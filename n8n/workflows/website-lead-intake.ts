import { workflow, node, trigger, expr, newCredential, sticky } from '@n8n/workflow-sdk';

const webhookTrigger = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Etihad One Website Lead Webhook',
    position: [200, 400],
    parameters: {
      httpMethod: 'POST',
      path: 'etihad-one/website-lead',
      authentication: 'headerAuth',
      responseMode: 'onReceived',
    },
    credentials: { httpHeaderAuth: newCredential('Website Webhook Auth') },
  },
  output: [{ body: { name: 'Salim', phone: '+96891111111', email: 'salim@example.com', cargo_type: 'furniture', origin: 'China', destination: 'Oman', shipping_method: 'sea_fcl', notes: '2 containers per quarter' } }],
});

const normalizeLead = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Normalize Website Lead',
    position: [460, 400],
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'a1', name: 'name', value: expr('{{ $json.body?.name ?? $json.name ?? "" }}'), type: 'string' },
          { id: 'a2', name: 'phone', value: expr('{{ $json.body?.phone ?? $json.phone ?? "" }}'), type: 'string' },
          { id: 'a3', name: 'email', value: expr('{{ $json.body?.email ?? $json.email ?? "" }}'), type: 'string' },
          { id: 'a4', name: 'cargoType', value: expr('{{ $json.body?.cargo_type ?? $json.cargo_type ?? "" }}'), type: 'string' },
          { id: 'a5', name: 'origin', value: expr('{{ $json.body?.origin ?? $json.origin ?? "China" }}'), type: 'string' },
          { id: 'a6', name: 'destination', value: expr('{{ $json.body?.destination ?? $json.destination ?? "Oman" }}'), type: 'string' },
          { id: 'a7', name: 'shippingMethod', value: expr('{{ $json.body?.shipping_method ?? $json.shipping_method ?? "" }}'), type: 'string' },
          { id: 'a8', name: 'notes', value: expr('{{ $json.body?.notes ?? $json.notes ?? "" }}'), type: 'string' },
        ],
      },
    },
  },
  output: [{ name: 'Salim', phone: '+96891111111', email: 'salim@example.com', cargoType: 'furniture', origin: 'China', destination: 'Oman', shippingMethod: 'sea_fcl', notes: '2 containers per quarter' }],
});

const readCustomerWebsite = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Read Customer (website)',
    position: [700, 400],
    alwaysOutputData: true,
    parameters: {
      resource: 'sheet',
      operation: 'read',
      documentId: { __rl: true, mode: 'list', value: '', cachedResultName: 'Etihad One CRM' },
      sheetName: { __rl: true, mode: 'name', value: 'Customers' },
      filtersUI: { values: [{ lookupColumn: 'phone', lookupValue: expr('{{ $json.phone || "__no_match__" }}') }] },
      combineFilters: 'AND',
      options: { returnAllMatches: 'returnFirstMatch' },
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets - Etihad One CRM') },
  },
  output: [{ customer_id: '', customer_name: '', notes: '', lead_source: '' }],
});

const isExistingWebsite = node({
  type: 'n8n-nodes-base.if',
  version: 2.3,
  config: {
    name: 'Existing Customer? (website)',
    position: [940, 400],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.customer_id }}'), operator: { type: 'string', operation: 'notEmpty' }, rightValue: '' }],
        combinator: 'and',
      },
    },
  },
});

