# ELC Operations

## 24/7 behavior

ELC answers and works the same shape at any hour: intake, qualification,
CRM logging, quote logging, and — if the calendar has a free slot — real
booking, all work regardless of time of day, because they hit live Sheets/
Calendar APIs directly rather than depending on a human being online.

**Known gap:** the assistant does not currently check the current time to
change its own behavior after hours (see `docs/elc-testing.md` #19). Today,
if it escalates outside business hours, the prompt tells it to "say so
honestly... don't imply someone is standing by if they aren't" — but it has
no explicit signal for *when* that is. A safe next step (no credential
needed): pass the current server time into the system prompt context or add
a lightweight time-of-day tool, and have the prompt state business hours
explicitly (09:00–17:00, Sunday–Thursday, Asia/Muscat — the same window
`get_available_slots` already uses) so it can say plainly "our team is
offline right now, but I've logged everything for a callback" instead of
attempting a transfer that won't be answered.

## Idempotency

- **Calls:** `call_id` (from Vapi) is the dedup key in Post Call — a
  retried end-of-call webhook updates the existing row instead of inserting
  a duplicate.
- **Tool calls:** write branches in Tools Router (customer create, meeting
  create, tracking save) carry a `toolCallId`-based guard using n8n's
  workflow static data, scoped to writes only after latency testing showed
  guarding every branch cost ~1.5s per call (your explicit "speed first"
  choice).
- **Website leads:** a generated `lead_id` plays the same role as `call_id`.

## Error recovery (by layer)

- **Tool call fails/times out** — the assistant does not claim success,
  retries at most once and only for safe read-style tools, and escalates if
  it still fails (see `docs/elc-tools.md`).
- **Calendar failure** — never confirm a booking without a real success
  result; offer `get_available_slots` again or escalate.
- **Tracking failure** — never invent a status; if the save itself fails,
  say so and escalate rather than claim it's saved.
- **CRM failure** — never claim a record was saved without a tool success
  result.
- **Webhook failure** (Vapi → n8n) — Vapi retries end-of-call webhooks on
  its own; the `call_id` idempotency guard (above) makes retries safe rather
  than something to prevent.

## Observability

Today: n8n's own execution history (`get_execution` / `search_executions`
via the n8n MCP tools, or the n8n Cloud UI) is the log — every tool call,
its inputs, and its result are inspectable per execution, without any
custom logging added. This is real observability, not a gap, for a system
at this call volume.

Not yet added: a single searchable events log (intent / tool / result
status / escalation / error, in one place) as the spec requested. Given the
sheet-corruption incident already on record from a previous schema-change
attempt, adding a new logging *sheet or columns* was intentionally not done
in this pass without a dedicated, low-risk window to do it column-by-column
with verification after each step. **Never log secrets** (webhook secret,
API keys) regardless of where logging ends up living.

## Security posture (reviewed again this pass, unchanged from `docs/architecture.md`)

- No secrets committed to git. `vapi/assistant.json` keeps
  `REPLACE_WITH_VAPI_WEBHOOK_SECRET` placeholders; the real secret lives
  only in the live n8n workflow (`Verify Vapi Secret` IF-node comparison)
  and the live Vapi assistant config. The `transferCall` destination number
  is committed as-is — a real business contact number is normal config, not
  a credential.
- Webhook auth: a shared secret checked in-workflow (an explicit IF-node
  comparison, not an n8n credential — see `docs/known-issues.md` for why
  this design was chosen over a Header Auth credential).
- No secrets are ever printed in this repo's docs, commit messages, or
  logs.

## Environment variables / credentials — current state

n8n Cloud holds the real credentials (OAuth2 for Sheets/Calendar, the Vapi
API bearer token used only by the one-time Vapi Connect workflow, and the
in-workflow shared secret). There is no separate secret-manager or `.env`
file in this repo, by design — GitHub Actions/CI does not run this system;
n8n Cloud and Vapi Cloud are the only runtimes, and both keep credentials in
their own credential stores, never in git.

If a `.env`-based deployment is ever introduced (e.g. a self-hosted n8n or
a custom backend), the variables to define are:

- `VAPI_API_KEY` — Vapi private API key (used only by the one-time connect workflow)
- `VAPI_WEBHOOK_SECRET` — shared secret Vapi sends and n8n verifies
- `N8N_BASE_URL` — `https://nadhm.app.n8n.cloud`
- `N8N_WEBHOOK_SECRET` — same value as `VAPI_WEBHOOK_SECRET` today (one shared secret for both directions); split into two if tool-call and post-call auth ever need to differ

None of these are stored in this repo today; this list exists so a future
setup doesn't have to rediscover it.

## Pending credentials (nothing invented — see `docs/known-issues.md` for full detail)

- **Gmail/SMTP or WhatsApp provider** — blocks real follow-up sends (today: flagged in CRM only)
- **Real shipping/tracking API** — blocks live tracking status (today: shipment number saved only)
- **SMS/Slack channel for pre-transfer handoff summaries** — optional, would let the human receive a written summary at the moment of transfer instead of only hearing the live call

## Manual sheet cleanup still outstanding

Two corrupted rows and stray columns from an earlier automated
column-creation incident remain in the live `Customers` sheet (see
`docs/known-issues.md` → Incidents). No further automated column changes
will be attempted — this needs a manual cleanup pass by you, or explicit
go-ahead to attempt it again carefully with a backup first.
