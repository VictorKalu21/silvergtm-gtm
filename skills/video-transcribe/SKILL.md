---
name: video-transcribe
description: >
  Turn any video into a clean, timestamped, readable transcript — from a YouTube/Vimeo/Loom/Wistia link,
  a web page that embeds a video (sales pages, course pages, webinar replays, podcast episodes, LinkedIn/X
  posts), or a local .mp4/.mp3. Pulls existing captions first (rotating YouTube player clients to get past
  the "Sign in to confirm you're not a bot" wall on datacenter IPs), falls back to local speech-to-text,
  then does an editorial clean-up pass. Use this WHENEVER the user asks to transcribe, get the transcript,
  "what does this video say", pull the script/notes/quotes/takeaways out of a video, summarize a video or
  webinar, turn a talk into a doc, or pastes a URL to a page whose main content is a video — even if they
  don't say the word "transcribe". Also use it when a plain WebFetch of a page returns only a title and no
  body because the content is in an embedded player.
---

# Video Transcribe

The content of a video is almost always already written down somewhere: YouTube auto-captions every
upload, and most hosted players ship a caption track. So the job is *retrieval first, speech-to-text
second, editing last*. Don't reach for Whisper until captions are proven unavailable — captions are
instant and free, Whisper on a 20-minute video is minutes of CPU.

Two deliverables come out of every run:

1. **Raw transcript** — machine output, timestamped, untouched. This is the evidence.
2. **Cleaned transcript** — the same content edited for reading. This is what the user actually wants.

Give the user both, and say clearly which is which.

## Step 1 — Run the script

```bash
python3 skills/video-transcribe/scripts/transcribe.py "<url-or-file>" --out <workdir> --json
```

It handles the whole retrieval pipeline and writes `<slug>.raw-transcript.md`:

- A **page URL** (not a known video host) is fetched and scanned for YouTube/Vimeo/Loom/Wistia/Vidyard
  embeds, `og:video` tags and bare media files. The first candidate is used; if the log lists several,
  re-run with `--pick N`.
- A **video URL** goes straight to yt-dlp. Manual subtitles beat auto-captions; `--lang` picks the
  language (default `en`, and it also accepts YouTube's `en-orig` untranslated auto track).
- **YouTube bot-wall.** From a datacenter/proxy IP, YouTube's `web` and `tv` clients often answer
  "Sign in to confirm you're not a bot" or "page needs to be reloaded". That is not a dead end — the
  script rotates through `android`, `ios`, `web_embedded`, `mweb` clients, and one of them almost
  always returns the caption track. Don't add cookies or give up when you see that error on the first
  attempt; read the log to see which client succeeded.
- **No captions at all** (Loom, private Vimeo, raw MP4, a local file): it downloads the audio and runs
  `faster-whisper` (preferred, no system ffmpeg needed) or `openai-whisper`. If neither is installed it
  exits 4 and tells you the pip command — install and re-run. `--whisper-model small` is the right
  default for speed; use `medium` only if the raw output is visibly garbled.
- `--chunk 45` controls the paragraph size (seconds per timestamp). 45s reads well for talking-head
  videos; use 20–30 for dense interviews where the user wants to jump to specific quotes.
- `--json` prints title, speaker/channel, publish date, duration, and which retrieval method worked.
  Put those in your reply — the user usually doesn't know how long the video is or who's speaking.

`yt-dlp` is auto-installed from PyPI if missing. Put outputs in a working directory, not in the repo —
transcripts are content, not process, and this repo gitignores deliverables.

## Step 2 — Clean it up

Auto-captions are accurate on words but wrong on everything that makes text readable. Do an editorial
pass and save it as `<slug>.transcript.md` next to the raw file. Keep the same metadata header and add
`**Edited:** cleaned from auto-captions; timestamps approximate` so nobody mistakes it for verbatim.

What to fix, and why:

- **Mis-heard product and proper names.** The single biggest quality lever. Captions render "Claude"
  as "cloud", "Clay" as "play"/"clay", company and person names phonetically. Use the page, the channel
  name, the video description and the surrounding sentence to resolve them; the same wrong word repeated
  ten times is one fix. When you genuinely can't tell, keep the caption's word and mark it `[?]`.
- **Punctuation and sentence boundaries.** Captions have almost none. Break run-ons into sentences.
- **Filler and false starts.** Drop "um", "uh", "like", "basically", "okay?", repeated words, and
  restarted phrases ("in the next days, in the next 90 days" → "in the next 90 days"). Keep the
  speaker's voice and idioms — you're an editor, not a rewriter. Never change a claim, a number, or a
  name; if a sentence is genuinely ambiguous, leave it as spoken.
- **Paragraphs by topic, not by clock.** Re-group the timestamped chunks around what's being said
  (intro, the pitch, the offer, pricing, case studies, CTA…). Keep one `[mm:ss]` at the start of each
  paragraph so the reader can still seek in the video; approximate is fine.
- **Speaker labels** only when there is more than one speaker. Infer names from the intro and metadata;
  fall back to "Host:" / "Guest:".
- **Spoken-to-written numbers**: "3 to 5,000 per month" → "$3,000–5,000 per month" when the context
  makes the unit unambiguous; otherwise leave it.

If the user asks for a *summary, notes, quotes, or takeaways* rather than the transcript, still produce
the cleaned transcript file (it's cheap once you have the raw one and they'll want to check quotes
against it), then build the summary from the cleaned version and quote with timestamps.

## Step 3 — Deliver

Send both files (attach, don't render — they're long). In the reply, lead with: title, who's speaking,
length, date, and *how* the transcript was obtained (manual captions / auto-captions / Whisper),
because that sets the reader's expectation of accuracy. Then a 4–8 line outline with timestamps so
they can jump around. Don't paste the whole transcript into chat.

## When it doesn't work

| Symptom | Meaning | Do |
|---|---|---|
| exit 2 "no video embed found" | Page loads the player via JS or the video is behind a login | Open the page source for `iframe`/`player` URLs, or ask the user for the direct link |
| every client says "Sign in to confirm" | YouTube is blocking this IP entirely | Ask the user to paste the transcript from YouTube's "Show transcript" panel, or to send the video file |
| captions exist but are in another language | `--lang` mismatch | Re-run with the right code; YouTube auto-translates so `en` is usually still available |
| exit 4 | Audio downloaded, no STT backend | `pip install faster-whisper`, re-run |
| Whisper output is word salad | Music/multiple speakers/heavy accent | Try `--whisper-model medium`; tell the user it's lower confidence |

## Worked example (2026-09-16)

Prompt: "can you transcribe the video here? https://michaelsaruggia.com/gtme-program"

- Page scan found one embed: YouTube `S30_0ZkuPAQ`, "Become a Go-To-Market Engineer Consultant",
  Michael Saruggia, 16:52, published 2026-06-15.
- `default` and `android`/`ios` clients answered "Sign in to confirm you're not a bot" (the session
  had hit YouTube a few times already); `web_embedded` returned the auto-caption track (527 segments).
  Whole run: ~15 seconds. No Whisper needed.
- Clean-up pass fixed "cloud"→Claude, "play"→Clay, "mikerosado.com"→michaelsaruggia.com, stripped
  ~200 fillers, regrouped 23 clock-chunks into 8 topic sections (intro, credentials, opportunity,
  why people get stuck, program + ROI, pricing, case studies, CTA). Raw 18.8k chars → clean 17.5k.
- Delivered both files attached plus a 6-line timestamped outline in chat.
