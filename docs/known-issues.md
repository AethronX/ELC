# Known Issues & Gaps — Etihad One

Last updated: 2026-08-17 (dedicated ELC calendar).

This file tracks gaps between the current live system and the full target
architecture (lead scoring persistence, real follow-up sends, live tracking,
sales notifications). Nothing here blocks current production use — CRM
logging, quote intake, calendar booking, live human handoff, and proactive
slot suggestions are all live and tested. Everything below is a scoped next
step.

## Resolved this session (2026-08-17 — dedicated ELC calendar)

Meetings now book on a **dedicated "ELC" Google Calendar** instead of the
personal Gmail calendar that was used previously. The user created the
calendar manually in the Google Calendar UI (calendar creation could not be
automated — see below); `Check Availability`, `Create Meeting`, and `Get
Upcoming Events` in Tools Router were repointed at it
(`f9566914af8435ca75741c294c178daa396476dda983f76b63e2cad790435876@group.calendar.google.com`).
Verified live: `get_available_slots` read real free slots from the new
calendar, and `create_meeting` booked a real event confirmed via
`organizer.displayName="ELC"` in the Google Calendar API response. The test
event was deleted immediately after verification.

**Why calendar creation couldn't be automated:** the Google Calendar OAuth2
credential connected in n8n is configured to block use in generic HTTP
Request/GraphQL nodes (a real account-level restriction, not a bug) — and
n8n's built-in Google Calendar node only exposes event CRUD and
availability, not calendar creation. This is why the calendar had to be
created manually by the user; everything downstream of that (reading and
writing events) works through the normal credential path and was fully
automatable.

## Resolved 2026-08-16 (pre-demo full system audit)

Ahead of a stakeholder demo, every live workflow was re-audited end to end:

### Same schema-drift bug found in 3 more nodes — FIXED
The partial-column-schema bug found in Tools Router's booking nodes on
2026-08-15 was also present in `Update Existing Customer (website)`
(Website Lead Intake), `Update Existing Customer (post-call)` (Post Call),
and `Update Existing Customer` (Tools Router's own customer-update path).
All now carry the same full, verified-safe 16-column schema.

### Full live test pass — ALL PASS
Every Tools Router tool was exercised against the real Google
Sheets/Calendar: `find_customer`, `create_customer`, `get_available_slots`,
`create_meeting`, `get_customer_history`, `get_tracking_status`, and
Website Lead Intake's full find-or-create path. All passed cleanly.

### Customers/Calls sheets contained no real data — CLEANED
Both sheets contained only test/corrupted rows from earlier development
sessions, including the 2 corrupted rows from the 2026-08-12 incident.
Wiped both back to a clean header-only state. **The 2026-08-12 corruption
incident is now fully resolved.**

## Still open

- **Outbound-capable phone number for live transfer**: the live phone
  number is a Vapi-hosted trial number (`provider: "vapi"`), which does not
  reliably support outbound PSTN legs — this is why `transfer_to_human`
  connects the assistant but the call ends instead of reaching the human
  line. Needs either a paid Vapi number or a connected Twilio/Vonage number
  with outbound calling enabled — a billing/config decision, not fixable in
  code. The user is deciding on a paid Vapi number as of this session.
- **Three pre-built, unused Vapi assistants** (Support Agent, Tracking
  Agent, Sales Agent — created 2026-08-11, not referenced in this repo, not
  wired to any phone number) still need input on whether they're an old
  experiment or a future multi-department squad.

## P1 — Revenue-impacting gaps (no credential needed, not started)

- **Sales/team notifications**: no Slack/email/Teams alert on new lead,
  meeting booked, or escalation. Structure not yet built.
- **Structured tool error taxonomy**: tool results are plain outcome
  strings (e.g. `meeting_booked`), not the formal
  `SUCCESS/NOT_FOUND/INVALID_INPUT/AUTH_ERROR/TIMEOUT/EXTERNAL_API_ERROR/UNKNOWN_ERROR`
  taxonomy — intentionally not changed to avoid a sweeping edit to Tools
  Router without a dedicated verification window (see `docs/elc-tools.md`).
- **After-hours time awareness**: the assistant has no explicit signal for
  current time / business hours — see `docs/elc-operations.md` → 24/7
  behavior for the proposed low-risk fix.

## P0 — Blocked on a decision/purchase from you

- **Outbound-capable phone number for live transfer**: see "Still open"
  above.

## P1/P2 — Blocked on a credential you haven't provided (cannot be faked)

- **Actual follow-up sends** (Gmail or WhatsApp) — Follow-up Engine only
  flags attempts in the CRM today.
- **Live shipment tracking** — `get_tracking_status` only saves the shipment
  number; no tracking API/credential exists to wire up.

## Deferred by explicit choice

- **Google account migration**: the connected Google Sheets/Calendar
  account will later move from a personal Gmail to the company's own email.
  When that happens: reconnect both OAuth credentials in n8n to the new
  account, transfer/share the CRM spreadsheet, and re-share the ELC
  calendar (or recreate it) under the new account, re-picking it in
  `Check Availability`, `Create Meeting`, and `Get Upcoming Events`.
- **Multi-department Vapi Squad**: see "Still open" above — needs your
  input given the three pre-built assistants found on the account.

## Incidents (all resolved)

- **2026-08-12** — an automated column-creation attempt corrupted 2 rows in
  the Customers sheet. Resolved 2026-08-16 when the sheet was wiped clean.
- **2026-08-15** — Post Call webhook was silently broken (a leftover
  Respond-to-Webhook node conflicted with the trigger's response mode),
  losing call records for an unknown window. Fixed the same day.

## Security posture (reviewed 2026-08-17)
- No secrets committed to git — `vapi/assistant.json` and `vapi/tools.json`
  still correctly hold `REPLACE_WITH_VAPI_WEBHOOK_SECRET` placeholders. The
  `transferCall` destination number is committed as-is (a real business
  contact number is a normal config value, not a credential/secret).
- Webhook auth is a single shared-secret header, no rate limiting or IP
  allowlisting. Acceptable at current call volume.
- The Google Calendar OAuth2 credential is deliberately restricted from use
  in generic HTTP Request nodes at the account level — confirmed this
  session (calendar-creation attempt was blocked), not worked around.
