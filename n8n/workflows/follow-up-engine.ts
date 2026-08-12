import { workflow, node, trigger, expr, newCredential, sticky } from '@n8n/workflow-sdk';

const dailyTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Daily 09:00 Follow-up Scan',
    position: [200, 400],
    parameters: {
      rule: {
        interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 9, triggerAtMinute: 0 }],
      },
    },
  },
  output: [{}],
});

const readAllCustomers = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Read All Customers',
    position: [460, 400],
    parameters: {
      resource: 'sheet',
      operation: 'read',
      documentId: { __rl: true, mode: 'list', value: '', cachedResultName: 'Etihad One CRM' },
      sheetName: { __rl: true, mode: 'name', value: 'Customers' },
      options: {},
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets - Etihad One CRM') },
  },
  output: [{ customer_id: 'CUS-1', phone: '+96890000000', customer_name: 'Ahmed', customer_status: 'quote_requested', last_contact: '2026-08-01T10:00:00Z', notes: '', follow_up_count: '' }],
});

const needsFollowUp = node({
  type: 'n8n-nodes-base.filter',
  version: 2.3,
  config: {
    name: 'Needs Follow-up?',
    position: [700, 400],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        combinator: 'and',
        conditions: [
          { leftValue: expr('{{ $json.customer_status }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'quote_requested' },
          { leftValue: expr('{{ $json.last_contact }}'), operator: { type: 'dateTime', operation: 'before' }, rightValue: expr('{{ $now.minus(2, "days").toISO() }}') },
          { leftValue: expr('{{ Number($json.follow_up_count) || 0 }}'), operator: { type: 'number', operation: 'lt' }, rightValue: 3 },
        ],
      },
    },
  },
});

const flagFollowUp = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Flag Follow-up Attempt',
    position: [940, 400],
    parameters: {
      resource: 'sheet',
      operation: 'appendOrUpdate',
      documentId: { __rl: true, mode: 'list', value: '', cachedResultName: 'Etihad One CRM' },
      sheetName: { __rl: true, mode: 'name', value: 'Customers' },
      columns: {
        mappingMode: 'defineBelow',
        matchingColumns: ['phone'],
        value: {
          phone: expr('{{ $json.phone }}'),
          follow_up_count: expr('{{ (Number($json.follow_up_count) || 0) + 1 }}'),
          last_follow_up_at: expr('{{ $now.toISO() }}'),
          notes: expr('{{ ($json.notes ? $json.notes + "\\n" : "") + "Auto follow-up #" + ((Number($json.follow_up_count) || 0) + 1) + " flagged on " + $now.toISO() + " (email send pending Gmail credential - see docs/runbook.md)" }}'),
        },
        schema: [
          { id: 'phone', displayName: 'phone', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'follow_up_count', displayName: 'follow_up_count', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'last_follow_up_at', displayName: 'last_follow_up_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'notes', displayName: 'notes', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
        ],
      },
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets - Etihad One CRM') },
  },
  output: [{}],
});

const note = sticky(
  '## Etihad One - Follow-up Engine\n\nRuns daily at 09:00 (instance timezone). Scans Customers for status=quote_requested with no contact in the last 2 days and fewer than 3 follow-ups already sent, then flags one follow-up attempt per matching customer (increments follow_up_count, stamps last_follow_up_at, adds a note).\n\nStop conditions already built in:\n- Only customer_status=quote_requested is targeted (per the spec\'s own example) - contacted/meeting_scheduled/customer/human_required/closed are left alone.\n- Caps at 3 attempts per customer (follow_up_count).\n- Any workflow that sets customer_status away from quote_requested (e.g. Post Call or Tools Router after the customer responds) automatically stops future follow-ups for that customer - no separate "stop" logic needed.\n\nWhat this does NOT do yet: it does not send an email or WhatsApp message - no Gmail/SMTP or WhatsApp credential is connected. It only flags the attempt in the CRM so the team can see who is due for outreach. Once a Gmail credential exists, add a Gmail node right after "Flag Follow-up Attempt" to actually send the follow-up (see docs/runbook.md - this is the top next-optimization item).\n\nSetup: attach "Google Sheets - Etihad One CRM" and set the Document on both Google Sheets nodes to the real spreadsheet ID. follow_up_count and last_follow_up_at are new columns - they will be created automatically in the Customers sheet the first time this workflow writes.',
  [dailyTrigger, readAllCustomers, needsFollowUp, flagFollowUp],
  { color: 4 }
);

export default workflow('etihad-one-follow-up-engine', 'Etihad One - Follow-up Engine')
  .add(dailyTrigger)
  .to(readAllCustomers)
  .to(needsFollowUp)
  .to(flagFollowUp)
  .add(note);
