# Dry run of M&A or restructuring v1 on GPT 5.6 Luna, 2026-09-29

API harness (`clay/dryrun.py`), six rows chosen as: two expected yes (Evri, Bromford), one subsidiary test (Sysco), one history-page test (Southern Housing, merged 2022), two expected no (Halfords, Unite).

| Row | Said | Source | Verified | Verdict |
|---|---|---|---|---|
| evri.com | yes, acquirer, high, 2025-10-01 | Evri press release: merger with DHL eCommerce UK completed 1 Oct 2025, Coll-8 named | Page text matches | Correct. |
| bromford-flagship.co.uk | yes, acquirer, high, 2026-01-29 | Bromford news: merger with LiveWest completed | Page text matches | Correct, and a fact the supply chain column never surfaced. |
| st.co.uk | yes, acquirer, high, 2025-09-29 | Hilton Food Group RNS PDF: Sysco GB bought Fairfax Meadow for £54m | PDF loads, seller's RNS | Correct, and the subsidiary rule held the right way: it found Sysco GB's own deal, not the parent's Restaurant Depot bid. Date is exactly the window start. |
| southernhousing.org.uk | no | Annual report page, news, Inside Housing | All load | Correct. Explicitly rejected 2024 redundancies as outside the window and the 2022 merger as history. Both exclusion rules working. |
| halfords.com | yes, restructuring, high, 2025-11-27 | FY26 interim results PDF: £3.1m restructuring costs and closure of a small number of garages | PDF loads, text not extractable here | Likely false positive by intent. An exceptional-cost line and "a small number" of closures is not a programme. The rule needs a materiality floor. |
| unitestudents.com | yes, acquirer, high, 2026-01-28 | Unite scheme effective announcement: acquisition of Empiric Student Property | Announcement and offer pages load | Correct. Our "expected no" was wrong again; the sample picked a real acquirer. |

JSON 6 of 6. Identity 6 of 6. Every yes cites a primary source. 0 aggregators, 0 dead URLs. Searches 3 to 6 per row, 30k to 58k tokens. Note the harness opened the Halfords PDFs directly; Clay's tool did not on three supply chain runs, so expect Clay to behave differently on that row.

## One fix for v2

Restructuring is under-specified. "Closure programme" and "group reorganisation" let a £3.1m exceptional line through. Add a floor: restructuring counts only when the source names a consultation, a number of roles or sites, a division or brand being closed or sold, or an insolvency process. A restructuring or exceptional cost line in results with no programme described does not count.

Nothing else changed a verdict wrongly. Apply the fix, then run the same 10 QA rows as supply chain in Clay.
