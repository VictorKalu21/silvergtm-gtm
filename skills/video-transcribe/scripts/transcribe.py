#!/usr/bin/env python3
"""
transcribe.py — get a timestamped transcript from a video URL, a web page that
embeds a video, or a local media file.

Pipeline (cheapest rung first):
  1. Resolve the video. A YouTube/Vimeo/Loom/Wistia/... URL is used as-is; any
     other URL is fetched and scanned for embedded players / media files.
  2. Pull existing captions with yt-dlp (manual subs preferred over auto-subs),
     rotating through player clients because YouTube bot-gates some of them
     from datacenter IPs (the "Sign in to confirm you're not a bot" error).
  3. If there are no captions, download the audio and run local speech-to-text
     (faster-whisper, falling back to openai-whisper) if either is installed.
  4. Normalise everything into one Markdown transcript with a metadata header
     and a timestamp every N seconds.

Usage:
  transcribe.py <url-or-file> [--out DIR] [--lang en] [--chunk 45]
                [--pick N] [--no-whisper] [--whisper-model small] [--json]

Exit codes: 0 ok, 2 no video found, 3 captions + audio both unavailable,
            4 audio downloaded but no speech-to-text backend installed.
"""
import argparse, html, json, os, re, subprocess, sys, tempfile, urllib.request
from pathlib import Path

VIDEO_HOST_RE = re.compile(
    r"(youtube\.com|youtu\.be|vimeo\.com|loom\.com|wistia\.(com|net)|"
    r"fast\.wistia|vidyard\.com|twitch\.tv|dailymotion\.com|tiktok\.com|"
    r"x\.com/.+/status|twitter\.com/.+/status|facebook\.com/.+/videos|"
    r"linkedin\.com/posts|rumble\.com|streamable\.com|descript\.com|"
    r"drive\.google\.com|dropbox\.com)", re.I)
MEDIA_EXT_RE = re.compile(r"\.(mp4|m4a|mp3|webm|mov|mkv|m3u8|wav|ogg)(\?|$)", re.I)

# Order matters: 'default' is yt-dlp's own choice; the rest are the clients that
# most often slip past YouTube's bot-check from a datacenter / proxy IP. web_embedded
# goes first because it kept returning captions after android/ios got rate-limited.
PLAYER_CLIENTS = ["default", "web_embedded", "android", "ios", "mweb", "tv", "web"]
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0 Safari/537.36")


def log(msg):
    print(f"[transcribe] {msg}", file=sys.stderr, flush=True)


def ensure_ytdlp():
    try:
        import yt_dlp  # noqa: F401
        return
    except ImportError:
        log("yt-dlp missing — installing from PyPI")
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "yt-dlp"], check=True)


