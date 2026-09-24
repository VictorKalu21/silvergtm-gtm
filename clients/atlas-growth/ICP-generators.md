# Atlas Growth — ICP: residential standby-generator installers (US)

> Opened 2026-09-24. Status: **ICP contract agreed in part — see "Open decisions" before any spend.**

## The pipeline lives in `google-maps-scrape` (operator directive, 2026-09-24)

**Every row, whatever source it came from, runs through the `google-maps-scrape` pipeline end to end.**
Owner-finding (STEP 6) and the Plusvibe upload (STEP 7b) are **mandatory deliverables**, not options.
Dealer-locator and permit rows are normalised into the engine's `leads_clean.csv` shape (same move as
the 2026-09-16 UK operator-export run) and enter at STEP 5b qualify → 5c cross-run dedupe →
5c-dom collapse → 5e site-text fit → 6 owner-finding → 6e emails → 7b Plusvibe. `icp-source-planner`
only decides the sources; it never ships a list that skips the Maps-skill back half.

## The offer (same offer as foundation repair, reworded for the trade)

> We help generator installation companies book 10 qualified generator estimate appointments that
> turn into install projects every month using Facebook lead generation.

A performance lead-generation retainer for **residential** in-home appointments. The buyer is
whoever controls **marketing spend and lead flow**.

## Footprint

**US, nationwide.** HQ address. Drop non-US (the dealer locators return CA/MX rows).

## Business types

Companies that sell and install **residential home standby generators** (Generac, Kohler/Rehlko,
Briggs & Stratton, Champion, Cummins dealers), plus **electrical contractors** that install home
standby generators as a real service line. Each row is tagged `segment`:
`generator_dealer` (on an OEM dealer list or generator-led site) | `electrical_contractor`
(general electrician for whom generator install is a real, advertised service).

## Qualification, in plain language

**Kept:** open, US, residential generator install/sales is a real service (site text or OEM
home-standby dealer listing), independent or roll-up (roll-ups kept and flagged `brand_family`,
same as foundation).

**Dropped:** **commercial/industrial-only** firms (operator, 2026-09-24 — no homeowner to sell to) ·
small-engine / outdoor-power / lawn-equipment shops listed as "Authorized Dealer" (Briggs trap) ·
big-box and rental outlets (Home Depot, Sunbelt Rentals, United Rentals) · distributors · portable-
generator retailers with no install service · lead-gen aggregator sites · electricians with no
generator service.

**Plumbers — OPEN (operator: "tricky").** Proposed rule, not yet signed off: a plumbing/HVAC firm is
kept as `generator_dealer` **only when its site text sells generator installation as its own
service** (or it sits on an OEM installer tier: Briggs INSTALLER / PLATINUM / ELITE IQ, Generac
Elite+/Premier/PowerPro, Kohler Gold+). A plumber that only pulls the gas-line permit for someone
else's install is dropped.

## Target role — WHO we are trying to reach

Same offer, same buyer as foundation repair: the KEEP / EXCLUDE tables in `ICP.md` apply verbatim.

- **KEEP:** Owner · Co-Owner · President · CEO · Founder · Partner · bare General Manager ·
  Marketing Manager / Director / VP · Operations Manager only at ≤2-location firms.
- **EXCLUDE (trade-specific false positives):** Estimator · Generator Technician · Service Tech ·
  Installer · Master Electrician / Journeyman (when not also owner) · Project Manager · Service
  Manager · Sales Consultant / Generator Specialist / Energy Advisor (the in-home closer who runs
  the appointment) · Office Manager · Dispatcher · CSR.
- Evaluate EXCLUDE before KEEP; a department qualifier is an exclusion (`Service Manager` drops).

## Sources (icp-source-planner Phase 2, 2026-09-24)

| Role | Source | Profile |
|---|---|---|
| Spine | OEM dealer locators — Briggs (2,466 US, 1 call), Generac (6–9k, ~1.5–2.5k zip-grid calls), Kohler/Rehlko, Champion (~476). Cummins blocked (Cloudflare). | `skills/icp-source-planner/library/oem-dealer-locators--us-generator-installers.md` |
| Gap-fill | Google Maps (`generator installation service`, electricians) via `google-maps-scrape` | to be written at the Maps run |
| Signal / tier | Open permit data — residential generator permits per contractor (Austin, Baton Rouge, Cape Coral, New Orleans, Seattle, Collin Co.) | `skills/icp-source-planner/library/open-permit-data--residential-generator-installers.md` |

## Site-text fit classification (STEP 5e) — proposed verdicts

| verdict | gate |
|---|---|
| `residential_generator` — home standby sales/install is a real service | **KEEP** |
| `commercial_only` — C&I / critical-power only | drop |
| `small_engine_shop` — outdoor power equipment / portable-generator retail, no install | drop |
| `plumber_gas_only` — plumbing/HVAC, gas hookup only, no generator sales | drop (pending plumber decision) |
| `not_generator` — wrong business, aggregator, electrician with no generator service | drop |
| `unclear` | drop — EXCEPT when the row is on an OEM installer tier or `brand_family` is set |

## Open decisions (answer before the ~50-row test)

1. Plumber rule above — sign off or change.
2. ~~Size floor~~ — decided 2026-09-24: OEM dealer rows have **no floor**; Maps rows **review_count >= 30**.
3. ~~Generac pull~~ — go given 2026-09-24.

## Google Maps leg (decided 2026-09-24)

- **Footprint:** nationwide, `areas` mode — 477 Census-derived anchors across all 50 states + DC
  (`gen-runsheet-generators.js` documents the derivation).
- **Queries (generator-intent only, no bare "electrician"):** generator installation · generator
  dealer · standby generator installer (P1) · Generac dealer · generator shop (P2).
- **Config:** `atlas-growth-generators-config.json` — deny rental/big-box/small-engine/vehicle/marine
  primaries, allow generator/electric/energy/solar/HVAC/plumbing/contractor types, review floor 30.
  Allow/deny lists are PROVISIONAL until the calibration tiles are read.
- **Owner prompt:** `owner-prompts/us-generator-installers.md` (copied into the run folder).
