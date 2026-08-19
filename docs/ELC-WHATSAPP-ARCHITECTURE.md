# ELC Agent — WhatsApp Channel Adapter (target architecture, spec only)

**Status: specification only. WhatsApp is not connected.** No WhatsApp
Business API credential exists in this environment — this is logged as a
`BLOCKED_DEPENDENCY` in `ELC-SYSTEM-AUDIT.md`. This document defines the
shape the adapter should take once that dependency is unblocked, so it's
built once, correctly, instead of as a bolt-on.

## The one hard rule

**WhatsApp must not become a second, parallel business-logic system.** It is
a new Channel Adapter in the layering from `ELC-ARCHITECTURE.md` — it talks to
the *same* Business Operations (CustomerService, QuoteService, MeetingService,
TrackingService) that Vapi Voice already uses via Tools Router. If WhatsApp
grows its own copy of "how to create a customer" or "how to book a meeting,"
the two channels will drift, and a customer switching channels mid-conversation
will get inconsistent behavior — exactly the failure mode the user's spec
calls out by name.

## Target flow

```
WhatsApp message
   ↓
Webhook (WhatsApp Business API → n8n)
   ↓
Normalize Message           — same shape as "Normalize Webhook Payload" produces for Vapi
   ↓
Identify Customer            — resolve whatsapp_id → customer_id (see ELC-CUSTOMER-CONTEXT.md;
                                requires unified customer identity to exist first)
   ↓
Load Context                 — Customer Summary + Active Context, same model as voice
   ↓
AI (text-mode equivalent of the Vapi assistant, same system prompt content)
   ↓
Shared Tools                 — calls the SAME Tools Router branches Vapi calls
                                (find_customer, create_quote_request, create_meeting, etc.)
   ↓
CRM / Calendar / Tracking    — same Google Sheets / Calendar backends, unchanged
   ↓
WhatsApp reply
```

## Why this is blocked, not just deferred

Two real prerequisites are missing, not just unbuilt:

1. **WhatsApp Business API credential** — not connected in this environment.
   `BLOCKED_DEPENDENCY`: cannot be fabricated; must come from the user.
2. **Unified customer identity** (`ELC-CUSTOMER-CONTEXT.md`) — without a
   `customer_id` that both channels resolve to, "the customer discussed a
   quote by phone, then continued on WhatsApp" cannot actually work: phone
   number formatting differs enough between Vapi's caller ID and WhatsApp's
   `wa_id` that a naive string match would silently miss real matches or
   collide unrelated customers. This should be solved before WhatsApp is
   wired up, not worked around inside the WhatsApp adapter.

## What "Shared Tools" means concretely

Not a new Tools Router. The existing `Etihad One - Tools Router` workflow's
webhook already accepts `{message: {type: "tool-calls", toolCalls: [...]}}`
in the same shape Vapi sends. A WhatsApp adapter's "Normalize Message" step
should translate an incoming WhatsApp message + the AI's chosen tool call into
that exact same payload shape and POST it to the exact same Tools Router
webhook — reusing the endpoint, not duplicating its logic. This is the
concrete meaning of "no channel talks to Google Sheets directly" from
`ELC-ARCHITECTURE.md`.

## What changes vs. voice

- No `transferCall` equivalent in the same sense — WhatsApp escalation likely
  means flagging the conversation for a human agent to pick up in whatever
  WhatsApp Business interface the team uses, not a live call transfer. This
  needs a product decision from the user, not an assumption.
- No `get_available_slots` "speak the natural label" concern — WhatsApp can
  show real ISO-adjacent formatted options as text/buttons directly.
- Business hours (`get_business_status`) matters more here, not less — a
  WhatsApp message can arrive at 2am and sit unanswered; the AI should be
  honest that a same-day human response isn't guaranteed outside hours,
  exactly the scenario `get_business_status` (Phase 7, now live) was built for.

## Related documents

- `ELC-ARCHITECTURE.md` — channel adapter table, layering principle
- `ELC-CUSTOMER-CONTEXT.md` — the identity prerequisite this depends on
- `ELC-SYSTEM-AUDIT.md` — `BLOCKED_DEPENDENCY` list (WhatsApp API)
- `ELC-BUSINESS-HOURS.md` — `get_business_status`, reused as-is by this channel
