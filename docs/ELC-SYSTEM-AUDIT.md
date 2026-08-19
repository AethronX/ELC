# ELC Agent — System Audit (Phase 0)

Date: 2026-08-19. Grounded in the live n8n workspace, live Vapi account, live Google
Sheets/Calendar, and this project's git history — nothing below is invented. Where
something couldn't be verified from this session, it's marked `BLOCKED_DEPENDENCY`.

## 1. Current Architecture

```
Customer (phone)
   ↓
Vapi (STT: Deepgram nova-3 / ar · LLM: gpt-4o · TTS: Azure ar-OM-AbdullahNeural)
   ↓ real-time function-call webhook, per tool
n8n: "Etihad One - Tools Router"  (dTECfAvJ8LkCdNTC, 41 nodes, active)
   ↓
Google Sheets (CRM: Customers, Calls)  /  Google Calendar ("ELC" calendar)
   ↓ result string
Vapi → spoken back to customer

--- after the call ends ---
Vapi (end-of-call-report webhook)
   ↓
n8n: "Etihad One - Post Call"  (3dlG0HwYvN76SLW2, active)
   ↓ idempotent on call_id
Find/Create Customer → Save Call → Update Customer status → human_required?

--- website channel ---
Website quote form → n8n: "Etihad One - Website Lead Intake" (wONDwM9abUlPeYZC, active)
   ↓ same find-or-create logic as calls
Google Sheets (CRM)

--- follow-ups ---
n8n: "Etihad One - Follow-up Engine" (Hm3jrnh7kEFAHjRy, active, daily schedule)
   ↓ scans Customers for status=quote_requested with no response
Respects a 3-attempt cap, logs every attempt in the CRM notes field

--- one-time utilities (inactive by design) ---
"Etihad One - CRM Setup" (snnVW5dwQ0y7u5VE) — created the spreadsheet + headers once
"Etihad One - Vapi Connect (one-time)" (nYRR1Za9dnfRf8B2) — the only channel that can
   reach api.vapi.ai from this session; used to patch the live assistant config
```

Every workflow above is currently live and has been exercised with real data this
project (not simulated) — see §6 for exactly what's been verified vs. not.

## 2. Components

| Component | What it is | Where it lives |
|---|---|---|
| Voice/conversation layer | Vapi assistant "ELC Agent" (`f44cf5c8-a491-4afd-9dd2-407c224e3774`) | Vapi Cloud |
| Tool execution layer | 5 n8n workflows | n8n Cloud (`nadhm.app.n8n.cloud`) |
| Customer data store | Google Sheets, spreadsheet `1wT2BfeEMrb2YKy9obWwOVYQ-hW3bhSaDYVmtCq3PtVI`, tabs `Customers` (16 columns) and `Calls` (15 columns) | Google Sheets |
| Scheduling store | Google Calendar, dedicated calendar named "ELC" (`f9566914af8435ca75741c294c178daa396476dda983f76b63e2cad790435876@group.calendar.google.com`) | Google Calendar |
| Telephony | Vapi-hosted trial number `+1 904 915 6313` (provider `vapi`) | Vapi Cloud |
| System prompt / knowledge base | `vapi/system-prompt.md` (single assembled prompt) + `docs/knowledge-base/*.md` (source reference content) | This git repo |
| Config-as-code mirror | `vapi/assistant.json`, `vapi/tools.json` | This git repo |
| Documentation | `docs/architecture.md`, `docs/elc-architecture.md`, `docs/elc-skills.md`, `docs/elc-tools.md`, `docs/elc-handoff.md`, `docs/elc-testing.md`, `docs/elc-operations.md`, `docs/known-issues.md`, `docs/runbook.md` | This git repo |

## 3. Data Flow

Every real-time tool call carries: `phone` (the primary match key), plus whatever
fields that specific tool needs (`customer_name`, `startTime`/`endTime`,
`shipment_number`, etc.). There is **no `customer_id` passed by Vapi today** — every
lookup happens by `phone` first (see §12, this is the single biggest structural gap
against the "unified customer identity" target).

Post-call data flow: Vapi's own `analysisPlan` (structured-data extraction + summary,
computed by Vapi's LLM from the transcript) is what Post Call receives — n8n does not
run a second LLM pass. This is a deliberate design choice (see `docs/architecture.md`),
not an oversight.

## 4. Tool Flow (Tools Router internals)

