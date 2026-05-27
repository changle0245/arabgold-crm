// Supabase-js compat shim — translates a subset of PostgREST query builder
// calls into raw SQL run against Neon via the shared `pg` Pool in lib/db.
//
// Scope: covers the ~90% of supabase.from(...) usage in this codebase.
//
// Supported:
//   .select(cols?)
//   .insert(values), .insert(values).select(), .insert(values).select().single()
//   .update(values), .update(values).select(), .update(values).eq(...)
//   .upsert(values, { onConflict })
//   .delete(), .delete().eq(...)
//   .eq/.neq/.lt/.lte/.gt/.gte/.ilike/.is(col, val)
//   .in(col, vals)
//   .or(filter)  — PostgREST string format, supports nested and(...)
//   .order(col, { ascending, nullsFirst })
//   .range(from, to)
//   .limit(n)
//   .single()  / .maybeSingle()
//   { count: 'exact' } in select(cols, opts)
//
// NOT supported (callers must rewrite to raw db.query):
//   nested joins  '.select(*, alias:related!fk(...))'
//   .returns<T>()  (use TS generics on rows instead)
//   .rpc()  (use db.query('select fn(...)'))
//   auth.*  (use NextAuth)
//   storage.*  (use R2 / S3 client)

import { db } from '../db'
import type { QueryResult } from 'pg'

type Row = Record<string, unknown>
type FilterOp = '=' | '<>' | '<' | '<=' | '>' | '>=' | 'ILIKE' | 'LIKE' | 'IS'

type Filter =
  | { kind: 'cmp'; col: string; op: FilterOp; val: unknown }
  | { kind: 'in'; col: string; vals: unknown[] }
  | { kind: 'or'; sql: string }
  | { kind: 'rawAnd'; sql: string }

interface PgError {
  message: string
  code?: string
  details?: string
}

export interface SbResult<T> {
  data: T | null
  error: PgError | null
  count?: number | null
}

function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`Unsafe identifier: ${name}`)
  }
  return name
}

function quoteTable(table: string): string {
  if (table.includes('.')) {
    return table.split('.').map(quoteIdent).join('.')
  }
  return quoteIdent(table)
}

// Parse PostgREST OR filter into SQL fragment with positional params $N.
// Supports: a.eq.1 / a.ilike.foo / a.in.(1,2,3) / and(a.eq.1,b.eq.2)
function parsePostgrestFilter(
  expr: string,
  startParam: number,
  params: unknown[]
): { sql: string; nextParam: number } {
  let i = 0
  let nextParam = startParam

  function splitTopLevel(s: string, sep: string): string[] {
    const out: string[] = []
    let depth = 0
    let buf = ''
    for (const ch of s) {
      if (ch === '(') { depth++; buf += ch; continue }
      if (ch === ')') { depth--; buf += ch; continue }
      if (ch === sep && depth === 0) {
        if (buf) out.push(buf)
        buf = ''
        continue
      }
      buf += ch
    }
    if (buf) out.push(buf)
    return out
  }

  function parseOne(part: string): string {
    part = part.trim()
    // and(...) / or(...)
    if (part.startsWith('and(') && part.endsWith(')')) {
      const inner = part.slice(4, -1)
      return '(' + splitTopLevel(inner, ',').map(parseOne).join(' AND ') + ')'
    }
    if (part.startsWith('or(') && part.endsWith(')')) {
      const inner = part.slice(3, -1)
      return '(' + splitTopLevel(inner, ',').map(parseOne).join(' OR ') + ')'
    }
    // col.op.val   or   col.in.(a,b,c)
    const firstDot = part.indexOf('.')
    const secondDot = part.indexOf('.', firstDot + 1)
    if (firstDot < 0 || secondDot < 0) {
      throw new Error('Bad filter fragment: ' + part)
    }
    const col = part.slice(0, firstDot)
    const op = part.slice(firstDot + 1, secondDot)
    let val: string = part.slice(secondDot + 1)
    if (op === 'in') {
      // val looks like '(a,b,c)'
      const raw = val.startsWith('(') && val.endsWith(')') ? val.slice(1, -1) : val
      const items = raw.split(',').map(s => s.trim()).filter(Boolean)
      const placeholders = items.map(item => {
        params.push(item)
        nextParam++
        return `$${nextParam - 1}`
      })
      return `${quoteIdent(col)} IN (${placeholders.join(', ')})`
    }
    if (op === 'is') {
      if (val === 'null') return `${quoteIdent(col)} IS NULL`
      if (val === 'true') return `${quoteIdent(col)} IS TRUE`
      if (val === 'false') return `${quoteIdent(col)} IS FALSE`
      return `${quoteIdent(col)} IS ${val}`
    }
    const sqlOp: Record<string, string> = {
      eq: '=', neq: '<>', lt: '<', lte: '<=', gt: '>', gte: '>=',
      ilike: 'ILIKE', like: 'LIKE',
    }
    if (!sqlOp[op]) throw new Error('Unsupported PostgREST op: ' + op)
    params.push(val)
    nextParam++
    return `${quoteIdent(col)} ${sqlOp[op]} $${nextParam - 1}`
  }

  void i
  const parts = splitTopLevel(expr, ',')
  const sql = '(' + parts.map(parseOne).join(' OR ') + ')'
  return { sql, nextParam }
}

