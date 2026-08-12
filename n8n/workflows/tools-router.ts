import { workflow, node, trigger, expr, newCredential, sticky } from '@n8n/workflow-sdk';

const webhookTrigger = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Etihad One Tools Webhook',
    position: [200, 400],
    parameters: {
      httpMethod: 'POST',
      path: 'etihad-one/tools',
      authentication: 'headerAuth',
      responseMode: 'responseNode',
    },
    credentials: { httpHeaderAuth: newCredential('Vapi Webhook Auth') },
  },
  output: [{ body: { message: { type: 'tool-calls', toolCallList: [{ id: 'call_1', type: 'function', function: { name: 'find_customer', arguments: { phone: '+96890000000' } } }], call: { id: 'vapi-call-abc' } } } }],
});

const normalizeBody = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Normalize Webhook Payload',
    position: [460, 400],
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'a1', name: 'toolCallList', value: expr('{{ $json.body?.message?.toolCallList ?? $json.message?.toolCallList ?? [] }}'), type: 'array' },
          { id: 'a2', name: 'vapiCallId', value: expr('{{ $json.body?.message?.call?.id ?? $json.message?.call?.id ?? $json.callId ?? "" }}'), type: 'string' },
        ],
      },
    },
  },
  output: [{ toolCallList: [{ id: 'call_1', type: 'function', function: { name: 'find_customer', arguments: { phone: '+96890000000' } } }], vapiCallId: 'vapi-call-abc' }],
});

const splitToolCalls = node({
  type: 'n8n-nodes-base.splitOut',
  version: 1,
  config: {
    name: 'Split Tool Calls',
    position: [700, 400],
    parameters: {
      fieldToSplitOut: 'toolCallList',
      include: 'allOtherFields',
    },
  },
  output: [{ id: 'call_1', type: 'function', function: { name: 'find_customer', arguments: { phone: '+96890000000' } }, vapiCallId: 'vapi-call-abc' }],
});

const flattenToolCall = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Flatten Tool Call',
    position: [940, 400],
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'b1', name: 'toolCallId', value: expr('{{ $json.id }}'), type: 'string' },
          { id: 'b2', name: 'name', value: expr('{{ $json.function.name }}'), type: 'string' },
          { id: 'b3', name: 'args', value: expr('{{ $json.function.arguments }}'), type: 'object' },
          { id: 'b4', name: 'vapiCallId', value: expr('{{ $json.vapiCallId }}'), type: 'string' },
        ],
      },
    },
  },
  output: [{ toolCallId: 'call_1', name: 'find_customer', args: { phone: '+96890000000' }, vapiCallId: 'vapi-call-abc' }],
});

const routeByTool = node({
  type: 'n8n-nodes-base.switch',
  version: 3.4,
  config: {
    name: 'Route By Tool',
    position: [1180, 400],
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          { outputKey: 'find_customer', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.name }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'find_customer' }], combinator: 'and' } },
          { outputKey: 'create_customer', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.name }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'create_customer' }], combinator: 'and' } },
          { outputKey: 'update_customer', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.name }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'update_customer' }], combinator: 'and' } },
          { outputKey: 'create_quote_request', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.name }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'create_quote_request' }], combinator: 'and' } },
          { outputKey: 'create_meeting', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.name }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'create_meeting' }], combinator: 'and' } },
          { outputKey: 'get_customer_history', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.name }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'get_customer_history' }], combinator: 'and' } },
          { outputKey: 'get_tracking_status', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.name }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'get_tracking_status' }], combinator: 'and' } },
        ],
      },
      options: { fallbackOutput: 'extra', renameFallbackOutput: 'Unknown Tool' },
    },
  },
});

const readCustomerForFind = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Read Customer (find_customer)',
    position: [1460, 40],
    alwaysOutputData: true,
    parameters: {
      resource: 'sheet',
      operation: 'read',
      documentId: { __rl: true, mode: 'list', value: '', cachedResultName: 'Etihad One CRM' },
      sheetName: { __rl: true, mode: 'name', value: 'Customers' },
      filtersUI: {
        values: [
          { lookupColumn: expr('{{ $json.args.phone ? "phone" : "email" }}'), lookupValue: expr('{{ $json.args.phone || $json.args.email || "__no_match__" }}') },
        ],
      },
      combineFilters: 'AND',
      options: { returnAllMatches: 'returnFirstMatch' },
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets - Etihad One CRM') },
  },
  output: [{ customer_id: 'CUS-1', customer_name: 'Ahmed', phone: '+96890000000', email: '', customer_status: 'quote_requested', shipment_number: '', notes: '' }],
});

