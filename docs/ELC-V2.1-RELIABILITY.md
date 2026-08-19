# ELC Agent V2.1 — Reliability, Traceability, Idempotency

Status legend used throughout: **LIVE** (implemented, published, tested this
pass), **DESIGNED** (specified here, not implemented), **EXISTING**
(implemented before this pass, described for completeness).

## 1. Correlation ID — LIVE

**What it's for**: answering "what happened to this operation?" across
systems — distinct from idempotency (§5), which answers "did we already do
this?"

**Format**: `ELC-YYYYMMDD-XXXXX` — UTC date at generation time, plus a
5-character deterministic hash suffix.

**Design**: derived from Vapi's `call.id`, not generated independently at
each layer. A new Code node at each workflow's entry point computes it:

- Tools Router: `Assign Correlation ID`, inserted between `Normalize Webhook
  Payload` and `Split Tool Calls`. Runs once per webhook batch (all tool
  calls in one round-trip share the same ID).
- Post Call: `Assign Correlation ID (post-call)`, inserted between
  `Normalize Call Data` and `Read Existing Call`.
- Both use the identical hash function on the same input (`call.id`), so for
  one phone call, both workflows compute the **same** correlation_id
  independently — no propagation channel between them is needed, and no Vapi
  config change was required.
- **Reuse-if-present**: checks `message.call.metadata.correlation_id` first;
  only derives if nothing arrived. Vapi doesn't send this today, but the
  check costs nothing and means a future Vapi-side metadata addition would be
  honored automatically.
- **Fallback**: no `call.id` (e.g. a manual test) → random-suffix ID, marked
  with a trailing `R`. Still valid, just not cross-workflow-joinable —
  correct, since there's no real call to join.

**Where it surfaces**: Tools Router's `Respond With Results` now returns
`{"results": [...], "correlation_id": "ELC-..."}` — the `results` array is
byte-for-byte unchanged; `correlation_id` is an added sibling field. Every
node downstream of `Assign Correlation ID` in both workflows also carries it
in its input data, so it's visible in n8n's own execution inspector even
without any Sheets/Calendar write being touched.

**Known limitation**: if a call starts before UTC midnight and Post Call's
webhook fires after, the two workflows' independently-computed date
components could differ for that one call, breaking the join. Not fixed this
pass (would need `call.startedAt` instead of "now" in Post Call, and Tools
Router doesn't reliably have that at tool-call time). Small-probability,
documented, not a `BLOCKED_DEPENDENCY`.

**Verification status**: `test_workflow` against Tools Router (executions
756, 757) with the same simulated `call.id` in both runs — both returned
`status: success`, confirming the node runs without breaking the response
chain. **Not verified**: the exact JSON content of the response (i.e., that
`correlation_id` is present and identical across both runs), and Post Call's
independently-computed value matching Tools Router's. This is a genuine gap,
not glossed over — see §8.

## 2. Structured Tool Response Contract — DESIGNED (unchanged from V2)

See `ELC-ERROR-TAXONOMY.md` in full. Not implemented this pass. The
recommended first branch (`create_meeting`, for its PARTIAL-failure
precedent) is unchanged from the V2 recommendation. Once implemented, the
natural home for `correlation_id` inside a structured result is the `data`
field, e.g. `{"success": true, "code": "BOOKED", "data": {"correlation_id":
"ELC-...", ...}}` — this pass's top-level response field is a temporary
placement until that lands.

## 3. Error Taxonomy — EXISTING (spec), no runtime enforcement yet

The taxonomy in `ELC-ERROR-TAXONOMY.md` is the taxonomy. Not duplicated here.
No code currently enforces it — tool results are still plain strings.
"Runtime-enforced" (per the V2.1 Definition of Done) requires §2 to ship
first; sequencing unchanged from `ELC-ERROR-TAXONOMY.md`'s own rollout plan.

## 4. Retry Policy — DESIGNED, prompt-level only today

Today: the system prompt tells the assistant "never retry an action that
creates or books something unless you're sure the first attempt didn't go
through" — this is real, live guidance, but it's advisory (the LLM decides),
not backend-enforced. The V2.1 spec's target (workflow/backend owns retry
decisions, not the AI) requires §2's `retryable` field to exist somewhere the
backend can act on — not built this pass. The retry-policy-per-code table in
`ELC-ERROR-TAXONOMY.md` is the design; nothing new added here.

## 5. Idempotency 2.0 — DESIGNED, not implemented

