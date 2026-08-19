# Runbook — Manual Setup & Remaining Credentials

## Session log (2026-08-12)

Steps 1–5 below are **done** — credentials 1 (Google Sheets), 2 (Vapi
account/API key), 3 (Vapi Webhook Auth in n8n), 4 (Google Calendar), and 5
(website webhook auth) are all attached and live. The Vapi assistant ("ELC
Agent") is patched with real tool/webhook URLs and a shared secret set on
both sides.

During a full production test pass, the following real bugs were found and
fixed live (all verified with real Google Sheets/Calendar calls, not just
simulated data):
- `Create Meeting` / `Check Availability` Google Calendar nodes were missing
  their `resource`/`operation` discriminators.
- `Slot Available?` IF node's strict type validation rejected a valid
  boolean under the unary "is true" operator — switched to loose validation.
- The `Flatten Tool Call` Set node read `$json.function.arguments`, which
  n8n's expression sandbox blocks (`arguments` is a reserved/guarded
  identifier) — reworked to avoid the literal token.
- `Split Tool Calls` nests each split item under its source field name
  (`toolCallList`) rather than promoting it to the item root — downstream
  expressions were updated to match the real shape.
- The production CRM spreadsheet had been created but never had its header
  row written (an earlier partial run stopped after spreadsheet creation) —
  headers were written for real to the live sheet.
- No credential was attached to any Google Sheets/Calendar/webhook node in
  any of the 5 workflows — all attached.
- Tools Router had no protection against a retried tool call double-booking
  a meeting or creating a duplicate customer — a `toolCallId`-based
  idempotency guard was added (see `docs/known-issues.md` #2 for its
  verification status).

See `docs/known-issues.md` for what's still open, prioritized, with exactly
what's needed from you for each item.

---

## 1. Google Sheets credential — done
Connected via OAuth2, attached to every Google Sheets node across all 5
workflows. The "Etihad One CRM" spreadsheet exists with `Customers` and
`Calls` tabs and real header rows.

## 2. Vapi account + API key — done
The "ELC Agent" assistant is live on the connected Vapi account, patched
with real tool schemas, the real webhook secret, and `server.url` pointing
at the Post Call workflow. Voice: Azure `ar-SA-HamedNeural` (Vapi built-in,
no separate voice-provider account needed).

## 3. Vapi Webhook Auth credential in n8n — done
A single Header Auth credential is attached to both the Tools Router and
Post Call webhook nodes.

## 4. Google Calendar credential — done
Connected via OAuth2, attached to both `Check Availability` and
`Create Meeting` nodes, pointing at the real calendar.

## 5. Website webhook — done (credential attached)
The Website Lead Intake workflow is live and credentialed. Confirm with your
web team that the site's quote form actually posts to
`https://nadhm.app.n8n.cloud/webhook/etihad-one/website-lead` with the
matching header — that final wiring on the website side wasn't verifiable
from this session.

## 6. Gmail/SMTP — not connected (blocks real follow-up sends)
Not connected — no credential available. The Follow-up Engine already flags
follow-up attempts in the CRM (`follow_up_count`, `last_follow_up_at`); once
a Gmail credential exists, add a Gmail node right after "Flag Follow-up
Attempt" (and similar confirmation-email nodes after quote/meeting actions)
to actually send. See `docs/known-issues.md`.

## 7. WhatsApp provider — not connected (optional, future)
Not evaluated or connected. Evaluate providers only once phone + email are
live and there's a real need.

## 8. Real shipping/tracking API — not connected (optional, future)
No tracking API exists today. `get_tracking_status` only saves the shipment
number, by design (see `docs/knowledge-base/policies.md`).

## 9. Live human call transfer / department handoff — decision needed
See `docs/known-issues.md` P0 #1. This needs a decision from you (Vapi
Squad vs. single assistant + `transferCall`) plus a real phone number or
assistant IDs to route to — nothing here can be safely guessed.

---

## End-to-end test plan

Scenarios 1–4 and 8–9 below have been run against the live system with real
Google Sheets/Calendar calls during this session and passed. Scenarios 5–7
still need a real live call to fully verify (they depend on Vapi's actual
end-of-call-report payload shape and dashboard replay tooling, which this
session cannot trigger directly).

1. **New customer call** — ✅ verified: `find_customer` not found →
   `create_customer`/`create_quote_request` creates a new `Customers` row.
2. **Existing customer call** — ✅ verified: `find_customer` found → the AI
   has the prior record; `update_customer` updates the same row, no
   duplicate.
3. **Meeting** — ✅ verified against the real calendar: booking a free slot
   creates a real event and updates `customer_status`; requesting an
   overlapping slot is correctly rejected without booking.
4. **Tracking** — ✅ verified: shipment number is saved; response text never
   claims a tracking status.
5. **Duplicate post-call webhook** — logic verified (idempotent on
   `call_id`); not yet triggered by a real duplicate Vapi event.
6. **Missing email** — ✅ verified: workflow completes with the email column
   blank.
7. **Human escalation** — prompt/CRM-side logic in place
   (`customer_status = human_required`); **no live call transfer exists yet**
   — see known-issues P0 #1. This is the most important remaining test once
   that's built.
8. **Website lead** — ✅ verified: a `Customers` row is created with
   `lead_source=website`.
9. **Follow-up engine** — ✅ verified: a stale `quote_requested` row gets
   `follow_up_count` incremented and `last_follow_up_at` stamped; the
   `follow_up_count`/`last_follow_up_at` columns were bootstrapped onto the
   real sheet during this session (they didn't exist before).
