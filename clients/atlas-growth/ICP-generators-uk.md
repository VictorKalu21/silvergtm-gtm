# Atlas Growth — UK pull spec: home backup power (DRAFT, 2026-09-28)

> Status: **icp-source-planner Phase 0–1 done, waiting on the operator at the GATE below.** Nothing scraped,
> no credits spent. Probes pasted in the session transcript (2026-09-28).

## Why the US spec does not port

The US list is built on OEM dealer locators (Generac 13k, Briggs 2.4k …). In the UK those networks barely exist
for homes:

| probe (2026-09-28) | result |
|---|---|
| Generac `DealerLocatorApi/GetDealers`, category 1 (home standby), 200-mile radius, `GBR SW1A1AA` / `GBR M11AE` / `GB LS1 4DY` | **0 dealers** on all three (HTTP 200, `resultCount: 0`) |
| Generac UK | sold through PRAMAC-GENERAC UK Ltd (Stoke) via a handful of distributors (Kentec, Powerplant Ltd …); residential range 8–13 kVA gas/LPG; no public locator |
| Briggs & Stratton UK | Barrus is sole distributor; installs are done by the dealer **or one national installer (Total Electrical & Mechanical Solutions)**; no public dealer list |
| Kohler / Rehlko UK | commercial diesel (WB Power Services, now owned by Rehlko) — not residential |

UK homes rarely buy a standby generator. **UK home backup power is battery storage** (usually sold with solar PV),
and that market has a public, keyless registry.

## Ranked sources (free-first)

| # | source | what it gives | verdict |
|---|---|---|---|
| 1 | **MCS "Find an Installer"** — `mcscertified.com/wp-admin/admin-ajax.php?action=filter_installers&nonce=<page nonce>&form_type=installers&technology[]=technology_battery&page=N` | **5,627 certified installers, 2,789 battery-certified** (233 pages × 12). Per row: name, **email (12/12 on the probe page)**, phone, website (~80%), full address + postcode, lat/lng, certification number + body (NAPIT/NICEIC…), a 0/1 flag per technology (battery, solar PV, heat pumps …). Keyless; nonce read from the page. | **Spine** for a battery/backup-power ICP. Registry membership proves the attribute (process rule R3). ~233 calls. |
| 2 | Google Maps via `google-maps-scrape` — "generator installation", "standby generator installer", "generator engineer", "battery storage installer" | the few genuine UK generator installers + battery installers MCS misses | gap-fill; needs a 3-call calibration probe (scraper.tech credits — operator go) |
| 3 | Generac-UK / Pramac distributor sites, Barrus dealer network | tens of dealers at most, no locator | hand list only |
| 4 | NICEIC / NAPIT registered-contractor search | every UK electrician (tens of thousands), no backup-power signal | not a source for this ICP; useful only as an owner/registry join |

Owner rung (back half): **Companies House** is the UK owner registry (validated on the UK foundation run: 504 of 586
names). MCS gives the legal company name, which makes the CH join cleaner than a Maps name.

## The decision the operator has to make (GATE)

The offer today is: *"We help generator installation companies book 10 qualified **generator estimate** appointments
that turn into install projects every month."* A UK list built on MCS battery installers needs that offer reworded
to **home battery / backup-power survey appointments** — that is Atlas Growth's call, not ours.

- **A. Backup power (recommended):** MCS battery-certified installers (2,789) as the spine + a Maps gap-fill for
  generator installers; offer reworded to battery/backup-power surveys. Tag `segment`: battery_backup |
  generator | solar_battery.
- **B. Generators only:** Maps gap-fill for UK standby-generator installers only. Expect a small list (likely low
  hundreds); run a 3-call calibration probe before promising any number.
- **C. Both, separate campaigns:** A and B as two lists and two offers.

## Qualification (proposed, Phase 3)

- Keep: domestic installers (MCS battery flag = 1; site text sells home battery / backup power / generators to
  homeowners). Drop: commercial-only, installers who only do heat pumps, national energy suppliers (Octopus, British
  Gas, EDF …) and roll-ups flagged `brand_family`.
- No review floor on MCS rows (registry proves the trade); Maps rows floor 5 (the UK foundation run's floor).
- Back half unchanged: `google-maps-scrape` STEP 5e site-text fit → owner (Companies House, then sweep) → emails
  (MCS email + on-site; no waterfall) → MillionVerifier → BounceBan → Plusvibe with a UK personalize config.

## Test (Phase 4, after the gate)

Stratify MCS by certification-technology mix (battery-only · battery + solar · battery + heat pump) and by nation
(England · Scotland · Wales · NI); ~50 qualified rows; report email fill, website fill, site-text fit, and overlap
with the UK foundation lists.
