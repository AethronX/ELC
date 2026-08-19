# ELC Agent V2.1 — Reliability Pass Implementation Plan

Audit date: 2026-08-19. Branch: `claude/etihad-one-autonomous-ai-ubejhd`. Last
known-good commit: `7bbb835`. Grounded in a fresh `get_workflow_details` read
of both live workflows this session — nothing below is from memory or from
the V2 docs without re-verification.

## 1. Current state (re-verified this session)

- `Etihad One - Tools Router` (`dTECfAvJ8LkCdNTC`): 42 nodes, active,
  `updatedAt` matches the V2 `get_business_status` change. Structure matches
  `ELC-SYSTEM-AUDIT.md` exactly, plus the `Compute Business Status` branch.
- `Etihad One - Post Call` (`3dlG0HwYvN76SLW2`): 15 nodes, active, unchanged
  since 2026-08-16.
- **Correction to `ELC-CUSTOMER-CONTEXT.md`**: `customer_id` already exists as
  a real column, generated on creation (`"CUS-" + $now.toMillis()`) in both
  Tools Router's `Generate New Customer Fields` and Post Call's `Generate New
  Customer Fields (post-call)`. The actual gap is narrower than that doc
  states: `customer_id` is never *returned* in any tool result string, so the
  assistant never sees it and can't pass it back on a later call. This is a
  read/return-shape gap, not a schema gap. Corrected in `ELC-CUSTOMER-CONTEXT.md`
  as part of this pass (see §9).
- No `correlation_id` concept exists anywhere yet.
- Tool results are plain strings (`meeting_booked: ...`, `no_matching_customer_found`,
  `already_processed`, etc.) — confirmed unchanged from the V2 audit.
- Idempotency today: `toolCallId`-based, 15-minute TTL, in n8n workflow static
  data (`Check Duplicate (Customer Write|Meeting|Tracking)` Code nodes in
  Tools Router), plus `call_id`-based dedup in Post Call (`Already Recorded?`).
  This protects against **retried tool calls**, not independent duplicate
  business events — confirmed, matches audit.
- Vapi tool-call response contract (confirmed from `Respond With Results`):
  `{"results": [{"toolCallId": "...", "result": "..."}]}`. This is the shape
  Vapi's function-calling protocol expects back — nothing in this repo's docs
  states Vapi's tolerance for *extra* top-level fields, and it should not be
  assumed; see §4.

## 2. Exact changes (this pass — Phase 1 only)

Scope of this pass, per the "one phase, one test, one verification" rule:
**Correlation ID only.** Structured tool contract, idempotency 2.0, retry
policy, and execution-trace tooling are designed on paper in
`ELC-V2.1-RELIABILITY.md` but not implemented this pass — see §7 for why.

1. **Tools Router**: new Code node `Assign Correlation ID`, inserted between
   `Normalize Webhook Payload` and `Split Tool Calls`. Computes one
   `correlation_id` per webhook batch (i.e., per Vapi tool-call round-trip),
   shared by every tool call in that batch.
2. **Tools Router**: `Respond With Results`'s `responseBody` expression
   changed from `{{ $json }}` to include `correlation_id` as an extra
   top-level field alongside the existing `results` array. No branch, no
   terminal Set node, no Sheets/Calendar node touched.
3. **Post Call**: new Code node `Assign Correlation ID (post-call)`, inserted
   between `Normalize Call Data` and `Read Existing Call`. Uses the identical
   hash function so that, for the same phone call, Tools Router and Post Call
   independently compute the **same** `correlation_id` from the shared Vapi
   `call.id` — without either workflow needing to receive it from the other,
   and without any Vapi-side config change.

## 3. Correlation ID design

`correlation_id = "ELC-" + YYYYMMDD (UTC, at generation time) + "-" + shortHash(call_id)`

- `shortHash`: a deterministic 5-character base36 hash (simple string hash,
  not cryptographic — traceability doesn't need collision-resistance at this
  volume, just a human-greppable stable ID).
- **Reuse-if-present**: if an incoming payload already carries a
  `correlation_id` (checked at `message.call.metadata.correlation_id`, a
  field Vapi does not currently send but might in the future if the user
  wires it up), it's reused verbatim instead of derived.
- **Fallback**: if there's no `call.id` at all (e.g., a manual test
  execution), fall back to a random suffix — still unique, just not
  cross-workflow-joinable, which is correct: there's no real call to join.
- This is deliberately **not** a new value generated independently at each
  layer — see the V2.1 spec's own distinction between correlation_id and
  idempotency_key. Deriving it from `call.id` (which both workflows already
  receive independently from Vapi) means Tools Router and Post Call agree on
  the same ID without a propagation channel that doesn't exist yet.
