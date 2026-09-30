# Dry-run — qualify rules vs an 18-row synthetic fixture (2026-09-30, $0, no network)

Fixture: `<scratchpad>/genuk/fixture.csv` (synthetic UK rows written to exercise each rule; not
committed — `*.csv` is gitignored). Engine: `skills/google-maps-scrape/qualify-leads.js`, config
`../atlas-growth-generators-uk-config.json`, then the unrated pass over `excluded_officp.csv`.

```
rules: 4 active | input 18 | KEEP 6 (33%) | DROP 12 (67%)
drop reasons: off_icp_primary 7 · name_deny 2 · too_small 3
```

| row | types (primary first) | reviews | result | why |
|---|---|---:|---|---|
| Cheshire Generators Ltd | Electrician \| Electric generator shop | 12 | **keep** | shire name survives the `" hire"` term |
| Hampshire Electrical Services | Electrician | 9 | **keep** | idem |
| Power Systems UK (Standby Generators) | Mechanical engineer \| Electric generator shop | 6 | **keep** | `engineer` stem admitted |
| Northern Ireland Generators | Electric generator shop \| Electrician | 7 | **keep** | NIR row |
| Ecogen Solar & Battery | Solar energy company | 44 | **keep** | plausible; site-text gate decides |
| Pramac Approved Dealer - Kent Generators | Electric generator shop | 5 | **keep** | floor is `>= 5`; OEM badge is not a deny |
| Speedy Hire Manchester | Equipment rental agency \| … | 88 | drop `off_icp_primary` | hire yard (would also die on name) |
| ABC Plant Hire | Electric generator shop | 40 | drop `name_deny` | `" hire"` fires; primary alone would have kept it |
| City Electrical Factors Leeds | Electrical supply store | 30 | drop `off_icp_primary` | wholesaler |
| Aggreko Bristol | Generator rental service | 20 | drop `off_icp_primary` | `generator rental` primary |
| Halfords Autocentre Cardiff | Auto repair shop | 150 | drop `off_icp_primary` | |
| Hire Station Leicester | Equipment rental agency | 25 | drop `off_icp_primary` | |
| Cheshire Plant Ltd | Construction equipment supplier | 18 | drop `off_icp_primary` | not by name — shire safe |
| Wessex Structural Engineers | Structural engineer | 10 | drop `off_icp_primary` | the `engineer` allow's counterweight |
| Blue Water Marine Electrical | Electrician | 15 | drop `name_deny` | `marine electrical` |
| Sapphire Electrical Contractors | Electrical installation service \| Contractor | 3 | drop `too_small` | 1–4 band = ghost filter (and "Sapphire" untouched by the hire term) |
| Bedford Backup Power Ltd | Electrical installation service | *blank* | drop `too_small` → **recovered** by the unrated pass (has website) | "Bedford" untouched by any `edf` term |
| Essex Standby Generators | Electrician \| Electric generator shop | *blank*, no website | drop `too_small`, unrated pass `no_website` | zero activity evidence — stays out |

Unrated pass: `rules 3 active | KEEP 1 | DROP 11 (not_an_unrated_candidate 9 · no_website 1 · has_review_count 1)`.

What this proves: the substring hazards called out in the config (`hire`/shire, `edf`/Bedford,
`sse`/Essex, `marine`) behave as written; the `engineer` allow is balanced by the consultancy
primary deny; blank reviews route to the recovery pass rather than to a lowered floor. What it
does NOT prove: the real UK hire/sales/install mix or the universe size — that is the calibration
sheet's job (GATE1 §5).
