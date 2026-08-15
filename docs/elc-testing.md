# ELC Testing — Scenario Matrix

Honest status as of this pass. **PASS** means verified against the real
system this session (real Google Sheets/Calendar/Vapi API calls, not
simulated data). **PENDING** means the logic is built and believed correct
but needs a real phone call or a real duplicate event to fully confirm —
this session cannot place live phone calls. **NOT TESTED** means genuinely
not yet exercised either way. Do not read PASS as "perfect" — it means the
specific scenario was actually run and produced the correct result.

| # | Scenario | Status | Notes |
|---|---|---|---|
| 1 | New customer call | PASS | `find_customer` not found → `create_customer`/`create_quote_request` creates a new `Customers` row (verified `docs/runbook.md`) |
| 2 | Existing customer call | PASS | `find_customer` found → `update_customer` updates the same row, no duplicate |
| 3 | Quote request | PASS | Logged with partial info; customer not blocked on unknown fields |
| 4 | Meeting booking | PASS | Real calendar event created on a free slot |
| 5 | Calendar conflict | PASS | Overlapping slot correctly rejected, nothing booked |
| 6 | Sales transfer (no separate sales role — see `docs/elc-handoff.md`) | PASS (config) / PENDING (live call) | `get_available_slots` answers directly instead of transferring, verified via the earlier live-call bug report and fix; not yet re-confirmed on an actual phone call since this pass's prompt update |
| 7 | Tracking request | PASS | Shipment number saved, no status/location ever stated |
| 8 | Unknown tracking number | NOT TESTED | Tracking is save-only regardless of whether the number is "known" — no live tracking source exists to look anything up against, so this scenario doesn't have a distinct failure mode to test |
| 9 | Complaint | PENDING | Escalation rule and `transfer_to_human` are live; not yet exercised on a real call |
| 10 | Angry customer | PENDING | "Reading the customer's mood" guidance added this pass; needs a real call to confirm tone in practice |
| 11 | Missing information | PASS | Workflow completes correctly with blank optional fields |
| 12 | Contradictory information | NOT TESTED | No explicit contradiction-handling test run yet |
| 13 | Duplicate webhook | PASS (logic) / PENDING (live) | Idempotent on `call_id` in Post Call, verified by design and code review; not yet triggered by an actual duplicate Vapi event |
| 14 | Duplicate call (repeat tool call, e.g. Vapi retry) | PASS (logic) / PENDING (live) | `toolCallId`-based idempotency guard on write branches in Tools Router (see `docs/known-issues.md`) |
| 15 | Missing email | PASS | Workflow completes with the email column blank |
| 16 | Tool failure | PENDING | Recovery wording added to the prompt this pass ("don't pretend it worked... escalate if it still doesn't work"); not yet forced to fail live to confirm behavior |
| 17 | CRM failure (Sheets write fails) | NOT TESTED | No fault-injection test run against the live Sheets credential |
| 18 | Calendar failure | NOT TESTED | Only the "conflict" case (#4/#5) has been tested, not a hard Calendar API failure |
| 19 | After-hours call | NOT TESTED (real gap) | `get_available_slots` only offers slots inside business hours, but the assistant does not currently check the current time to change its own behavior after hours (e.g. explicitly telling the customer no one is live right now). Worth a small, low-risk addition — see `docs/known-issues.md` |
| 20 | Arabic | PASS | Default language; live-call bugs (interruption, wrong-language switching) reported and fixed earlier this project |
| 21 | English | NOT TESTED | Declared supported in the prompt; no live English call run yet |
| 22 | Chinese | NOT TESTED | Declared "when reasonably possible" in the prompt; no live Chinese call run yet |
| 23 | Human request (explicit "connect me to a person") | PASS (config) / PENDING (live) | `transferCall` live and verified via the Vapi API response (real `updatedAt`); not yet confirmed by an actual placed call |
| 24 | Follow-up attempt 1 | PASS | `follow_up_count` incremented, `last_follow_up_at` stamped on a real stale row |
| 25 | Follow-up attempt 2 | NOT TESTED | Same code path as attempt 1; not separately exercised |
| 26 | Follow-up attempt 3 (cap) | NOT TESTED | Filter condition (`follow_up_count < 3`) verified by reading the workflow logic, not by driving a real row to the cap |
| 27 | Follow-up stop (status changes away from `quote_requested`) | NOT TESTED | Verified by design (filter only targets `quote_requested`) - not run end-to-end |

## What would move PENDING/NOT TESTED items to PASS

Almost all of them need one thing: **a real phone call to the live number**,
or in a couple of cases a deliberately-broken credential to force a failure
path. Both are outside what this session can trigger (no telephony access,
and deliberately breaking a working credential to test failure isn't worth
the risk of a repeat of the sheet-corruption incident). Recommended real
test pass, in priority order:

1. Call and explicitly ask for a human — confirm the transfer actually
   connects and the destination number rings.
2. Call and ask "what times do you have available" without proposing a time
   — confirm it answers directly instead of offering a transfer.
3. Call in English, then in Chinese if you have a Chinese speaker available.
4. Report a complaint or an angry tone deliberately, confirm the assistant
   doesn't argue and escalates appropriately.
5. Let a test customer sit at `quote_requested` for the follow-up engine to
   pick up 3 days running, confirm it stops after the 3rd flagged attempt.