**Existing (EXISTING, unchanged)**: `toolCallId`-based dedup with a 15-minute
TTL, stored in each workflow's static data (`Check Duplicate (Customer
Write|Meeting|Tracking)` in Tools Router; `call_id`-based in Post Call's
`Already Recorded?`). This protects against **retried tool calls** (the same
`toolCallId` arriving twice) — confirmed still accurate after this session's
fresh `get_workflow_details` read.

**Gap this doesn't cover**: independent duplicate *business* events — e.g.
the same customer asking to book the same meeting twice in one call, or
across two calls, would get two different `toolCallId`s and sail through the
existing guard.

**Target design** (not built): an `idempotency_key` computed per-operation,
not per-tool-call-id:

| Operation | Proposed key |
|---|---|
| `create_customer` | `create_customer` + `phone` |
| `create_quote_request` | `create_quote_request` + `phone` + day (a customer re-requesting the same day's quote is likely the same request; a new day is likely a new one — judgment call, not derived mechanically) |
| `create_meeting` | `create_meeting` + `phone` (or `customer_id` once available) + `startTime` |

**States** (per spec): `PROCESSING` / `SUCCEEDED` / `FAILED`. Today's
static-data dedup is binary (seen/not-seen within TTL) — it doesn't model a
`PROCESSING` state, so two truly concurrent requests for the same operation
within the same execution tick could both pass the check before either
writes back. This is a real, documented gap, not a hypothetical one: Google
Sheets' `appendOrUpdate` has no row-level lock either, so a genuine race
(same customer, same meeting, two near-simultaneous calls) could still
produce two Sheets rows even with an `idempotency_key` layered on top, unless
that layer itself has atomic check-and-set semantics — n8n workflow static
data does have atomic-enough semantics for the existing `toolCallId` dedup
(single Node.js process per execution), but a proper `idempotency_key` store
should not be assumed race-free without checking against n8n's actual
execution concurrency model first, not assumed here.

**Storage abstraction (`IdempotencyStore`)**: designed as an interface, not
built:

```
IdempotencyStore {
  get(key) -> { status: PROCESSING|SUCCEEDED|FAILED, result, correlation_id } | null
  setProcessing(key, correlation_id)
  setSucceeded(key, result)
  setFailed(key)
}
```

Today's only safe backing store is n8n workflow static data (same place the
existing `toolCallId` dedup already lives) — **not** Google Sheets, per the
explicit V2.1 instruction not to assume Sheets is safe for this without
checking, and per this project's own incident history with Sheets schema
edits. Workflow static data doesn't survive workflow re-publishes (it's
tied to the workflow's saved state) — a real limitation, documented rather
than worked around. A future PostgreSQL/Redis swap would only need a new
`IdempotencyStore` implementation, not business-logic changes — that's the
whole point of the abstraction, but it's paper-only until §8's phase is
picked up.

## 6. Execution Trace — DESIGNED, not built

**Prerequisite now satisfied**: correlation_id exists (§1), which is what
this needs to key events by.

**Not built**: the actual event stream. Example shape from the spec:

```json
{"timestamp": "...", "correlation_id": "ELC-...", "component": "tools_router", "operation": "create_meeting", "status": "SUCCEEDED", "code": "BOOKED", "duration_ms": 421}
```

No new storage for this exists — building it means deciding where trace
events live (a new Data Table? Sheets? — not decided, not built) and adding
an emit-event step to Tools Router's terminal nodes, which is exactly the
"touch every branch" risk this pass avoided for §1 by design. Correctly
sequenced after §2 (structured responses), since trace events and structured
results share almost the same fields.

## 7. Observability Foundation — mostly `NOT_IMPLEMENTED`

Per the spec's own instruction not to fabricate unavailable metrics:

| Metric | Status |
|---|---|
| `tool_success_rate` | `NOT_IMPLEMENTED` — no aggregation exists |
| `tool_error_rate` | `NOT_IMPLEMENTED` |
| `tool_latency` | `NOT_IMPLEMENTED` (n8n's own execution history has per-node timing, but nothing aggregates it) |
| `call_completion_rate` | `NOT_IMPLEMENTED` |
| `human_transfer_rate` | `NOT_IMPLEMENTED` |
| `calendar_success_rate` | `NOT_IMPLEMENTED` |
| `crm_sync_success_rate` | `NOT_IMPLEMENTED` |
| `retry_rate` | `NOT_AVAILABLE` — no backend-level retry exists yet to measure (§4) |
| `duplicate_prevention_rate` | `NOT_IMPLEMENTED` (the existing `toolCallId` dedup doesn't emit a count anywhere queryable) |

## 8. Failure Handling & What's Honestly Unverified

Per the spec's explicit instruction: "workflow saved" is not proof of
success, and unavailable live verification must be logged, not faked.

- **Verified live**: both correlation-ID nodes execute without crashing the
  workflow (`test_workflow` returned `status: success` twice on Tools
  Router). Node wiring confirmed correct via a fresh `get_workflow_details`
  read after publish (connections match the intended chain exactly).
- **Not verified this pass**: the exact JSON body content returned to a
  caller (i.e., that `correlation_id` actually appears correctly in the
  response, and that Post Call's independently-computed ID matches Tools
  Router's for the same call). The cause is concrete and disclosed, not
  hand-waved: `mcp__n8n__get_execution`, `mcp__n8n__search_executions`, and
  `mcp__n8n__prepare_test_pin_data` all returned `Tool not found` errors
  for the remainder of this session after an MCP server reconnect event,
  despite other n8n tools (`search_workflows`, `get_workflow_details`,
  `update_workflow`, `publish_workflow`, `test_workflow`) continuing to work
  normally. This is logged as a **tooling outage**, not a
  `BLOCKED_DEPENDENCY` (the credentials and design are fine; the inspection
  tool was unavailable) — re-verification with content-level checks is the
  first action item for whoever picks this back up, before trusting §1
  further or building on top of it.
- **Not attempted**: an actual live phone call through Vapi to confirm Vapi's
  tool-result parser tolerates the extra `correlation_id` field. Not
  available from this session (no live outbound calling capability here).
  This is the single highest-remaining-risk item in this pass — see
  `ELC-V2.1-IMPLEMENTATION-PLAN.md` §6 for the rollback path if it turns out
  Vapi rejects the extra field.

## Rollback

Both workflows have clean version-history checkpoints
(`get_workflow_history`) immediately before and after this pass's changes.
Rollback: `restore_workflow_version` to the pre-Phase-1 version, or manually
remove the two new Code nodes and revert `Respond With Results`'s
`responseBody` to `{{ $json }}`. No Sheets schema, no Calendar node, no Vapi
assistant config, no existing branch logic was touched — rollback surface is
exactly two new nodes and one parameter change, nothing else.
