#!/usr/bin/env node
/**
 * 中台契约 §11.1 八项手工测试 · 自动化版本
 *
 * 源自 changle-wholesale 站(2026-05-26 commit 238d4dc),改 metric / entity 适配 CRM。
 *
 * 用法:
 *   1) 起 dev server(本地 dry-run)或部 staging/prod 后获 URL:
 *        MIDDLEGROUND_HMAC_SECRET=<同 secret> \
 *        MIDDLEGROUND_SITE_ID=crm-arabgold \
 *        npm run dev
 *   2) 另开终端:
 *        MIDDLEGROUND_HMAC_SECRET=<同 secret> \
 *        BASE_URL=http://localhost:3000 \
 *        node scripts/middleground-self-test.mjs
 *
 * 报错码：
 *   - 0 = 全部 8 项通过
 *   - 1 = 至少一项失败（详见输出）
 *   - 2 = DB 未联，跳过依赖 DB 的测试但其他全通过（半绿）
 *
 * DB 状态：
 *   - 测试 1 (health 200) — 即便 DB down，HMAC 通过仍返 200（dependencies.database = down）
 *   - 测试 2 (bad sig 401) — 与 DB 无关
 *   - 测试 3 (old ts 401) — 与 DB 无关
 *   - 测试 4-6 (metrics / entities / events) — events 无关，metrics/entities 需 DB
 *   - 测试 7 (bad metric_name) — 与 DB 无关
 *   - 测试 8 (wrong version) — 与 DB 无关
 */
import { createHmac } from 'node:crypto';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SECRET = process.env.MIDDLEGROUND_HMAC_SECRET;

if (!SECRET || SECRET.length < 32) {
  console.error('[fatal] MIDDLEGROUND_HMAC_SECRET env required (≥32 chars)');
  process.exit(1);
}

/** 按契约 §5.3 算签名 */
function sign({ method, path, body = '', timestamp }) {
  const signingString = `${timestamp}\n${method.toUpperCase()}\n${path}\n${body}`;
  return createHmac('sha256', SECRET).update(signingString).digest('hex');
}

function headers({ method, path, body = '', timestamp, signature }) {
  return {
    'X-Middleground-Timestamp': String(timestamp),
    'X-Middleground-Signature': `sha256=${signature}`,
  };
}

