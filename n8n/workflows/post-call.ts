import { workflow, node, trigger, expr, newCredential, sticky } from '@n8n/workflow-sdk';

const webhookTrigger = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Etihad One Post Call Webhook',
    position: [200, 400],
    parameters: {
      httpMethod: 'POST',
      path: 'etihad-one/post-call',
      authentication: 'headerAuth',
      responseMode: 'onReceived',
    },
    credentials: { httpHeaderAuth: newCredential('Vapi Webhook Auth') },
  },
  output: [{ body: { message: { type: 'end-of-call-report', call: { id: 'vapi-call-abc', customer: { number: '+96890000000' } }, startedAt: '2026-08-12T10:00:00Z', analysis: { summary: 'Customer requested a sea freight quote from China to Oman.', structuredData: { customer_name: 'Ahmed', request_type: 'quote_request', quote_requested: true, meeting_booked: false, shipment_number: '', call_result: 'quote_logged', customer_status: 'quote_requested', human_required: false } }, transcript: 'full transcript text', recordingUrl: 'https://storage.vapi.ai/recording.mp3' } } }],
});

const normalizeCallData = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Normalize Call Data',
    position: [460, 400],
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'a1', name: 'callId', value: expr('{{ $json.body?.message?.call?.id ?? $json.message?.call?.id ?? "" }}'), type: 'string' },
          { id: 'a2', name: 'phone', value: expr('{{ $json.body?.message?.call?.customer?.number ?? $json.message?.call?.customer?.number ?? "" }}'), type: 'string' },
          { id: 'a3', name: 'customerName', value: expr('{{ $json.body?.message?.analysis?.structuredData?.customer_name ?? $json.message?.analysis?.structuredData?.customer_name ?? "" }}'), type: 'string' },
          { id: 'a4', name: 'callDate', value: expr('{{ $json.body?.message?.startedAt ?? $json.message?.startedAt ?? $now.toISO() }}'), type: 'string' },
          { id: 'a5', name: 'summary', value: expr('{{ $json.body?.message?.analysis?.summary ?? $json.message?.analysis?.summary ?? "" }}'), type: 'string' },
          { id: 'a6', name: 'requestType', value: expr('{{ $json.body?.message?.analysis?.structuredData?.request_type ?? $json.message?.analysis?.structuredData?.request_type ?? "general_inquiry" }}'), type: 'string' },
          { id: 'a7', name: 'quoteRequested', value: expr('{{ !!($json.body?.message?.analysis?.structuredData?.quote_requested ?? $json.message?.analysis?.structuredData?.quote_requested) }}'), type: 'boolean' },
          { id: 'a8', name: 'meetingBooked', value: expr('{{ !!($json.body?.message?.analysis?.structuredData?.meeting_booked ?? $json.message?.analysis?.structuredData?.meeting_booked) }}'), type: 'boolean' },
          { id: 'a9', name: 'shipmentNumber', value: expr('{{ $json.body?.message?.analysis?.structuredData?.shipment_number ?? $json.message?.analysis?.structuredData?.shipment_number ?? "" }}'), type: 'string' },
          { id: 'a10', name: 'callResult', value: expr('{{ $json.body?.message?.analysis?.structuredData?.call_result ?? $json.message?.analysis?.structuredData?.call_result ?? "completed" }}'), type: 'string' },
          { id: 'a11', name: 'customerStatus', value: expr('{{ $json.body?.message?.analysis?.structuredData?.customer_status ?? $json.message?.analysis?.structuredData?.customer_status ?? "" }}'), type: 'string' },
          { id: 'a12', name: 'humanRequired', value: expr('{{ !!($json.body?.message?.analysis?.structuredData?.human_required ?? $json.message?.analysis?.structuredData?.human_required) }}'), type: 'boolean' },
          { id: 'a13', name: 'transcriptAvailable', value: expr('{{ !!($json.body?.message?.transcript ?? $json.message?.transcript) }}'), type: 'boolean' },
          { id: 'a14', name: 'recordingAvailable', value: expr('{{ !!($json.body?.message?.recordingUrl ?? $json.message?.recordingUrl ?? $json.body?.message?.artifact?.recordingUrl ?? $json.message?.artifact?.recordingUrl) }}'), type: 'boolean' },
        ],
      },
    },
  },
  output: [{ callId: 'vapi-call-abc', phone: '+96890000000', customerName: 'Ahmed', callDate: '2026-08-12T10:00:00Z', summary: 'Customer requested a sea freight quote.', requestType: 'quote_request', quoteRequested: true, meetingBooked: false, shipmentNumber: '', callResult: 'quote_logged', customerStatus: 'quote_requested', humanRequired: false, transcriptAvailable: true, recordingAvailable: true }],
});

