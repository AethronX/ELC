# Etihad One — Autonomous AI Employee

شركة الاتحاد المحدودة · CHINA — OMAN LOGISTICS

Etihad One is the AI logistics employee for China → Oman shipments: it answers customer calls (Vapi), understands intent, qualifies leads, maintains a single customer record per phone/email, books real meetings, and escalates to a human the moment it would otherwise have to guess.

## Status: live and production-tested

All 5 workflows are **active, published, and credentialed** in the connected
n8n Cloud instance (`nadhm.app.n8n.cloud`), and the Vapi assistant ("ELC
Agent") is patched with all 7 tools and the post-call webhook pointing at
them, with the shared secret set on both sides. Real end-to-end testing has
been done against the live Google Sheets CRM and Google Calendar (real rows
written, a real calendar event booked and double-booking correctly
rejected). See `docs/known-issues.md` for exactly what's still open.

## Layout

```
docs/
  architecture.md          final architecture + design rationale
  runbook.md                exact manual steps + credentials still required
  known-issues.md           gap analysis: what's live, what's partial, what's blocked and why
  knowledge-base/           company/services/process/policies/faqs/qualification/escalation/communication
sheets/
  schema.md                 Google Sheets CRM schema (Customers, Calls)
vapi/
  assistant.json            Vapi Assistant config-as-code (system prompt, tools, analysisPlan)
  system-prompt.md          source text for the system prompt (kept in sync with assistant.json)
  tools.json                standalone copy of the tool schemas
n8n/
  workflows/*.ts             n8n Workflow SDK source for every workflow, mirroring what's live in n8n
```

## Live n8n workflows (nadhm.app.n8n.cloud)

| Workflow | Purpose | Trigger | Status |
|---|---|---|---|
| Etihad One - CRM Setup | One-time: creates the CRM spreadsheet + headers | manual | done (spreadsheet live, headers written) |
| Etihad One - Tools Router | Real-time Vapi tool calls (find/create/update customer, quote, meeting, history, tracking) | webhook | **live**, idempotency-guarded |
| Etihad One - Post Call | Idempotent post-call CRM update from Vapi's end-of-call-report | webhook | **live** |
| Etihad One - Website Lead Intake | Website quote form → same CRM pipeline | webhook | **live** |
| Etihad One - Follow-up Engine | Daily scan for stale `quote_requested` leads, spam-capped | schedule | **live** (flags only — no send channel yet) |

The Vapi ↔ n8n connection (tool URLs + webhook secret + phone/calendar
credentials) is live end-to-end. What's genuinely still open — a live human
call-transfer path, lead scoring, sales notifications, and any channel that
needs a credential nobody has provided yet (Gmail, WhatsApp, a tracking API)
— is tracked in `docs/known-issues.md`, not silently assumed done.

## Start here
1. Read `docs/known-issues.md` for exactly what's open and what decision/credential each item needs from you.
2. Read `docs/runbook.md` for the manual setup history and any remaining steps.
3. Read `docs/architecture.md` for how the pieces fit together and why.