- **Known limitation**: if a call starts before midnight UTC and Post Call's
  webhook fires after midnight UTC, the date component could differ between
  the two workflows' independently-computed IDs, breaking the join for that
  one call. This is a real, small, documented edge case — not solved this
  pass (would require deriving the date from `call.startedAt` instead of
  "now," which Tools Router doesn't reliably have at tool-call time). Logged
  as a known limitation in `ELC-V2.1-RELIABILITY.md`, not a `BLOCKED_DEPENDENCY`
  (it doesn't block anything, it's a documented small-probability edge case).

## 4. Risk analysis

| Change | Risk | Mitigation |
|---|---|---|
| New `Assign Correlation ID` node in Tools Router's main chain | Could break the chain if connections are wired wrong | Additive node insertion via `update_workflow`'s `addNode`/`addConnection`/`removeConnection` ops, verified with `test_workflow` before treating it as done |
| `Respond With Results` body expression change | Vapi's tool-result parser might reject or ignore an unexpected top-level field | This is the single highest-risk item in this pass. Mitigation: `results` array is byte-for-byte unchanged in shape and content — only a sibling key is added. Verified via `test_workflow` that the JSON shape is exactly `{results: [...], correlation_id: "..."}`. Cannot verify Vapi's actual parser tolerance without a live phone call (not available in this session) — flagged honestly in §6, not assumed safe. |
| New node in Post Call's main chain | Same class of risk as Tools Router | Same mitigation: additive-only, `execute_workflow` verification before considering done |
| Nothing in the structured-response contract touched | N/A | Explicitly out of scope this pass |

## 5. Backward compatibility strategy

- No existing node's `result` string content changes. No existing branch
  logic changes. No existing tool name, parameter, or Vapi-facing schema
  changes.
- The one genuinely new surface Vapi sees is the extra `correlation_id` key
  in the webhook response body. Per §11 of the V2.1 spec ("compatibility
  layer" principle): this is additive-only by construction (a sibling field,
  not a schema replacement) rather than a formatter/compatibility-layer
  pattern, because the existing `results` array is not being restructured at
  all — there is nothing to translate back from.

## 6. Test strategy

1. `test_workflow` against Tools Router with a simulated `get_business_status`
   tool call (reusing the established pattern from V2): confirm the response
   body is exactly `{"results": [{"toolCallId": "...", "result": "..."}],
   "correlation_id": "ELC-YYYYMMDD-XXXXX"}`.
2. Run it twice with the **same** simulated `call.id` in the payload: confirm
   both executions produce the identical `correlation_id` (proves the
   deterministic-derivation claim, not just that *a* value is generated).
3. Run it once with **no** `call.id` in the payload: confirm it still
   produces a valid (fallback, random-suffix) `correlation_id` rather than
   erroring.
4. `execute_workflow` against Post Call with a simulated end-of-call payload
   using the **same** `call.id` used in step 1/2: confirm Post Call's
   independently-computed `correlation_id` matches Tools Router's.
5. Explicitly **not** claimed as verified this pass: actual Vapi-side
   tolerance of the extra response field on a real live phone call — logged
   as an open verification item, not fabricated.

## 7. Rollback strategy

- Both changes are `update_workflow` operations with `versionName`/
  `versionDescription`, so n8n's own version history (`get_workflow_history`)
  has a clean rollback point per workflow.
- Rollback is: `restore_workflow_version` to the pre-Phase-1 version ID for
  each workflow, or manually `removeNode`/`removeConnection` for
  `Assign Correlation ID` (Tools Router) and its Post Call counterpart, and
  revert `Respond With Results`'s `responseBody` to `{{ $json }}`.
- If step 5's live verification later reveals Vapi actually rejects or
  mis-parses the extra field, the fix is a single-node revert (`Respond With
  Results` only) — the correlation_id computation itself stays intact and
  simply becomes internal-only (still useful for n8n execution tracing, per
  `ELC-OBSERVABILITY.md`'s existing "grep by execution" recommendation) even
  if never returned to Vapi.

## 8. What's explicitly deferred past this pass

Per the "one phase, one test, one verification" rule and this project's own
incident history (two prior production incidents both came from broader,
uncontrolled edits), the remaining V2.1 phases are designed in
`ELC-V2.1-RELIABILITY.md` but **not implemented this pass**:

- Structured tool response contract (Phase 2) — the `create_meeting` PARTIAL-
  failure case remains the recommended first branch per
  `ELC-ERROR-TAXONOMY.md`, still not started.
- Idempotency 2.0 / `IdempotencyStore` abstraction (Phase 3).
- Retry policy enforcement at the workflow level (Phase 4) — today retry
  discipline is prompt-level only (system prompt tells the assistant not to
  retry creates), not backend-enforced.
- Execution Trace event stream (Phase 5) — the correlation_id landing this
  pass is the prerequisite for this; the trace *events* themselves aren't
  built yet.
- Observability metrics (Phase 6) — `NOT_IMPLEMENTED` for all nine metrics
  named in the spec; none are fabricated.

## 9. Documentation corrected/updated this pass

- `ELC-CUSTOMER-CONTEXT.md`: corrected to reflect that `customer_id` already
  exists as a column; the real gap is narrower (never returned to the
  assistant).
- `ELC-OBSERVABILITY.md`, `ELC-ERROR-TAXONOMY.md`, `ELC-ARCHITECTURE.md`,
  `ELC-TEST-PLAN.md`: updated where Phase 1 changes what they describe as
  "not yet implemented."
- New: `ELC-V2.1-RELIABILITY.md` (correlation ID, structured results design,
  error codes, retry policy design, idempotency design, execution trace
  design, failure handling, rollback — reflecting what's actually built vs.
  designed-only, not conflating the two).