const readExistingCall = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Read Existing Call',
    position: [700, 400],
    alwaysOutputData: true,
    parameters: {
      resource: 'sheet',
      operation: 'read',
      documentId: { __rl: true, mode: 'list', value: '', cachedResultName: 'Etihad One CRM' },
      sheetName: { __rl: true, mode: 'name', value: 'Calls' },
      filtersUI: { values: [{ lookupColumn: 'call_id', lookupValue: expr('{{ $json.callId || "__no_match__" }}') }] },
      combineFilters: 'AND',
      options: { returnAllMatches: 'returnFirstMatch' },
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets - Etihad One CRM') },
  },
  output: [{ call_id: '' }],
});

const isDuplicateCall = node({
  type: 'n8n-nodes-base.if',
  version: 2.3,
  config: {
    name: 'Already Recorded?',
    position: [940, 400],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.call_id }}'), operator: { type: 'string', operation: 'notEmpty' }, rightValue: '' }],
        combinator: 'and',
      },
    },
  },
});

const duplicateSkipped = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Duplicate - Skipped',
    position: [1180, 280],
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: { assignments: [{ id: 'z1', name: 'skipped', value: true, type: 'boolean' }] },
    },
  },
  output: [{ skipped: true }],
});

const readCustomerPostCall = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Read Customer (post-call)',
    position: [1180, 500],
    alwaysOutputData: true,
    parameters: {
      resource: 'sheet',
      operation: 'read',
      documentId: { __rl: true, mode: 'list', value: '', cachedResultName: 'Etihad One CRM' },
      sheetName: { __rl: true, mode: 'name', value: 'Customers' },
      filtersUI: { values: [{ lookupColumn: 'phone', lookupValue: expr('{{ $("Normalize Call Data").item.json.phone || "__no_match__" }}') }] },
      combineFilters: 'AND',
      options: { returnAllMatches: 'returnFirstMatch' },
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets - Etihad One CRM') },
  },
  output: [{ customer_id: '', customer_name: '', notes: '', shipment_number: '' }],
});

const isExistingCustomerPostCall = node({
  type: 'n8n-nodes-base.if',
  version: 2.3,
  config: {
    name: 'Existing Customer? (post-call)',
    position: [1420, 500],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.customer_id }}'), operator: { type: 'string', operation: 'notEmpty' }, rightValue: '' }],
        combinator: 'and',
      },
    },
  },
});

const updateExistingCustomerPostCall = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Update Existing Customer (post-call)',
    position: [1660, 420],
    parameters: {
      resource: 'sheet',
      operation: 'appendOrUpdate',
      documentId: { __rl: true, mode: 'list', value: '', cachedResultName: 'Etihad One CRM' },
      sheetName: { __rl: true, mode: 'name', value: 'Customers' },
      columns: {
        mappingMode: 'defineBelow',
        matchingColumns: ['phone'],
        value: {
          phone: expr('{{ $("Normalize Call Data").item.json.phone }}'),
          customer_name: expr('{{ $("Normalize Call Data").item.json.customerName || $json.customer_name }}'),
          request_type: expr('{{ $("Normalize Call Data").item.json.requestType }}'),
          customer_status: expr('{{ $("Normalize Call Data").item.json.humanRequired ? "human_required" : ($("Normalize Call Data").item.json.customerStatus || $json.customer_status || "contacted") }}'),
          shipment_number: expr('{{ $("Normalize Call Data").item.json.shipmentNumber || $json.shipment_number }}'),
          notes: expr('{{ ($json.notes ? $json.notes + "\\n" : "") + $("Normalize Call Data").item.json.summary }}'),
          last_contact: expr('{{ $now.toISO() }}'),
          updated_at: expr('{{ $now.toISO() }}'),
          last_call_id: expr('{{ $("Normalize Call Data").item.json.callId }}'),
        },
        schema: [
          { id: 'phone', displayName: 'phone', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'customer_name', displayName: 'customer_name', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'request_type', displayName: 'request_type', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'customer_status', displayName: 'customer_status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'shipment_number', displayName: 'shipment_number', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'notes', displayName: 'notes', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'last_contact', displayName: 'last_contact', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'updated_at', displayName: 'updated_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'last_call_id', displayName: 'last_call_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
        ],
      },
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets - Etihad One CRM') },
  },
  output: [{}],
});

