# ELC Agent — Architecture Contract (target, not a rebuild)

This document defines where ELC is heading structurally. It does not describe a
rewrite — every layer below already exists in some form today (see
`ELC-SYSTEM-AUDIT.md`); this is the contract new work should conform to so the
system grows toward it instead of drifting further from it.

## Layering principle

```
Channels (Vapi Voice today; WhatsApp, Website tomorrow)
   ↓
Channel Adapter        — normalizes each channel's payload into one shape
   ↓
Business Operations    — the actual logic: find/create customer, book a meeting...
   ↓
Data Access            — one repository interface per entity
   ↓
External Services      — Google Sheets today, PostgreSQL possible later
```

**No channel talks to Google Sheets directly.** Today, in practice, Tools Router's
branches *are* both the channel adapter and the business operation in one Code/Set
node chain — that's acceptable at current scale and is not being torn out. The
contract going forward is additive: new channels (WhatsApp) and new operations
(business hours, notifications) get built as their own adapter/operation, calling
the *same* n8n sub-flow logic that Tools Router already has for customer/meeting/
tracking operations, rather than each channel re-implementing customer lookup or
meeting booking from scratch.

## Business Operations (logical grouping, mapped to what exists today)

| Operation | Today's implementation | Status |
|---|---|---|
| `CustomerService` (find/create/update) | Tools Router branches `find_customer`/`create_customer`/`update_customer` | Live |
| `QuoteService` | Tools Router branch `create_quote_request` | Live |
| `MeetingService` | Tools Router branches `get_available_slots`/`create_meeting` | Live |
| `TrackingService` | Tools Router branch `get_tracking_status` (save-only) | Live, deliberately minimal |
| `FollowUpService` | Follow-up Engine workflow | Live |
| `NotificationService` | — | Not built (Phase 9, doc-only this pass) |
| `EscalationService` | Native Vapi `transferCall` + prompt rules | Live |
| `BusinessHoursService` | — | **Built this pass** as `get_business_status` |

## Channel adapters

| Channel | Adapter | Status |
|---|---|---|
| Vapi Voice | `Etihad One Tools Webhook` + `Normalize Webhook Payload` | Live |
| Website | `Etihad One Website Lead Webhook` + `Normalize Website Lead` | Live |
| WhatsApp | — | Not built. See `ELC-WHATSAPP-ARCHITECTURE.md` for the target shape |
| Human (post-transfer) | Native Vapi `transferCall`, no adapter needed | Live |

## Data Access

Today: every business-operation node in n8n talks to Google Sheets directly via
the `googleSheets` node type — there is no repository abstraction layer separating
"what a Customer record looks like" from "how it's stored in Sheets."

**This pass does not introduce a repository abstraction in n8n** — n8n's node model
doesn't have a clean way to express "swap the storage node without touching the
workflow" the way a real codebase would with an interface. The practical
equivalent, and what's actually recommended: **keep every Sheets-touching node's
column list and matching-key identical across all workflows** (already true as of
the 2026-08-16 audit) so that *if* a migration to PostgreSQL ever happens, it's a
mechanical one-node-type swap per branch, not a redesign. This is documented so the
constraint is explicit, not because new tooling was built for it.

## Why no Vapi Squad, still

Unchanged from `docs/elc-architecture.md`'s original reasoning, reaffirmed here: one
generalist assistant covers the full tool set without permission conflicts; the
three unused pre-built assistants on the account (§11 of the audit) remain a
decision for the user, not something adopted or extended in this pass.

## Why no PostgreSQL migration yet

No real trigger exists for it: current volume is well within what Google Sheets
handles safely, and every incident traced back to *editing* the current shape live,
not to Sheets' capacity. Migrating now would add risk without solving a real,
present problem. The discipline above (identical schemas across workflows) is what
keeps that door open cheaply for later.

## Related documents

- `ELC-SYSTEM-AUDIT.md` — current state, verified facts, failure points
- `ELC-ERROR-TAXONOMY.md` — the structured tool-response contract (spec, not yet
  implemented across Tools Router)
- `ELC-BUSINESS-HOURS.md` — the `get_business_status` tool that implements
  `BusinessHoursService`
- `ELC-CUSTOMER-CONTEXT.md` — what "unified customer identity" means concretely and
  what's missing today
- `ELC-WHATSAPP-ARCHITECTURE.md` — the target shape for a WhatsApp channel adapter
- `ELC-OBSERVABILITY.md` — correlation ID and logging plan
- `ELC-TEST-PLAN.md` — critical scenarios and their current verified/pending status
