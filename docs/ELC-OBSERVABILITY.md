# ELC Agent — Observability & Correlation ID Plan (spec only)

**Status: specification only.** Nothing in this document is implemented this
pass. Documents the target and why it's sequenced after the structural work
(customer identity, error taxonomy) rather than before it.

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

## Why this isn't built yet

Correlation ID propagation only becomes valuable once there's a stable
`customer_id` to key off of (see `ELC-CUSTOMER-CONTEXT.md`) and structured
tool responses to carry it in (`ELC-ERROR-TAXONOMY.md`'s `data` field is the
natural home for it). Building correlation IDs first, before those two land,
would mean re-touching every Tools Router branch twice — once to add the ID,
again when the structured-response rollout happens. Sequencing it after both
avoids that rework, consistent with the project's own "small, testable,
reversible" rule.

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
