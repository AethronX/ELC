# ELC Architecture — Reasoning & Orchestration Layer

This file documents how ELC actually *thinks*, on top of the system-level shape
already described in `docs/architecture.md` (call lifecycle, why Vapi does the
conversation and n8n does the deterministic execution, idempotency, security).
Read that file first for the plumbing; this one covers the decision-making
layer added during the ELC intelligence-upgrade pass.

## The operating loop

Every customer turn runs through the same shape, encoded directly in
`vapi/system-prompt.md` (see "How you think before you act"):

```
UNDERSTAND   what does the customer actually want, in this turn
IDENTIFY     who is this (find_customer once phone/email is known)
VERIFY       is what I have confirmed, or am I assuming it
REASON       what's missing, what's the real next action
DECIDE       tool call, direct answer, or escalation
ACT          call the right tool with the right inputs
VERIFY RESULT   did the tool actually report success
RESPOND      tell the customer the truth, in their language
DOCUMENT     the tool call itself is the CRM write - no separate step
FOLLOW UP / ESCALATE   per the rules in docs/elc-handoff.md
```

This is enforced entirely inside the Vapi model's system prompt (the LLM *is*
the reasoning engine here) rather than as a separate orchestration layer in
n8n, for the same reason `docs/architecture.md` gives for not running a second
LLM pass in n8n: Vapi already owns conversation intelligence, n8n owns
deterministic business execution. Splitting "reasoning" into a second service
would add latency and a second place for the loop to drift out of sync with
what the assistant says.

## Why no multi-agent Vapi Squad

The upgrade spec this pass was built against described a role-based squad
(Receptionist / Sales / Tracking / Support assistants transferring between
each other). That was evaluated and **deliberately not built**, because:

1. You already made an explicit choice this project: **one designated human
   phone number covers every escalation scenario without exception** (not a
   per-department routing tree). A squad's main value — routing between
   *different AI roles* — doesn't apply when the destination for anything a
   single generalist agent can't handle is the same human line either way.
2. ELC's actual tool set (customer CRM, quotes, meetings, tracking, human
   transfer) is small enough that one system prompt covers it without
   role-permission conflicts. Splitting it into 4 assistants would mean 4x the
   context to keep in sync, 4x the places a prompt bug can hide, and inter-
   assistant transfers to test — for no capability ELC doesn't already have.
3. The concrete bug this spec worried about ("customer asks for sales →
   assistant hangs up instead of routing") was real, but its root cause
   wasn't "missing squad" — it was the assistant not having a live
   `transfer_to_human` tool at all, and not knowing to call `get_available_slots`
   instead of offering a transfer for a fast lookup. Both were already fixed
   earlier this project (see `docs/known-issues.md` → "Resolved this
   session") and reinforced again in this pass ("USE THEM, don't transfer
   instead of using them" in the tools section of the system prompt).

**If you want real role separation later** (e.g. a dedicated sales
assistant with its own KPIs, or department-specific phone lines), that's a
squad, and it's a real Vapi feature — but it needs a decision from you first
(which departments, which real phone numbers/contacts per department) before
it can be built without inventing anything. See `docs/elc-handoff.md` →
"If you want multi-department routing".

## Where each responsibility actually lives

| Responsibility | Lives in | Why |
|---|---|---|
| Conversation, intent, language, tone, reasoning loop | Vapi system prompt (`vapi/system-prompt.md`) | Single LLM already doing STT/TTS/dialogue; a second reasoning pass in n8n would double latency and cost for no new capability |
| Company facts, policies, FAQs, escalation triggers | `docs/knowledge-base/*.md` | Small enough to live as structured reference content the prompt draws from directly; no RAG needed at this scale |
| Tool execution, CRM writes, calendar writes, dedup | n8n (`Tools Router`, `Post Call`, `Website Lead Intake`, `Follow-up Engine`) | Deterministic, needs to be inspectable/versioned/idempotent - not something to trust to free-form LLM output |
| Customer data | Google Sheets (`Customers`, `Calls` tabs) | Matches current volume, free, inspectable by non-engineers; revisit only if concurrency becomes a real problem |
| Scheduling truth | Google Calendar | Never guessed - `get_available_slots`/`create_meeting` always hit the real calendar |
| Human escalation | Native Vapi `transferCall` → your number | Live, real-time handoff, not a queued ticket |

## Internal decision checklist

The system prompt carries a condensed version of this (it must stay short for
voice latency); the full rationale for each check:

1. **Did I understand the request?** — one turn can carry more than one
   intent (a quote AND a meeting); don't drop the second one.
2. **Did I identify the customer?** — `find_customer` before assuming new.
3. **Do I have enough information?** — ask one thing at a time; don't block
   on optional fields the customer doesn't know.
4. **Is the information verified?** — a tool result, not an assumption.
5. **Do I need a tool?** — see `docs/elc-tools.md` for the "when NOT to call
   a tool" cases (small talk, already-known facts, out-of-scope questions).
6. **Is this operation safe to automate?** — see "Automate vs escalate"
   below.
7. **Could this require escalation?** — check against
   `docs/elc-handoff.md` triggers before acting further.
8. **Am I about to guess?** — if yes, stop; say so honestly instead.
9. **Can I truthfully confirm completion?** — only after a tool result
   says so, never before.
10. **What's the next action?** — always end reasoning on a concrete next
    step, not an open loop.

This checklist is never spoken to the customer — it's the internal shape of
each turn, not a script.

## Automate vs. escalate

Kept deliberately narrow, per "don't over-automate":

**Automate** (deterministic, tool-backed, low risk):
customer lookup/create/update, calendar availability + booking, quote
request logging, shipment-number logging, known company facts (process,
services, FAQs).

**Escalate to the human line** (judgment, money, or trust on the line):
compensation/refund decisions, customs disputes, legal threats, lost/damaged
shipment claims, sensitive negotiations, anything the customer is visibly
angry about, anything the assistant genuinely doesn't have a tool or fact
for.

## Related documents

- `docs/architecture.md` — system-level plumbing (call lifecycle, idempotency, security posture)
- `docs/elc-skills.md` — how the knowledge base maps to the "skills" the spec asked for, and why it isn't a separate multi-file loader
- `docs/elc-tools.md` — per-tool contract: inputs, when to call, when not to, failure handling
- `docs/elc-handoff.md` — escalation triggers and the context-preserving handoff structure
- `docs/elc-testing.md` — the test matrix and current verified/pending status
- `docs/elc-operations.md` — 24/7 behavior, credentials, observability, environment variables