const isCustomerFound = node({
  type: 'n8n-nodes-base.if',
  version: 2.3,
  config: {
    name: 'Customer Found?',
    position: [1700, 40],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.customer_id }}'), operator: { type: 'string', operation: 'notEmpty' }, rightValue: '' }],
        combinator: 'and',
      },
    },
  },
});

const foundResult = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Found Result',
    position: [1940, -40],
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'c1', name: 'toolCallId', value: expr('{{ $("Flatten Tool Call").item.json.toolCallId }}'), type: 'string' },
          { id: 'c2', name: 'result', value: expr('{{ "Existing customer: " + ($json.customer_name || "(no name on file)") + ". Status: " + ($json.customer_status || "unknown") + ". Last shipment number: " + ($json.shipment_number || "none on file") + "." }}'), type: 'string' },
        ],
      },
    },
  },
  output: [{ toolCallId: 'call_1', result: 'Existing customer: Ahmed. Status: quote_requested. Last shipment number: none on file.' }],
});

const notFoundResult = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Not Found Result',
    position: [1940, 120],
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'd1', name: 'toolCallId', value: expr('{{ $("Flatten Tool Call").item.json.toolCallId }}'), type: 'string' },
          { id: 'd2', name: 'result', value: 'no_matching_customer_found', type: 'string' },
        ],
      },
    },
  },
  output: [{ toolCallId: 'call_1', result: 'no_matching_customer_found' }],
});

const readCustomerForUpsert = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Read Customer (upsert)',
    position: [1460, 320],
    alwaysOutputData: true,
    parameters: {
      resource: 'sheet',
      operation: 'read',
      documentId: { __rl: true, mode: 'list', value: '', cachedResultName: 'Etihad One CRM' },
      sheetName: { __rl: true, mode: 'name', value: 'Customers' },
      filtersUI: {
        values: [{ lookupColumn: 'phone', lookupValue: expr('{{ $json.args.phone || "__no_match__" }}') }],
      },
      combineFilters: 'AND',
      options: { returnAllMatches: 'returnFirstMatch' },
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets - Etihad One CRM') },
  },
  output: [{ customer_id: '', customer_name: '', phone: '', notes: '' }],
});

const isExistingForUpsert = node({
  type: 'n8n-nodes-base.if',
  version: 2.3,
  config: {
    name: 'Existing Customer? (upsert)',
    position: [1700, 320],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.customer_id }}'), operator: { type: 'string', operation: 'notEmpty' }, rightValue: '' }],
        combinator: 'and',
      },
    },
  },
});

const updateExistingCustomer = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Update Existing Customer',
    position: [1940, 220],
    parameters: {
      resource: 'sheet',
      operation: 'appendOrUpdate',
      documentId: { __rl: true, mode: 'list', value: '', cachedResultName: 'Etihad One CRM' },
      sheetName: { __rl: true, mode: 'name', value: 'Customers' },
      columns: {
        mappingMode: 'defineBelow',
        matchingColumns: ['phone'],
        value: {
          phone: expr('{{ $("Flatten Tool Call").item.json.args.phone }}'),
          customer_name: expr('{{ $("Flatten Tool Call").item.json.args.customer_name || $json.customer_name }}'),
          email: expr('{{ $("Flatten Tool Call").item.json.args.email || $json.email }}'),
          customer_type: expr('{{ $("Flatten Tool Call").item.json.args.customer_type || $json.customer_type }}'),
          request_type: expr('{{ $("Flatten Tool Call").item.json.name === "create_quote_request" ? "quote_request" : ($("Flatten Tool Call").item.json.args.request_type || $json.request_type) }}'),
          lead_source: expr('{{ $json.lead_source || "phone" }}'),
          last_contact: expr('{{ $now.toISO() }}'),
          customer_status: expr('{{ $("Flatten Tool Call").item.json.name === "create_quote_request" ? "quote_requested" : ($("Flatten Tool Call").item.json.args.customer_status || $json.customer_status || "contacted") }}'),
          shipment_number: expr('{{ $("Flatten Tool Call").item.json.args.shipment_number || $json.shipment_number }}'),
          notes: expr('{{ ($json.notes ? $json.notes + "\\n" : "") + ($("Flatten Tool Call").item.json.args.notes || $("Flatten Tool Call").item.json.args.cargo_description || "") }}'),
          updated_at: expr('{{ $now.toISO() }}'),
          last_call_id: expr('{{ $("Flatten Tool Call").item.json.vapiCallId }}'),
        },
        schema: [
          { id: 'phone', displayName: 'phone', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'customer_name', displayName: 'customer_name', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'email', displayName: 'email', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'customer_type', displayName: 'customer_type', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'request_type', displayName: 'request_type', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'lead_source', displayName: 'lead_source', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'last_contact', displayName: 'last_contact', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'customer_status', displayName: 'customer_status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'shipment_number', displayName: 'shipment_number', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'notes', displayName: 'notes', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'updated_at', displayName: 'updated_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'last_call_id', displayName: 'last_call_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
        ],
      },
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets - Etihad One CRM') },
  },
  output: [{}],
});

