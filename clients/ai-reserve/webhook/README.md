# AI Reserve: Smartlead + HeyReach -> Telegram

Cloudflare Worker (`worker.js`) receives vendor webhooks and posts to a Telegram chat.
Events: Smartlead reply + lead-category-updated (interested); HeyReach reply + connection accepted.

## Setup
1. Deploy (secrets never go in the repo):
   ```
   cd clients/ai-reserve/webhook
   npx wrangler deploy
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_CHAT_ID
   npx wrangler secret put WEBHOOK_PATH_SECRET   # any long random string; it is the URL auth
   ```
2. Smoke test (should land in Telegram):
   ```
   curl -X POST https://<worker>.workers.dev/smartlead/<SECRET> -H 'content-type: application/json' \
     -d '{"event_type":"EMAIL_REPLY","lead_email":"test@example.com","campaign_name":"test","reply_message":{"text":"hello"}}'
   ```
3. Register the webhooks (needs AI Reserve's keys; verify the calls per STEP 4 first):
   - Smartlead, per campaign: `POST https://server.smartlead.ai/api/v1/campaigns/{id}/webhooks?api_key=KEY`
     `{"id":null,"name":"telegram","webhook_url":"<url>/smartlead/<SECRET>","event_types":["EMAIL_REPLY","LEAD_CATEGORY_UPDATED"],"categories":["Interested"]}`
   - HeyReach: `POST https://api.heyreach.io/api/public/webhooks/CreateWebhook` (header `X-API-KEY`)
     one per event: `{"webhookName":"telegram","webhookUrl":"<url>/heyreach/<SECRET>","eventType":"MESSAGE_REPLY_RECEIVED","campaignIds":[]}`
     and `CONNECTION_REQUEST_ACCEPTED`.
4. UNVERIFIED: registration bodies and payload field names were written from memory. Per repo rules,
   probe with 3 calls (create, list, fire a real event) and paste output before trusting them; the
   raw-payload tail on every Telegram message shows the true field names to fix in `worker.js`.
