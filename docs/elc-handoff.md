# ELC Human Handoff

## Model: single generalist agent + one live transfer target

ELC is one Vapi assistant ("ELC Agent"). There is no squad and no
department routing — every escalation goes live, in real time, to the one
human contact number you designated (`+96876923072`), covering **every**
scenario without exception. This was your explicit choice earlier in this
project and is unchanged by this pass. See `docs/elc-architecture.md` →
"Why no multi-agent Vapi Squad" for the full reasoning.

## Escalation triggers

(from `docs/knowledge-base/escalation-rules.md`, mirrored in `vapi/system-prompt.md`)

- Customer explicitly requests a human
- Serious complaint
- Legal issue
- Customs dispute
- Payment/compensation dispute
- Lost or damaged shipment
- Sensitive commercial negotiation
- A tool call fails and ELC can't recover
- High-value or unusual shipment
- Customer is frustrated / the conversation is going poorly
- Anything that would otherwise require guessing

**Not a trigger:** a question a function tool can answer (available times,
existing-customer lookup, tracking-number save, call history). Transferring
for these is the exact bug that was fixed earlier this project — see
`docs/elc-tools.md`.

## What actually happens on transfer

1. ELC tells the customer briefly and honestly it's connecting them now.
2. If it can be done in a few seconds without making the customer wait, it
   logs the reason via the appropriate customer tool call first (notes
   field) — otherwise it transfers immediately and lets the post-call
   summary capture the reason.
3. It calls the native Vapi `transferCall` tool, which places the customer
   live with the number above. This is a real telephony transfer, not a
   queued ticket or a callback promise.
4. If the line can't be reached or it's outside business hours, ELC says so
   honestly instead of implying someone is standing by, and makes sure
   everything needed for a callback is already logged.

## Context preservation

Today the human being transferred to hears the live call directly (native
Vapi `transferCall`) — the context they need mid-call is whatever was said,
plus whatever ELC already wrote into the customer's `notes` field before
transferring (reason, what the customer needs, what's already been done).
After the call ends, the full picture — summary, structured data, outcome —
lands in the `Calls` sheet via `n8n/workflows/post-call.ts`, so anyone
reviewing later (not just the person who took the transfer) has the full
record; nothing requires the customer to repeat themselves to a *second*
person on a callback.

A structured pre-transfer summary block (customer / reason / issue /
conversation context / shipment / actions taken / urgency / recommended next
action), spoken or SMS'd to the human right as the transfer happens, is real
future value — but needs a channel to deliver it through (SMS API, Slack,
or similar) that doesn't exist yet. See `docs/elc-operations.md` → Pending
credentials.

## If you want multi-department routing later

A real Vapi Squad (e.g. separate Sales / Support / Tracking assistants that
hand off to each other, or separate human lines per department) is buildable
without inventing anything, but needs from you:

- Which departments actually need separate handling (not just separate
  prompts — separate real destinations)
- A real phone number or Vapi assistant ID per department
- Whether department routing should be AI-to-AI (squad transfer) or
  AI-to-human (multiple `transferCall` destinations, picked by intent)

Until that's decided, the single-agent-with-one-line model is the correct,
tested, working design — not a placeholder waiting to be replaced.
