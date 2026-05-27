// Phase 3: browser-side stub. No DB or pg import — `pg` is Node-only and
// would crash the browser bundle. Any data call routes through `/api/*`
// endpoints (server-side) backed by the Neon-backed compat client.
//
// Phase 3b: the stub query builder exposes the full chainable surface
// (.from(...).select(...).eq(...).order(...).range(...)... and friends)
// so legacy components that still import `createClient` keep compiling
// during the gradual migration to fetch('/api/*') routes. At runtime,
// every terminal operation (.then / awaited result) throws — the error
// message points the dev at the right migration target.
//
// As call sites are migrated to fetch (see customers/page.tsx for the
// reference pattern), the import + the entire query chain can be deleted
// from each file. Once every client component is migrated, this whole
// file goes away.

/* eslint-disable @typescript-eslint/no-explicit-any */

// Stub-only typing: `data` is intentionally permissive because legacy call
// sites use a wide spectrum of post-await operations (.filter, .map, dot
// access etc.). The runtime always rejects this promise, so the type is
// unreachable in practice.
//
// Two flavours:
//   • DenyArrayResult — `.from(...).select(...)` returns an array (or null
//     on error). Default for chains without `.single()`.
//   • DenySingleResult — `.single()` / `.maybeSingle()` collapse to one row.
//
// We keep `data` typed as `any` (silenced via the disable comment above) so
// arbitrary property access and `filter` callbacks type-check.
interface DenyArrayResult {
  data: any[] | null
  error: { message: string } | null
  count: number | null
}
interface DenySingleResult {
  data: any
  error: { message: string } | null
  count: number | null
}

function denyError(label: string): Error {
  return new Error(
    `[supabase compat] Browser-side ${label} is not supported in Phase 3. ` +
      `Move the call to an API route, or use NextAuth (signIn/signOut/useSession) for auth.`
  )
}

interface DenyQuery extends PromiseLike<DenyArrayResult> {
  select(cols?: string, opts?: { count?: string; head?: boolean }): DenyQuery
  insert(values: unknown): DenyQuery
  update(values: unknown): DenyQuery
  upsert(
    values: unknown,
    opts?: { onConflict?: string; ignoreDuplicates?: boolean }
  ): DenyQuery
  delete(): DenyQuery
  eq(col: string, val: unknown): DenyQuery
  neq(col: string, val: unknown): DenyQuery
  lt(col: string, val: unknown): DenyQuery
  lte(col: string, val: unknown): DenyQuery
  gt(col: string, val: unknown): DenyQuery
  gte(col: string, val: unknown): DenyQuery
  ilike(col: string, val: unknown): DenyQuery
  like(col: string, val: unknown): DenyQuery
  is(col: string, val: unknown): DenyQuery
  in(col: string, vals: unknown[]): DenyQuery
  or(filter: string): DenyQuery
  not(col: string, op: string, val: unknown): DenyQuery
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): DenyQuery
  limit(n: number): DenyQuery
  range(from: number, to: number): DenyQuery
  // .single() / .maybeSingle() narrow the awaited shape to a single-row result.
  single(): DenySingleQuery
  maybeSingle(): DenySingleQuery
  returns(): DenyQuery
  catch<TResult = never>(
    onRejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | undefined | null
  ): Promise<DenyArrayResult | TResult>
}

interface DenySingleQuery extends PromiseLike<DenySingleResult> {
  // Allow chaining onto single() / maybeSingle() — supabase-js permits this
  // pattern but callers in this codebase usually terminate immediately.
  // Methods narrow back to DenyQuery to preserve the type as the call site
  // continues filtering.
  select(cols?: string, opts?: { count?: string; head?: boolean }): DenyQuery
  eq(col: string, val: unknown): DenySingleQuery
  catch<TResult = never>(
    onRejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | undefined | null
  ): Promise<DenySingleResult | TResult>
}

function makeDenyQuery(label: string): DenyQuery {
  const q: DenyQuery = {
    select: () => q,
    insert: () => q,
    update: () => q,
    upsert: () => q,
    delete: () => q,
    eq: () => q,
    neq: () => q,
    lt: () => q,
    lte: () => q,
    gt: () => q,
    gte: () => q,
    ilike: () => q,
    like: () => q,
    is: () => q,
    in: () => q,
    or: () => q,
    not: () => q,
    order: () => q,
    limit: () => q,
    range: () => q,
    single: () => makeDenySingleQuery(label),
    maybeSingle: () => makeDenySingleQuery(label),
    returns: () => q,
    then(onFulfilled, onRejected) {
      return Promise.reject(denyError(label)).then(onFulfilled, onRejected) as Promise<any>
    },
    catch(onRejected) {
      return Promise.reject(denyError(label)).catch(onRejected) as Promise<any>
    },
  }
  return q
}

function makeDenySingleQuery(label: string): DenySingleQuery {
  const sq: DenySingleQuery = {
    select: () => makeDenyQuery(label),
    eq: () => sq,
    then(onFulfilled, onRejected) {
      return Promise.reject(denyError(label)).then(onFulfilled, onRejected) as Promise<any>
    },
    catch(onRejected) {
      return Promise.reject(denyError(label)).catch(onRejected) as Promise<any>
    },
  }
  return sq
}

interface DenyStorageBucket {
  getPublicUrl(path: string): { data: { publicUrl: string } }
  upload(
    path: string,
    file: Blob | ArrayBuffer | Buffer | File,
    opts?: { contentType?: string; upsert?: boolean }
  ): Promise<{ data: { path: string } | null; error: { message: string } | null }>
  remove(paths: string[]): Promise<{ data: null; error: { message: string } | null }>
  createSignedUrl(
    path: string,
    expiresIn: number
  ): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>
  download(
    path: string
  ): Promise<{ data: Blob | null; error: { message: string } | null }>
}

interface DenyClient {
  from(table: string): DenyQuery
  rpc(
    fn: string,
    args?: Record<string, unknown>
  ): Promise<{ data: any; error: { message: string } | null }>
  storage: { from(bucket: string): DenyStorageBucket }
  auth: {
    signOut(): Promise<never>
    getUser(): Promise<{ data: { user: null }; error: null }>
    getSession(): Promise<{ data: { session: null }; error: null }>
    onAuthStateChange(cb: unknown): {
      data: { subscription: { unsubscribe: () => void } }
    }
  }
}

function makeDenyStorage(bucket: string): DenyStorageBucket {
  return {
    getPublicUrl: (_p: string) => ({ data: { publicUrl: '' } }),
    upload: () => Promise.reject(denyError(`storage("${bucket}").upload`)),
    remove: () => Promise.reject(denyError(`storage("${bucket}").remove`)),
    createSignedUrl: () =>
      Promise.reject(denyError(`storage("${bucket}").createSignedUrl`)),
    download: () => Promise.reject(denyError(`storage("${bucket}").download`)),
  }
}

export function createClient(): DenyClient {
  return {
    from: (table: string) => makeDenyQuery(`.from("${table}")`),
    rpc: (fn: string, _args?: Record<string, unknown>) =>
      Promise.reject(denyError(`.rpc("${fn}")`)) as Promise<{
        data: any
        error: { message: string } | null
      }>,
    storage: {
      from: (bucket: string) => makeDenyStorage(bucket),
    },
    auth: {
      signOut: async () => {
        throw new Error("Use signOut from 'next-auth/react' instead of supabase.auth.signOut")
      },
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: (_cb: unknown) => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  }
}