`Etihad One Tools Webhook` → `Verify Vapi Secret` (in-workflow IF-node secret
comparison, not an n8n credential — see §9) → `Normalize Webhook Payload` → `Split
Tool Calls` → `Flatten Tool Call` → `Route By Tool` (switch by function name) → one of:

- `find_customer` → `Read Customer (find_customer)` → found/not-found result
- `create_customer` / `create_quote_request` → duplicate-guard → upsert → `Compute
  Lead Score` (computed, **not persisted** — see §8) → result
- `update_customer` → duplicate-guard → upsert → result
- `get_available_slots` → `Get Upcoming Events` → `Compute Available Slots` (Code
  node; also produces the natural-language `spoken` label fixed 2026-08-17) → result
- `create_meeting` → `Check Availability` → `Slot Available?` → `Create Meeting` →
  `Update CRM After Booking` → result
- `get_customer_history` → `Read Call History` → `Summarize History` → result
- `get_tracking_status` → duplicate-guard → `Save Shipment Number` → result

→ `Aggregate Results` → `Respond With Results` (single JSON body back to Vapi).

`transfer_to_human` is **not** a Tools Router branch — it's a native Vapi `transferCall`
tool with no server round-trip at all.

## 5. Workflow Dependencies

- All 4 live business workflows share one Google Sheets spreadsheet and (for
  calendar-touching nodes) one Google Calendar — there is no per-workflow data
  isolation.
- Tools Router and Post Call both share the same hardcoded webhook secret,
  compared in an IF node in each workflow independently (not a shared credential).
- The Vapi Connect workflow is the **only** path from this Claude session to the
  live Vapi API — this session's own network policy blocks `api.vapi.ai` directly.
- Follow-up Engine depends on Customers sheet state only; it has no dependency on
  Tools Router or Post Call at runtime (reads/writes the sheet directly on its own
  schedule).

## 6. External Dependencies

| Dependency | Status | Notes |
|---|---|---|
| Vapi account/API | Live, working | Assistant, transcriber, voice, tools all verified live |
| Vapi phone number | Live but **trial-tier** | No reliable outbound legs — blocks `transferCall` and caused real call drops (see Incident, 2026-08-17) |
| Google Sheets OAuth2 | Live, working | Credential `bNsYF9FXlaxwenxR` |
| Google Calendar OAuth2 | Live, working | Credential `ZOb98SYVTa4tmwDQ`; **restricted from generic HTTP Request node use** at the account level (confirmed by a failed attempt to create a calendar via raw API call) |
| Gmail/SMTP | **Not connected** | Follow-up Engine can only flag, not send |
| WhatsApp Business API | **Not connected** | No Meta Business/BSP account exists yet |
| Live tracking API | **Not connected** | No provider selected; `get_tracking_status` is save-only by design |
| PostgreSQL or any DB other than Sheets | **Not connected** | Not evaluated; see §14 |

## 7. Failure Points (ranked by real-world impact, not theoretical)

1. **Trial phone number** — confirmed root cause of both a failed live `transferCall`
   and two real mid-call drops (`endedReason: customer-ended-call`, SIP data showed
   STIR/SHAKEN attestation "C"). User is deciding on a paid Vapi number as of this
   session.
2. **No `customer_id` propagation from Vapi** — every write path re-derives identity
   from `phone` alone. Works today because there's one channel, but is the direct
   blocker for §15 (unified identity) and §18 (WhatsApp).
3. **Google Sheets as the only data store** — no real transactions across
   Sheets+Calendar; a partial-failure state (calendar event created, CRM write failed)
   is possible and was actually seen live on 2026-08-15 (see Incident log) before the
   node's column schema was fixed. The *specific* schema bug is fixed; the *general*
   risk of split-brain state between Calendar and Sheets is architectural and still
   present.
4. **Single shared webhook secret**, compared per-workflow in an IF node rather than
   a shared credential — works, but means the secret is duplicated 2x (Tools Router,
   Post Call) and must be updated in two places if rotated.
5. **No correlation ID** — a real production incident (Post Call fully down for an
   unknown window on 2026-08-15) was found by manually cross-referencing execution
   timestamps across two workflows; there was no single ID to grep for across Vapi →
   n8n → Sheets.

## 8. Security Risks

- No secrets in git — confirmed; `vapi/assistant.json`/`tools.json` carry
  `REPLACE_WITH_VAPI_WEBHOOK_SECRET` placeholders, the real secret lives only in the
  live n8n workflows and the live Vapi config.
- The webhook secret is a single static string compared via IF node — functional, but
  is plaintext in each workflow's node parameters (visible to anyone with n8n editor
  access). No rotation mechanism exists.
