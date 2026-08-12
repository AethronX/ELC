# Known Issues & Gaps — Etihad One

Last updated: 2026-08-12 (live production audit + bug-fix session).

This file tracks gaps between the current live system and the full target
architecture (multi-department squad, lead scoring, real follow-up sends,
live tracking, sales notifications). Nothing here blocks current production
use for CRM logging, quote intake, and calendar booking — those are live,
tested, and working. Everything below is a scoped next step.

## P0 — Production-critical gaps

### 1. No real live call transfer / department handoff (BLOCKER — needs your input)
Today, when a caller says "أريد موظفًا بشريًا" / "connect me to sales", the
assistant only **notes the escalation in the CRM** (`customer_status =
human_required`) and the call continues or ends normally — it does **not**
perform a real telephony transfer to a human agent or a specialized
sub-assistant (Sales / Tracking / Support). There is one single assistant
("ELC Agent") handling every intent via tools; no Vapi Squad / `transferCall`
tool is configured.

**Why:** a real transfer requires a real destination — either a phone number
to dial out to, or a second/third Vapi assistant ID for a Squad handoff. No
such number or squad exists yet.

**What's ready on the code side:** none yet — this is a real architecture
decision (squad of specialized assistants vs. single assistant + `transferCall`
tool) that should be made deliberately, not guessed.

**Your action:** tell me (a) which model you want — a Vapi Squad (separate
Receptionist/Sales/Tracking/Support assistants, AI-to-AI handoff) or a single
assistant with a `transferCall` tool to a real human phone number, and (b)
the phone number(s)/assistant routing if you already have them. I'll build
and wire it immediately once I have that.

### 2. Tools Router idempotency guard — implemented, not yet verified in production
A duplicate-`toolCallId` guard was added (workflow static data, 15-minute
TTL) so a retried tool call from Vapi can't double-book a meeting or create a
duplicate customer. It was code-reviewed and deployed, but the n8n MCP test
harness appears to sandbox each test run separately, so persistence across
calls could not be confirmed end-to-end from this session. Verify on the
first real duplicate event (check n8n Executions for the "Duplicate Call
Result" node firing) or ask for a follow-up verification pass.

### 3. No structured tool error taxonomy
Tool results are currently plain strings (`"saved"`, `"tool_not_recognized"`,
etc.) rather than the `SUCCESS / NOT_FOUND / INVALID_INPUT / AUTH_ERROR /
TIMEOUT / EXTERNAL_API_ERROR / UNKNOWN_ERROR` taxonomy. The assistant
currently cannot distinguish "Google Sheets timed out" from "customer not
found" — both would need to fail safely without the assistant assuming
success, which the system prompt already guards against, but the failure
mode itself isn't classified. Next step: wrap each Google Sheets/Calendar
node's error output in a typed result before it reaches "Aggregate Results".

## P1 — Revenue-impacting gaps (no credential needed to build, but not started)

- **Lead scoring (0–100, HOT/WARM/COLD)**: not implemented. `Customers` sheet
  has no `lead_score`/`lead_status` column yet.
- **Proactive available-slot suggestion**: `create_meeting` only checks one
  proposed time; there's no `get_available_slots` tool, so the assistant
  can't offer times — it can only accept/reject a customer-proposed time.
- **Sales/team notifications**: no Slack/email/Teams alert on new lead,
  meeting booked, or escalation. Structure not yet built.

## P1/P2 — Blocked on a credential you haven't provided (cannot be faked)

- **Actual follow-up sends** (Gmail or WhatsApp) — Follow-up Engine only
  flags attempts in the CRM today, exactly as designed until a send channel
  exists.
- **Live shipment tracking** — `get_tracking_status` only saves the shipment
  number and tells the customer honestly that no live tracking is connected.
  No tracking API/credential exists to wire up.
- **Squad/transferCall phone destination** — see P0 #1 above.

## Documentation drift found and fixed this session
`README.md` and `docs/runbook.md` said "None [workflows] are activated yet"
and described credentials as missing. In reality, by the time of this audit,
all 5 workflows were live, published, and credentialed, and extensive
production testing had already found and fixed several real bugs (see
`docs/runbook.md` → "Session log" for the list). Docs have been updated to
match reality.

## Security posture (reviewed this session)
- No secrets committed to git — `vapi/assistant.json` and `vapi/tools.json`
  still correctly hold `REPLACE_WITH_VAPI_WEBHOOK_SECRET` placeholders; the
  real secret lives only in n8n credentials and the live Vapi assistant
  config (not in this repo). Confirmed via direct file read + code search.
- Webhook auth is a single shared-secret header, checked before any
  processing — no rate limiting or IP allowlisting exists on either webhook.
  Acceptable at current call volume; revisit if abuse is observed.
- No PII beyond name/phone/email/notes is collected or stored.
