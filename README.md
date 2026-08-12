# Etihad One — Autonomous AI Employee

شركة الاتحاد المحدودة · CHINA — OMAN LOGISTICS

Etihad One is the AI logistics employee for China → Oman shipments: it answers customer calls (Vapi), understands intent, qualifies leads, maintains a single customer record per phone/email, books real meetings, and escalates to a human the moment it would otherwise have to guess.

This repository started **completely empty** — see `docs/runbook.md` for exactly what that means for setup. Everything buildable without a live Vapi account or Google Sheets/Calendar OAuth credential has been built and, where possible, pushed live to the connected n8n Cloud instance.

## Layout

```
docs/
  architecture.md          final architecture + design rationale
  runbook.md                exact manual steps + credentials still required
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

| Workflow | Purpose | Trigger |
|---|---|---|
| Etihad One - CRM Setup | One-time: creates the CRM spreadsheet + headers | manual |
| Etihad One - Tools Router | Real-time Vapi tool calls (find/create/update customer, quote, meeting, history, tracking) | webhook |
| Etihad One - Post Call | Idempotent post-call CRM update from Vapi's end-of-call-report | webhook |
| Etihad One - Website Lead Intake | Website quote form → same CRM pipeline | webhook |
| Etihad One - Follow-up Engine | Daily scan for stale `quote_requested` leads, spam-capped | schedule |

None are activated yet — each needs its Google/Vapi credential attached first. See `docs/runbook.md`.

## Start here
1. Read `docs/runbook.md` and complete steps 1–5 (Google Sheets, Vapi account, webhook secrets, Calendar, website webhook).
2. Publish the 4 webhook/schedule workflows in n8n once credentials are attached.
3. Import `vapi/assistant.json` into Vapi and attach a phone number.
4. Run the test plan at the bottom of `docs/runbook.md`.