class SbQuery<T = Row> implements PromiseLike<SbResult<T>> {
  private _kind: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private _columns = '*'
  private _filters: Filter[] = []
  private _orderBy: { col: string; asc: boolean; nullsFirst?: boolean }[] = []
  private _limit: number | null = null
  private _offset: number | null = null
  private _values: Row | Row[] | null = null
  private _onConflict: string | null = null
  private _returning: string | null = null
  private _single: boolean | 'maybe' = false
  private _countMode: 'exact' | 'estimated' | 'planned' | null = null
  private _pendingSelectAfterMutation = false

  constructor(private table: string) {}

  select(cols: string = '*', opts?: { count?: 'exact' | 'estimated' | 'planned'; head?: boolean }): SbQuery<T> {
    if (this._kind === 'insert' || this._kind === 'update' || this._kind === 'upsert' || this._kind === 'delete') {
      // chained .select() after mutation → RETURNING
      this._returning = cols === '*' ? '*' : cols
      this._pendingSelectAfterMutation = true
    } else {
      this._kind = 'select'
      this._columns = cols
    }
    if (opts?.count) this._countMode = opts.count
    return this
  }

  insert(values: Row | Row[]): SbQuery<T> {
    this._kind = 'insert'
    this._values = values
    return this
  }

  update(values: Row): SbQuery<T> {
    this._kind = 'update'
    this._values = values
    return this
  }

