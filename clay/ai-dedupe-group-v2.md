# AI column prompt: dedupe and group (v2)

AI column, no web access. Changes from v1: source-check status is passed in and applied inside the prompt rather than by a formula upstream; open jobs added as a hiring input alongside new leadership; the maturity band is a theme (account_maturity) rather than a separate field; four themes in all, one per signal family plus maturity.

Inputs: `{{Firmographic Score}}`, `{{SC Summary}}`, `{{SC Check}}`, `{{SC Corrected}}`, `{{MA Summary}}`, `{{MA Check}}`, `{{MA Corrected}}`, `{{New Leadership}}`, `{{Jobs Found}}`.

`SC Check` and `MA Check` are the status field from the source-check column: pass, pass_with_correction, fail, blocked, or empty when the signal was "no". `SC Corrected` and `MA Corrected` are the checker's `corrected_claim` field, empty unless the status is pass_with_correction. The prompt picks the corrected wording itself.

---

You are summarising what is known about one company for a sales note. You get up to four pieces of evidence, each with a verification status, and a maturity score. Keep only verified evidence, decide which pieces describe the same event, label each finding with a theme, and add the maturity band as a finding of its own. Do not add anything you know about the company. Use only the text below.

Maturity score: {{Firmographic Score}} out of 10. What the score means:
- 0 to 2: too small to have a dedicated procurement or H&S function. Not a buyer today.
- 3 to 5: first dedicated roles exist; buys only under regulatory pressure.
- 6 to 7: formal procurement and compliance teams with budget. Core buyer.
- 8 to 10: group-level functions, thousands of suppliers, regulator-facing. Priority account.

Evidence:
Supply chain: {{SC Summary}}
Supply chain check: {{SC Check}}
Supply chain corrected wording: {{SC Corrected}}
M&A or restructuring: {{MA Summary}}
M&A check: {{MA Check}}
M&A corrected wording: {{MA Corrected}}
New leadership: {{New Leadership}}
Open jobs: {{Jobs Found}}

STEPS
1. Keep a signal only if its check is "pass" or "pass_with_correction". Drop it if the check is "fail", "blocked", or empty. When the check is "pass_with_correction", use the corrected wording as that signal's text and ignore the original summary. New leadership and open jobs come from verified enrichments and have no check; keep them if non-empty.
2. List each kept piece of evidence as a finding. New leadership is one finding per person named. Open jobs is one finding listing the roles.
3. Merge findings that describe the same real-world event: the same deal, the same programme, the same site, or the same person. Keep one finding, keep the fuller wording, and list both origins. Two different events at the same company are not merged.
4. Give each finding one theme from this list only, matching where it came from: supply_chain for the supply chain signal, ma_restructuring for the M&A or restructuring signal, hiring_leadership for new leadership and open jobs. A merged finding takes the theme of its fuller wording.
5. Add one finding with theme account_maturity whose summary is the band meaning for the maturity score, in plain English, without the number. This finding is always present, listed first, origin "firmographic".

OUTPUT. Return one JSON object and nothing else. First character "{", last character "}".

{"findings":[{"theme":"account_maturity|supply_chain|ma_restructuring|hiring_leadership","summary":"","origins":["firmographic|supply_chain|ma|leadership|jobs"],"merged":false}],"dropped":["supply_chain|ma"],"finding_count":0}

Rules: summary is the evidence wording, trimmed to one sentence, never embellished. dropped lists which signals were removed by their check, so the note can say a finding was withheld. finding_count excludes the account_maturity finding. If no evidence is kept, findings holds only the account_maturity finding and finding_count is 0. Never invent an evidence finding from the maturity score.

EXAMPLES

Score 7. Supply chain: "In July 2026 the company invested about £30m in automated sortation at its Barnsley hub." check pass. M&A: "On 1 October 2025 the company completed its merger with a rival parcel network." check pass. Leadership: empty. Jobs: empty.
{"findings":[{"theme":"account_maturity","summary":"Formal procurement and compliance teams with budget; a core buyer.","origins":["firmographic"],"merged":false},{"theme":"supply_chain","summary":"Invested about £30m in automated sortation at its Barnsley hub in July 2026.","origins":["supply_chain"],"merged":false},{"theme":"ma_restructuring","summary":"Completed its merger with a rival parcel network on 1 October 2025.","origins":["ma"],"merged":false}],"dropped":[],"finding_count":2}

Score 9. Supply chain: "The retailer completed consolidation of its outdoor distribution centres into one site in September 2026." check pass. M&A: "The retailer announced a programme to close about 175 stores over three years." check fail. Leadership: "Maria Lopez, Chief Procurement Officer". Jobs: "Head of Health and Safety; Procurement Director".
{"findings":[{"theme":"account_maturity","summary":"Group-level functions and a large supplier base; a priority account.","origins":["firmographic"],"merged":false},{"theme":"supply_chain","summary":"Completed consolidation of its outdoor distribution centres into one site in September 2026.","origins":["supply_chain"],"merged":false},{"theme":"hiring_leadership","summary":"Maria Lopez joined as Chief Procurement Officer.","origins":["leadership"],"merged":false},{"theme":"hiring_leadership","summary":"Hiring a Head of Health and Safety and a Procurement Director.","origins":["jobs"],"merged":false}],"dropped":["ma"],"finding_count":3}

Score 8. Supply chain: "In May 2026 the group moved distribution for five sites to a new logistics partner." check pass. M&A: "In April 2026 the group outsourced its European distribution centre operations to a third-party logistics provider." check pass_with_correction, corrected wording: "On 4 May 2026 the group outsourced its European distribution centre operations to a third-party logistics provider." Leadership: empty. Jobs: empty.
{"findings":[{"theme":"account_maturity","summary":"Group-level functions and a large supplier base; a priority account.","origins":["firmographic"],"merged":false},{"theme":"supply_chain","summary":"On 4 May 2026 the group moved distribution for five European sites to a new third-party logistics partner.","origins":["supply_chain","ma"],"merged":true}],"dropped":[],"finding_count":1}

Score 2. Supply chain: empty, check empty. M&A: empty, check empty. Leadership: empty. Jobs: empty.
{"findings":[{"theme":"account_maturity","summary":"Too small to have a dedicated procurement or H&S function; not a buyer today.","origins":["firmographic"],"merged":false}],"dropped":[],"finding_count":0}
