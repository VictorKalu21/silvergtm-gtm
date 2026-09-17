// fetch-ats.mjs — Stage 2. Tier-0: hit each ATS's public job-board JSON directly (no key, no render).
// One call per company returns EVERY open role + full JD body + posting date. Also fetches the board's
// HTML page once to read the company name + any outbound link to the company's own site (WA-09).
// Reads discovery/slugs.json → writes boards.jsonl (one per board) + postings.jsonl (one per posting).
// Resume-safe: boards already in boards.jsonl are skipped. Workable is Cloudflare-rate-limited from
// datacenter IPs (error 1015) — it is off by default; enable in config only from a residential machine.
// Run:  node <skill>/scripts/fetch-ats.mjs   (cwd = run folder)
import fs from "node:fs";
import { loadConfig, fetchText, pool, sleep, htmlToText, decodeEntities, extractHrefs, hostOf, registrable, JUNK_HOST, readJSONL, appendJSONL } from "./lib.mjs";

const CFG = loadConfig();
const ENABLED = CFG.ats || { greenhouse: true, lever: true, ashby: true, workable: false };
const CONC = CFG.fetch?.concurrency || 6, T = CFG.fetch?.timeout_ms || 20000;
const slugs = JSON.parse(fs.readFileSync(CFG.slugs_file || "discovery/slugs.json", "utf8")).filter(s => s.slug && ENABLED[s.ats]);
const done = new Set(readJSONL("boards.jsonl").map(b => `${b.ats}:${b.slug.toLowerCase()}`));
const queue = slugs.filter(s => !done.has(`${s.ats}:${s.slug.toLowerCase()}`));
console.error(`boards: ${slugs.length} enabled, ${done.size} done, ${queue.length} to fetch`);

const boardLinks = html => { const c = {}; for (const h of extractHrefs(html)) { const host = hostOf(h); if (!host || JUNK_HOST.test(host)) continue; const d = registrable(host); c[d] = (c[d] || 0) + 1; } return c; };
const titleOf = html => decodeEntities(((html || "").match(/<title[^>]*>([^<]{0,200})<\/title>/i) || [])[1] || "").trim();

