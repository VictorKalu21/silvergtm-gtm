# campaign-review eval harness (Windows workaround -- skill-creator's run_eval.py is broken here:
# WinError 10038 select-on-pipe. This scores triggering + diagnostic quality via `claude -p`.)
# ASCII-only on purpose: PS 5.1 reads .ps1 as cp1252 and non-ASCII (em-dash/arrow) breaks the parser.
# Usage: powershell -File run-eval.ps1   (writes results.md in this folder)
param([string]$Model = "claude-sonnet-4-6")

$ErrorActionPreference = "Continue"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $dir "results.md"
"# campaign-review eval results" | Set-Content $out
"Model: $Model  |  Run via subprocess claude -p" | Add-Content $out
"" | Add-Content $out

function Ask($prompt) {
  try { $r = & claude.cmd -p --model $Model $prompt 2>$null; return ($r -join " ").Trim() }
  catch { return "ERROR" }
}

# ---------- 1. TRIGGER EVAL ----------
# expect = "campaign-review"  OR  "NONE" (should route elsewhere / not fire)
$trig = @(
  @{q="Can you review my cold email campaign? My reply rate is low."; e="campaign-review"}
  @{q="Diagnose why my Instantly account is not booking meetings."; e="campaign-review"}
  @{q="Run the weekly roster review across all my cold outreach clients."; e="campaign-review"}
  @{q="My Smartlead campaigns get opens but no replies. What is wrong?"; e="campaign-review"}
  @{q="Audit my HeyReach LinkedIn campaign, acceptance rate is terrible."; e="campaign-review"}
  @{q="I think my cold email is going to spam. Can you check the account?"; e="campaign-review"}
  @{q="Categorize the replies in my Instantly campaign and tell me what is landing."; e="campaign-review"}
  @{q="Is my campaign problem the copy, the list, or deliverability?"; e="campaign-review"}
  @{q="Check whether my live campaigns drifted from our approved ICP."; e="campaign-review"}
  @{q="Review the Bluesoft cold email account."; e="campaign-review"}
  @{q="My bounce rate spiked on Smartlead. What is going on?"; e="campaign-review"}
  @{q="Should I run an inbox placement test? My replies dropped to zero."; e="campaign-review"}
  # --- near-misses that must NOT fire (belong to sibling skills) ---
  @{q="Write me a cold email sequence for SaaS founders."; e="NONE"}
  @{q="Help me build a list of Shopify agencies to reach out to."; e="NONE"}
  @{q="Scrape Google Maps for roofers in Phoenix."; e="NONE"}
  @{q="Improve the copy on my landing page, it is not converting."; e="NONE"}
  @{q="Set up a Google Ads search campaign for my product."; e="NONE"}
  @{q="Generate 10 headline variations for my Facebook ad."; e="NONE"}
  @{q="Find agencies on Clutch and get their decision-maker emails."; e="NONE"}
  @{q="What topics should I write about on my blog?"; e="NONE"}
  @{q="Set up GA4 conversion tracking on my site."; e="NONE"}
  @{q="Draft a re-engagement email to a warm lead who went quiet."; e="NONE"}
)

"## 1. Triggering (should fire / should not)" | Add-Content $out
"| # | Expected | Result | Pass | Query |" | Add-Content $out
"|---|---|---|---|---|" | Add-Content $out
$tp=0; $i=0
foreach($c in $trig){
  $i++
  $p = "You have skills available. Do NOT perform the task. Reply in ONE line only: the exact skill name you would invoke (or NONE), then a dash and a short reason. Request: " + $c.q
  $a = Ask $p
  $fired = $a -match "campaign-review"
  if($c.e -eq "campaign-review"){ $pass = $fired } else { $pass = -not $fired }
  if($pass){ $tp++ }
  $mark = if($pass){"PASS"}else{"**FAIL**"}
  $clean = $a -replace "\|","/"
  $clean = $clean -replace "`r?`n"," "
  "| $i | $($c.e) | $clean | $mark | $($c.q) |" | Add-Content $out
}
"" | Add-Content $out
"**Trigger score: $tp / $($trig.Count)**" | Add-Content $out
"" | Add-Content $out

# ---------- 2. QUALITY EVAL (golden client cases -> correct binding constraint) ----------
$qual = @(
  @{n="Untitled(orig)"; data="2,568 contacted, 15 replies (0.58 percent), bounce 1.4 percent, 0 positives. About 80 percent of replies are out-of-office autoresponders. A prospect quoted the sending address as k.caswell at webidentify-untitled.info. The SAME offer to the SAME people converts fine on LinkedIn."; e="deliver|placement|spam|infra"}
  @{n="SolveX"; data="Field-service app. 7,180 sent, 0.86 percent reply, bounce about 0.9 percent. Plenty of human replies. Dominant objection: only 1 contractor and one van, small team we move together. When it reaches a multi-person firm with an office it converts (2 positives from real companies)."; e="size"}
  @{n="Bluesoft"; data="Shopify CRO offer. 27,300 sent, 0.80 percent reply, bounce about 1 percent, many human replies. Who replies: a prosthetics maker, a surgical-lighting company, an industrial-filter company, all running Shopify but all B2B/industrial. Contacts are National Account Executive and B2B Business Manager. Copy claims grew revenue 2,600 percent. The medical and parts verticals ARE in the client approved GTM."; e="persona|business.model|distributor|targeting"}
  @{n="Campus51"; data="Teacher-PD offer. Winning: 7.5 percent reply, 2 percent positive (33 real interested). But bounce is 27 percent, and about 15 percent of replies are I have retired, no longer employed here, wrong contact."; e="list|bounce|quality|rot"}
  @{n="Minerva(seller)"; data="Agency M and A offer asking owners about acquisition. 4 percent reply, mail clearly lands (people read and reply at length). About 31 percent is this a scam or not interested, about 45 percent seasonal OOO, low positives. The positives are timing-gated: might exit Q1-2027, still building."; e="offer|timing"}
)

"## 2. Diagnostic quality (golden cases -> correct binding constraint)" | Add-Content $out
"| Case | Expected | Model verdict | Pass |" | Add-Content $out
"|---|---|---|---|" | Add-Content $out
$qp=0
foreach($c in $qual){
  $p = "You have skills available. Using the campaign-review skill diagnostic methodology, read this cold-outreach campaign data and reply in ONE line: the single BINDING CONSTRAINT / primary diagnosis, then a dash and one short reason. Choose from: deliverability/placement, copy/offer, offer-timing, targeting-company-size, targeting-persona-or-business-model, list-quality/bounce. Data: " + $c.data
  $a = Ask $p
  $pass = $a -match $c.e
  if($pass){ $qp++ }
  $mark = if($pass){"PASS"}else{"**FAIL**"}
  $clean = $a -replace "\|","/"
  $clean = $clean -replace "`r?`n"," "
  "| $($c.n) | $($c.e) | $clean | $mark |" | Add-Content $out
}
"" | Add-Content $out
"**Quality score: $qp / $($qual.Count)**" | Add-Content $out
"" | Add-Content $out
"## TOTAL: trigger $tp/$($trig.Count), quality $qp/$($qual.Count)" | Add-Content $out
"DONE" | Add-Content $out
