# ELC Agent — Test Plan: Critical Scenarios

Live-verified scenarios are marked ✅ with the execution ID/date used to
verify them. Everything else is the target coverage once the corresponding
phase is implemented — not yet run.

## Tools Router — per-branch

| Scenario | Status | Evidence |
|---|---|---|
| `find_customer` by phone, match found | ✅ Verified (project history, pre-V2) | — |
| `find_customer` by phone, no match | ✅ Verified (project history, pre-V2) | — |
| `create_customer` new record | ✅ Verified (project history, pre-V2) | — |
| `create_quote_request` | ✅ Verified (project history, pre-V2) | — |
| `get_available_slots` | ✅ Verified (project history, pre-V2) | — |
| `create_meeting` success | ✅ Verified (project history, pre-V2) | — |
| `create_meeting` — Calendar succeeds, CRM sync fails (PARTIAL case) | ⚠️ Happened once in production (2026-08-15), not yet a repeatable test | Real incident, see `ELC-SYSTEM-AUDIT.md` |
| `get_customer_history` | ✅ Verified (project history, pre-V2) | — |
| `get_tracking_status` (save-only) | ✅ Verified (project history, pre-V2) | — |
| `get_business_status` — closed, evening | ✅ Verified live | Execution 754, 2026-08-19: `is_open=false, next_open=tomorrow at 09:00` |
| `get_business_status` — routing isolation (only new rule fires, no other branch/fallback) | ✅ Verified live | Execution 754 `Route By Tool` trace: only output index 8 fired |
| Unknown tool name → fallback | ✅ Verified (project history, pre-V2) | "Unknown Tool Result" node exists and is exercised by the Switch fallback |
| Auth: wrong/missing `x-vapi-secret` → Unauthorized Response | ✅ Verified live (incidentally) | Execution 753, 2026-08-19: placeholder secret correctly routed to `Unauthorized Response` |
| `Assign Correlation ID` node executes without breaking the response chain | ✅ Verified live (execution status only) | Executions 756, 757, 2026-08-19: both `status: success` with the new node in the chain |
| `correlation_id` present and correct in the actual JSON response body | ⚠️ **Not verified** — see below | `get_execution`/`search_executions`/`prepare_test_pin_data` all returned `Tool not found` for the rest of this session after an MCP reconnect; logged honestly in `ELC-V2.1-RELIABILITY.md` §8, not fabricated |
| Post Call independently derives the same `correlation_id` as Tools Router for the same `call.id` | ⚠️ **Not verified** — code reviewed (identical hash function, correct field name `callId`), not executed, to avoid a real Sheets write via `execute_workflow` while `prepare_test_pin_data` was unavailable | `ELC-V2.1-RELIABILITY.md` §8 |
| Vapi tolerates the extra `correlation_id` field in the tool-result response | ❌ Not attempted — no live outbound calling in this session | `ELC-V2.1-RELIABILITY.md` §8, highest-remaining-risk item |

## Not yet testable (blocked or unbuilt)

| Scenario | Blocked by |
|---|---|
| WhatsApp message → shared Tools Router → reply | No WhatsApp API credential (`BLOCKED_DEPENDENCY`) |
| Cross-channel context (phone → WhatsApp same customer) | Unified `customer_id` return-shape not built (storage already exists — see `ELC-CUSTOMER-CONTEXT.md` correction) |
| Structured `{success,code,...}` response branching | `ELC-ERROR-TAXONOMY.md` rollout not started |
| Execution Trace event stream | `ELC-V2.1-RELIABILITY.md` §6 — designed, not built |
| Idempotency 2.0 (`idempotency_key`, duplicate business events) | `ELC-V2.1-RELIABILITY.md` §5 — designed, not built |
| Live inbound call end-to-end (real phone number) | Trial Vapi/Twilio number confirmed causing call drops — paid number upgrade in progress per audit, not this session's blocker to fix |

## `get_business_status` — additional scenarios still worth running before relying on it in a live demo

Not yet run this pass (only the "closed" path was exercised, since the test
was run at 19:38 local Muscat time):

- Call during business hours (e.g. Tuesday 11:00 Asia/Muscat) → expect
  `is_open=true`, `closes=today at 17:00`.
- Call right at a boundary (08:59 → not open; 09:00 → open; 16:59 → open;
  17:00 → not open) — the Code node uses `hour >= OPEN_HOUR && hour < CLOSE_HOUR`,
  so 17:00 exactly should read as closed; worth a live check since boundary
  conditions are the easiest place for an off-by-one to hide.
- Call on a closed day that isn't "tomorrow" (e.g. Friday evening → next open
  should be "Sunday", not "tomorrow") — exercises the weekday-name branch of
  the Code node, not yet exercised by the one live test run so far.

## How to re-run these

Use `mcp__n8n__prepare_test_pin_data` + `mcp__n8n__test_workflow` against
workflow `dTECfAvJ8LkCdNTC`, with a real `x-vapi-secret` header value (see
any prior successful execution, e.g. execution 721, for the current value —
never fabricate one). For time-boundary scenarios, the Code node reads the
real system clock (`Date.now()`), so testing a specific boundary means either
running the test at that real wall-clock time or temporarily reading the
node's logic rather than its live output — there is no time-injection
parameter today, which is a real limitation of this test approach worth
knowing about rather than working around with a fake clock.

## Related documents

- `ELC-BUSINESS-HOURS.md` — the tool these scenarios test
- `ELC-ERROR-TAXONOMY.md` — retry policy that a future structured-response
  test suite should assert against
- `ELC-SYSTEM-AUDIT.md` — the two real production incidents that motivate
  the PARTIAL-failure and auth test rows above
