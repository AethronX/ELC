# ELC Tools — Contract & Intelligence

Canonical reference for every tool ELC can call. `vapi/tools.json` is the
literal schema sent to Vapi; this file documents the *judgment* around each
one (when to call it, when not to, how to handle failure) that the system
prompt states more tersely for voice-latency reasons.

All tools except `transferCall` are function tools routed through n8n's
**Tools Router** workflow (`n8n/workflows/tools-router.ts`), authenticated by
a shared secret checked in-workflow (see `docs/elc-operations.md` →
Security). `transferCall` is a native Vapi telephony action with no server
round-trip.

| Tool | Call it when | Do NOT call it when | On failure |
|---|---|---|---|
| `find_customer` | As soon as a phone or email is known, before assuming new/existing | The customer hasn't given contact info yet | Treat as "not found" (proceed as new customer), don't retry silently more than once |
| `create_customer` | `find_customer` confirmed no existing record | `find_customer` wasn't called first, or it found a match | Don't retry automatically (risk of duplicate) - tell the customer honestly, escalate if it keeps failing |
| `update_customer` | `find_customer` confirmed an existing record | Customer is new | Same as above |
| `create_quote_request` | Customer gave any shipment/quote detail worth logging | Customer is only asking a general question with no request to log | Don't claim it's logged until success; escalate on repeated failure |
| `get_available_slots` | Customer wants to book but hasn't given a specific time, or asks what's available | Customer already gave a specific time (go straight to `create_meeting`) | If it fails, say so and offer to log a callback request instead of guessing times |
| `create_meeting` | A specific time is known (customer-given or picked from `get_available_slots`) | Time isn't confirmed with the customer yet | Never claim booked unless result starts with `meeting_booked`; on `slot_not_available_not_booked`, offer `get_available_slots` instead of retrying blindly |
| `get_customer_history` | Right after `find_customer` confirms an existing record, if context would help | New customer, or history isn't relevant to this call | Non-critical - if it fails, continue the call without it, don't stall |
| `get_tracking_status` | Customer gives a shipment/tracking number | Customer asks for actual delivery status/location (no live tracking source exists - see `docs/knowledge-base/policies.md`) | Save-only; if the write fails, tell the customer honestly and escalate rather than pretend it's saved |
| `transfer_to_human` (`transferCall`) | Escalation criteria in `docs/elc-handoff.md` are met | A function tool above could answer the question instead - this is the most common misuse and was the root cause of the earlier "asks for available times → gets transferred → call ends" bug (fixed; see `docs/known-issues.md`) | N/A - this is itself the failure-recovery path for other tools |

## General rules (all tools)

- **Verify before claiming.** Never tell the customer an action succeeded
  before the tool result actually confirms it.
- **One retry, only if safe.** Only retry read-style tools (`find_customer`,
  `get_available_slots`, `get_customer_history`) automatically. Never
  silently retry a write (`create_customer`, `create_meeting`,
  `create_quote_request`) without knowing whether the first attempt already
  succeeded — that risks a duplicate. The write-path tools in Tools Router
  carry `toolCallId`-based idempotency guards precisely so a legitimate Vapi
  retry doesn't create a duplicate row (see `docs/elc-operations.md` →
  Idempotency).
- **Tool over transfer, always try first.** `transfer_to_human` is the
  fallback for what tools genuinely can't do, never a substitute for calling
  one.
- **No narration.** Never tell the customer "let me call a tool" — just do
  it and speak the result naturally.

## Structured error taxonomy — status

The original spec asked for a `SUCCESS / NOT_FOUND / INVALID_INPUT /
AUTH_ERROR / TIMEOUT / EXTERNAL_API_ERROR / UNKNOWN_ERROR` result taxonomy.
Today, Tools Router returns human-readable outcome strings (e.g.
`meeting_booked`, `slot_not_available_not_booked`) that the prompt is
written to check directly — this works and is verified live. Migrating to a
formal status-code taxonomy is real value (P1, see `docs/known-issues.md`)
but touches every branch of Tools Router's 30+ nodes; given the sheet-
corruption incident already on record from a previous schema change attempt,
this was intentionally *not* changed in this pass to avoid touching working,
tested logic without a dedicated testing window. Next step when picked up:
do it branch-by-branch with `test_workflow` verification after each one, not
as a single sweeping edit.
