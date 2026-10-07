# -*- coding: utf-8 -*-
"""
Stage 3 — build an interactive HTML teardown report from the swipe file.

Usage:  py -3.13 report.py <config.json> <workdir>

Reads <workdir>/swipe_file_full.csv + the config's angle_taxonomy/angle_colors/display_name,
and writes <workdir>/report.html: top-line stats, longevity-weighted angle bars, the top-10
champion cards (deduped by near-identical copy), and a searchable/sortable table of every
unique-copy group with live links to the Meta Ad Library. Works for single- or multi-market
configs (a Market column + per-market stat strip appear when >1 country is present).
"""
import csv, re, html, json, statistics, sys
from collections import defaultdict, Counter

def fnum(x):
    try: return float(x)
    except: return 0.0

def main():
    cfg = json.load(open(sys.argv[1], encoding="utf-8"))
    workdir = sys.argv[2]
    FN = f"{workdir}\\swipe_file_full.csv"; OUT = f"{workdir}\\report.html"
    rows = list(csv.DictReader(open(FN, encoding="utf-8-sig")))

    TAXC = {k: re.compile(v, re.I) for k, v in cfg["angle_taxonomy"].items()}
    COLORS = cfg.get("angle_colors", {})
    def tag(txt):
        hits = [k for k, rx in TAXC.items() if rx.search(txt or "")]
        return "|".join(hits) if hits else "(untagged)"

    for r in rows:
        r["dr"] = fnum(r["days_running"]); r["var"] = fnum(r["variants"])
        r["live"] = str(r["is_active"]).lower() in ("true", "1")
        r["angle"] = tag(f"{r['body']} {r['title']} {r['cta']}")

    markets = sorted(set(r["country"] for r in rows))
    multi = len(markets) > 1

    def stats(rs):
        drs = [r["dr"] for r in rs if r["dr"] > 0]
        return {"ads": len(rs), "advs": len(set(r["advertiser"] for r in rs)),
                "median": statistics.median(drs) if drs else 0,
                "maxd": max(drs) if drs else 0,
                "live": sum(1 for r in rs if r["live"])}
    S = stats(rows)

    w = defaultdict(float); cnt = Counter()
    for r in rows:
        for a in r["angle"].split("|"):
            if a == "(untagged)": continue
            w[a] += r["dr"]; cnt[a] += 1
    AG = sorted(w.items(), key=lambda kv: -kv[1])

    # Creative TYPE breakdown (display_format) — which formats actually win, days-weighted + live count.
    FMT = {}
    for r in rows:
        t = (r.get("display_format") or "(blank)").upper()
        f = FMT.setdefault(t, {"n": 0, "days": 0.0, "live": 0, "maxd": 0.0})
        f["n"] += 1; f["days"] += r["dr"]; f["live"] += 1 if r["live"] else 0
        f["maxd"] = max(f["maxd"], r["dr"])
    FMT = sorted(FMT.items(), key=lambda kv: -kv[1]["days"])

    txtrows = [r for r in rows if len((r["body"] or "").strip()) > 15]
    def pctang(a):
        n = sum(1 for r in txtrows if a in r["angle"].split("|"))
        return (100*n/len(txtrows) if txtrows else 0)

    def norm(b):
        b = (b or "").lower(); b = re.sub(r"https?://\S+", "", b)
        b = re.sub(r"[^a-z0-9 ]", "", b); return re.sub(r"\s+", " ", b).strip()[:160]
    def is_real(b):
        b = (b or "").strip()
        if len(b) < 40 or b.startswith("{{"): return False
        tags = len(re.findall(r"#\w+", b)); words = len(re.findall(r"[A-Za-z]{3,}", b))
        return not (tags >= 3 and words < tags * 2)

    groups = {}
    for r in rows:
        if not is_real(r["body"]): continue
        k = (r["country"], r["advertiser"], norm(r["body"]))
        g = groups.get(k)
        if not g:
            g = groups[k] = {"advertiser": r["advertiser"], "country": r["country"], "body": r["body"],
                             "dr": r["dr"], "maxvar": r["var"], "live": r["live"], "n": 0, "ids": [],
                             "ctas": Counter(), "link": r["link_url"]}
        g["n"] += 1; g["dr"] = max(g["dr"], r["dr"]); g["maxvar"] = max(g["maxvar"], r["var"])
        g["live"] = g["live"] or r["live"]
        if r["cta"]: g["ctas"][r["cta"]] += 1
        if r["ad_archive_id"] and len(g["ids"]) < 5: g["ids"].append(r["ad_archive_id"])
        if len(r["body"]) > len(g["body"]): g["body"] = r["body"]
        if not g["link"] and r["link_url"]: g["link"] = r["link_url"]
    G = sorted(groups.values(), key=lambda g: -g["dr"])
    for g in G: g["angle_set"] = tag(g["body"]).split("|")

    def chip(a):
        col = COLORS.get(a, "#94a3b8")
        return f'<span class="chip" style="--c:{col}">{a}</span>'
    def esc(s): return html.escape(s or "")
    AD = "https://www.facebook.com/ads/library/?id="

    def angle_bars():
        mx = max((v for _, v in AG), default=1)
        return "\n".join(
            f'<div class="bar"><div class="bl">{a} <em>&times;{cnt[a]} &middot; {pctang(a):.0f}%</em></div>'
            f'<div class="bt"><div class="bf" style="width:{100*v/mx:.0f}%;background:{COLORS.get(a,"#94a3b8")}"></div></div></div>'
            for a, v in AG)

    def fmt_rows():
        return "\n".join(
            f'<tr><td>{esc(t)}</td><td class="npill">{s["n"]}</td><td class="npill">{s["live"]}</td>'
            f'<td class="npill">{int(s["days"]):,}</td><td class="npill">{int(s["maxd"])}</td></tr>'
            for t, s in FMT)

    def card(g):
        ang = " ".join(chip(a) for a in g["angle_set"] if a != "(untagged)")
        live = '<span class="dot">&#9679;</span> live' if g["live"] else "ended"
        vr = f"&middot; {int(g['maxvar'])} FB variants" if g["maxvar"] else ""
        cp = f"&middot; {g['n']} near-dupes" if g["n"] > 1 else ""
        mk = f'<span class="mk">{g["country"]}</span>' if multi else ""
        cta = g["ctas"].most_common(1)[0][0] if g["ctas"] else "—"
        adlink = f'<a href="{AD}{g["ids"][0]}" target="_blank">see ad &#8599;</a>' if g["ids"] else ""
        site = f'<a href="{esc(g["link"])}" target="_blank">dest &#8599;</a>' if g["link"] else ""
        return f'''<div class="card">
          <div class="chd">{mk}<b>{esc(g['advertiser'])}</b>
            <span class="days">{g['dr']:.0f}d</span><span class="live">{live} {vr} {cp}</span></div>
          <div class="ang">{ang}</div>
          <blockquote>{esc(g['body'][:460])}&hellip;</blockquote>
          <div class="cta">CTA: {esc(cta)} &nbsp; {adlink} &nbsp; {site}</div>
        </div>'''
    champions = "".join(card(g) for g in G[:10])

    def gjson():
        out = []
        for g in G:
            out.append({"a": g["advertiser"], "c": g["country"], "d": int(g["dr"]), "v": int(g["maxvar"]),
                        "n": g["n"], "live": g["live"], "ang": "|".join(g["angle_set"]),
                        "b": g["body"][:700], "id": (g["ids"][0] if g["ids"] else ""), "link": g["link"]})
        return json.dumps(out, ensure_ascii=False)

    mstrip = ""
    if multi:
        cells = "".join(f'<div class="stat"><div class="big">{stats([r for r in rows if r["country"]==m])["ads"]}'
                        f'<small> {m} ads</small></div><div class="lab">median '
                        f'{stats([r for r in rows if r["country"]==m])["median"]:.0f}d &middot; '
                        f'{stats([r for r in rows if r["country"]==m])["advs"]} advertisers</div></div>' for m in markets)
        mstrip = f'<div class="grid3">{cells}</div>'

    top_angle = AG[0][0] if AG else "—"
    colors_js = json.dumps(COLORS)
    HTML = f'''<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(cfg['display_name'])} — Meta Ads Teardown</title>
<style>
:root{{--bg:#0b0e14;--pan:#131824;--pan2:#1a2030;--ink:#e8edf6;--dim:#8a95a8;--line:#242c3d;--ac:#34d399;--cy:#22d3ee;}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto}}
a{{color:var(--cy);text-decoration:none}} a:hover{{text-decoration:underline}}
.wrap{{max-width:1060px;margin:0 auto;padding:0 22px 90px}}
header{{padding:56px 0 30px;border-bottom:1px solid var(--line);margin-bottom:34px}}
.kick{{color:var(--dim);letter-spacing:.22em;text-transform:uppercase;font-size:11px;font-weight:700}}
h1{{font-size:clamp(28px,5vw,48px);line-height:1.05;margin:14px 0 10px;letter-spacing:-.02em}} h1 .ac{{color:var(--ac)}}
.sub{{color:var(--dim)}}
h2{{font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);margin:50px 0 18px;font-weight:700}}
.grid3{{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:18px 0}}
.stat{{background:var(--pan);border:1px solid var(--line);border-radius:14px;padding:20px}}
.stat .big{{font-size:34px;font-weight:800;letter-spacing:-.02em;line-height:1}} .stat .big small{{font-size:14px;color:var(--dim);font-weight:600}}
.stat .lab{{color:var(--dim);font-size:12.5px;margin-top:8px}}
table.m{{width:100%;border-collapse:collapse;background:var(--pan);border:1px solid var(--line);border-radius:14px;overflow:hidden;margin:4px 0 8px}}
table.m th{{text-align:left;padding:10px 14px;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);border-bottom:1px solid var(--line)}}
table.m td{{padding:9px 14px;border-bottom:1px solid var(--line)}} table.m tr:last-child td{{border-bottom:0}}
.bar{{margin:10px 0}} .bl{{font-size:13.5px;margin-bottom:4px}} .bl em{{color:var(--dim);font-style:normal}}
.bt{{height:9px;background:#0d1119;border-radius:6px;overflow:hidden}} .bf{{height:100%;border-radius:6px}}
.card{{background:var(--pan);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin-bottom:14px}}
.chd{{display:flex;align-items:center;gap:10px;flex-wrap:wrap}} .chd b{{font-size:15px}}
.mk{{font-size:11px;font-weight:700;color:var(--dim);border:1px solid var(--line);border-radius:6px;padding:1px 6px}}
.days{{background:#0d1119;border:1px solid var(--line);border-radius:20px;padding:2px 11px;font-weight:800;font-variant-numeric:tabular-nums}}
.live{{color:var(--dim);font-size:12.5px}} .dot{{color:var(--ac)}}
.ang{{margin:10px 0 8px;display:flex;gap:6px;flex-wrap:wrap}}
.chip{{font-size:11px;padding:2px 9px;border-radius:20px;border:1px solid var(--c);color:var(--c);background:color-mix(in srgb,var(--c) 12%,transparent)}}
blockquote{{margin:6px 0;padding-left:14px;border-left:3px solid var(--line);color:#d4dbe8;font-size:14px}}
.cta{{color:var(--dim);font-size:12.5px;margin-top:8px;display:flex;gap:12px;flex-wrap:wrap}}
.tools{{display:flex;gap:10px;margin:0 0 14px;flex-wrap:wrap;align-items:center}}
input,select{{background:var(--pan);border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:9px 12px;font-size:14px}} input{{flex:1;min-width:200px}}
label.ck{{display:flex;align-items:center;gap:7px;color:var(--dim);font-size:13px;cursor:pointer}}
#tbl{{width:100%;border-collapse:collapse;font-size:13.5px}}
#tbl th{{position:sticky;top:0;background:var(--pan2);text-align:left;padding:10px;border-bottom:1px solid var(--line);cursor:pointer;color:var(--dim);font-size:11.5px;text-transform:uppercase;letter-spacing:.06em}}
#tbl td{{padding:10px;border-bottom:1px solid var(--line);vertical-align:top}} #tbl tr:hover td{{background:#10151f}}
.dd{{font-weight:800;font-variant-numeric:tabular-nums}} .bcell{{color:#c3ccdb;max-width:420px}}
.lv{{color:var(--ac)}} .npill{{color:var(--dim);font-variant-numeric:tabular-nums}}
footer{{margin-top:50px;color:var(--dim);font-size:12.5px;border-top:1px solid var(--line);padding-top:20px}}
@media(max-width:720px){{.grid3{{grid-template-columns:1fr 1fr}}}}
</style></head><body><div class="wrap">
<header>
  <div class="kick">Meta Ad Library &middot; Contractor Swipe &amp; Intel</div>
  <h1><span class="ac">{esc(cfg['display_name'])}</span><br>Ads Teardown</h1>
  <div class="sub">{S['ads']:,} ads &middot; {S['advs']} advertisers &middot; {len(G):,} unique-copy groups &middot; market(s): {", ".join(markets)}</div>
</header>
<h2>The shape of the market</h2>
<div class="grid3">
  <div class="stat"><div class="big">{S['ads']:,}<small> ads</small></div><div class="lab">across {S['advs']} advertisers</div></div>
  <div class="stat"><div class="big">{S['median']:.0f}<small> days</small></div><div class="lab">median ad lifespan</div></div>
  <div class="stat"><div class="big">{S['maxd']:.0f}<small> days</small></div><div class="lab">longest-running ad</div></div>
  <div class="stat"><div class="big">{S['live']}<small> live</small></div><div class="lab">currently active of {S['ads']:,}</div></div>
</div>
{mstrip}
<h2>What angle survives (longevity-weighted &middot; {top_angle} leads)</h2>
<p style="color:var(--dim);font-size:13.5px;margin:-6px 0 16px;max-width:760px">
  Bar length = total days-running carried by that angle (a durability-weighted vote, not a raw count);
  <em>&times;n &middot; %</em> = ad count &amp; share of copy ads.</p>
{angle_bars()}
<h2>Winning creative types (by format)</h2>
<p style="color:var(--dim);font-size:13.5px;margin:-6px 0 14px;max-width:760px">
  Which creative FORMATS the market actually commits to. "Total days" = days-running summed across
  that format (the durability vote); "Live" = how many are running right now. A format that's common
  but short-lived is noise; one with high total-days + live count is where the money stays.
  <b>Caveat:</b> this uses Meta's `display_format` label, which can mislabel a video as IMAGE &mdash;
  confirm the top winners' real format by eye (run <code>fetch-creatives.py</code>).</p>
<table class="m"><tr><th>Format</th><th>Ads</th><th>Live</th><th>Total days</th><th>Longest</th></tr>
{fmt_rows()}
</table>
<h2>Swipe file — the champions (deduped, top 10 by longevity)</h2>
{champions}
<h2>Browse the swipe ({len(G)} unique-copy groups)</h2>
<div class="tools">
  <input id="q" placeholder="Search copy, advertiser, angle&hellip;">
  {'<select id="mkt"><option value="">All markets</option>' + "".join(f'<option value="{m}">{m}</option>' for m in markets) + "</select>" if multi else ""}
  <label class="ck"><input type="checkbox" id="liveonly"> live only</label>
</div>
<table id="tbl"><thead><tr>
  <th data-k="a">Advertiser</th>{"<th data-k='c'>Mkt</th>" if multi else ""}<th data-k="d">Days</th>
  <th data-k="n">Copies</th><th data-k="v">Var</th><th data-k="ang">Angle</th><th data-k="b">Copy</th><th>Links</th>
</tr></thead><tbody></tbody></table>
<footer>
  days_running = winning proxy (no public spend for commercial ads). Rows grouped by near-identical copy
  (Copies = how many live/dup ads share it; Var = Meta's own variant count). Hashtag-only &amp; template
  catalog ads excluded. Source: swipe_file_full.csv.
</footer>
<script>
const DATA = {gjson()};
const MULTI = {str(multi).lower()};
const AD='https://www.facebook.com/ads/library/?id=';
const tb=document.querySelector('#tbl tbody'), q=document.getElementById('q'), liveonly=document.getElementById('liveonly');
const mkt=document.getElementById('mkt');
let sortK='d', sortDir=-1;
const COL={colors_js};
function chips(a){{return a.split('|').filter(x=>x!=='(untagged)').map(x=>`<span style="font-size:10.5px;padding:1px 7px;border-radius:20px;border:1px solid ${{COL[x]||'#889'}};color:${{COL[x]||'#889'}}">${{x}}</span>`).join(' ')}}
function render(){{
  const term=q.value.toLowerCase(), lo=liveonly.checked, m=mkt?mkt.value:'';
  let r=DATA.filter(d=>(!m||d.c===m)&&(!lo||d.live)&&(!term||(d.a+' '+d.ang+' '+d.b).toLowerCase().includes(term)));
  r.sort((x,y)=>{{let a=x[sortK],b=y[sortK];return (a<b?-1:a>b?1:0)*sortDir}});
  tb.innerHTML=r.map(d=>`<tr>
    <td><b>${{d.a}}</b></td>
    ${{MULTI?`<td class=npill>${{d.c}}</td>`:''}}
    <td class="dd">${{d.d}}${{d.live?' <span class=lv>&#9679;</span>':''}}</td>
    <td class="npill">${{d.n>1?'&times;'+d.n:''}}</td>
    <td class="npill">${{d.v||''}}</td>
    <td>${{chips(d.ang)}}</td>
    <td class="bcell">${{d.b.replace(/</g,'&lt;').slice(0,240)}}&hellip;</td>
    <td>${{d.id?`<a href="${{AD}}${{d.id}}" target=_blank>ad&#8599;</a>`:''}} ${{d.link?`<a href="${{d.link.replace(/"/g,'')}}" target=_blank>dest&#8599;</a>`:''}}</td></tr>`).join('');
}}
document.querySelectorAll('#tbl th[data-k]').forEach(th=>th.onclick=()=>{{const k=th.dataset.k;sortDir=(sortK===k)?-sortDir:-1;sortK=k;render();}});
q.oninput=render; liveonly.onchange=render; if(mkt)mkt.onchange=render; render();
</script>
</div></body></html>'''
    open(OUT, "w", encoding="utf-8").write(HTML)
    print("WROTE", OUT, f"({len(HTML):,} bytes)")

if __name__ == "__main__":
    main()