  upsert(values: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }): SbQuery<T> {
    this._kind = 'upsert'
    this._values = values
    this._onConflict = opts?.onConflict ?? 'id'
    return this
  }

  delete(): SbQuery<T> {
    this._kind = 'delete'
    return this
  }

  eq(col: string, val: unknown): SbQuery<T> { this._filters.push({ kind: 'cmp', col, op: '=', val }); return this }
  neq(col: string, val: unknown): SbQuery<T> { this._filters.push({ kind: 'cmp', col, op: '<>', val }); return this }
  lt(col: string, val: unknown): SbQuery<T> { this._filters.push({ kind: 'cmp', col, op: '<', val }); return this }
  lte(col: string, val: unknown): SbQuery<T> { this._filters.push({ kind: 'cmp', col, op: '<=', val }); return this }
  gt(col: string, val: unknown): SbQuery<T> { this._filters.push({ kind: 'cmp', col, op: '>', val }); return this }
  gte(col: string, val: unknown): SbQuery<T> { this._filters.push({ kind: 'cmp', col, op: '>=', val }); return this }
  ilike(col: string, val: unknown): SbQuery<T> { this._filters.push({ kind: 'cmp', col, op: 'ILIKE', val }); return this }
  like(col: string, val: unknown): SbQuery<T> { this._filters.push({ kind: 'cmp', col, op: 'LIKE', val }); return this }
  is(col: string, val: unknown): SbQuery<T> {
    if (val === null || val === 'null') { this._filters.push({ kind: 'cmp', col, op: 'IS', val: null }); return this }
    this._filters.push({ kind: 'cmp', col, op: 'IS', val })
    return this
  }
  in(col: string, vals: unknown[]): SbQuery<T> { this._filters.push({ kind: 'in', col, vals }); return this }
  or(expr: string): SbQuery<T> {
    // Defer parsing — we need the running param index, do it in compile().
    this._filters.push({ kind: 'or', sql: expr })
    return this
  }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): SbQuery<T> {
    this._orderBy.push({ col, asc: opts?.ascending ?? true, nullsFirst: opts?.nullsFirst })
    return this
  }
  limit(n: number): SbQuery<T> { this._limit = n; return this }
  range(from: number, to: number): SbQuery<T> {
    this._offset = from
    this._limit = to - from + 1
    return this
  }
  single(): SbQuery<T> { this._single = true; return this }
  maybeSingle(): SbQuery<T> { this._single = 'maybe'; return this }

  // Compile to SQL + params
  private compile(): { sql: string; params: unknown[]; isMutation: boolean } {
    const params: unknown[] = []
    const conditions: string[] = []

    let nextParam = 1

    for (const f of this._filters) {
      if (f.kind === 'cmp') {
        if (f.op === 'IS' && f.val === null) {
          conditions.push(`${quoteIdent(f.col)} IS NULL`)
        } else {
          params.push(f.val)
          nextParam++
          conditions.push(`${quoteIdent(f.col)} ${f.op} $${nextParam - 1}`)
        }
      } else if (f.kind === 'in') {
        if (f.vals.length === 0) {
          conditions.push('FALSE')
          continue
        }
        const placeholders = f.vals.map(v => {
          params.push(v)
          nextParam++
          return `$${nextParam - 1}`
        })
        conditions.push(`${quoteIdent(f.col)} IN (${placeholders.join(', ')})`)
      } else if (f.kind === 'or') {
        const out = parsePostgrestFilter(f.sql, nextParam, params)
        conditions.push(out.sql)
        nextParam = out.nextParam
      } else if (f.kind === 'rawAnd') {
        conditions.push(f.sql)
      }
    }

    const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : ''
    const order = this._orderBy.length > 0
      ? ' ORDER BY ' + this._orderBy.map(o => {
          const dir = o.asc ? 'ASC' : 'DESC'
          const nulls = o.nullsFirst === undefined ? '' : (o.nullsFirst ? ' NULLS FIRST' : ' NULLS LAST')
          return `${quoteIdent(o.col)} ${dir}${nulls}`
        }).join(', ')
      : ''
    const limit = this._limit !== null ? ` LIMIT ${this._limit}` : ''
    const offset = this._offset !== null ? ` OFFSET ${this._offset}` : ''
    const tbl = quoteTable(this.table)

    if (this._kind === 'select') {
      const cols = this._columns
      return {
        sql: `SELECT ${cols} FROM ${tbl}${where}${order}${limit}${offset}`,
        params,
        isMutation: false,
      }
    }
    if (this._kind === 'delete') {
      const ret = this._returning ? ` RETURNING ${this._returning}` : ''
      return {
        sql: `DELETE FROM ${tbl}${where}${ret}`,
        params,
        isMutation: true,
      }
    }
    if (this._kind === 'update') {
      const v = this._values as Row
      const setClauses: string[] = []
      for (const [k, val] of Object.entries(v)) {
        params.push(val)
        nextParam++
        setClauses.push(`${quoteIdent(k)} = $${nextParam - 1}`)
      }
      // Re-render WHERE because we pushed values after filter params... fix by computing where post-set
      // Actually: filter params come first, then values for SET. SET uses higher param indices, but WHERE
      // condition strings already reference $1..$N from filters. We pushed set values after filters,
      // so SET indices are filters.length+1..., conditions reference $1..filters.length. CORRECT.
      const ret = this._returning ? ` RETURNING ${this._returning}` : ''
      return {
        sql: `UPDATE ${tbl} SET ${setClauses.join(', ')}${where}${ret}`,
        params,
        isMutation: true,
      }
    }
    if (this._kind === 'insert' || this._kind === 'upsert') {
      const rows = Array.isArray(this._values) ? (this._values as Row[]) : [this._values as Row]
      if (rows.length === 0) {
        return { sql: `SELECT 1 WHERE FALSE`, params: [], isMutation: true }
      }
      const cols = Array.from(new Set(rows.flatMap(r => Object.keys(r))))
      const valuesSql: string[] = []
      for (const r of rows) {
        const rowParts = cols.map(c => {
          const v = r[c] ?? null
          params.push(v)
          nextParam++
          return `$${nextParam - 1}`
        })
        valuesSql.push(`(${rowParts.join(', ')})`)
      }
      const colList = cols.map(quoteIdent).join(', ')
      const ret = this._returning ? ` RETURNING ${this._returning}` : ''
      if (this._kind === 'upsert') {
        const conflict = this._onConflict ?? 'id'
        const conflictCols = conflict.split(',').map(s => quoteIdent(s.trim())).join(', ')
        const updates = cols
          .filter(c => !conflict.split(',').map(s => s.trim()).includes(c))
          .map(c => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
        const updateClause = updates.length > 0 ? `DO UPDATE SET ${updates.join(', ')}` : 'DO NOTHING'
        return {
          sql: `INSERT INTO ${tbl} (${colList}) VALUES ${valuesSql.join(', ')} ON CONFLICT (${conflictCols}) ${updateClause}${ret}`,
          params,
          isMutation: true,
        }
      }
      return {
        sql: `INSERT INTO ${tbl} (${colList}) VALUES ${valuesSql.join(', ')}${ret}`,
        params,
        isMutation: true,
      }
    }
    throw new Error('Unreachable')
  }

  private async execute(): Promise<SbResult<T>> {
    try {
      const { sql, params } = this.compile()

      // For count: 'exact' on a select, run COUNT separately
      let count: number | null = null
      if (this._kind === 'select' && this._countMode === 'exact') {
        const countSql = sql.replace(/^SELECT [^F]+ FROM/, 'SELECT COUNT(*)::int AS c FROM').replace(/ ORDER BY .*$/, '').replace(/ LIMIT \d+/, '').replace(/ OFFSET \d+/, '')
        const cr = await db.query<{ c: number }>(countSql, params)
        count = cr.rows[0]?.c ?? 0
      }

      const result: QueryResult<Row> = await db.query(sql, params)

      if (this._kind === 'insert' || this._kind === 'update' || this._kind === 'upsert' || this._kind === 'delete') {
        if (this._pendingSelectAfterMutation) {
          if (this._single === true) {
            const row = result.rows[0]
            if (!row) return { data: null, error: { message: 'No rows returned', code: 'PGRST116' } }
            return { data: row as T, error: null, count }
          }
          if (this._single === 'maybe') {
            return { data: (result.rows[0] ?? null) as T, error: null, count }
          }
          return { data: result.rows as T, error: null, count }
        }
        // mutation without RETURNING — typical: return { data: null, error: null }
        return { data: null, error: null, count }
      }

      // SELECT
      if (this._single === true) {
        if (result.rows.length === 0) return { data: null, error: { message: 'PGRST116: 0 rows', code: 'PGRST116' } }
        if (result.rows.length > 1) return { data: null, error: { message: 'PGRST116: more than one row', code: 'PGRST116' } }
        return { data: result.rows[0] as T, error: null, count }
      }
      if (this._single === 'maybe') {
        return { data: (result.rows[0] ?? null) as T, error: null, count }
      }
      return { data: result.rows as T, error: null, count }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const code = (e as { code?: string })?.code
      return { data: null, error: { message: msg, code } }
    }
  }

  // Make awaitable
  then<TResult1 = SbResult<T>, TResult2 = never>(
    onfulfilled?: (value: SbResult<T>) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }
}

