# ELC Skills — Modular Knowledge Architecture

The upgrade spec asked for a modular skills directory (`elc/core/`,
`elc/skills/`, `elc/roles/`, `elc/situations/`). This project already has a
modular knowledge structure — `docs/knowledge-base/*.md` — built during the
original CRM/n8n build. Rather than duplicate that content into a second,
parallel file tree, this document maps the spec's requested skill categories
onto what already exists, and is explicit about the one place they intentionally
collapse into a single file.

## Why one system prompt, not N loaded skill files

Vapi assistants take a single system prompt string per model config — there
is no "load skill file X only when situation Y is detected" mechanism at
the assistant-config level (that would require a squad with per-situation
routing, which `docs/elc-architecture.md` explains was deliberately not
built). So the *source* is modular (`docs/knowledge-base/`), but the
*delivery* is one assembled prompt (`vapi/system-prompt.md`), kept short
enough to stay fast for voice.

## Skill → file mapping

| Spec category | Where it actually lives | Status |
|---|---|---|
| `core/identity.md` | "Who we are" + opening lines, `vapi/system-prompt.md` | Live |
| `core/operating-principles.md` | "How you think before you act", `vapi/system-prompt.md`; expanded in `docs/elc-architecture.md` | Live |
| `core/reasoning.md` | Internal decision checklist, `docs/elc-architecture.md` | Live |
| `core/communication.md` | `docs/knowledge-base/communication-rules.md` + "Personality"/"Reading the customer's mood" in `vapi/system-prompt.md` | Live |
| `core/safety.md` | "Absolute rule: never hallucinate" + "Never expose API keys..." in `vapi/system-prompt.md` | Live |
| `core/verification.md` | "Confirming sensitive details" in `vapi/system-prompt.md`; tool-result verification rules in `docs/elc-tools.md` | Live |
| `skills/customer-recognition.md` | `find_customer`/`create_customer`/`update_customer` rules in `vapi/system-prompt.md` + `docs/elc-tools.md`; phone-then-email-then-id match order enforced in `n8n/workflows/tools-router.ts` | Live |
| `skills/intent-detection.md` | Handled by the underlying LLM per-turn, guided by the operating loop in `docs/elc-architecture.md` | Live (model-native, not a separate rules file) |
| `skills/qualification.md` | `docs/knowledge-base/qualification.md` | Live |
| `skills/quote-request.md` | "Quote requests" in `vapi/system-prompt.md`, `create_quote_request` in `docs/elc-tools.md` | Live |
| `skills/meeting-booking.md` | "Meetings" in `vapi/system-prompt.md`, `get_available_slots`/`create_meeting` in `docs/elc-tools.md` | Live |
| `skills/tracking.md` | `get_tracking_status` in `docs/elc-tools.md`, `docs/knowledge-base/policies.md` (no live tracking source - never fabricate) | Live (save-only, no live tracking API) |
| `skills/complaint-handling.md` + `skills/escalation.md` | `docs/knowledge-base/escalation-rules.md`, expanded in `docs/elc-handoff.md` | Live |
| `skills/follow-up.md` | `n8n/workflows/follow-up-engine.ts`, rules in `docs/elc-operations.md` | Live (flags in CRM; real sends blocked on a Gmail/WhatsApp credential) |
| `skills/sales.md` | Folded into quote-request + meeting-booking - there is no separate sales role/assistant (see `docs/elc-architecture.md`) | By design, not a gap |
| `skills/multilingual.md` | "Language" section in `vapi/system-prompt.md` | Live (Arabic default, English, Chinese "when reasonably possible") |
| `skills/voice-conversation.md` | `startSpeakingPlan`/`stopSpeakingPlan`/`backgroundDenoisingEnabled` in `vapi/assistant.json`; "Confirming sensitive details" in the prompt | Live |
| `skills/error-recovery.md` | "If a tool call fails..." in `vapi/system-prompt.md`, expanded in `docs/elc-operations.md` | Live |
| `skills/data-privacy.md` | "Never expose API keys..." in `vapi/system-prompt.md` | Live |
| `skills/after-call.md` | `n8n/workflows/post-call.ts`, `analysisPlan` in `vapi/assistant.json` | Live |
| `roles/receptionist.md` / `sales.md` / `tracking.md` / `support.md` | Not separate roles - one generalist ELC agent covers all four, per the no-squad decision | By design, not a gap |
| `situations/urgent-case.md`, `angry-customer.md` | "Reading the customer's mood" in `vapi/system-prompt.md` | Live |
| `situations/missing-information.md` | "If the customer doesn't know something, let them continue" in `vapi/system-prompt.md` | Live |
| `situations/tool-failure.md` | `docs/elc-operations.md` → Error recovery | Live |
| `situations/human-request.md` | `docs/knowledge-base/escalation-rules.md` | Live |

## Company knowledge base (unchanged, already modular)

`docs/knowledge-base/` holds the reference content the prompt draws from:
`company.md`, `services.md`, `process.md`, `policies.md`, `faqs.md`,
`qualification.md`, `escalation-rules.md`, `communication-rules.md`. These
were not restructured in this pass — they were already the right shape and
still match the live system prompt content.

## If the knowledge base grows

If `docs/knowledge-base/` grows past what fits comfortably in one system
prompt (rule of thumb: once it meaningfully slows first-token latency or the
prompt becomes hard to review in a single sitting), the next step is a real
Vapi Knowledge Base / RAG lookup tool rather than a bigger prompt — not more
markdown files. That's a deliberate future decision, not something to
pre-build speculatively now (see "don't over-automate" in
`docs/elc-architecture.md`).
