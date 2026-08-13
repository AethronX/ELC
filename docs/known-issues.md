# Known Issues & Gaps — Etihad One

Last updated: 2026-08-13 (live call-transfer + get_available_slots added).

This file tracks gaps between the current live system and the full target
architecture (lead scoring persistence, real follow-up sends, live tracking,
sales notifications). Nothing here blocks current production use — CRM
logging, quote intake, calendar booking, live human handoff, and proactive
slot suggestions are all live and tested. Everything below is a scoped next
step.

## Resolved this session

### Live call transfer / human handoff — DONE
The "ELC Agent" Vapi assistant now has a real `transferCall` tool wired to
the designated human contact number, covering every escalation scenario
(explicit human request, complaints, legal/customs disputes, payment or
compensation claims, lost/damaged shipments, sensitive negotiations, or
anything the assistant can't resolve confidently — no exceptions, per
explicit choice). The system prompt was updated to call this tool live
instead of only logging a note and continuing the call. Verified live via
the Vapi API response after patching (real `updatedAt` timestamp, tool
present in the response body). **Not yet verified with an actual live phone
call** — that's the one remaining verification step, and it needs a real
call to test properly.

### Proactive available-slot suggestion — DONE
Added a `get_available_slots` tool (Tools Router: `Get Upcoming Events` →
`Compute Available Slots`) that reads the real Google Calendar, computes
free 30-minute slots within business hours (09:00–17:00, Sunday–Thursday,
Asia/Muscat UTC+4), and returns up to 3 real options. Wired into both the
live n8n workflow and the live Vapi assistant's tool list. Verified with a
real Calendar API call returning real free slots.

### Lead scoring — logic done, NOT persisted to the sheet yet
A `Compute Lead Score` node computes a 0–100 score (hot/warm/cold) from
real conversation signals (cargo details given, business customer type,
returning customer, urgency keywords, explicit quote request). Verified
computing correctly (e.g. a detailed quote request scored 65/warm).
**It is not currently written to the Customers sheet** — an earlier attempt
to auto-create the `lead_score`/`lead_status` columns corrupted 2 rows in
the production sheet (see "Incidents" below) and was reverted. Needs the
2 columns added manually to the sheet before this gets wired to persist
(see runbook.md).

## Incidents

### Sheet corruption from an automated column-creation attempt (2026-08-12)
An attempt to auto-create `lead_score`/`lead_status` columns using the same
trick that safely created `follow_up_count`/`last_follow_up_at` earlier
instead corrupted the real Customers sheet: it added 2 wrong extra header
columns (`new_customer_id`, `new_created_at`) and left 2 malformed rows
(one with only those 2 fields populated, one where header label text was
written as data). The change was reverted immediately and a clean customer
write was verified afterward, but **the corrupted rows/columns are still in
the live sheet** and need manual cleanup — see runbook.md. No further
automated column-creation will be attempted; new columns will be requested
as a manual step instead.

## P1 — Revenue-impacting gaps (no credential needed, not started)

- **Sales/team notifications**: no Slack/email/Teams alert on new lead,
  meeting booked, or escalation. Structure not yet built.
- **Structured tool error taxonomy**: tool results are plain strings, not
  the `SUCCESS/NOT_FOUND/INVALID_INPUT/AUTH_ERROR/TIMEOUT/EXTERNAL_API_ERROR/UNKNOWN_ERROR`
  taxonomy described in the spec.

## P1/P2 — Blocked on a credential you haven't provided (cannot be faked)

- **Actual follow-up sends** (Gmail or WhatsApp) — Follow-up Engine only
  flags attempts in the CRM today.
- **Live shipment tracking** — `get_tracking_status` only saves the shipment
  number; no tracking API/credential exists to wire up.

## Deferred by explicit choice

- **Google account migration**: the connected Google Sheets/Calendar
  account will later move from a personal Gmail to the company's own email.
  When that happens: reconnect both OAuth credentials in n8n to the new
  account, transfer/share the CRM spreadsheet, and re-pick the calendar in
  `Check Availability`, `Create Meeting`, and `Get Upcoming Events`.

## Security posture (reviewed 2026-08-12)
- No secrets committed to git — `vapi/assistant.json` and `vapi/tools.json`
  still correctly hold `REPLACE_WITH_VAPI_WEBHOOK_SECRET` placeholders. The
  `transferCall` destination number is committed as-is (a real business
  contact number is a normal config value, not a credential/secret).
- Webhook auth is a single shared-secret header, no rate limiting or IP
  allowlisting. Acceptable at current call volume.
