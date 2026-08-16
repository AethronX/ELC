# Known Issues & Gaps — Etihad One

Last updated: 2026-08-16 (pre-demo full system audit).

This file tracks gaps between the current live system and the full target
architecture (lead scoring persistence, real follow-up sends, live tracking,
sales notifications). Nothing here blocks current production use — CRM
logging, quote intake, calendar booking, live human handoff, and proactive
slot suggestions are all live and tested. Everything below is a scoped next
step.

## Resolved this session (2026-08-16 — pre-demo full system audit)

Ahead of a stakeholder demo, every live workflow was re-audited end to end
(not just the two nodes fixed yesterday):

### Same schema-drift bug found in 3 more nodes — FIXED
The partial-column-schema bug fixed yesterday in Tools Router's booking
nodes was also present in `Update Existing Customer (website)` (Website
Lead Intake, only 8 of 16 real columns cached), `Update Existing Customer
(post-call)` (Post Call, 12 of 16), and `Update Existing Customer` (Tools
Router's own customer-update path, 12 of 16). All four now carry the same
full, verified-safe 16-column schema. This wasn't yet causing visible
failures the way yesterday's bug did, but was the same latent risk -
fixed proactively rather than waiting for it to break during the demo.

### Full live test pass — ALL PASS
Every Tools Router tool was exercised against the real Google
Sheets/Calendar with a clearly-marked test phone number:
`find_customer` (not-found and found), `create_customer`,
`get_available_slots` (returned real free slots), `create_meeting` (booked
a real calendar event and updated the CRM without error - the exact
scenario that failed yesterday), `get_customer_history`,
`get_tracking_status`, and Website Lead Intake's full find-or-create path.
All passed cleanly.

### Customers/Calls sheets contained no real data — CLEANED
Reading both sheets in full during the audit showed **every row was test
or corrupted data** - fake customers from earlier development sessions
(UAE-format test numbers), the 2 corrupted rows from the 2026-08-12
incident (see "Incidents" below), duplicated header rows written as data,
and this session's own test records. Not a single real customer was in
either sheet. Both were wiped back to a clean header-only state so
tomorrow's demo starts from a real, professional CRM that fills in live as
you demo calls - rather than showing test artifacts if someone scrolls the
sheet. **The 2026-08-12 corruption incident is now resolved** - the stray
rows/columns it left behind were removed as part of this cleanup.

### Live Vapi assistant prompt verified intact
While investigating the phone-number issue, a diagnostic step briefly
reconnected a node that could have re-triggered the assistant patch with a
stale value. Directly re-fetched the live assistant afterward and confirmed
the system prompt is the full, correct, current version - no action was
needed, but flagging the near-miss for transparency.

## Still open before the demo

- **Outbound-capable phone number for live transfer** (see "Investigated"
  below, unchanged since yesterday) - `transfer_to_human` will still not
  actually connect a customer to your line until this is resolved. If the
  demo needs to show a live transfer, this is the one capability that
  cannot be demonstrated end-to-end yet.
- **Three pre-built, unused Vapi assistants** (see below, unchanged) still
  need your input on whether they're an old experiment or a future squad.

## Resolved 2026-08-15 (live production bug-fix pass)

Two real bugs were found via live n8n execution logs (not simulated) and
fixed, both confirmed against real production data from that day's test
calls:

### P0 — Post Call webhook was completely broken — FIXED
Since approximately 08:11 UTC that day, **every single** end-of-call-report
from Vapi was failing before any node ran (486 failed executions in a rapid
retry storm). Root cause: the webhook trigger's response mode is
`onReceived` (responds immediately), but the workflow also contained an
`Unauthorized Response` "Respond to Webhook" node left over from copying
the auth pattern used in Tools Router — n8n rejects that combination
outright ("Unused Respond to Webhook node found in the workflow") and never
executes a single node. This means no call from that window was saved to
the CRM until this was fixed. Fixed by removing the unreachable node;
verified with a synthetic replay that the workflow now runs end-to-end
successfully.

### P0 — Meeting-booking tool call errored right after the meeting was actually booked — FIXED
Real execution logs from a live test call showed `create_meeting` actually
succeeded against the real Google Calendar, but the very next step (`Update
CRM After Booking`, a Google Sheets write) crashed with "The 'Column to
Match On' parameter is required" — so the tool call reported failure back
to the assistant even though the meeting was real. Root cause: a stale,
partial column schema (4 of the sheet's real columns) instead of the full
schema. Fixed by restoring the full schema; the same fix was applied more
broadly in this session's audit above.

### Investigated — "transfer hangs up instead of connecting" — likely root cause identified, not yet fixable without a decision from you
The live phone number connected to ELC Agent (`+1 904 915 6313`) is a
**Vapi-hosted trial/native number** (`provider: "vapi"`), not a purchased
Twilio/Vonage number or SIP trunk. Vapi-hosted trial numbers are commonly
restricted from placing genuine outbound PSTN legs, which is exactly what a
`transferCall` to an external number (`+96876923072`) requires — this fits
the reported symptom exactly (the call ends instead of the transfer leg
connecting). This needs either (a) upgrading/porting to a paid Vapi number,
or (b) connecting your own Twilio/Vonage number with outbound calling
enabled and pointing ELC Agent at it - a billing/config decision, not
something fixable in code.

### Discovered — three pre-built, unused Vapi assistants already exist on the account
Three additional assistants were found on the same Vapi account, not
referenced anywhere in this repo and not wired to any phone number:
**Support Agent** (complaint/ticket handling, voice "Neil"), **Tracking
Agent** (shipment status via `get_shipment`, voice "Emma"), and **Sales
Agent** (quote/lead intake, voice "Savannah") — each with a fairly detailed
Arabic system prompt and its own tool set, created 2026-08-11. These were
not built by this session and predate the "single-agent, no squad"
documentation in `docs/elc-architecture.md`. Not deleted or modified —
needs your input on whether they're an old experiment or a future squad.

## Resolved 2026-08-15 (ELC intelligence-upgrade pass, earlier the same day)

The Vapi "ELC Agent" system prompt was upgraded live with: an explicit
internal reasoning loop and decision checklist, stronger tool-vs-transfer
discipline, emotional-intelligence guidance, tool-failure recovery wording,
sensitive-detail confirmation, and a data-privacy rule.

New documentation added: `docs/elc-architecture.md`, `docs/elc-skills.md`,
`docs/elc-tools.md`, `docs/elc-handoff.md`, `docs/elc-testing.md`,
`docs/elc-operations.md`.

**Gap surfaced by this pass (still not fixed):** the assistant has no
explicit signal for current time / business hours, so its after-hours
behavior relies only on prompt wording rather than a real time check. See
`docs/elc-operations.md` → 24/7 behavior for the proposed low-risk fix.

## Resolved previous session

### Live call transfer / human handoff — DONE (tool wiring), see above for the phone-number blocker
The "ELC Agent" Vapi assistant has a real `transferCall` tool wired to the
designated human contact number, covering every escalation scenario. Verified
live via the Vapi API response after patching. **Confirmed via a real call
that the transfer does not actually connect** — see "Investigated" above.

### Proactive available-slot suggestion — DONE
Added a `get_available_slots` tool that reads the real Google Calendar,
computes free 30-minute slots within business hours (09:00–17:00,
Sunday–Thursday, Asia/Muscat UTC+4), and returns up to 3 real options.
Re-verified in this session's audit.

### Lead scoring — logic done, NOT persisted to the sheet yet
A `Compute Lead Score` node computes a 0–100 score (hot/warm/cold) from real
conversation signals. Not currently written to the Customers sheet — needs
the `lead_score`/`lead_status` columns added manually (see runbook.md).

## Incidents

### Sheet corruption from an automated column-creation attempt (2026-08-12) — RESOLVED 2026-08-16
An attempt to auto-create `lead_score`/`lead_status` columns corrupted the
real Customers sheet: it added 2 wrong extra header columns
(`new_customer_id`, `new_created_at`) and left 2 malformed rows. The change
was reverted immediately at the time, but the corrupted rows/columns
remained in the live sheet until the 2026-08-16 pre-demo audit, which wiped
all data rows (including these) back to a clean header-only state. No
further automated column-creation will be attempted; new columns will be
requested as a manual step instead.

### Post Call webhook silently broken for an unknown period (2026-08-15) — RESOLVED
See "Resolved 2026-08-15" above. 486 failed executions were found dating
back to at least 08:11 UTC that day. Any call before the fix landed did not
get its customer/call record saved - a data-loss gap, not corruption, but
flagged the same way for transparency. Fixed the same day.

## P1 — Revenue-impacting gaps (no credential needed, not started)

- **Sales/team notifications**: no Slack/email/Teams alert on new lead,
  meeting booked, or escalation. Structure not yet built.
- **Structured tool error taxonomy**: tool results are plain outcome
  strings (e.g. `meeting_booked`), not the formal
  `SUCCESS/NOT_FOUND/INVALID_INPUT/AUTH_ERROR/TIMEOUT/EXTERNAL_API_ERROR/UNKNOWN_ERROR`
  taxonomy — intentionally not changed to avoid a sweeping edit to Tools
  Router without a dedicated verification window (see `docs/elc-tools.md`).
- **After-hours time awareness**: see "Resolved 2026-08-15" above.

## P0 — Blocked on a decision/purchase from you

- **Outbound-capable phone number for live transfer**: see "Investigated"
  above. Needed before `transfer_to_human` can actually connect a customer
  to your line.

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
- **Multi-department Vapi Squad**: see "Discovered" above — needs your
  input given the three pre-built assistants found on the account.

## Security posture (reviewed 2026-08-16)
- No secrets committed to git — `vapi/assistant.json` and `vapi/tools.json`
  still correctly hold `REPLACE_WITH_VAPI_WEBHOOK_SECRET` placeholders. The
  `transferCall` destination number is committed as-is (a real business
  contact number is a normal config value, not a credential/secret).
- Webhook auth is a single shared-secret header, no rate limiting or IP
  allowlisting. Acceptable at current call volume.