# ---------------------------------------------------------------- step 1: find the video
def find_videos_in_page(url):
    """Return a de-duplicated list of candidate video URLs found in a web page."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read().decode("utf-8", "replace")
    body = html.unescape(body).replace("\\/", "/")
    found = []

    def add(u):
        u = u.strip().rstrip("\\\"'")
        if u.startswith("//"):
            u = "https:" + u
        if u and u not in found:
            found.append(u)

    # YouTube in any of its shapes → canonical watch URL
    for m in re.finditer(r"(?:youtube(?:-nocookie)?\.com/(?:embed|watch\?v=|v/|shorts/)|youtu\.be/)([A-Za-z0-9_-]{11})", body):
        add(f"https://www.youtube.com/watch?v={m.group(1)}")
    for pat in [
        r"https?://(?:player\.)?vimeo\.com/(?:video/)?\d+[^\s\"'<>]*",
        r"https?://(?:www\.)?loom\.com/(?:share|embed)/[A-Za-z0-9]+",
        r"https?://fast\.wistia\.(?:com|net)/embed/(?:iframe|medias)/[A-Za-z0-9]+",
        r"https?://[^\s\"'<>]*vidyard\.com/[^\s\"'<>]+",
        r"https?://[^\s\"'<>]+\.(?:mp4|m3u8|webm|mov|m4a|mp3)(?:\?[^\s\"'<>]*)?",
    ]:
        for m in re.finditer(pat, body, re.I):
            add(m.group(0))
    # og:video / twitter:player meta tags
    for m in re.finditer(r'<meta[^>]+(?:property|name)="(?:og:video(?::url|:secure_url)?|twitter:player)"[^>]+content="([^"]+)"', body, re.I):
        add(m.group(1))
    # generic iframes we haven't already matched
    for m in re.finditer(r'<iframe[^>]+src="([^"]+)"', body, re.I):
        src = m.group(1)
        if VIDEO_HOST_RE.search(src) and not any(src in f or f in src for f in found):
            add(src)
    return found


# ---------------------------------------------------------------- step 2: captions via yt-dlp
def ytdlp_info(url, client):
    import yt_dlp
    # ignore_no_formats_error: some clients (web_embedded, mweb) return captions but no
    # playable formats without a PO token; we only want the captions, so don't fail on that.
    opts = {"quiet": True, "no_warnings": True, "skip_download": True, "ignore_no_formats_error": True}
    if client != "default":
        opts["extractor_args"] = {"youtube": {"player_client": [client]}}
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=False)


def pick_sub_track(info, lang):
    """Prefer a human-made subtitle track; fall back to auto-captions."""
    def best(tracks, kind):
        if not tracks:
            return None
        # exact lang, then lang-orig (YouTube's untranslated auto track), then any lang-*
        for key in [lang, f"{lang}-orig"] + sorted(k for k in tracks if k.startswith(lang + "-")):
            if key in tracks:
                fmts = tracks[key]
                for want in ("json3", "vtt", "srv3", "srt", "ttml"):
                    for f in fmts:
                        if f.get("ext") == want:
                            return {"url": f["url"], "ext": want, "lang": key, "kind": kind}
        return None
    return best(info.get("subtitles"), "manual") or best(info.get("automatic_captions"), "auto")


def fetch_captions(url, lang):
    """Try every player client until one returns metadata + a caption track."""
    import yt_dlp
    best_info = None
    for client in PLAYER_CLIENTS:
        try:
            log(f"yt-dlp metadata via player_client={client}")
            info = ytdlp_info(url, client)
        except yt_dlp.utils.DownloadError as e:
            log(f"  {client}: {str(e).splitlines()[-1][:120]}")
            continue
        best_info = best_info or info
        track = pick_sub_track(info, lang)
        if track:
            log(f"  {client}: found {track['kind']} captions ({track['lang']}, {track['ext']})")
            req = urllib.request.Request(track["url"], headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                track["body"] = r.read().decode("utf-8", "replace")
            return info, track
        # A bot-walled client can still hand back partial metadata with an empty caption
        # list, so "no captions" from one client is not proof — keep rotating.
        log(f"  {client}: metadata ok but no {lang} captions, trying next client")
    return best_info, None


# ---------------------------------------------------------------- step 3: audio + whisper
def download_audio(url, workdir):
    import yt_dlp
    for client in PLAYER_CLIENTS:
        opts = {"quiet": True, "no_warnings": True, "format": "bestaudio[ext=m4a]/bestaudio/best",
                "outtmpl": str(Path(workdir) / "audio.%(ext)s")}
        if client != "default":
            opts["extractor_args"] = {"youtube": {"player_client": [client]}}
        try:
            log(f"downloading audio via player_client={client}")
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([url])
            files = sorted(Path(workdir).glob("audio.*"))
            if files:
                return files[0]
        except yt_dlp.utils.DownloadError as e:
            log(f"  {client}: {str(e).splitlines()[-1][:120]}")
    return None


def whisper_transcribe(audio_path, lang, model_name):
    """Return list of (start_ms, text) using whichever local backend exists."""
    try:
        from faster_whisper import WhisperModel
        log(f"faster-whisper model={model_name}")
        model = WhisperModel(model_name, compute_type="int8")
        segments, _ = model.transcribe(str(audio_path), language=lang or None, vad_filter=True)
        return [(int(s.start * 1000), s.text.strip()) for s in segments], "faster-whisper"
    except ImportError:
        pass
    try:
        import whisper
        log(f"openai-whisper model={model_name}")
        model = whisper.load_model(model_name)
        res = model.transcribe(str(audio_path), language=lang or None)
        return [(int(s["start"] * 1000), s["text"].strip()) for s in res["segments"]], "openai-whisper"
    except ImportError:
        return None, None


# ---------------------------------------------------------------- step 4: normalise
def parse_json3(body):
    d = json.loads(body)
    out = []
    for e in d.get("events", []):
        if "segs" not in e:
            continue
        t0 = e.get("tStartMs", 0)
        text = "".join(s.get("utf8", "") for s in e["segs"]).replace("\n", " ").strip()
        if text:
            out.append((t0, text))
    return out


def parse_vtt(body):
    out = []
    ts_re = re.compile(r"(\d+):(\d+):(\d+)[.,](\d+)\s*-->")
    cur_t, buf = None, []
    seen = set()
    for line in body.splitlines() + [""]:
        m = ts_re.match(line)
        if m:
            h, mnt, s, ms = map(int, m.groups())
            cur_t = ((h * 60 + mnt) * 60 + s) * 1000 + ms
            continue
        if line.strip() == "":
            if cur_t is not None and buf:
                text = re.sub(r"<[^>]+>", "", " ".join(buf)).strip()
                if text and text not in seen:  # auto-subs repeat lines as they scroll
                    out.append((cur_t, text)); seen.add(text)
            cur_t, buf = None, []
        elif cur_t is not None and not line.startswith(("WEBVTT", "Kind:", "Language:", "NOTE")):
            buf.append(line)
    return out


def to_paragraphs(segments, chunk_s):
    """Group (ms, text) segments into paragraphs of ~chunk_s seconds, each with a [mm:ss] stamp."""
    def ts(ms):
        s = ms // 1000
        return f"[{s // 3600:d}:{(s % 3600) // 60:02d}:{s % 60:02d}]" if s >= 3600 else f"[{(s % 3600) // 60:02d}:{s % 60:02d}]"
    paras, cur, start = [], [], None
    for t, text in segments:
        if start is None:
            start = t
        if t - start >= chunk_s * 1000 and cur:
            paras.append(f"{ts(start)} " + " ".join(cur)); cur, start = [], t
        cur.append(text)
    if cur:
        paras.append(f"{ts(start)} " + " ".join(cur))
    txt = "\n\n".join(paras)
    txt = re.sub(r"\s+([,.?!;:])", r"\1", txt)
    txt = re.sub(r" {2,}", " ", txt)
    return txt


def slugify(s, n=60):
    s = re.sub(r"[^A-Za-z0-9]+", "-", s or "video").strip("-").lower()
    return s[:n] or "video"


def fmt_duration(sec):
    if not sec:
        return "?"
    sec = int(sec)
    return f"{sec // 3600}:{(sec % 3600) // 60:02d}:{sec % 60:02d}" if sec >= 3600 else f"{sec // 60}:{sec % 60:02d}"


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", help="video URL, web page URL that embeds a video, or local media file")
    ap.add_argument("--out", default=".", help="directory for the transcript files (default: cwd)")
    ap.add_argument("--lang", default="en", help="caption / speech language code (default en)")
    ap.add_argument("--chunk", type=int, default=45, help="seconds per timestamped paragraph (default 45)")
    ap.add_argument("--pick", type=int, default=1, help="when a page embeds several videos, which one (1-based)")
    ap.add_argument("--no-whisper", action="store_true", help="never fall back to local speech-to-text")
    ap.add_argument("--whisper-model", default="small", help="faster-whisper / whisper model size (default small)")
    ap.add_argument("--json", action="store_true", help="also print a JSON summary to stdout")
    a = ap.parse_args()

    ensure_ytdlp()
    out_dir = Path(a.out); out_dir.mkdir(parents=True, exist_ok=True)
    src = a.source
    page_url = None
    is_local = os.path.exists(src)

    # step 1
    if not is_local and not VIDEO_HOST_RE.search(src) and not MEDIA_EXT_RE.search(src):
        page_url = src
        log(f"scanning page for embedded video: {src}")
        cands = find_videos_in_page(src)
        if not cands:
            log("no video embed or media file found on that page"); sys.exit(2)
        for i, c in enumerate(cands, 1):
            log(f"  candidate {i}: {c}")
        if a.pick > len(cands):
            log(f"--pick {a.pick} but only {len(cands)} candidates"); sys.exit(2)
        src = cands[a.pick - 1]
        if len(cands) > 1:
            log(f"using candidate {a.pick} (re-run with --pick N for another)")

    info, track, segments, method = {}, None, None, None

    # step 2
    if not is_local:
        info, track = fetch_captions(src, a.lang)
        info = info or {}
        if track:
            segments = parse_json3(track["body"]) if track["ext"] == "json3" else parse_vtt(track["body"])
            method = f"{track['kind']} captions ({track['lang']}, {track['ext']}) via yt-dlp"

    # step 3
    if segments is None:
        if a.no_whisper:
            log("no captions and --no-whisper set"); sys.exit(3)
        with tempfile.TemporaryDirectory() as tmp:
            audio = Path(src) if is_local else download_audio(src, tmp)
            if not audio:
                log("could not download audio either"); sys.exit(3)
            segments, method = whisper_transcribe(audio, a.lang, a.whisper_model)
            if segments is None:
                log("audio available but no speech-to-text backend. Install one:\n"
                    "    pip install faster-whisper      (CPU-friendly, no system ffmpeg needed)\n"
                    "  then re-run this command.")
                sys.exit(4)
            method = f"{method} ({a.whisper_model})"

    # step 4
    title = info.get("title") or (Path(src).stem if is_local else src)
    slug = slugify(title)
    body = to_paragraphs(segments, a.chunk)
    header = [f"# Transcript: {title}", ""]
    meta = []
    if info.get("uploader") or info.get("channel"):
        meta.append(f"**Speaker/channel:** {info.get('uploader') or info.get('channel')}")
    if info.get("upload_date"):
        d = info["upload_date"]; meta.append(f"**Published:** {d[:4]}-{d[4:6]}-{d[6:]}")
    meta.append(f"**Duration:** {fmt_duration(info.get('duration'))}")
    meta.append(f"**Video:** {info.get('webpage_url') or src}")
    if page_url:
        meta.append(f"**Found on:** {page_url}")
    meta.append(f"**Transcript source:** {method} — unedited machine output; see the cleaned version for a readable edit")
    header += [" \\\n".join(meta), "", "---", ""]
    raw_path = out_dir / f"{slug}.raw-transcript.md"
    raw_path.write_text("\n".join(header) + body + "\n")
    log(f"wrote {raw_path} ({len(segments)} caption segments, {len(body)} chars)")

    summary = {"title": title, "video_url": info.get("webpage_url") or src, "page_url": page_url,
               "uploader": info.get("uploader"), "upload_date": info.get("upload_date"),
               "duration_s": info.get("duration"), "method": method, "raw_transcript": str(raw_path),
               "segments": len(segments), "chars": len(body)}
    if a.json:
        print(json.dumps(summary, indent=2))
    else:
        print(str(raw_path))


if __name__ == "__main__":
    main()