const updateExistingWebsite = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Update Existing Customer (website)',
    position: [1180, 320],
    parameters: {
      resource: 'sheet',
      operation: 'appendOrUpdate',
      documentId: { __rl: true, mode: 'list', value: '', cachedResultName: 'Etihad One CRM' },
      sheetName: { __rl: true, mode: 'name', value: 'Customers' },
      columns: {
        mappingMode: 'defineBelow',
        matchingColumns: ['phone'],
        value: {
          phone: expr('{{ $("Normalize Website Lead").item.json.phone }}'),
          customer_name: expr('{{ $("Normalize Website Lead").item.json.name || $json.customer_name }}'),
          email: expr('{{ $("Normalize Website Lead").item.json.email || $json.email }}'),
          request_type: 'quote_request',
          customer_status: 'quote_requested',
          last_contact: expr('{{ $now.toISO() }}'),
          updated_at: expr('{{ $now.toISO() }}'),
          notes: expr('{{ ($json.notes ? $json.notes + "\\n" : "") + "Website quote request: " + $("Normalize Website Lead").item.json.cargoType + " / " + $("Normalize Website Lead").item.json.shippingMethod + " / " + $("Normalize Website Lead").item.json.origin + " -> " + $("Normalize Website Lead").item.json.destination + ". " + $("Normalize Website Lead").item.json.notes }}'),
        },
        schema: [
          { id: 'phone', displayName: 'phone', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'customer_name', displayName: 'customer_name', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'email', displayName: 'email', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'request_type', displayName: 'request_type', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'customer_status', displayName: 'customer_status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'last_contact', displayName: 'last_contact', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'updated_at', displayName: 'updated_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'notes', displayName: 'notes', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
        ],
      },
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets - Etihad One CRM') },
  },
  output: [{}],
});

const generateNewWebsite = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Generate New Customer Fields (website)',
    position: [1180, 500],
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

const appendNewWebsite = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Append New Customer (website)',
    position: [1420, 500],
    parameters: {
      resource: 'sheet',
      operation: 'append',
      documentId: { __rl: true, mode: 'list', value: '', cachedResultName: 'Etihad One CRM' },
      sheetName: { __rl: true, mode: 'name', value: 'Customers' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          customer_id: expr('{{ $("Generate New Customer Fields (website)").item.json.new_customer_id }}'),
          customer_name: expr('{{ $("Normalize Website Lead").item.json.name }}'),
          phone: expr('{{ $("Normalize Website Lead").item.json.phone }}'),
          email: expr('{{ $("Normalize Website Lead").item.json.email }}'),
          customer_type: 'other',
          request_type: 'quote_request',
          lead_source: 'website',
          last_contact: expr('{{ $now.toISO() }}'),
          customer_status: 'quote_requested',
          notes: expr('{{ "Website quote request: " + $("Normalize Website Lead").item.json.cargoType + " / " + $("Normalize Website Lead").item.json.shippingMethod + " / " + $("Normalize Website Lead").item.json.origin + " -> " + $("Normalize Website Lead").item.json.destination + ". " + $("Normalize Website Lead").item.json.notes }}'),
          created_at: expr('{{ $("Generate New Customer Fields (website)").item.json.new_created_at }}'),
          updated_at: expr('{{ $("Generate New Customer Fields (website)").item.json.new_created_at }}'),
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
          { id: 'notes', displayName: 'notes', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'created_at', displayName: 'created_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'updated_at', displayName: 'updated_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
        ],
      },
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets - Etihad One CRM') },
  },
  output: [{}],
});

const note = sticky(
  '## Etihad One - Website Lead Intake\n\nWebsite quote form -> same CRM pipeline as phone leads (find-or-create by phone, never a separate customer system).\n\nSetup:\n1. Attach a "Website Webhook Auth" Header Auth credential; configure the website form handler to send the matching header.\n2. Attach "Google Sheets - Etihad One CRM" and set each node\'s Document to the real spreadsheet ID.\n3. Point the website\'s quote form submit handler at this workflow\'s production webhook URL, POSTing JSON: { name, phone, email, cargo_type, origin, destination, shipping_method, notes }. Defaults: origin=China, destination=Oman.\n4. This sets customer_status=quote_requested, which the Follow-up Engine workflow picks up automatically.',
  [webhookTrigger, normalizeLead, readCustomerWebsite, isExistingWebsite],
  { color: 4 }
);

export default workflow('etihad-one-website-lead-intake', 'Etihad One - Website Lead Intake')
  .add(webhookTrigger)
  .to(normalizeLead)
  .to(readCustomerWebsite)
  .to(isExistingWebsite
    .onTrue(updateExistingWebsite)
    .onFalse(generateNewWebsite.to(appendNewWebsite)))
  .add(note);
