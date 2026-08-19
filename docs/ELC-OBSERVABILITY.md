# ELC Agent — Observability & Correlation ID Plan

**Status: correlation ID implemented (V2.1 Phase 1, 2026-08-19). Everything
else in this document (metrics, execution trace events, alerting) remains
specification only.** See `ELC-V2.1-RELIABILITY.md` for the implemented
design in full detail; this document keeps the original reasoning for why
correlation ID was sequenced where it was, now updated to reflect that it
shipped ahead of customer identity/error taxonomy rather than after them —
see "Why the sequencing changed" below.

## What exists today

- Vapi's own dashboard: per-call transcripts, recordings, and the
  `analysisPlan` structured-data extraction (see the live `Patch Assistant`
  jsonBody) — this is real, already-live observability, just not owned by n8n.
- n8n's own execution list per workflow (`search_executions`,
  `get_execution`) — usable for debugging after the fact, not proactive
  alerting.
- Nothing joins these two. A failed tool call inside a Vapi call has no shared
  identifier that lets you find "the n8n execution that corresponds to this
  Vapi call" without manually matching on timestamp.

## Target: correlation ID

Format proposed by the user: `ELC-YYYYMMDD-XXXXX` (date + short random/hash
suffix). Propagated:

```
Vapi (assign at call start, e.g. via a variable in firstMessage context)
   → Tool call (as a field in every tool-call payload)
   → n8n Tools Router (read it, attach to every Sheets/Calendar write as a column or note)
   → CRM (Sheets row)
   → Calendar (event description or extended property)
   → Post Call webhook (same ID, closes the loop)
```

Once in place, a single ID lets you trace one customer interaction across
Vapi's dashboard, every Tools Router execution it triggered, and every Sheets
row/Calendar event it created — without timestamp-matching.

## Why the sequencing changed

This document originally argued correlation ID should come *after*
`customer_id` and structured responses, to avoid touching Tools Router
branches twice. The V2.1 pass (2026-08-19) implemented it *first* instead,
once the actual design was worked out: correlation_id is **derived from
Vapi's `call.id`**, computed in one new node at each workflow's entry point
(`Assign Correlation ID` in Tools Router, `Assign Correlation ID (post-call)`
in Post Call), and returned as a top-level field in the Tools Router response
— without touching any of the 12+ terminal branch nodes at all. This avoided
the "touch every branch twice" problem the original sequencing was trying to
prevent, so there was no actual reason left to wait for `customer_id` or the
structured-response rollout. See `ELC-V2.1-RELIABILITY.md` §1 for the full
design and verification status.

customer_id and structured responses are still sequenced after this, for
their own reasons (schema/prompt changes, tool-result shape changes) — not
because correlation_id depends on them.

## Minimal logging discipline (recommended now, not built)

Independent of the full correlation ID plan, a cheap first step: every
Sheets-writing node already has an implicit trace via n8n's own execution
history. No code change needed to start using it — the gap is process, not
tooling: when investigating an incident (like the 2026-08-15 partial-failure
case in `ELC-SYSTEM-AUDIT.md`), start from `search_executions` filtered by
workflow + time window, not from re-reading the workflow definition. This
costs nothing to adopt and doesn't require any of the phases above.

## Related documents

- `ELC-CUSTOMER-CONTEXT.md` — `customer_id`, the prerequisite this depends on
- `ELC-ERROR-TAXONOMY.md` — the `data` field that would eventually carry the
  correlation ID once structured responses roll out
- `ELC-SYSTEM-AUDIT.md` — the 2026-08-15 incident this would have made faster
  to diagnose
