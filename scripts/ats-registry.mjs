#!/usr/bin/env node
/**
 * ats-registry.mjs — build a registry of ATS job-board tokens from Common Crawl's
 * raw URL index (no API keys, no index.commoncrawl.org query API).
 *
 * How it works
 * ------------
 * Each crawl publishes a "cluster index" at
 *   https://data.commoncrawl.org/cc-index/collections/<CRAWL>/indexes/cluster.idx
 * a ~105 MB tab-separated file sorted by SURT key:
 *   <surt> <timestamp> \t <cdx-file> \t <offset> \t <length> \t <seq>
 * Every line names a ~3000-record gzip block inside
 *   https://data.commoncrawl.org/cc-index/collections/<CRAWL>/indexes/<cdx-file>
 * Range-requesting offset..offset+length-1 and gunzipping yields CDX lines of the
 * form `<surt> <timestamp> {json}`.
 *
 * To get every record for a SURT prefix P we need:
 *   - the block whose first key is the LAST key < P (P's records may start mid-block)
 *   - every block whose first key starts with P
 * then we keep only the CDX lines that actually start with P.
 *
 * Usage:  node scripts/ats-registry.mjs [--work <dir>] [--crawls a,b,c]
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_WORK =
  process.env.WORK ||
  '/tmp/claude-0/-home-user-silvergtm-gtm/bc7a0fbf-e99f-5e6b-a7de-acde7f9cbb9b/scratchpad';

const DEFAULT_CRAWLS = ['CC-MAIN-2026-30', 'CC-MAIN-2026-34', 'CC-MAIN-2026-39'];

const BASE = 'https://data.commoncrawl.org/cc-index/collections';
const CONCURRENCY = 4;

function parseArgs(argv) {
  const out = { work: DEFAULT_WORK, crawls: DEFAULT_CRAWLS };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--work') out.work = argv[++i];
    else if (argv[i] === '--crawls') out.crawls = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('usage: node scripts/ats-registry.mjs [--work <dir>] [--crawls CC-MAIN-a,CC-MAIN-b]');
      process.exit(0);
    }
  }
  return out;
}

const ARGS = parseArgs(process.argv);
const WORK = ARGS.work;
const CRAWLS = ARGS.crawls;

// ---------------------------------------------------------------------------
// SURT prefixes we harvest. `family` picks the extraction rule.
// ---------------------------------------------------------------------------

const PREFIXES = [
  { p: 'io,greenhouse,boards)', family: 'greenhouse' },
  { p: 'io,greenhouse,job-boards)', family: 'greenhouse' },
  { p: 'co,lever,jobs)', family: 'lever' },
  { p: 'co,lever,eu,jobs)', family: 'lever' },
  { p: 'com,ashbyhq,jobs)', family: 'ashby' },
  { p: 'com,smartrecruiters,jobs)', family: 'smartrecruiters' },
  { p: 'com,smartrecruiters,careers)', family: 'smartrecruiters' },
  // Recruitee lives on arbitrary subdomains: com,recruitee,<sub>)
  { p: 'com,recruitee,', family: 'recruitee' },
  // Workday: com,myworkdayjobs,wd<N>,<tenant>)/<site>/...
  { p: 'com,myworkdayjobs,', family: 'workday' },
];

const BAD_TOKENS = new Set([
  'embed',
  'jobs',
  'job',
  'robots.txt',
  'sitemap.xml',
  'sitemap',
  'favicon.ico',
  'static',
  'assets',
  'api',
]);

const TOKEN_OK = /^[A-Za-z0-9._-]+$/;

const RECRUITEE_EXCLUDE = new Set([
  'www', 'app', 'api', 'docs', 'support', 'help', 'careers', 'blog', 'status',
]);

const LOCALE_RE = /^[a-z]{2}([-_][A-Za-z]{2,4})?$/;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const log = (...a) => console.error('[ats-registry]', ...a);

function validToken(tok) {
  if (!tok) return false;
  if (tok.length > 120) return false;
  if (BAD_TOKENS.has(tok.toLowerCase())) return false;
  if (!TOKEN_OK.test(tok)) return false;
  return true;
}

/** Retry-once wrapper around fetch. */
async function fetchRetry(url, init = {}, attempts = 2) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (!res.ok && res.status !== 206) {
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

/** Run tasks with a fixed worker pool. */
async function pool(items, limit, worker) {
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = idx++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

/**
 * gunzip a range payload. CC index blocks are a single gzip member, but
 * gunzipSync also walks concatenated members, so one call covers both. A
 * truncated tail is tolerated via Z_SYNC_FLUSH. Non-gzip payloads pass through.
 */
function gunzipAll(buf) {
  if (buf.length < 2 || buf[0] !== 0x1f || buf[1] !== 0x8b) return buf; // not gzip
  try {
    return zlib.gunzipSync(buf, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
  } catch {
    return Buffer.alloc(0);
  }
}

// ---------------------------------------------------------------------------
// Step 1: cluster.idx download
// ---------------------------------------------------------------------------

async function ensureClusterIdx(crawl) {
  const dir = path.join(WORK, 'cc', crawl);
  const file = path.join(dir, 'cluster.idx');
  await fsp.mkdir(dir, { recursive: true });
  try {
    const st = await fsp.stat(file);
    if (st.size > 1_000_000) {
      log(`cluster.idx present for ${crawl} (${(st.size / 1048576).toFixed(1)} MB) — skipping download`);
      return file;
    }
  } catch {
    /* not present */
  }
  const url = `${BASE}/${crawl}/indexes/cluster.idx`;
  log(`downloading ${url}`);
  const res = await fetchRetry(url, {});
  const tmp = `${file}.part`;
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
  await fsp.rename(tmp, file);
  const st = await fsp.stat(file);
  log(`  -> ${file} (${(st.size / 1048576).toFixed(1)} MB)`);
  return file;
}

// ---------------------------------------------------------------------------
// Step 2: block selection — one streaming pass over cluster.idx for all prefixes
// ---------------------------------------------------------------------------

async function selectBlocks(idxFile) {
  const state = PREFIXES.map(() => ({ prev: null, blocks: [] }));

  const rl = readline.createInterface({
    input: fs.createReadStream(idxFile, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line) continue;
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const key = line.slice(0, tab);
    const rest = line.slice(tab + 1).split('\t');
    const rec = { file: rest[0], offset: Number(rest[1]), length: Number(rest[2]) };
    for (let i = 0; i < PREFIXES.length; i++) {
      const p = PREFIXES[i].p;
      if (key.startsWith(p)) state[i].blocks.push(rec);
      else if (key < p) state[i].prev = rec;
    }
  }

  // Merge into a deduped block list, each tagged with the prefixes it may serve.
  const byId = new Map();
  const perPrefix = [];
  for (let i = 0; i < PREFIXES.length; i++) {
    const list = [];
    if (state[i].prev) list.push(state[i].prev);
    list.push(...state[i].blocks);
    perPrefix.push({ prefix: PREFIXES[i], count: list.length });
    for (const rec of list) {
      const id = `${rec.file}:${rec.offset}:${rec.length}`;
      let entry = byId.get(id);
      if (!entry) {
        entry = { ...rec, id, prefixes: [] };
        byId.set(id, entry);
      }
      if (!entry.prefixes.includes(PREFIXES[i])) entry.prefixes.push(PREFIXES[i]);
    }
  }
  return { blocks: [...byId.values()], perPrefix };
}

// ---------------------------------------------------------------------------
// Step 3: token extraction
// ---------------------------------------------------------------------------

/** Cheap `"url": "..."` extraction — far faster than JSON.parse on 3000 lines. */
function extractUrl(json) {
  const k = json.indexOf('"url"');
  if (k < 0) return null;
  const q1 = json.indexOf('"', json.indexOf(':', k) + 1);
  if (q1 < 0) return null;
  let out = '';
  for (let i = q1 + 1; i < json.length; i++) {
    const c = json[i];
    if (c === '\\') {
      const n = json[++i];
      if (n === 'n') out += '\n';
      else if (n === 't') out += '\t';
      else if (n === 'u') {
        out += String.fromCharCode(parseInt(json.slice(i + 1, i + 5), 16));
        i += 4;
      } else out += n;
      continue;
    }
    if (c === '"') return out;
    out += c;
  }
  return null;
}

function segments(pathname) {
  return pathname.split('/').filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
}

/**
 * Turn one CDX record into zero or more registry rows.
 * Returns null when the record should be dropped.
 */
function extract(family, surt, url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const segs = segments(u.pathname);

  if (family === 'greenhouse') {
    if (!host.endsWith('greenhouse.io')) return null;
    const lower = u.pathname.toLowerCase();
    if (lower.startsWith('/embed/job_board') || lower.startsWith('/embed/job_app')) {
      const forParam = u.searchParams.get('for') || u.searchParams.get('For');
      if (!forParam) return null;
      const tok = forParam.trim().toLowerCase();
      return validToken(tok) ? { ats: 'greenhouse', token: tok, region: '', shard: '', site: '' } : null;
    }
    const tok = (segs[0] || '').toLowerCase();
    return validToken(tok) ? { ats: 'greenhouse', token: tok, region: '', shard: '', site: '' } : null;
  }

  if (family === 'lever') {
    if (!host.endsWith('lever.co')) return null;
    const region = host.includes('.eu.') || host.startsWith('eu.') ? 'eu' : 'us';
    const tok = (segs[0] || '').toLowerCase();
    return validToken(tok) ? { ats: 'lever', token: tok, region, shard: '', site: '' } : null;
  }

  if (family === 'ashby') {
    if (!host.endsWith('ashbyhq.com')) return null;
    const tok = (segs[0] || '').toLowerCase();
    return validToken(tok) ? { ats: 'ashby', token: tok, region: '', shard: '', site: '' } : null;
  }

  if (family === 'smartrecruiters') {
    if (!host.endsWith('smartrecruiters.com')) return null;
    const tok = segs[0] || ''; // case-sensitive: SmartRecruiters tokens keep their case
    return validToken(tok) ? { ats: 'smartrecruiters', token: tok, region: '', shard: '', site: '' } : null;
  }

  if (family === 'recruitee') {
    if (!host.endsWith('.recruitee.com')) return null;
    const sub = host.slice(0, -'.recruitee.com'.length);
    if (!sub || sub.includes('.')) return null; // only first-level subdomains
    if (RECRUITEE_EXCLUDE.has(sub)) return null;
    return validToken(sub) ? { ats: 'recruitee', token: sub, region: '', shard: '', site: '' } : null;
  }

  if (family === 'workday') {
    if (!host.endsWith('.myworkdayjobs.com')) return null;
    const parts = host.slice(0, -'.myworkdayjobs.com'.length).split('.');
    // expected: <tenant>.<shard>   (e.g. acme.wd5)
    let tenant = '';
    let shard = '';
    if (parts.length >= 2) {
      tenant = parts[0];
      shard = parts[parts.length - 1];
      if (!/^wd\d+$/.test(shard)) {
        // e.g. <tenant>.wd3.myworkdayjobs.com is the norm; anything else -> skip shard
        shard = '';
        tenant = parts[0];
      }
    } else {
      tenant = parts[0] || '';
    }
    if (!validToken(tenant) || tenant === 'www') return null;
    if (!segs.length) return null;
    const last = segs[segs.length - 1].toLowerCase();
    if (last === 'robots.txt' || last === 'sitemap.xml') return null;
    let site = segs[0];
    if (LOCALE_RE.test(site) && segs.length >= 2) site = segs[1];
    if (!site) return null;
    if (!TOKEN_OK.test(site)) return null;
    if (BAD_TOKENS.has(site.toLowerCase())) return null;
    return { ats: 'workday', token: tenant.toLowerCase(), region: '', shard: shard.toLowerCase(), site };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Step 4: fetch blocks, filter, aggregate
// ---------------------------------------------------------------------------

/** registry: key -> { ats, token, region, shard, site, url_count, crawls:Set } */
const registry = new Map();
/** per-crawl unique-token tracking: crawl -> ats -> Set(token) */
const perCrawlTokens = new Map();
/** diagnostics: prefix -> { records, rows } per crawl */
const prefixStats = new Map();

function bump(crawl, prefixP, row) {
  const key = `${row.ats}\u0000${row.token}\u0000${row.region}\u0000${row.shard}\u0000${row.site}`;
  let e = registry.get(key);
  if (!e) {
    e = { ...row, url_count: 0, crawls: new Set() };
    registry.set(key, e);
  }
  e.url_count += 1;
  e.crawls.add(crawl);

  let byAts = perCrawlTokens.get(crawl);
  if (!byAts) perCrawlTokens.set(crawl, (byAts = new Map()));
  let set = byAts.get(row.ats);
  if (!set) byAts.set(row.ats, (set = new Set()));
  set.add(`${row.token}|${row.region}|${row.shard}`);

  const ps = prefixStats.get(`${crawl}\u0000${prefixP}`);
  if (ps) ps.rows += 1;
}

async function processBlock(crawl, block) {
  const url = `${BASE}/${crawl}/indexes/${block.file}`;
  const end = block.offset + block.length - 1;
  const res = await fetchRetry(url, { headers: { Range: `bytes=${block.offset}-${end}` } });
  const buf = Buffer.from(await res.arrayBuffer());
  const text = gunzipAll(buf).toString('utf8');

  let start = 0;
  for (;;) {
    let nl = text.indexOf('\n', start);
    if (nl < 0) nl = text.length;
    const line = text.slice(start, nl);
    start = nl + 1;
    if (line.length) handleCdxLine(crawl, block, line);
    if (start >= text.length) break;
  }
}

function handleCdxLine(crawl, block, line) {
  // `<surt> <timestamp> {json}`
  const sp1 = line.indexOf(' ');
  if (sp1 < 0) return;
  const surt = line.slice(0, sp1);
  let match = null;
  for (const pref of block.prefixes) {
    if (surt.startsWith(pref.p)) {
      match = pref;
      break;
    }
  }
  if (!match) return;

  const statKey = `${crawl}\u0000${match.p}`;
  const ps = prefixStats.get(statKey);
  if (ps) ps.records += 1;

  const brace = line.indexOf('{', sp1);
  if (brace < 0) return;
  const url = extractUrl(line.slice(brace));
  if (!url) return;
  const row = extract(match.family, surt, url);
  if (row) bump(crawl, match.p, row);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await fsp.mkdir(path.join(WORK, 'cc'), { recursive: true });

  const leverDiag = [];

  for (const crawl of CRAWLS) {
    for (const pref of PREFIXES) {
      prefixStats.set(`${crawl}\u0000${pref.p}`, { records: 0, rows: 0, blocks: 0 });
    }

    const idxFile = await ensureClusterIdx(crawl);
    log(`scanning cluster.idx for ${crawl} ...`);
    const { blocks, perPrefix } = await selectBlocks(idxFile);
    for (const { prefix, count } of perPrefix) {
      prefixStats.get(`${crawl}\u0000${prefix.p}`).blocks = count;
    }
    log(
      `  ${blocks.length} unique blocks to fetch ` +
        `(${(blocks.reduce((s, b) => s + b.length, 0) / 1048576).toFixed(1)} MB compressed)`
    );

    // --- Lever diagnostics: what lever.* hosts exist in this crawl's index? ---
    leverDiag.push(await leverProbe(crawl, idxFile));

    let done = 0;
    await pool(blocks, CONCURRENCY, async (block) => {
      try {
        await processBlock(crawl, block);
      } catch (err) {
        log(`  !! block ${block.id} failed: ${err.message}`);
      }
      done += 1;
      if (done % 20 === 0 || done === blocks.length) log(`  blocks ${done}/${blocks.length}`);
    });
  }

  // ---- merge Workday rows that differ only by the CASE of the site ------
  // Workday site names are case-sensitive in URLs but the same board shows up
  // both as /External_Careers and /external_careers in the wild; keeping both
  // would double-count boards. Keep the dominant casing, sum the counts.
  {
    const groups = new Map();
    for (const [key, r] of registry) {
      if (r.ats !== 'workday') continue;
      const g = `${r.token}\u0000${r.shard}\u0000${r.site.toLowerCase()}`;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push([key, r]);
    }
    let merged = 0;
    for (const entries of groups.values()) {
      if (entries.length < 2) continue;
      entries.sort((a, b) => b[1].url_count - a[1].url_count || a[1].site.localeCompare(b[1].site));
      const [, winner] = entries[0];
      for (const [key, r] of entries.slice(1)) {
        winner.url_count += r.url_count;
        for (const c of r.crawls) winner.crawls.add(c);
        registry.delete(key);
        merged += 1;
      }
    }
    if (merged) log(`merged ${merged} Workday rows that differed only by site casing`);
  }

  // ---- write CSV -------------------------------------------------------
  const csvPath = path.join(WORK, 'registry.csv');
  const rows = [...registry.values()].sort(
    (a, b) =>
      a.ats.localeCompare(b.ats) ||
      a.token.localeCompare(b.token) ||
      a.region.localeCompare(b.region) ||
      a.shard.localeCompare(b.shard) ||
      a.site.localeCompare(b.site)
  );
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out = fs.createWriteStream(csvPath);
  out.write('ats,token,region,shard,site,url_count,crawls\n');
  for (const r of rows) {
    out.write(
      [esc(r.ats), esc(r.token), esc(r.region), esc(r.shard), esc(r.site), r.url_count, esc([...r.crawls].sort().join('|'))].join(
        ','
      ) + '\n'
    );
  }
  await new Promise((res, rej) => out.end(() => res()).on('error', rej));

  // ---- summary ---------------------------------------------------------
  const atsList = [...new Set(rows.map((r) => r.ats))].sort();
  const unionTokens = new Map();
  for (const r of rows) {
    if (!unionTokens.has(r.ats)) unionTokens.set(r.ats, new Set());
    unionTokens.get(r.ats).add(`${r.token}|${r.region}|${r.shard}`);
  }

  const header = ['ats', ...CRAWLS, 'union(unique)', 'csv rows'];
  const table = [header];
  for (const ats of atsList) {
    const line = [ats];
    for (const c of CRAWLS) line.push(String(perCrawlTokens.get(c)?.get(ats)?.size ?? 0));
    line.push(String(unionTokens.get(ats)?.size ?? 0));
    line.push(String(rows.filter((r) => r.ats === ats).length));
    table.push(line);
  }
  const widths = header.map((_, i) => Math.max(...table.map((r) => (r[i] ?? '').length)));
  console.log('\n=== unique tokens per ATS ===');
  for (const [i, r] of table.entries()) {
    console.log(r.map((c, j) => String(c).padEnd(widths[j])).join('  '));
    if (i === 0) console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  }

  console.log('\n=== per-prefix record counts (CDX lines matching prefix / rows kept / blocks fetched) ===');
  for (const crawl of CRAWLS) {
    for (const pref of PREFIXES) {
      const s = prefixStats.get(`${crawl}\u0000${pref.p}`);
      console.log(
        `${crawl}  ${pref.p.padEnd(30)} records=${String(s.records).padStart(7)}  rows=${String(s.rows).padStart(7)}  blocks=${s.blocks}`
      );
    }
  }

  console.log('\n=== Lever diagnostics ===');
  for (const d of leverDiag) {
    console.log(`\n${d.crawl}:`);
    console.log(`  cluster.idx lines whose key starts with "co,lever"   : ${d.boundaryCount}`);
    console.log(`  => the whole co,lever,* range lives inside 1 block spanning:`);
    console.log(`     ${d.before}`);
    console.log(`     ${d.after}`);
    console.log(`  lever.co hosts present in that block (CDX record counts):`);
    for (const h of d.hosts) console.log(`     ${h.host.padEnd(28)} ${String(h.count).padStart(6)}`);
    console.log(`  jobs.lever.co    HTTP status: ${JSON.stringify(d.usStatus)}  robots.txt-only records: ${d.usRobots}`);
    console.log(`  jobs.eu.lever.co HTTP status: ${JSON.stringify(d.euStatus)}  robots.txt-only records: ${d.euRobots}`);
  }

  const empty = [];
  for (const crawl of CRAWLS) {
    for (const pref of PREFIXES) {
      const s = prefixStats.get(`${crawl}\u0000${pref.p}`);
      if (s.records === 0) empty.push(`${crawl} ${pref.p}`);
    }
  }
  console.log('\n=== prefixes that returned NO records ===');
  console.log(empty.length ? empty.map((e) => '  ' + e).join('\n') : '  (none)');

  console.log(`\nregistry: ${csvPath}  (${rows.length} rows)`);
}

/**
 * Lever is suspiciously sparse, so probe it explicitly:
 *  - how many cluster.idx blocks even start inside the co,lever,* range
 *  - which lever.co hosts actually appear in the block that spans that range
 *  - the HTTP status mix for jobs.lever.co vs jobs.eu.lever.co
 */
async function leverProbe(crawl, idxFile) {
  let before = null;
  let after = null;
  let boundaryCount = 0;
  let spanBlock = null;

  const rl = readline.createInterface({
    input: fs.createReadStream(idxFile, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const key = line.slice(0, tab);
    const rest = line.slice(tab + 1).split('\t');
    if (key < 'co,lever') {
      before = key;
      spanBlock = { file: rest[0], offset: Number(rest[1]), length: Number(rest[2]) };
    } else {
      if (key.startsWith('co,lever')) boundaryCount += 1;
      if (after === null) after = key;
      if (!key.startsWith('co,lever')) break;
    }
  }
  rl.close();

  const out = {
    crawl,
    before,
    after,
    boundaryCount,
    hosts: [],
    usStatus: {},
    euStatus: {},
    usRobots: 0,
    euRobots: 0,
  };
  if (!spanBlock) return out;

  try {
    const url = `${BASE}/${crawl}/indexes/${spanBlock.file}`;
    const end = spanBlock.offset + spanBlock.length - 1;
    const res = await fetchRetry(url, { headers: { Range: `bytes=${spanBlock.offset}-${end}` } });
    const text = gunzipAll(Buffer.from(await res.arrayBuffer())).toString('utf8');
    const hosts = new Map();
    for (const line of text.split('\n')) {
      if (!/^co,lever[,)]/.test(line)) continue;
      const host = line.slice(0, line.indexOf(')'));
      hosts.set(host, (hosts.get(host) || 0) + 1);
      const st = (line.match(/"status": "(\d+)"/) || [])[1] || '?';
      const isRobots = /\)\/robots\.txt/.test(line);
      if (host === 'co,lever,jobs') {
        out.usStatus[st] = (out.usStatus[st] || 0) + 1;
        if (isRobots) out.usRobots += 1;
      } else if (host === 'co,lever,eu,jobs') {
        out.euStatus[st] = (out.euStatus[st] || 0) + 1;
        if (isRobots) out.euRobots += 1;
      }
    }
    out.hosts = [...hosts.entries()].sort((a, b) => b[1] - a[1]).map(([host, count]) => ({ host, count }));
  } catch (err) {
    log(`  !! lever probe failed for ${crawl}: ${err.message}`);
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
