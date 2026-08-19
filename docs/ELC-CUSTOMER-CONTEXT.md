# ELC Agent — Unified Customer Identity & Conversation Context (spec)

**Status: specification only.** Documents the gap and the target shape.
Nothing in this document has been implemented this pass — see
`ELC-SYSTEM-AUDIT.md` §"Data consistency risks" for how this gap was found.

## Correction (2026-08-19, V2.1 audit)

`customer_id` already exists as a real column in the Customers sheet and is
generated on creation (`"CUS-" + $now.toMillis()`) in both Tools Router's
`Generate New Customer Fields` and Post Call's `Generate New Customer Fields
(post-call)`. The gap below is narrower than earlier drafts of this document
stated: it's a **read/return-shape gap**, not a schema gap. `customer_id` is
never *returned* in any tool result string, so the assistant never sees it
and can't pass it back on a later call — the storage side is already correct.

## The gap, precisely

Vapi today passes **no `customer_id` of any kind** in tool-call payloads, and
no tool result returns it either. Every lookup in Tools Router
(`find_customer`, `get_customer_history`, etc.) matches on `phone` alone.
That means:

- A customer who calls from a different number is invisible to
  `find_customer`, even if they exist in the Customers sheet under another
  number.
- There is no stable key to join a phone conversation with a future WhatsApp
  conversation (see `ELC-WHATSAPP-ARCHITECTURE.md`) — phone number is the only
  thing that could join them today, and international/mobile numbers aren't
  guaranteed to match formatting between channels.
- `call_id` (Vapi's per-call identifier) is already used for Post Call
  idempotency, but it identifies a *call*, not a *customer* — a returning
  customer gets a new `call_id` every time.

## Target: `customer_id` as the central identity

- Already generated once, at first contact, by `create_customer`/
  `create_quote_request` (row-based `"CUS-" + timestamp` ID) — no schema
  change needed, confirmed present in the live Customers sheet.
- Not yet returned by `find_customer` alongside the existing fields — this is
  the one remaining step. Once returned, `customer_id` becomes available to
  every subsequent tool call in that conversation (the assistant would need
  to be told, via the system prompt, to pass it back on later tool calls).
- `phone`, `email`, and (later) `whatsapp_id` become **lookup keys that
  resolve to a `customer_id`**, not the identity itself.

This is now a pure Tools Router logic change (return `customer_id` from
`find_customer`'s `Found Result` node) plus a small prompt update — no schema
change, since the column and generation logic already exist. Still not
attempted in the V2.1 pass (scoped to correlation_id only — see
`ELC-V2.1-IMPLEMENTATION-PLAN.md`), but meaningfully smaller than previously
documented:
1. ~~Add `customer_id` column to Customers sheet~~ — already exists, not needed.
2. ~~Update `create_customer` to generate and write it~~ — already does this.
3. Update `find_customer`'s `Found Result` node to include `customer_id` in
   the result string (or, once structured responses land, in `data`).
4. Update the system prompt to tell the assistant to reuse `customer_id` on
   later calls in the same conversation once it has one.
5. Only once verified live, start having other branches accept/use it.

## Conversation context model

Per the user's explicit instruction, the goal is **not** to dump full call
history into the LLM's context on every turn (token cost, latency, and
hallucination risk all scale badly with that). The target shape:

| Layer | Contents | Source |
|---|---|---|
| Customer Summary | Name, customer_type, standing request type, last interaction date | `get_customer_history` (already summarizes, doesn't dump) |
| Active Context | What's happening *this* conversation — current quote being discussed, pending meeting, in-progress tracking number | New: would need a short-lived "session context" concept, not built |
| Relevant History | Only if the customer references the past ("as I mentioned before...") | Existing `get_customer_history`, called on demand |

`get_customer_history`'s current implementation (`Summarize History` node)
already follows the "summary, not dump" principle — this is the one part of
the target model that's already correct today. What's missing is the "Active
Context" layer, which doesn't exist as a concept anywhere in the system yet:
there's no place that tracks "this customer, mid-call, is discussing quote X"
across a tool-call sequence within one conversation.

## Why this isn't built this pass

Both changes above (customer_id, active context) require schema changes or
new cross-call state, unlike `get_business_status` which was pure, stateless,
additive. Given the project's own incident history (schema drift caused two
real production issues — see audit §"Reliability risks"), these are correctly
sequenced *after* the smaller, safer phases, and each deserves its own
verification window rather than being bundled into this pass.

## Related documents

- `ELC-SYSTEM-AUDIT.md` — where this gap was first identified (§ Data flow)
- `ELC-WHATSAPP-ARCHITECTURE.md` — the concrete case this identity gap blocks
  (phone → WhatsApp context continuity)
- `ELC-ARCHITECTURE.md` — `CustomerService` in the Business Operations table
