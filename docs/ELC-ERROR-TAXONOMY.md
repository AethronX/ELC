# ELC Agent — Structured Error Taxonomy (spec)

**Status: specification only.** Not yet implemented across Tools Router. This is
deliberate — see "Why this isn't implemented yet" below. Implement this
branch-by-branch, one Tools Router tool at a time, with a live `test_workflow`
verification after each branch, never as a single sweeping edit.

## Response contract

Every tool result should carry this shape once implemented (today it's a plain
string — see `ELC-SYSTEM-AUDIT.md` §11):

```json
{
  "success": true,
  "code": "MEETING_CREATED",
  "message": "تم حجز الموعد بنجاح",
  "data": { "startTime": "2026-08-20T14:00:00+04:00" },
  "retryable": false,
  "severity": "INFO"
}
```

```json
{
  "success": false,
  "code": "CALENDAR_TIMEOUT",
  "message": "تعذر الوصول إلى التقويم",
  "data": null,
  "retryable": true,
  "severity": "ERROR"
}
```

`message` is the only field ever meant to reach the customer (spoken or otherwise);
`code` is what the assistant's tool-handling logic should branch on internally.

## Code taxonomy

| Category | Codes |
|---|---|
| SUCCESS | `SUCCESS`, `FOUND`, `CREATED`, `UPDATED`, `BOOKED` |
| BUSINESS | `NOT_FOUND`, `ALREADY_EXISTS`, `INVALID_INPUT`, `NO_AVAILABILITY`, `NOT_ELIGIBLE`, `DUPLICATE` |
| AUTH | `AUTH_ERROR`, `PERMISSION_DENIED`, `TOKEN_EXPIRED` |
| SYSTEM | `TIMEOUT`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`, `RATE_LIMITED`, `NETWORK_ERROR` |
| DATA | `SCHEMA_ERROR`, `DATA_VALIDATION_ERROR`, `MISSING_REQUIRED_FIELD`, `CONFLICT` |
| HUMAN | `HUMAN_REQUIRED`, `SENSITIVE_CASE`, `CUSTOMER_REQUESTED_HUMAN` |
| **PARTIAL** (new, see below) | `MEETING_CREATED_CRM_SYNC_FAILED`, `CUSTOMER_SAVED_HISTORY_SYNC_FAILED` |

The **PARTIAL** category is the direct fix for the real incident in
`ELC-SYSTEM-AUDIT.md` §10: when the external side effect (Calendar event, in the
2026-08-15 incident) genuinely succeeded but the CRM write failed, the tool result
must say so precisely — not `SUCCESS` (would hide a real data gap) and not a
generic `FAILURE` (would make the assistant retry `create_meeting` and risk a real
double-booking). This distinction is the single highest-value item in this whole
taxonomy and should be the first branch migrated when implementation starts.

## Retry policy (per code, not per tool)

| Code | retryable | max_retries | Who decides |
|---|---|---|---|
| `TIMEOUT`, `SERVICE_UNAVAILABLE`, `NETWORK_ERROR` | true | 2 | System (safe to auto-retry) |
| `RATE_LIMITED` | true | 1, with backoff | System |
| `INVALID_INPUT`, `AUTH_ERROR`, `PERMISSION_DENIED`, `NOT_ELIGIBLE` | false | 0 | Never retry — the input or the credential is the problem, not transient |
| `MEETING_CREATED_CRM_SYNC_FAILED` and other PARTIAL codes | false | 0 | **Never retry the create** — the side effect already happened; retrying would duplicate it. Escalate to human/logged-for-reconciliation instead |
| `HUMAN_REQUIRED`, `SENSITIVE_CASE` | false | 0 | Not a failure to retry — a routing decision |

This mirrors what's already true informally in the current system prompt ("never
retry an action that creates or books something unless you're sure the first
attempt didn't go through") — the taxonomy makes that rule mechanically checkable
instead of relying on the LLM inferring it from a string every time.

## Why this isn't implemented yet

Tools Router has 41 nodes and has already caused two real production incidents
(2026-08-12 sheet corruption, 2026-08-15 booking-response failure) from edits made
without a dedicated verification window. A sweeping rewrite of every branch's
output shape in one pass repeats exactly that risk pattern at much larger scale.
The correct rollout, when picked up:

1. Pick one branch (recommend `create_meeting`, since it's the one with a real
   PARTIAL-failure precedent).
2. Add the structured object *alongside* the existing string result (don't remove
   the string yet) so nothing currently depending on it breaks.
3. Update the system prompt to prefer the structured `code` field when present.
4. Verify live with `test_workflow` against real Sheets/Calendar.
5. Only once that branch is stable in production, move to the next branch.

Each branch is its own small, reversible commit per the project's own stated rule.
