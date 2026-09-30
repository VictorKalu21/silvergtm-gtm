# Dry run of M&A or restructuring v2 on GPT 5.6 Luna, same six rows, 2026-09-29

v2 added a materiality floor to restructuring: the source must name a consultation, a number of roles or sites, a named division or brand closed or sold, or an insolvency process.

| Row | v1 | v2 | Verified | Verdict on v2 |
|---|---|---|---|---|
| evri.com | yes, acquirer | yes, acquirer, 2025-10-01 | Same Evri release | Correct, stable. |
| bromford-flagship.co.uk | yes, acquirer | yes, acquirer, 2026-01-29 | Same Bromford news | Correct, stable. |
| st.co.uk | yes, acquirer (Fairfax Meadow) | no | Checked Sysco parent releases and Sysco International Holdings Ltd on Companies House | Miss. The Fairfax Meadow deal v1 found on Hilton Food's RNS was not surfaced this run. It correctly excluded the parent's Restaurant Depot deal. Search variance, same pattern as supply chain. |
| southernhousing.org.uk | no | yes, restructuring, 2025-11-20 | Find a Tender audit notice verified: "the group is also working on consolidating the group structure", "Optivo Homes Ltd – will be closed before this audit", listed among dormant subsidiaries | False positive by intent. Closing a dormant legal entity in an auditor tender is not a restructuring programme. It met v2's "named division closed" test literally. |
| halfords.com | yes, restructuring (£3.1m costs) | yes, restructuring, 2026-06-25 | FY26 RNS PDF text verified: "£0.5m charge ... following the completion of closures of certain garages ... as part of the garage optimisation programme announced in FY25" | Marginal but correct by rule. A named programme with closures completed inside the window. The floor did its job: v1 cited a cost line, v2 cited the programme. Note the programme was announced before the window; only the completions are inside it. |
| unitestudents.com | yes, acquirer | yes, acquirer, 2026-01-28 | Same scheme announcement | Correct, stable. |

JSON 6 of 6, identity 6 of 6, every yes on a primary source, 0 aggregators, 0 dead URLs. Searches 3 to 5, 33k to 52k tokens.

## Reading

- The floor worked on Halfords: the model went from citing a cost line to citing the named programme. That is the behaviour change we wanted.
- The floor opened a new hole on Southern Housing: "a named division or brand closed" is satisfied by a dormant subsidiary being struck off. One line closes it.
- Sysco is search variance, not a prompt effect. Same behaviour as the supply chain runs. Rerun policy handles it.

## One line for v3

Restructuring must affect people, sites or an operating business. Closing, merging or renaming a dormant or non-trading legal entity, a finance vehicle, or an internal holding company does not count.

That is the only change v2 supports. Apply it and take v3 into Clay on the same 10 QA rows as supply chain.