const resolvedExisting = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Resolved Existing',
    position: [1900, 420],
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: { assignments: [{ id: 'r1', name: 'resolvedCustomerId', value: expr('{{ $("Read Customer (post-call)").item.json.customer_id }}'), type: 'string' }] },
    },
  },
  output: [{ resolvedCustomerId: 'CUS-1' }],
});

const generateNewCustomerFieldsPostCall = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Generate New Customer Fields (post-call)',
    position: [1660, 620],
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      assignments: {
        assignments: [
          { id: 'e1', name: 'new_customer_id', value: expr('{{ "CUS-" + $now.toMillis() }}'), type: 'string' },
          { id: 'e2', name: 'new_created_at', value: expr('{{ $now.toISO() }}'), type: 'string' },
        ],
      },
    },
  },
  output: [{}],
});

const appendNewCustomerPostCall = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Append New Customer (post-call)',
    position: [1900, 620],
    parameters: {
      resource: 'sheet',
      operation: 'append',
      documentId: { __rl: true, mode: 'list', value: '', cachedResultName: 'Etihad One CRM' },
      sheetName: { __rl: true, mode: 'name', value: 'Customers' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          customer_id: expr('{{ $("Generate New Customer Fields (post-call)").item.json.new_customer_id }}'),
          customer_name: expr('{{ $("Normalize Call Data").item.json.customerName }}'),
          phone: expr('{{ $("Normalize Call Data").item.json.phone }}'),
          customer_type: 'other',
          request_type: expr('{{ $("Normalize Call Data").item.json.requestType }}'),
          lead_source: 'phone',
          last_contact: expr('{{ $now.toISO() }}'),
          customer_status: expr('{{ $("Normalize Call Data").item.json.humanRequired ? "human_required" : ($("Normalize Call Data").item.json.customerStatus || "new") }}'),
          shipment_number: expr('{{ $("Normalize Call Data").item.json.shipmentNumber }}'),
          notes: expr('{{ $("Normalize Call Data").item.json.summary }}'),
          created_at: expr('{{ $("Generate New Customer Fields (post-call)").item.json.new_created_at }}'),
          updated_at: expr('{{ $("Generate New Customer Fields (post-call)").item.json.new_created_at }}'),
          last_call_id: expr('{{ $("Normalize Call Data").item.json.callId }}'),
        },
        schema: [
          { id: 'customer_id', displayName: 'customer_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'customer_name', displayName: 'customer_name', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'phone', displayName: 'phone', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'customer_type', displayName: 'customer_type', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'request_type', displayName: 'request_type', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'lead_source', displayName: 'lead_source', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'last_contact', displayName: 'last_contact', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'customer_status', displayName: 'customer_status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'shipment_number', displayName: 'shipment_number', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'notes', displayName: 'notes', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'created_at', displayName: 'created_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'updated_at', displayName: 'updated_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'last_call_id', displayName: 'last_call_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
        ],
      },
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets - Etihad One CRM') },
  },
  output: [{}],
});

const resolvedNew = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Resolved New',
    position: [2140, 620],
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: { assignments: [{ id: 'r2', name: 'resolvedCustomerId', value: expr('{{ $("Generate New Customer Fields (post-call)").item.json.new_customer_id }}'), type: 'string' }] },
    },
  },
  output: [{ resolvedCustomerId: 'CUS-2' }],
});