- No rate limiting or IP allowlisting on either public webhook.
- `transferCall` destination number (`+96876923072`) is committed to git as-is — this
  was an explicit, deliberate choice (a real business contact number is normal
  config, not a credential) documented in `docs/known-issues.md`.

## 9. Reliability Risks

- **Confirmed incident**: Post Call was completely down (100% failure) for an
  unknown window on 2026-08-15 due to a webhook-trigger/response-mode misconfiguration
  — fixed, but nothing currently *alerts* if this happens again; it was found by
  manual inspection.
- **Confirmed incident**: the same class of Google Sheets schema-drift bug (a node's
  cached column schema going stale relative to the real sheet) has now been hit twice
  independently — once causing sheet corruption (2026-08-12), once causing a
  post-booking tool-call failure (2026-08-15). All currently-known instances were
  found and fixed in the 2026-08-16 audit, but the *pattern* (cached schema drifting
  from live sheet state) is not structurally prevented — a new node added later could
  reintroduce it.
- No automated tests exist. All verification to date has been live manual replay via
  `test_workflow` against real Sheets/Calendar/Vapi.

## 10. Data Consistency Risks

- `create_meeting` can succeed against Google Calendar while the subsequent CRM
  write fails — this exact sequence happened live on 2026-08-15. There is currently
  no `meeting_status` field distinguishing "booked, CRM synced" from "booked, CRM
  sync failed" — the tool result today is binary (success string or crash).
- Duplicate-guards exist (`toolCallId`-based, using n8n workflow static data) on the
  three write branches (customer write, meeting, tracking) — scoped to writes only
  after a deliberate speed-vs-safety tradeoff (user chose speed). This is real
  idempotency, but it protects against *retried tool calls*, not against
  *independent duplicate business events* (e.g., the same customer calling twice
  with the same request).
- The live Customers/Calls sheets were fully test/corrupted data as of 2026-08-16
  and were wiped clean — current production data starts from that wipe forward.

## 11. Current Technical Debt

- Tool results are plain outcome strings (`meeting_booked`, `no_matching_customer_found`,
  etc.), not a structured contract — the assistant's behavior depends on it
  recognizing specific substrings rather than parsing a defined schema.
- Business hours (09:00–17:00, Sun–Thu, Asia/Muscat) are hardcoded inside the
  `Compute Available Slots` Code node and nowhere else — the assistant has no way to
  know "are we open right now," only "what slots exist in the next 7 days."
- Three pre-built, unused Vapi assistants exist on the account (Support Agent,
  Tracking Agent, Sales Agent, created 2026-08-11) — not referenced in this repo, not
  wired to any phone number, origin/intent unknown. Flagged, not touched.
- No logging/observability beyond n8n's own per-execution history (real, but not
  aggregated — no dashboard, no metrics, no alerting).

## 12. Recommended Changes (summary — detailed in ELC-ARCHITECTURE.md)

Ranked by (impact × safety), highest first:

1. Add a `get_business_status` tool — additive, no schema risk, immediately removes
   hardcoded hours from the prompt's blast radius. **Implemented this pass** (§ Phase 7).
2. Formalize the structured tool-response contract as a *written spec* now,
   implemented branch-by-branch later — writing the contract is zero-risk; a
   sweeping Tools Router rewrite is not something to do in one uncontrolled pass
   (this project has twice been burned by exactly that kind of broad edit).
3. Add a `correlation_id` at the webhook-entry point of each workflow, log it,
   return it in tool results — additive, low risk, directly addresses the Post-Call
   outage's root diagnostic gap.
4. Do not touch the Google Sheets data layer's *shape* until a real
   `CustomerRepository`-style abstraction is designed on paper first (§14) — every
   incident so far traces back to editing that shape live without a dry run.
5. Do not build WhatsApp integration or Vapi Squad yet — both are correctly staged
   as architecture-readiness work, not this pass's implementation target, per the
   explicit instruction not to over-build ahead of real need.

## BLOCKED_DEPENDENCY items (nothing guessed, nothing invented)

- Paid Vapi phone number / Twilio number — needs a payment method on the user's Vapi
  account (in progress, user's decision, not yet completed as of this audit).
- WhatsApp Business API credential (Meta or a BSP) — does not exist yet.
- Live shipment tracking provider — none selected.
- Gmail/SMTP credential for real follow-up sends — not connected.
- PostgreSQL or any alternate datastore — not provisioned, not requested until a
  real trigger for it exists (see §14).
