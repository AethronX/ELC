# ELC Agent — Business Hours Awareness (`get_business_status`)

**Status: implemented and live.** Phase 7 of the ELC Agent V2 pass. This is the
first `BusinessHoursService` operation (see `ELC-ARCHITECTURE.md`'s Business
Operations table).

## What it fixes

Before this tool existed, business hours were hardcoded in exactly one place —
the `Compute Available Slots` Code node inside the `create_meeting`/
`get_available_slots` branches — and nowhere else. The assistant had no way to
know, at any other point in a conversation, whether the team was actually open.
That meant it could promise "someone will call you back today" at 11pm on a
Friday with no way to know that was false. `get_business_status` gives the
assistant a machine-computed answer instead of letting the LLM guess or
hardcode it into the prompt.

## Business hours

Sun–Thu, 09:00–17:00, Asia/Muscat (UTC+4, no DST). Same hours already used by
`Compute Available Slots`; this tool does not change them, only exposes them.

## Implementation

- **Workflow**: `Etihad One - Tools Router` (`dTECfAvJ8LkCdNTC`)
- **New node**: `Compute Business Status` (Code node) — pure JS, no external
  calls, no credentials, no Sheets/Calendar dependency. Computes:
  - `is_open` (boolean)
  - `current_local_time` (HH:MM, Asia/Muscat)
  - `next_open` (when closed — "today"/"tomorrow"/weekday name + 09:00)
  - `closes` (when open — today at 17:00)
- **Routing**: `Route By Tool` Switch node got a 9th rule matching
  `$json.name == "get_business_status"`, routed to the new Code node, which
  feeds into the existing `Aggregate Results` node — same pattern as every
  other branch. No existing rule, node, or connection was modified.
- **Output shape**: deliberately kept as the existing plain-string convention
  (`business_status: is_open=... | current_local_time=... | ...`), not the new
  structured `{success,code,message,...}` contract from
  `ELC-ERROR-TAXONOMY.md` — that rollout starts with `create_meeting` per that
  doc's own reasoning, and mixing conventions across branches for a single
  Phase 7 change would add inconsistency without a corresponding benefit here
  (this is a pure read/compute operation, nothing to retry or partially fail).

## Verification (live, 2026-08-19)

Ran via `test_workflow` against the published workflow with a real webhook
secret (confirmed against a prior successful execution, not guessed):

```
business_status: is_open=false | current_local_time=19:38 (Asia/Muscat) | timezone=Asia/Muscat | business_hours=09:00-17:00 Sun-Thu | next_open=tomorrow at 09:00
```

`Route By Tool` execution trace confirmed only output index 8 (the new rule)
fired — no other branch and no fallback ("Unknown Tool Result") fired for this
call. Correct for the test time (Wednesday evening, past 17:00 close, Thursday
still a business day so `next_open=tomorrow`).

## Vapi wiring

- Added to `vapi/assistant.json` (`model.tools`) and `vapi/tools.json`
  (standalone reference copy) as a zero-parameter function tool.
- Added to `vapi/system-prompt.md`'s tool list and a usage rule: call this
  before promising "someone will call you back today/shortly" so the assistant
  never makes a same-day promise it can't back up outside business hours.
- Live Vapi assistant patch: see task tracking — applied via the
  `Etihad One - Vapi Connect (one-time)` workflow's Patch Assistant node,
  same mechanism used for all prior prompt/tool updates to the live assistant.

## What this does not do

- Does not block or gate any other tool. The assistant can still log a quote,
  save a shipment number, or book a future meeting outside business hours —
  only the "someone will call you back right now" class of promise is meant to
  change based on this.
- Does not add a human-handoff / IVR business-hours gate at the Vapi phone
  number level. That is a different, larger decision (would affect how calls
  are answered at all, not just what the assistant says) and is out of scope
  for this additive Phase 7 change.