async function call({ method = 'GET', path, body = '', tsOverride, sigOverride }) {
  const ts = tsOverride ?? Math.floor(Date.now() / 1000);
  const sig = sigOverride ?? sign({ method, path, body, timestamp: ts });
  const res = await fetch(BASE + path, {
    method,
    headers: headers({ method, path, body, timestamp: ts, signature: sig }),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, json, headers: Object.fromEntries(res.headers) };
}

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const tag = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${tag} ${name}${detail ? '  — ' + detail : ''}`);
}

function expect(condition, detail) {
  return { ok: !!condition, detail };
}

console.log(`\n[middleground self-test] BASE=${BASE}\n`);

// ── Test 1 · /health 200 ──────────────────────────────────────────
{
  console.log('Test 1 · /health 200');
  const r = await call({ path: '/api/middleground/v1/health' });
  const ok = r.status === 200 && r.json?.ok === true && r.json?.data?.version === 'v1';
  record(
    'GET /health → 200 + valid envelope',
    ok,
    `status=${r.status} db=${r.json?.data?.dependencies?.database ?? '?'}`,
  );
}

// ── Test 2 · 错误签名 401 ─────────────────────────────────────────
{
  console.log('\nTest 2 · 错误签名 401');
  const r = await call({
    path: '/api/middleground/v1/health',
    sigOverride: 'a'.repeat(64),
  });
  const ok = r.status === 401 && r.json?.error?.code === 'E_AUTH_FAILED';
  record('bad sig → 401 + E_AUTH_FAILED', ok, `status=${r.status}`);
}

// ── Test 3 · 旧 timestamp 401 ─────────────────────────────────────
{
  console.log('\nTest 3 · 旧 timestamp 401');
  const oldTs = Math.floor(Date.now() / 1000) - 600; // 10 分钟前
  const r = await call({
    path: '/api/middleground/v1/health',
    tsOverride: oldTs,
  });
  const ok = r.status === 401 && r.json?.error?.code === 'E_AUTH_FAILED';
  record('stale ts → 401 + E_AUTH_FAILED', ok, `status=${r.status}`);
}

// ── Test 4 · /export/metrics 200 (DB) ─────────────────────────────
// CRM 支持的 metric 子集:customer_count / monthly_orders / monthly_quotes / monthly_revenue
// 选 customer_count 做 smoke(快照型,任何 [since, until) 覆盖当前时刻都会返 1 行)
{
  console.log('\nTest 4 · /export/metrics 200');
  const since = '2026-01-01T00:00:00.000Z';
  const r = await call({
    path: `/api/middleground/v1/export/metrics?since=${encodeURIComponent(since)}&metric_name=customer_count`,
  });
  if (r.status === 503 && r.json?.error?.code === 'E_DEPENDENCY_DOWN') {
    record('metrics customer_count → 200', false, 'DB down (skip in CI, will pass on staging)');
  } else {
    const ok = r.status === 200 && Array.isArray(r.json?.data);
    record(
      'metrics customer_count → 200 + array',
      ok,
      `status=${r.status} count=${r.json?.meta?.count ?? '?'}`,
    );
  }
}

// ── Test 5 · /export/entities 200 (DB) ────────────────────────────
// CRM 支持的 entity:customer / order / quote(不含 inquiry,中台已对齐)
{
  console.log('\nTest 5 · /export/entities 200');
  const r = await call({
    path: '/api/middleground/v1/export/entities?type=customer&limit=5',
  });
  if (r.status === 503 && r.json?.error?.code === 'E_DEPENDENCY_DOWN') {
    record('entities customer → 200', false, 'DB down (skip in CI, will pass on staging)');
  } else {
    const ok = r.status === 200 && Array.isArray(r.json?.data);
    record(
      'entities customer → 200 + array',
      ok,
      `status=${r.status} count=${r.json?.meta?.count ?? '?'}`,
    );
  }
}

// ── Test 6 · /export/events 200 + 空数组 ──────────────────────────
{
  console.log('\nTest 6 · /export/events 200 + []');
  const since = '2026-01-01T00:00:00.000Z';
  const r = await call({
    path: `/api/middleground/v1/export/events?since=${encodeURIComponent(since)}`,
  });
  const ok =
    r.status === 200 && Array.isArray(r.json?.data) && r.json.data.length === 0;
  record('events → 200 + data: []', ok, `status=${r.status}`);
}

// ── Test 7 · 不支持的 metric_name 400 ─────────────────────────────
{
  console.log('\nTest 7 · 不支持的 metric_name 400');
  const since = '2026-01-01T00:00:00.000Z';
  const r = await call({
    path: `/api/middleground/v1/export/metrics?since=${encodeURIComponent(since)}&metric_name=foobar`,
  });
  const ok = r.status === 400 && r.json?.error?.code === 'E_UNSUPPORTED_METRIC';
  record('metric_name=foobar → 400 + E_UNSUPPORTED_METRIC', ok, `status=${r.status}`);
}

// ── Test 8 · 非 v1 URL → E_VERSION_MISMATCH ──────────────────────
{
  console.log('\nTest 8 · /v0/ URL → 400 + E_VERSION_MISMATCH');
  const r = await call({ path: '/api/middleground/v0/health' });
  const ok = r.status === 400 && r.json?.error?.code === 'E_VERSION_MISMATCH';
  record('v0 → 400 + E_VERSION_MISMATCH', ok, `status=${r.status}`);
}

// ── 总结 ──────────────────────────────────────────────────────────
const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
const dbSkipped = failed.filter((r) => r.detail.includes('DB down'));

console.log(`\n[result] ${passed}/${results.length} passed`);
if (failed.length === 0) {
  console.log('\n\x1b[32m✓ ALL 8 TESTS PASSED. 可以申请联调。\x1b[0m\n');
  process.exit(0);
}

console.log('\nFailed:');
for (const f of failed) {
  console.log(`  - ${f.name}: ${f.detail}`);
}

if (failed.length === dbSkipped.length) {
  console.log(
    '\n\x1b[33m⚠ 仅 DB 依赖测试失败。其余 HMAC / 错误码 / 协议测试都通过。' +
      '\n  在 Vercel staging（有真 DB）重跑即可。\x1b[0m\n',
  );
  process.exit(2);
}

console.log('\n\x1b[31m✗ 非 DB 测试失败 — 必须修。\x1b[0m\n');
process.exit(1);
