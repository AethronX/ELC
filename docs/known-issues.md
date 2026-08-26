# Known Issues & Gaps — Etihad One

Last updated: 2026-08-26 (real test call exposed an unpublished-draft trap).

## Resolved 2026-08-26 — fixes were saved to drafts, never published

**Read this before trusting any "verified live" claim about an n8n workflow.**

n8n separates a workflow's **draft** from its **published (active) version**.
`update_workflow` edits the draft. `execute_workflow` with
`executionMode: "manual"` also runs the **draft**. But a production webhook —
which is what Vapi actually calls — runs the **published** version.

So the 2026-08-25 phone-normalisation fixes were verified against the draft
and reported as live, while every real call kept running the old published
code. A real test call proved it: the CRM row was written as
`phone: "+96876923072"` (unnormalised), so the follow-up call's
`find_customer` found nothing and the caller was not recognised.

Fixed by publishing all three edited workflows (Tools Router, Post Call,
Website Lead Intake). Re-verified with `executionMode: "production"`, which
does run the published version: the phone now arrives normalised as
`96876923072` and `find_customer` returns the existing customer.

**Rule going forward:** after any `update_workflow`, call `publish_workflow`,
then confirm `versionId === activeVersionId` via `get_workflow_details`, and
verify with `executionMode: "production"` — never with `"manual"` alone.

Note: the Vapi assistant patches were never affected. The Vapi Connect
workflow is run manually on purpose and its HTTP node hits the real Vapi API,
whose response was checked each time.

## Resolved 2026-08-26 — a question was saved as the customer's name

The same test call saved `customer_name: "اسمك الكريم؟"` — the assistant
copied the example question wording out of the system prompt and passed it as
the value. Two guards now:

- Prompt: customer_name must be the name the customer actually spoke; if it
  wasn't caught clearly, omit the field rather than echo the question.
- Tools Router `Flatten Tool Call`: drops customer_name when it is empty,
  over 60 characters, or contains `?`/`؟`, so the CRM keeps its previous
  value instead of storing a question.

Also added: `create_meeting` is now told to pass customer_name, so booking a
meeting no longer files it against an unnamed number.

### Follow-up needed (data cleanup)

The Customers sheet holds several rows for the tester's number from repeated
trials, including one whose name is the question text. De-duplicate by phone,
keep the most recently updated row, and delete the `اسمك الكريم؟` row.

---

Previously updated: 2026-08-25 (pre-demo full live verification).

## Resolved 2026-08-25 (pre-demo verification) — phone lookups never matched

The most serious bug found so far. Google Sheets treats a leading `+` as a
formula prefix, so writing the E.164 number Vapi sends (`+96812345678`)
stored the cell as the **number** `96812345678`. Every lookup that filtered
the `phone` column by the original `+968…` string therefore matched nothing.

Effect in production, on every call:

- `find_customer` never recognised a returning customer — Rashid always
  treated the caller as brand new and re-asked everything.
- `create_customer` / `update_customer` / `create_quote_request` /
  `get_tracking_status` fell through to the "new customer" branch and
  **appended a duplicate row** instead of updating the existing one.
- `Etihad One - Post Call` did the same after *every* completed call, so the
  CRM gained a second row per caller per call.
- `Etihad One - Website Lead Intake` could not merge a web lead into the
  caller's existing record.

Fixed by normalising the phone to digits only (`replace(/[^0-9]/g, "")`) at
the single point each workflow first reads it, so reads and writes agree and
match the numeric form Sheets already stores:

- Tools Router → `Flatten Tool Call` (`args.phone`)
- Post Call → `Normalize Call Data` (`phone`)
- Website Lead Intake → `Normalize Website Lead` (`phone`)

`Follow-up Engine` needed no change: it reuses the phone value straight from
the sheet row, so it was always self-consistent.

Verified live end to end: `find_customer` with `+96800000000` now returns the
existing record, and a follow-up `create_quote_request` for the same number
ran `Update Existing Customer` (not `Append New Customer`).

Also fixed alongside it: when the CRM holds historic duplicate rows for one
phone, the Sheets lookup returned several items and `find_customer` emitted
multiple results sharing one `toolCallId`, breaking Vapi's one-result-per-
call contract. A `Pick Latest Customer Match` code node now collapses to the
most recently updated row.

### Follow-up needed (data cleanup, not code)

Rows created before this fix are still duplicated in the `Customers` sheet —
de-duplicate by phone, keeping the most recently updated row per number.

### Still open — website webhook header name

`Etihad One - Website Lead Intake` uses a Header Auth credential whose header
name appears to be `"x-vapi-secret "` **with a trailing space**. Most HTTP
clients cannot send that verbatim, so the website form would be rejected.
Not yet exercised (the site form is not wired up), but fix the credential
before connecting it.

---

Previously updated: 2026-08-23 (pre-launch full system check).

This file tracks gaps between the current live system and the full target
architecture (lead scoring persistence, real follow-up sends, live tracking,
sales notifications). Nothing here blocks current production use — CRM
logging, quote intake, calendar booking, live human handoff, and proactive
slot suggestions are all live and tested. Everything below is a scoped next
step.

## Resolved 2026-08-23 (pre-launch check) — real routing bug found and fixed

While verifying the system end to end before launch, found that
`get_business_status` (added 2026-08-19) had a real wiring bug in Tools
Router's `Route By Tool` Switch node: when it was added as the 9th rule, the
Switch's fallback ("Unknown Tool Result") was never moved off output index 8
to the new fallback slot (index 9). Effect: **every** `get_business_status`
call also fired the fallback branch in parallel (`tool_not_recognized`,
racing the real response — Vapi could have received either one), and a
genuinely unrecognized tool name produced **no response at all** (fell
through to a disconnected output) instead of the intended
`tool_not_recognized`.

Fixed by rewiring `Unknown Tool Result` from output 8 to output 9. Verified
live with two `test_workflow` runs: a `get_business_status` call now fires
`Compute Business Status` alone with a single clean response, and a made-up
tool name now correctly reaches `Unknown Tool Result` alone. Also confirmed,
via read-only `find_customer`/`get_available_slots` test calls, that the
Google Sheets and Google Calendar credentials are both still live — and
noticed the "ELC" calendar already has 3 real "Etihad One - Customer call"
events booked for 2026-08-24/27, meaning the system is already taking real
bookings.

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

- **Outbound-capable phone number for live transfer**: reconfirmed live on
  2026-08-23 via the Vapi API (`GET /phone-number`) — still `+19049156313`,
  `provider: "vapi"`, still the trial number, still attached to the ELC
  Agent assistant. This does not reliably support outbound PSTN legs — this
  is why `transfer_to_human` connects the assistant but the call ends
  instead of reaching the human line. **This is the one real launch blocker
  for live human transfer** — needs either a paid Vapi number or a
  connected Twilio/Vonage number with outbound calling enabled, a
  billing/config decision only the user can make, not fixable in code.
  Everything else in the system (customer intake, quotes, meeting booking,
  business-hours awareness, tracking-number save, CRM sync) does not depend
  on this and is launch-ready independent of it.
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
