// AI Reserve: Smartlead + HeyReach webhooks -> Telegram relay (Cloudflare Worker).
// Routes: POST /smartlead/<WEBHOOK_PATH_SECRET>, POST /heyreach/<WEBHOOK_PATH_SECRET>, GET /health.
// Secrets (wrangler secret put): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, WEBHOOK_PATH_SECRET.
// Field names below are UNVERIFIED against live payloads (no keys when written); every message
// ends with a raw-payload fallback so a wrong guess still shows the data. Fix by probing STEP 4 of README.

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pick = (o, ...keys) => { for (const k of keys) { const v = k.split(".").reduce((a, p) => a?.[p], o); if (v) return v; } return ""; };
const clip = (s, n) => (s.length > n ? s.slice(0, n) + "..." : s);

function fmtSmartlead(p) {
  const ev = pick(p, "event_type", "event") || "event";
  const name = [pick(p, "lead_data.first_name", "to_name", "first_name"), pick(p, "lead_data.last_name", "last_name")].filter(Boolean).join(" ");
  const body = pick(p, "reply_message.text", "reply_body", "preview_text", "body");
  return [
    `<b>Smartlead</b> · ${esc(ev)}`,
    name && `Lead: ${esc(name)}`,
    pick(p, "lead_email", "to_email", "sl_lead_email") && `Email: ${esc(pick(p, "lead_email", "to_email", "sl_lead_email"))}`,
    pick(p, "campaign_name") && `Campaign: ${esc(pick(p, "campaign_name"))}`,
    pick(p, "lead_category", "category", "new_category_name") && `Category: ${esc(pick(p, "lead_category", "category", "new_category_name"))}`,
    body && `\n${esc(clip(String(body), 1200))}`,
  ].filter(Boolean).join("\n");
}

function fmtHeyReach(p) {
  const ev = pick(p, "eventType", "event_type", "event") || "event";
  const lead = p.lead || p.Lead || {};
  const name = pick(lead, "full_name", "fullName") || [pick(lead, "first_name", "firstName"), pick(lead, "last_name", "lastName")].filter(Boolean).join(" ");
  const msg = pick(p, "recent_messages.0.message", "message", "last_message", "text");
  const url = pick(lead, "profile_url", "profileUrl", "linkedin_url");
  return [
    `<b>HeyReach</b> · ${esc(ev)}`,
    name && `Lead: ${esc(name)}`,
    pick(lead, "position", "headline") && `Role: ${esc(pick(lead, "position", "headline"))}`,
    pick(lead, "company_name", "companyName") && `Company: ${esc(pick(lead, "company_name", "companyName"))}`,
    pick(p, "campaign.name", "campaign_name") && `Campaign: ${esc(pick(p, "campaign.name", "campaign_name"))}`,
    url && esc(url),
    msg && `\n${esc(clip(String(msg), 1200))}`,
  ].filter(Boolean).join("\n");
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return new Response("ok");
    const [, source, secret] = url.pathname.split("/");
    if (req.method !== "POST" || !["smartlead", "heyreach"].includes(source) || secret !== env.WEBHOOK_PATH_SECRET)
      return new Response("not found", { status: 404 });

    let payload;
    try { payload = await req.json(); } catch { return new Response("bad json", { status: 400 }); }

    const text = (source === "smartlead" ? fmtSmartlead(payload) : fmtHeyReach(payload))
      + `\n\n<pre>${esc(clip(JSON.stringify(payload), 700))}</pre>`;

    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: clip(text, 4000), parse_mode: "HTML", disable_web_page_preview: true }),
    });
    // 500 on Telegram failure so the vendor retries; 200 otherwise.
    return new Response(r.ok ? "ok" : "telegram error", { status: r.ok ? 200 : 502 });
  },
};
