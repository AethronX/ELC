# Runbook — Manual Setup & Remaining Credentials

Everything that could be built without a live external account has been built and pushed to the n8n Cloud instance (`nadhm.app.n8n.cloud`) already connected to this environment. The items below are the exact manual steps required before the system goes live — every one of them needs a human with account access; none can be done from this session.

## 1. Google Sheets credential (blocks: CRM Setup, Tools Router, Post Call, Website Lead Intake, Follow-up Engine)
1. In n8n, open any Etihad One workflow → the "Google Sheets - Etihad One CRM" credential placeholder → connect via OAuth2 with the Google account that should own the CRM spreadsheet.
2. Run **Etihad One - CRM Setup** once (manual trigger) to create the "Etihad One CRM" spreadsheet with `Customers` and `Calls` tabs and header rows.
3. Open the created spreadsheet, copy its ID from the URL, and paste it into the `documentId` field (mode: id, or pick it from the list picker) on every Google Sheets node across the other 4 workflows.
4. Verify row 1 of each tab holds only the header labels — if Google Sheets duplicated a row during creation, delete the extra one.

## 2. Vapi account + API key (blocks: everything customer-facing)
No Vapi account/API key is available in this environment. Once you have one:
1. Create the assistant from `vapi/assistant.json` — either `POST https://api.vapi.ai/assistant` with that body (minus `_readme`/`_comment`/`_note` fields), or recreate it manually in the dashboard using the same values.
2. Replace every `REPLACE_WITH_VAPI_WEBHOOK_SECRET` with one strong secret of your choosing.
3. Replace `REPLACE_WITH_ARABIC_CAPABLE_VOICE_ID` with a real ElevenLabs voice ID from your account (multilingual, Arabic-capable).
4. Attach a phone number to the assistant.
5. Make a real test call and confirm the tool-call payload shape matches the assumption documented in `n8n/workflows/tools-router.ts`'s sticky note (`message.toolCallList[].function.arguments` as a parsed object). Adjust the "Flatten Tool Call" node if it differs.

## 3. Vapi Webhook Auth credential in n8n (blocks: Tools Router, Post Call)
1. Create ONE Header Auth credential named "Vapi Webhook Auth" in n8n (header name/value of your choosing, matching step 2.2 above).
2. Attach that same credential to both the Tools Router and Post Call webhook nodes — do not let each workflow create its own.

## 4. Google Calendar credential (blocks: create_meeting tool)
1. Connect "Google Calendar - Etihad One" via OAuth2 in the Tools Router workflow.
2. Pick the real calendar on both "Check Availability" and "Create Meeting" nodes (currently an empty list-mode placeholder).

## 5. Website webhook (blocks: Website Lead Intake)
1. Create a "Website Webhook Auth" Header Auth credential in n8n.
2. Point the website's quote form submit handler at `https://nadhm.app.n8n.cloud/webhook/etihad-one/website-lead`, POSTing JSON `{ name, phone, email, cargo_type, origin, destination, shipping_method, notes }` with the matching header.

## 6. Gmail/SMTP (blocks: quote/meeting confirmation emails, real follow-up sends)
Not connected — no credential available. The Follow-up Engine already flags follow-up attempts in the CRM (`follow_up_count`, `last_follow_up_at`); once a Gmail credential exists, add a Gmail node right after "Flag Follow-up Attempt" (and similar confirmation-email nodes after quote/meeting actions) to actually send. This is the top next-optimization item — see the final report.

## 7. WhatsApp provider (optional, future)
Not evaluated or connected. Per the brief, do not add an expensive platform without checking the cheapest reliable option first — evaluate providers (e.g. WhatsApp Cloud API direct, or a low-cost n8n-compatible provider) only once phone + email are live and there's a real need.

## 8. Real shipping/tracking API (optional, future)
No tracking API exists today. `get_tracking_status` only saves the shipment number, by design (see `docs/knowledge-base/policies.md`). Wire a real Shipping API node into the Tools Router's "Save Shipment Number" branch only once a real, contracted tracking source exists — never fabricate one.

---

## End-to-end test plan (to run once credentials 1–5 are attached)

All 5 workflows passed `validate_workflow` (structurally valid n8n graphs) and were created successfully in the live n8n instance. `publish_workflow`/`test_workflow` against the live instance correctly refused to run until real credentials are attached — confirming the system fails safely instead of silently misbehaving. Run these once credentials are connected:

1. **New customer call** — call the Vapi number as an unknown phone number, ask for a quote → expect `find_customer` → not found → `create_quote_request` → new row in `Customers` (status `quote_requested`) → post-call webhook adds a row in `Calls`.
2. **Existing customer call** — call again from the same number → expect `find_customer` → found, AI references the earlier request → `update_customer`/`create_quote_request` updates the same row (no duplicate).
3. **Meeting** — ask to book a meeting; confirm the AI does not say "booked" until `create_meeting` returns `meeting_booked:...`; verify the event appears on the real Google Calendar and `customer_status` becomes `meeting_scheduled`.
4. **Tracking** — give a shipment number; confirm the AI states no live tracking exists and never invents a status; confirm the number lands in `Customers.shipment_number`.
5. **Duplicate post-call webhook** — resend the same `end-of-call-report` payload (same `call.id`) via the Vapi dashboard's webhook replay or curl → confirm only one `Calls` row exists for that `call_id`.
6. **Missing email** — run scenario 1 with no email ever given → confirm the workflow completes without error (email column stays blank).
7. **Human escalation** — say "I want to speak to a human" → confirm `customer_status` becomes `human_required` and the call summary/notes capture why.
8. **Website lead** — POST a test payload to the website-lead webhook → confirm a `Customers` row appears with `lead_source=website`, matching the same row if the same phone later calls in.
9. **Follow-up engine** — manually set a test row's `customer_status=quote_requested` and `last_contact` to 3+ days ago, run the Follow-up Engine manually → confirm `follow_up_count` increments once and stops at 3.
