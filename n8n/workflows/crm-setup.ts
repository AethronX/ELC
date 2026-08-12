import { workflow, node, trigger, expr, newCredential, sticky } from '@n8n/workflow-sdk';

const manualTrigger = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Run Setup', position: [240, 300] },
  output: [{}],
});

const createSpreadsheet = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Create CRM Spreadsheet',
    position: [520, 300],
    parameters: {
      resource: 'spreadsheet',
      operation: 'create',
      title: 'Etihad One CRM',
      sheetsUi: {
        sheetValues: [{ title: 'Customers' }, { title: 'Calls' }],
      },
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets - Etihad One CRM') },
  },
  output: [{ spreadsheetId: '1AbCDeFGhIJKLmnoPQRstuVWXyz', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/1AbCDeFGhIJKLmnoPQRstuVWXyz/edit' }],
});

const addCustomersHeader = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Write Customers Header Row',
    position: [820, 200],
    parameters: {
      resource: 'sheet',
      operation: 'append',
      documentId: { __rl: true, mode: 'id', value: expr('{{ $json.spreadsheetId }}') },
      sheetName: { __rl: true, mode: 'name', value: 'Customers' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          customer_id: 'customer_id',
          customer_name: 'customer_name',
          phone: 'phone',
          email: 'email',
          customer_type: 'customer_type',
          request_type: 'request_type',
          lead_source: 'lead_source',
          last_contact: 'last_contact',
          customer_status: 'customer_status',
          shipment_number: 'shipment_number',
          notes: 'notes',
          created_at: 'created_at',
          updated_at: 'updated_at',
          last_call_id: 'last_call_id',
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

const addCallsHeader = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Write Calls Header Row',
    position: [820, 420],
    parameters: {
      resource: 'sheet',
      operation: 'append',
      documentId: { __rl: true, mode: 'id', value: expr('{{ $("Create CRM Spreadsheet").item.json.spreadsheetId }}') },
      sheetName: { __rl: true, mode: 'name', value: 'Calls' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          call_id: 'call_id',
          customer_id: 'customer_id',
          call_date: 'call_date',
          phone: 'phone',
          customer_name: 'customer_name',
          call_type: 'call_type',
          request_type: 'request_type',
          quote_requested: 'quote_requested',
          meeting_booked: 'meeting_booked',
          shipment_number: 'shipment_number',
          call_result: 'call_result',
          summary: 'summary',
          transcript_available: 'transcript_available',
          recording_available: 'recording_available',
          created_at: 'created_at',
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
  '## Etihad One - CRM Setup\n\nRun this ONCE after attaching the "Google Sheets - Etihad One CRM" credential.\nCreates the "Etihad One CRM" spreadsheet with Customers + Calls tabs and writes header rows.\n\nAfter running: open the spreadsheet and confirm row 1 in each tab holds only the header labels (delete a duplicate row if Google Sheets added one). Then copy the spreadsheetId into the other Etihad One workflows\' Google Sheets nodes (Document field).',
  [manualTrigger, createSpreadsheet, addCustomersHeader, addCallsHeader],
  { color: 4 }
);

export default workflow('etihad-one-crm-setup', 'Etihad One - CRM Setup')
  .add(manualTrigger)
  .to(createSpreadsheet)
  .to(addCustomersHeader)
  .add(createSpreadsheet)
  .to(addCallsHeader)
  .add(note);