const generateNewCustomerFields = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Generate New Customer Fields',
    position: [1940, 420],
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

const appendNewCustomer = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Append New Customer',
    position: [2180, 420],
    parameters: {
      resource: 'sheet',
      operation: 'append',
      documentId: { __rl: true, mode: 'list', value: '', cachedResultName: 'Etihad One CRM' },
      sheetName: { __rl: true, mode: 'name', value: 'Customers' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          customer_id: expr('{{ $("Generate New Customer Fields").item.json.new_customer_id }}'),
          customer_name: expr('{{ $("Flatten Tool Call").item.json.args.customer_name || "" }}'),
          phone: expr('{{ $("Flatten Tool Call").item.json.args.phone || "" }}'),
          email: expr('{{ $("Flatten Tool Call").item.json.args.email || "" }}'),
          customer_type: expr('{{ $("Flatten Tool Call").item.json.args.customer_type || "other" }}'),
          request_type: expr('{{ $("Flatten Tool Call").item.json.name === "create_quote_request" ? "quote_request" : ($("Flatten Tool Call").item.json.args.request_type || "new_customer") }}'),
          lead_source: 'phone',
          last_contact: expr('{{ $now.toISO() }}'),
          customer_status: expr('{{ $("Flatten Tool Call").item.json.name === "create_quote_request" ? "quote_requested" : "new" }}'),
          shipment_number: expr('{{ $("Flatten Tool Call").item.json.args.shipment_number || "" }}'),
          notes: expr('{{ $("Flatten Tool Call").item.json.args.notes || $("Flatten Tool Call").item.json.args.cargo_description || "" }}'),
          created_at: expr('{{ $("Generate New Customer Fields").item.json.new_created_at }}'),
          updated_at: expr('{{ $("Generate New Customer Fields").item.json.new_created_at }}'),
          last_call_id: expr('{{ $("Flatten Tool Call").item.json.vapiCallId }}'),
        },
        schema: [
          { id: 'customer_id', displayName: 'customer_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'customer_name', displayName: 'customer_name', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'phone', displayName: 'phone', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'email', displayName: 'email', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
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

const upsertResult = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Upsert Result',
    position: [2420, 320],
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'f1', name: 'toolCallId', value: expr('{{ $("Flatten Tool Call").item.json.toolCallId }}'), type: 'string' },
          { id: 'f2', name: 'result', value: 'saved', type: 'string' },
        ],
      },
    },
  },
  output: [{ toolCallId: 'call_1', result: 'saved' }],
});

const checkAvailability = node({
  type: 'n8n-nodes-base.googleCalendar',
  version: 1.3,
  config: {
    name: 'Check Availability',
    position: [1460, 620],
    parameters: {
      resource: 'calendar',
      operation: 'availability',
      calendar: { __rl: true, mode: 'list', value: '' },
      timeMin: expr('{{ $json.args.startTime }}'),
      timeMax: expr('{{ $json.args.endTime }}'),
    },
    credentials: { googleCalendarOAuth2Api: newCredential('Google Calendar - Etihad One') },
  },
  output: [{ available: true }],
});

const isAvailable = node({
  type: 'n8n-nodes-base.if',
  version: 2.3,
  config: {
    name: 'Slot Available?',
    position: [1700, 620],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.available }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: '' }],
        combinator: 'and',
      },
    },
  },
});

const createCalendarEvent = node({
  type: 'n8n-nodes-base.googleCalendar',
  version: 1.3,
  config: {
    name: 'Create Meeting',
    position: [1940, 560],
    parameters: {
      resource: 'event',
      operation: 'create',
      calendar: { __rl: true, mode: 'list', value: '' },
      start: expr('{{ $("Flatten Tool Call").item.json.args.startTime }}'),
      end: expr('{{ $("Flatten Tool Call").item.json.args.endTime }}'),
      additionalFields: {
        summary: expr('{{ "Etihad One - " + ($("Flatten Tool Call").item.json.args.customer_name || "Customer call") }}'),
        description: expr('{{ $("Flatten Tool Call").item.json.args.notes || "" }}'),
        sendUpdates: 'none',
      },
    },
    credentials: { googleCalendarOAuth2Api: newCredential('Google Calendar - Etihad One') },
  },
  output: [{ id: 'evt_1', htmlLink: 'https://calendar.google.com/event?eid=evt_1', status: 'confirmed' }],
});