async function greenhouse(slug) {
  const r = await fetchText(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`, { timeout: T });
  if (r.err || r.status !== 200) return { err: r.err || `http${r.status}` };
  let j; try { j = JSON.parse(r.body); } catch { return { err: "badjson" }; }
  const meta = await fetchText(`https://boards-api.greenhouse.io/v1/boards/${slug}`, { timeout: T });
  let name = ""; let intro = ""; try { const m = JSON.parse(meta.body || "{}"); name = m.name || ""; intro = m.content || ""; } catch {}
  const page = await fetchText(`https://job-boards.greenhouse.io/${slug}`, { timeout: T });
  const links = boardLinks((page.body || "") + " " + decodeEntities(intro));
  const postings = (j.jobs || []).map(x => {
    const html = decodeEntities(x.content || "");
    return { ats: "greenhouse", slug, job_id: String(x.id), title: x.title || "", url: x.absolute_url || "", company_name: x.company_name || name,
      posted_at: x.first_published || "", updated_at: x.updated_at || "", location: x.location?.name || "", department: (x.departments || []).map(d => d.name).join("|"),
      body_text: htmlToText(html), body_links: extractHrefs(html) };
  });
  return { name: (name || postings[0]?.company_name || slug).trim(), page_title: titleOf(page.body), links, postings };
}
async function lever(slug) {
  const r = await fetchText(`https://api.lever.co/v0/postings/${slug}?mode=json`, { timeout: T });
  if (r.err || r.status !== 200) return { err: r.err || `http${r.status}` };
  let j; try { j = JSON.parse(r.body); } catch { return { err: "badjson" }; }
  if (!Array.isArray(j)) return { err: "notarray" };
  const page = await fetchText(`https://jobs.lever.co/${slug}`, { timeout: T });
  let name = titleOf(page.body).replace(/\s*[-|–]\s*(jobs|careers).*$/i, "").trim(); if (!name || /not found|404|error/i.test(name)) name = slug; // Lever board HTML 404s for some slugs even when the API answers
  const links = boardLinks(page.body || "");
  const postings = j.map(x => {
    const html = [x.description, ...(x.lists || []).map(l => `<h3>${l.text}</h3>${l.content}`), x.additional].filter(Boolean).join("\n");
    const text = [x.descriptionPlain, ...(x.lists || []).map(l => `${l.text}\n${htmlToText(l.content)}`), x.additionalPlain].filter(Boolean).join("\n");
    return { ats: "lever", slug, job_id: x.id, title: x.text || "", url: x.hostedUrl || "", company_name: name,
      posted_at: x.createdAt ? new Date(x.createdAt).toISOString() : "", updated_at: "", location: x.categories?.location || "", department: [x.categories?.department, x.categories?.team].filter(Boolean).join("|"),
      body_text: text, body_links: extractHrefs(html) };
  });
  return { name, page_title: titleOf(page.body), links, postings };
}
async function ashby(slug) {
  const r = await fetchText(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`, { timeout: T });
  if (r.err || r.status !== 200) return { err: r.err || `http${r.status}` };
  let j; try { j = JSON.parse(r.body); } catch { return { err: "badjson" }; }
  const page = await fetchText(`https://jobs.ashbyhq.com/${encodeURIComponent(slug)}`, { timeout: T });
  // window.__appData.organization carries {name, publicWebsite} — the company's own site, first-party. Take it verbatim.
  const org = ((page.body || "").match(/"organization":\{[\s\S]{0,1500}?"publicWebsite":("[^"]*"|null)/) || [])[0] || "";
  let name = decodeEntities(((org.match(/"name":"((?:[^"\\]|\\.)*)"/) || [])[1] || "").replace(/\\"/g, '"'));
  const site = ((org.match(/"publicWebsite":"([^"]+)"/) || [])[1] || "");
  const links = boardLinks(page.body || "");
  if (site) { const d = registrable(hostOf(site)); if (d && !JUNK_HOST.test(d)) links[d] = (links[d] || 0) + 5; }
  name = name || titleOf(page.body).replace(/\s*(jobs|careers)$/i, "").trim() || slug;
  const postings = (j.jobs || []).filter(x => x.isListed !== false).map(x => ({ ats: "ashby", slug, job_id: x.id, title: x.title || "", url: x.jobUrl || "", company_name: name,
    posted_at: x.publishedAt || "", updated_at: "", location: [x.location, ...(x.secondaryLocations || []).map(s => s.location)].filter(Boolean).join("|"), department: [x.department, x.team].filter(Boolean).join("|"),
    body_text: x.descriptionPlain || htmlToText(x.descriptionHtml || ""), body_links: extractHrefs(x.descriptionHtml || "") }));
  return { name, page_title: titleOf(page.body), links, postings };
}
async function workable(slug) {
  const r = await fetchText(`https://apply.workable.com/api/v1/widget/accounts/${slug}?details=true`, { timeout: T, headers: { Accept: "application/json" } });
  if (r.err || r.status !== 200) return { err: r.err || `http${r.status}` };
  let j; try { j = JSON.parse(r.body); } catch { return { err: "badjson" }; }
  const links = {}; if (j.url) { const d = registrable(hostOf(j.url)); if (d && !JUNK_HOST.test(d)) links[d] = 3; }
  const postings = (j.jobs || []).map(x => ({ ats: "workable", slug, job_id: x.shortcode || x.id, title: x.title || "", url: x.url || `https://apply.workable.com/${slug}/j/${x.shortcode}/`, company_name: j.name || slug,
    posted_at: x.published_on || x.created_at || "", updated_at: "", location: [x.city, x.country].filter(Boolean).join(", "), department: x.department || "",
    body_text: htmlToText([x.description, x.requirements, x.benefits].filter(Boolean).join("\n")), body_links: extractHrefs([x.description, x.requirements].filter(Boolean).join("\n")) }));
  return { name: j.name || slug, page_title: "", links, postings };
}
const FETCHERS = { greenhouse, lever, ashby, workable };

let ok = 0, fail = 0, nPost = 0;
await pool(queue, CONC, async s => {
  const res = await FETCHERS[s.ats](s.slug);
  if (res.err) { fail++; appendJSONL("boards.jsonl", { ats: s.ats, slug: s.slug, err: res.err, hit_urls: s.hit_urls, queries: s.queries }); console.error(`  x ${s.ats}/${s.slug}: ${res.err}`); return; }
  ok++; nPost += res.postings.length;
  appendJSONL("boards.jsonl", { ats: s.ats, slug: s.slug, name: res.name, page_title: res.page_title, links: res.links, n_postings: res.postings.length, hit_urls: s.hit_urls, hit_job_ids: s.hit_job_ids, queries: s.queries });
  for (const p of res.postings) appendJSONL("postings.jsonl", p);
  console.error(`  ✓ ${s.ats}/${s.slug} "${res.name}" ${res.postings.length} postings, links ${Object.keys(res.links).slice(0, 3).join("|") || "-"}`);
  await sleep(CFG.fetch?.delay_ms || 300);
});
console.error(`done: ${ok} ok, ${fail} failed, ${nPost} postings appended (total in file: ${readJSONL("postings.jsonl").length})`);