// Minimal supabase-js client surface used by this codebase
export interface SbClient {
  from<T = Row>(table: string): SbQuery<T>
  rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<SbResult<T>>
  storage: {
    from(bucket: string): {
      getPublicUrl(path: string): { data: { publicUrl: string } }
      remove(paths: string[]): Promise<{ data: null; error: PgError | null }>
      upload(path: string, file: Blob | ArrayBuffer | Buffer, opts?: { contentType?: string; upsert?: boolean }): Promise<{ data: { path: string } | null; error: PgError | null }>
      createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: PgError | null }>
    }
  }
}

function makeStorageStub(bucket: string) {
  // Phase 4: storage now hits R2 via the ArabGold Worker proxy.
  // All keys are namespaced under `crm-arabgold/<bucket>/...` by lib/r2.
  return {
    getPublicUrl(path: string) {
      try {
        const { getPublicObjectUrl } = require('../r2') as typeof import('../r2')
        return { data: { publicUrl: getPublicObjectUrl(bucket, path) } }
      } catch {
        return { data: { publicUrl: '' } }
      }
    },
    async remove(paths: string[]) {
      try {
        const { deleteObjects } = require('../r2') as typeof import('../r2')
        await deleteObjects(paths.map(p => `${bucket}/${p}`))
        return { data: null, error: null }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { data: null, error: { message: msg } }
      }
    },
    async upload(
      path: string,
      file: Blob | ArrayBuffer | Buffer,
      opts?: { contentType?: string; upsert?: boolean }
    ) {
      try {
        const { uploadObject } = require('../r2') as typeof import('../r2')
        const r = await uploadObject(bucket, path, file, { contentType: opts?.contentType })
        return { data: { path: r.path }, error: null }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { data: null, error: { message: msg } }
      }
    },
    async createSignedUrl(path: string, _expiresIn: number) {
      // R2 bucket is public; the "signed" URL is just the public URL.
      // Object keys embed customerId + timestamp + random and are never
      // exposed without an authenticated request, so this is safe for
      // internal CRM use. If we ever need true signed URLs, switch the
      // Worker proxy to mint short-lived tokens.
      try {
        const { getPublicObjectUrl } = require('../r2') as typeof import('../r2')
        return { data: { signedUrl: getPublicObjectUrl(bucket, path) }, error: null }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { data: null, error: { message: msg } }
      }
    },
  }
}

export function makeSbClient(): SbClient {
  return {
    from<T = Row>(table: string) {
      return new SbQuery<T>(table)
    },
    async rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<SbResult<T>> {
      try {
        if (!/^[a-z_][a-z0-9_]*$/i.test(fn)) {
          return { data: null, error: { message: 'Unsafe rpc function name' } }
        }
        const params: unknown[] = []
        const argList = args
          ? Object.entries(args).map(([k, v], i) => {
              params.push(v)
              return `${quoteIdent(k)} => $${i + 1}`
            }).join(', ')
          : ''
        const sql = `SELECT * FROM ${quoteIdent(fn)}(${argList})`
        const result = await db.query<Row>(sql, params)
        // Most rpc calls return either an array of rows or a single scalar — caller decides.
        return { data: result.rows as unknown as T, error: null }
      } catch (e) {
        return { data: null, error: { message: e instanceof Error ? e.message : String(e) } }
      }
    },
    storage: {
      from(bucket: string) {
        return makeStorageStub(bucket)
      },
    },
  }
}