const updateCrmAfterBooking = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Update CRM After Booking',
    position: [2180, 560],
    parameters: {
      resource: 'sheet',
      operation: 'appendOrUpdate',
      documentId: { __rl: true, mode: 'list', value: '', cachedResultName: 'Etihad One CRM' },
      sheetName: { __rl: true, mode: 'name', value: 'Customers' },
      columns: {
        mappingMode: 'defineBelow',
        matchingColumns: ['phone'],
        value: {
          phone: expr('{{ $("Flatten Tool Call").item.json.args.phone }}'),
          customer_status: 'meeting_scheduled',
          last_contact: expr('{{ $now.toISO() }}'),
          updated_at: expr('{{ $now.toISO() }}'),
        },
        schema: [
          { id: 'phone', displayName: 'phone', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'customer_status', displayName: 'customer_status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'last_contact', displayName: 'last_contact', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'updated_at', displayName: 'updated_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
        ],
      },
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets - Etihad One CRM') },
  },
  output: [{}],
});

const meetingSuccessResult = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Meeting Success Result',
    position: [2420, 560],
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'g1', name: 'toolCallId', value: expr('{{ $("Flatten Tool Call").item.json.toolCallId }}'), type: 'string' },
          { id: 'g2', name: 'result', value: expr('{{ "meeting_booked: " + $("Create Meeting").item.json.start.dateTime }}'), type: 'string' },
        ],
      },
    },
  },
  output: [{ toolCallId: 'call_1', result: 'meeting_booked: 2026-08-15T10:00:00' }],
});

const meetingFailedResult = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Meeting Failed Result',
    position: [1940, 700],
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'h1', name: 'toolCallId', value: expr('{{ $("Flatten Tool Call").item.json.toolCallId }}'), type: 'string' },
          { id: 'h2', name: 'result', value: 'slot_not_available_not_booked', type: 'string' },
        ],
      },
    },
  },
  output: [{ toolCallId: 'call_1', result: 'slot_not_available_not_booked' }],
});

const readCallHistory = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Read Call History',
    position: [1460, 900],
    alwaysOutputData: true,
    parameters: {
      resource: 'sheet',
      operation: 'read',
      documentId: { __rl: true, mode: 'list', value: '', cachedResultName: 'Etihad One CRM' },
      sheetName: { __rl: true, mode: 'name', value: 'Calls' },
      filtersUI: {
        values: [{ lookupColumn: 'phone', lookupValue: expr('{{ $json.args.phone || "__no_match__" }}') }],
      },
      combineFilters: 'AND',
      options: { returnAllMatches: 'returnAllMatches' },
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets - Etihad One CRM') },
  },
  output: [{ call_date: '2026-07-01', request_type: 'quote_request', call_result: 'quote logged' }],
});

const summarizeHistory = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Summarize History',
    position: [1700, 900],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: 'const rows = $input.all().map(i => i.json).filter(j => j.call_id);\nconst toolCallId = $("Flatten Tool Call").first().json.toolCallId;\nif (rows.length === 0) {\n  return [{ json: { toolCallId, result: "no_previous_interactions" } }];\n}\nconst recent = rows.slice(-3).reverse();\nconst lines = recent.map(r => (r.call_date || "") + " - " + (r.request_type || "general") + " - " + (r.call_result || ""));\nreturn [{ json: { toolCallId, result: lines.join(" | ") } }];',
    },
  },
  output: [{ toolCallId: 'call_1', result: '2026-07-01 - quote_request - quote logged' }],
});

const upsertTrackingNumber = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Save Shipment Number',
    position: [1460, 1080],
    parameters: {
      resource: 'sheet',
      operation: 'appendOrUpdate',
      documentId: { __rl: true, mode: 'list', value: '', cachedResultName: 'Etihad One CRM' },
      sheetName: { __rl: true, mode: 'name', value: 'Customers' },
      columns: {
        mappingMode: 'defineBelow',
        matchingColumns: ['phone'],
        value: {
          phone: expr('{{ $json.args.phone }}'),
          shipment_number: expr('{{ $json.args.shipment_number || "" }}'),
          last_contact: expr('{{ $now.toISO() }}'),
          updated_at: expr('{{ $now.toISO() }}'),
        },
        schema: [
          { id: 'phone', displayName: 'phone', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'shipment_number', displayName: 'shipment_number', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'last_contact', displayName: 'last_contact', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'updated_at', displayName: 'updated_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
        ],
      },
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets - Etihad One CRM') },
  },
  output: [{}],
});