const saveCall = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Save Call',
    position: [2380, 500],
    parameters: {
      resource: 'sheet',
      operation: 'append',
      documentId: { __rl: true, mode: 'list', value: '', cachedResultName: 'Etihad One CRM' },
      sheetName: { __rl: true, mode: 'name', value: 'Calls' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          call_id: expr('{{ $("Normalize Call Data").item.json.callId }}'),
          customer_id: expr('{{ $json.resolvedCustomerId }}'),
          call_date: expr('{{ $("Normalize Call Data").item.json.callDate }}'),
          phone: expr('{{ $("Normalize Call Data").item.json.phone }}'),
          customer_name: expr('{{ $("Normalize Call Data").item.json.customerName }}'),
          call_type: 'inbound',
          request_type: expr('{{ $("Normalize Call Data").item.json.requestType }}'),
          quote_requested: expr('{{ $("Normalize Call Data").item.json.quoteRequested }}'),
          meeting_booked: expr('{{ $("Normalize Call Data").item.json.meetingBooked }}'),
          shipment_number: expr('{{ $("Normalize Call Data").item.json.shipmentNumber }}'),
          call_result: expr('{{ $("Normalize Call Data").item.json.callResult }}'),
          summary: expr('{{ $("Normalize Call Data").item.json.summary }}'),
          transcript_available: expr('{{ $("Normalize Call Data").item.json.transcriptAvailable }}'),
          recording_available: expr('{{ $("Normalize Call Data").item.json.recordingAvailable }}'),
          created_at: expr('{{ $now.toISO() }}'),
        },
        schema: [
          { id: 'call_id', displayName: 'call_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'customer_id', displayName: 'customer_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'call_date', displayName: 'call_date', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'phone', displayName: 'phone', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'customer_name', displayName: 'customer_name', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'call_type', displayName: 'call_type', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'request_type', displayName: 'request_type', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'quote_requested', displayName: 'quote_requested', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'meeting_booked', displayName: 'meeting_booked', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'shipment_number', displayName: 'shipment_number', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'call_result', displayName: 'call_result', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'summary', displayName: 'summary', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'transcript_available', displayName: 'transcript_available', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'recording_available', displayName: 'recording_available', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'created_at', displayName: 'created_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
        ],
      },
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets - Etihad One CRM') },
  },
  output: [{}],
});

const note = sticky(
  '## Etihad One - Post Call\n\nVapi end-of-call-report webhook (fired automatically after every call). Idempotent on call_id: a repeated webhook for the same call is detected and skipped, never creating a duplicate Calls row.\n\nSetup:\n1. Reuse the existing "Vapi Webhook Auth" Header Auth credential (created for the Tools Router workflow) - do not create a second one.\n2. Attach "Google Sheets - Etihad One CRM" and set each node\'s Document to the real spreadsheet ID.\n3. In Vapi, set this workflow\'s production webhook URL as the assistant\'s serverUrl / end-of-call-report webhook.\n4. This workflow assumes the Vapi assistant\'s analysisPlan.structuredDataSchema returns: customer_name, request_type, quote_requested, meeting_booked, shipment_number, call_result, customer_status, human_required (see vapi/assistant.json). If the schema changes, update "Normalize Call Data" to match.\n5. Escalation: when human_required is true, customer_status is set to "human_required" in the CRM. No Slack/email notification channel is connected yet - add one in "Update Existing/Append New Customer" once available (see docs/runbook.md).',
  [webhookTrigger, normalizeCallData, readExistingCall, isDuplicateCall],
  { color: 4 }
);

export default workflow('etihad-one-post-call', 'Etihad One - Post Call')
  .add(webhookTrigger)
  .to(normalizeCallData)
  .to(readExistingCall)
  .to(isDuplicateCall
    .onTrue(duplicateSkipped)
    .onFalse(readCustomerPostCall.to(isExistingCustomerPostCall
      .onTrue(updateExistingCustomerPostCall.to(resolvedExisting.to(saveCall)))
      .onFalse(generateNewCustomerFieldsPostCall.to(appendNewCustomerPostCall.to(resolvedNew.to(saveCall)))))))
  .add(note);
