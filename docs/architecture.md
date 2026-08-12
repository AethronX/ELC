# Architecture — Etihad One

## Call lifecycle

```
Customer (phone)
   ↓
Vapi (STT + LLM + TTS, holds the conversation)
   ↓ real-time tool calls (HTTPS webhook, per-tool)
n8n: "Etihad One - Tools Router"
   ↓
Google Sheets (CRM)  /  Google Calendar (meetings)
   ↓ result
Vapi → spoken back to customer

--- after the call ends ---

Vapi (end-of-call-report webhook, includes analysisPlan summary + structured data)
   ↓
n8n: "Etihad One - Post Call"
   ↓ idempotent on call_id
Find/Create Customer → Save Call → Update Customer status → (human_required?) 

--- website channel ---

Website quote form
   ↓ webhook
n8n: "Etihad One - Website Lead Intake"
   ↓ same find-or-create logic as calls
Google Sheets (CRM)

--- follow-ups ---

n8n: "Etihad One - Follow-up Engine" (scheduled, e.g. daily)
   ↓ scans Customers for status=quote_requested/contacted with no response
Respects contact limits, stops on response/closure, logs every attempt
```

## Why this shape (design decisions)

- **Vapi does the conversation and the classification.** Intent detection and call summarization happen inside Vapi itself (system prompt + `analysisPlan`), not via a second LLM call in n8n. This avoids double LLM cost (rule: "don't use an LLM to do something ordinary code can do") and keeps the post-call webhook deterministic.
- **n8n is the only place that touches Google Sheets/Calendar.** Vapi never talks to Google directly — this keeps credentials in one place, makes retries/idempotency possible, and means the CRM logic is inspectable/versioned (this repo) instead of buried in a dashboard.
- **Google Sheets, not a CRM product.** Matches the required lead-qualification volume, is free, and is trivially inspectable by non-engineers on the team. Revisit only if row-level locking or concurrent-write volume becomes a real problem (see `docs/runbook.md` → Next optimization).
- **No vector DB, no second AI agent.** The knowledge base is small enough to live in the Vapi system prompt as structured markdown/JSON; retrieval-augmented lookups are unnecessary at this scale.
- **Tracking:** no live tracking API exists, so no tracking integration was built. The tool `get_tracking_status` only records the shipment number and explains that live tracking isn't connected yet — never fabricated.
- **Email/WhatsApp:** wired for in the tool schema and n8n workflow shape, but left inactive (no credential) until Gmail/SMTP or a WhatsApp provider is actually connected — see `docs/runbook.md`.

## Idempotency

`call_id` (from Vapi) is the primary key for the `Calls` tab and the dedup check in the Post-Call workflow: if a row with that `call_id` already exists, the workflow updates it instead of inserting a duplicate. Website leads use a generated `lead_id` the same way.

## Security

- All webhook endpoints validate a shared secret (`VAPI_WEBHOOK_SECRET` / `WEBSITE_WEBHOOK_SECRET`) passed as a header, checked in an n8n IF node before any processing.
- No secrets are committed to this repo — every credential is an n8n credential or environment variable, referenced by name only.
- Cross-customer data isolation: every read is scoped by the caller-supplied phone/email/customer_id from the current call; nothing returns another customer's row.
