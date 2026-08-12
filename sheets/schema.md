# Google Sheets CRM Schema

One Google Sheet ("Etihad One CRM") with two tabs. This is the system of record until/unless a real CRM becomes justified.

Matching order for find-or-create (never merge on name alone): **1) phone → 2) email → 3) customer_id**.

## Tab: `Customers`

| Column | Type | Notes |
|---|---|---|
| customer_id | string | `CUS-` + short uuid, generated on create |
| customer_name | string | |
| phone | string | E.164 where possible; primary match key |
| email | string | secondary match key |
| customer_type | enum | regular_importer / retailer / ecommerce / company / contractor / trader / individual / other |
| request_type | enum | last known intent (see qualification.md) |
| lead_source | enum | phone / website / whatsapp / email |
| last_contact | datetime (ISO) | |
| customer_status | enum | new / contacted / quote_requested / meeting_scheduled / customer / human_required / closed |
| shipment_number | string | last known, if any |
| notes | string | append-only free text |
| created_at | datetime (ISO) | |
| updated_at | datetime (ISO) | |
| last_call_id | string | Vapi call id |
| follow_up_count | number | auto-created by the Follow-up Engine on first write; counts automated follow-up attempts, capped at 3 |
| last_follow_up_at | datetime (ISO) | auto-created by the Follow-up Engine on first write |

## Tab: `Calls`

| Column | Type | Notes |
|---|---|---|
| call_id | string | Vapi call id — **idempotency key**, must be unique |
| customer_id | string | FK to Customers |
| call_date | datetime (ISO) | |
| phone | string | |
| customer_name | string | |
| call_type | enum | inbound / outbound |
| request_type | enum | intent detected during the call |
| quote_requested | boolean | |
| meeting_booked | boolean | |
| shipment_number | string | |
| call_result | string | short outcome label |
| summary | string | from Vapi's analysisPlan.summaryPrompt |
| transcript_available | boolean | |
| recording_available | boolean | |
| created_at | datetime (ISO) | |

## Provisioning

The sheet and headers are created by the `Etihad One - CRM Setup` n8n workflow (`n8n/workflows/crm-setup.json`), run once after a Google Sheets credential is attached in n8n. It is safe to re-run (checks for existing tabs before creating).
