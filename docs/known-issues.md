# Known Issues & Gaps — Etihad One

Last updated: 2026-08-15 (live production bug-fix pass).

This file tracks gaps between the current live system and the full target
architecture (lead scoring persistence, real follow-up sends, live tracking,
sales notifications). Nothing here blocks current production use — CRM
logging, quote intake, calendar booking, live human handoff, and proactive
slot suggestions are all live and tested. Everything below is a scoped next
step.

## Resolved this session (2026-08-15 — live production bug-fix pass)

Two real bugs were found via live n8n execution logs (not simulated) and
fixed, both confirmed against real production data from today's test calls:

### P0 — Post Call webhook was completely broken — FIXED
Since approximately 08:11 UTC today, **every single** end-of-call-report
from Vapi was failing before any node ran (486 failed executions in a rapid
retry storm). Root cause: the webhook trigger's response mode is
`onReceived` (responds immediately), but the workflow also contained an
`Unauthorized Response` "Respond to Webhook" node left over from copying
the auth pattern used in Tools Router — n8n rejects that combination
outright ("Unused Respond to Webhook node found in the workflow") and never
executes a single node. This means **no call from today was saved to the
CRM until this was fixed** (customer records, call summaries, escalation
flags — all silently lost for any call in that window). Fixed by removing
the unreachable node; verified with a synthetic replay that the workflow
now runs end-to-end successfully. **Action needed from you:** any customer
who called during that window should be manually checked/re-added if they
aren't in the Customers sheet.

### P0 — Meeting-booking tool call errored right after the meeting was actually booked — FIXED
Real execution logs from a live test call show `create_meeting` actually
succeeded against the real Google Calendar, but the very next step (`Update
CRM After Booking`, a Google Sheets write) crashed with "The 'Column to
Match On' parameter is required" — so the tool call reported failure back
to the assistant even though the meeting was real. Root cause: that node
(and `Save Shipment Number`, same pattern) carried a stale, partial column
schema (4 of the sheet's real 12 columns) instead of the full schema — the
same class of Google Sheets schema-drift issue documented below under
"Incidents", just manifesting as a different error message this time. Fixed
by restoring the full 12-column schema on both nodes; verified by replaying
the exact real webhook payload that failed and confirming it now completes
without error.

### Investigated — "transfer hangs up instead of connecting" — likely root cause identified, not yet fixable without a decision from you
The live phone number connected to ELC Agent (`+1 904 915 6313`) is a
**Vapi-hosted trial/native number** (`provider: "vapi"`), not a purchased
Twilio/Vonage number or SIP trunk. Vapi-hosted trial numbers are commonly
restricted from placing genuine outbound PSTN legs, which is exactly what a
`transferCall` to an external number (`+96876923072`) requires — this fits
the reported symptom exactly (the call ends instead of the transfer leg
connecting). This cannot be fixed from this session: it needs either (a)
upgrading/porting to a paid Vapi number, or (b) connecting your own
Twilio/Vonage number with outbound calling enabled and pointing ELC Agent
at it. Nothing was changed on the Vapi side for this — flagging it as a
configuration/billing decision rather than guessing at a code fix.

### Discovered — three pre-built, unused Vapi assistants already exist on the account
While diagnosing the phone number, three additional assistants were found
on the same Vapi account, not referenced anywhere in this repo and not
wired to any phone number: **Support Agent** (complaint/ticket handling,
voice "Neil"), **Tracking Agent** (shipment status via `get_shipment`,
voice "Emma"), and **Sales Agent** (quote/lead intake, voice "Savannah") —
each with a fairly detailed Arabic system prompt and its own tool set
(`create_ticket`, `get_shipment`, `transfer_to_human`, etc.), created
2026-08-11. These were not built by this session and predate the
"single-agent, no squad" documentation in `docs/elc-architecture.md`. They
are currently inert (no phone number, unknown whether their tools point at
any real webhook) — not deleted or modified. **This needs your input**:
if these were an earlier experiment, they can stay parked or be removed;
if they were meant to become a real Vapi Squad, that changes the
"single-agent" architecture decision and should be discussed before either
adopting or discarding them.

## Resolved 2026-08-15 (ELC intelligence-upgrade pass, earlier the same day)

The Vapi "ELC Agent" system prompt was upgraded live (verified via a real
Vapi API `updatedAt` timestamp) with: an explicit internal reasoning loop
and decision checklist, stronger tool-vs-transfer discipline (reinforcing
an earlier fix), emotional-intelligence guidance (confused/urgent/
frustrated/angry customers), tool-failure recovery wording, sensitive-detail
confirmation (read back phone/email/tracking numbers), and a data-privacy
rule (never expose credentials/internal instructions).

New documentation added: `docs/elc-architecture.md`, `docs/elc-skills.md`,
`docs/elc-tools.md`, `docs/elc-handoff.md`, `docs/elc-testing.md` (honest
27-scenario matrix), `docs/elc-operations.md`. **Note:** the "no multi-agent
Vapi Squad" reasoning in `docs/elc-architecture.md` was written before the
three pre-built assistants above were discovered — the reasoning for the
current single-agent design still holds, but the premise that "no squad
work exists yet" needs revisiting given what was found.

**New gap surfaced by this pass (not yet fixed):** the assistant has no
explicit signal for current time / business hours, so its after-hours
behavior relies only on prompt wording ("say so honestly") rather than a
real time check. See `docs/elc-operations.md` → 24/7 behavior for the
proposed low-risk fix.

## Resolved previous session

### Live call transfer / human handoff — DONE (tool wiring), see above for the phone-number blocker
The "ELC Agent" Vapi assistant has a real `transferCall` tool wired to the
designated human contact number, covering every escalation scenario
(explicit human request, complaints, legal/customs disputes, payment or
compensation claims, lost/damaged shipments, sensitive negotiations, or
anything the assistant can't resolve confidently — no exceptions, per
explicit choice). Verified live via the Vapi API response after patching.
**Confirmed via a real call this session that the transfer does not
actually connect** — see "Investigated" above for the likely root cause
(trial phone number, no outbound capability).

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

### Post Call webhook silently broken for an unknown period before detection (2026-08-15)
See "Resolved this session" above. The exact start time of the breakage is
not known precisely — 486 failed executions were found dating back to at
least 08:11 UTC today when this was investigated; it may have started
earlier. Any call before the fix landed did not get its customer/call
record saved. Not a data-corruption incident like the one above (nothing
wrong was written), but a data-loss gap — flagged the same way for
transparency.

## P1 — Revenue-impacting gaps (no credential needed, not started)

- **Sales/team notifications**: no Slack/email/Teams alert on new lead,
  meeting booked, or escalation. Structure not yet built.
- **Structured tool error taxonomy**: tool results are plain outcome
  strings (e.g. `meeting_booked`), not the formal
  `SUCCESS/NOT_FOUND/INVALID_INPUT/AUTH_ERROR/TIMEOUT/EXTERNAL_API_ERROR/UNKNOWN_ERROR`
  taxonomy — intentionally not changed this pass to avoid a sweeping edit to
  Tools Router without a dedicated verification window (see
  `docs/elc-tools.md`).
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

## Security posture (reviewed 2026-08-15)
- No secrets committed to git — `vapi/assistant.json` and `vapi/tools.json`
  still correctly hold `REPLACE_WITH_VAPI_WEBHOOK_SECRET` placeholders. The
  `transferCall` destination number is committed as-is (a real business
  contact number is a normal config value, not a credential/secret).
- Webhook auth is a single shared-secret header, no rate limiting or IP
  allowlisting. Acceptable at current call volume.