const trackingResult = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Tracking Result',
    position: [1700, 1080],
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'i1', name: 'toolCallId', value: expr('{{ $("Flatten Tool Call").item.json.toolCallId }}'), type: 'string' },
          { id: 'i2', name: 'result', value: 'shipment_number_saved_no_live_tracking_source_connected', type: 'string' },
        ],
      },
    },
  },
  output: [{ toolCallId: 'call_1', result: 'shipment_number_saved_no_live_tracking_source_connected' }],
});

const unknownToolResult = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Unknown Tool Result',
    position: [1460, 1220],
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'j1', name: 'toolCallId', value: expr('{{ $json.toolCallId }}'), type: 'string' },
          { id: 'j2', name: 'result', value: 'tool_not_recognized', type: 'string' },
        ],
      },
    },
  },
  output: [{ toolCallId: 'call_1', result: 'tool_not_recognized' }],
});

const aggregateResults = node({
  type: 'n8n-nodes-base.aggregate',
  version: 1,
  config: {
    name: 'Aggregate Results',
    position: [2680, 400],
    parameters: {
      aggregate: 'aggregateAllItemData',
      destinationFieldName: 'results',
      include: 'allFields',
    },
  },
  output: [{ results: [{ toolCallId: 'call_1', result: 'saved' }] }],
});

const respondToolResults = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond With Results',
    position: [2920, 400],
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ $json }}'),
    },
  },
});

const note = sticky(
  '## Etihad One - Tools Router\n\nReal-time tool-call webhook for the Vapi assistant.\n\nSetup:\n1. Attach "Vapi Webhook Auth" (Header Auth credential) - set the header name/value Vapi will send, and configure the same secret in the Vapi assistant server config.\n2. Attach "Google Sheets - Etihad One CRM" credential, then set each Google Sheets node\'s Document to the real spreadsheet ID from the CRM Setup workflow.\n3. Attach "Google Calendar - Etihad One" credential and pick the real calendar.\n4. ASSUMPTION (verify with a live Vapi test call): tool-call arguments arrive as a parsed object at message.toolCallList[].function.arguments. If Vapi instead sends a JSON string, add JSON.parse in "Flatten Tool Call".\n5. Known simplification: when several tool calls of the same type arrive in a single webhook batch, branches that reference "Flatten Tool Call".first()/.item may resolve to the wrong call. In practice Vapi sends one tool call at a time for this assistant\'s flow.\n\nActivate this workflow, then paste its production webhook URL into vapi/assistant.json tool server URLs.',
  [webhookTrigger, normalizeBody, splitToolCalls, flattenToolCall, routeByTool],
  { color: 4 }
);

export default workflow('etihad-one-tools-router', 'Etihad One - Tools Router')
  .add(webhookTrigger)
  .to(normalizeBody)
  .to(splitToolCalls)
  .to(flattenToolCall)
  .to(routeByTool
    .onCase(0, readCustomerForFind.to(isCustomerFound.onTrue(foundResult.to(aggregateResults)).onFalse(notFoundResult.to(aggregateResults))))
    .onCase(1, readCustomerForUpsert.to(isExistingForUpsert.onTrue(updateExistingCustomer.to(upsertResult)).onFalse(generateNewCustomerFields.to(appendNewCustomer.to(upsertResult)))))
    .onCase(2, readCustomerForUpsert)
    .onCase(3, readCustomerForUpsert)
    .onCase(4, checkAvailability.to(isAvailable.onTrue(createCalendarEvent.to(updateCrmAfterBooking.to(meetingSuccessResult.to(aggregateResults)))).onFalse(meetingFailedResult.to(aggregateResults))))
    .onCase(5, readCallHistory.to(summarizeHistory.to(aggregateResults)))
    .onCase(6, upsertTrackingNumber.to(trackingResult.to(aggregateResults)))
    .onCase(7, unknownToolResult.to(aggregateResults)))
  .add(upsertResult)
  .to(aggregateResults)
  .add(aggregateResults)
  .to(respondToolResults)
  .add(note);
