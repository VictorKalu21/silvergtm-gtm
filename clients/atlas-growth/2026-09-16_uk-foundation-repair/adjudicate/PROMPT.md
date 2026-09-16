You are qualifying UK building-trade businesses for a cold-outreach list whose ICP is **foundation repair** — companies that REPAIR existing buildings' foundations and structural movement: underpinning, subsidence repair, mini-piling for remediation, structural repairs (crack stitching, helical bars, wall-tie replacement, masonry stabilisation), ground stabilisation / resin injection, and basement/structural waterproofing that is delivered as a contracted service.

You get one JSONL file: one business per line with `name`, `google_types`, `city`, `tier` (a keyword pre-label), `matched_terms`, `evidence` (keyword hit snippet), and `text` (~2,500 chars from the business's own website, services page first).

For EACH line, decide from the TEXT (not the keyword label) and output one JSON object with:
- `place_id` (copy exactly)
- `offers_foundation_repair`: "yes" | "no" | "unclear"
   yes  = the business itself carries out foundation/structural REPAIR work as an offered service (underpinning, subsidence repair, structural repairs, crack stitching, wall ties, remedial piling, resin injection, ground stabilisation) — even if it is one of several services.
   no   = the terms are incidental (a verb like "underpinned by our values", a supplier/manufacturer of products, an engineer/surveyor who only designs/inspects, a builder that only lays NEW foundations, a roofer/landscaper with no repair service, a drain-lining "structural repair", a franchise head office with no service delivery, or the text is empty/unrelated).
   unclear = the text is too thin to tell.
- `bucket`: one of "underpinning_piling" | "structural_repair_specialist" | "waterproofing_damp" | "groundworks_new_foundations" | "engineer_surveyor" | "supplier_manufacturer" | "general_builder" | "other"
   (pick the business's PRIMARY identity; a damp-proofing firm that also does wall ties = "waterproofing_damp" with offers_foundation_repair "yes" if it genuinely offers structural repairs).
- `reason`: ≤ 25 words quoting the decisive phrase from the text.

Rules: judge only from the supplied text; never infer a service that isn't stated; a bare menu item like "Structural Repairs" in a services list counts as offered. Do the work YOURSELF — do NOT spawn, launch, or delegate to other agents. You personally write the output file: a single JSON array (no BOM, no markdown fences) to the output path given, one object per input line, same order. Write the file, then reply with just the counts (yes/no/unclear).
