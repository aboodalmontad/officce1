import { getSupabaseClient } from '../supabaseClient';
import { Client, AdminTask, Appointment, AccountingEntry, Invoice } from '../types';
import { User } from '@supabase/supabase-js';

// Define the core data structure for the application.
// This is used both for local state and for structuring data from Supabase.
export type AppData = {
    clients: Client[];
    adminTasks: AdminTask[];
    appointments: Appointment[];
    accountingEntries: AccountingEntry[];
    invoices: Invoice[];
    assistants: string[];
};

/**
 * Checks if all required tables exist in the Supabase database schema.
 * This is crucial for ensuring the backend is properly configured before attempting data operations.
 * @returns An object indicating success or failure, with details on the error if any.
 */
export const checkSupabaseSchema = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
        return { success: false, error: 'unconfigured', message: 'Supabase client is not configured.' };
    }

    const tableChecks: { [key: string]: string } = {
        'profiles': 'id', 'clients': 'id, cases(id)', 'cases': 'id, stages(id)',
        'stages': 'id, sessions(id)', 'sessions': 'id', 'admin_tasks': 'id',
        'appointments': 'id', 'accounting_entries': 'id', 'assistants': 'id',
        'invoices': 'id, invoice_items(id)', 'invoice_items': 'id',
    };
    
    const tableCheckPromises = Object.entries(tableChecks).map(([table, query]) =>
        supabase.from(table).select(query, { head: true }).then(res => ({ ...res, table }))
    );

    try {
        const results = await Promise.all(tableCheckPromises);
        for (const result of results) {
            if (result.error) {
                const message = String(result.error.message || '').toLowerCase();
                const code = String(result.error.code || '');
                
                if (code === '42P01' || message.includes('does not exist') || message.includes('could not find the table') || message.includes('schema cache') || message.includes('relation') ) {
                    return { success: false, error: 'uninitialized', message: `Database uninitialized. Missing table or relation: ${result.table}.` };
                } else {
                    throw result.error;
                }
            }
        }
        return { success: true, error: null, message: '' };
    } catch (err: any) {
        const message = String(err?.message || '').toLowerCase();
        const code = String(err?.code || '');

        if (message.includes('failed to fetch')) {
            return { success: false, error: 'network', message: 'Failed to connect to the server. Check internet connection and CORS settings.' };
        }
        
        if (message.includes('does not exist') || code === '42P01' || message.includes('could not find the table') || message.includes('schema cache')) {
            return { success: false, error: 'uninitialized', message: 'Database is not fully initialized.' };
        }

        return { success: false, error: 'unknown', message: `Database schema check failed: ${err.message}` };
    }
};


/**
 * Fetches the entire dataset for the current user from Supabase.
 * @returns A promise that resolves with the user's data.
 * @throws An error if the Supabase client is unavailable or if the fetch fails.
 */
export const fetchDataFromSupabase = async (): Promise<Omit<AppData, 'assistants' | 'clients'> & { assistants: {name: string}[], clients: any[] }> => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not available.');

    const clientsRes = await supabase.from('clients').select('*, cases(*, stages(*, sessions(*)))').order('name');
    const adminTasksRes = await supabase.from('admin_tasks').select('*');
    const appointmentsRes = await supabase.from('appointments').select('*');
    const accountingEntriesRes = await supabase.from('accounting_entries').select('*');
    const assistantsRes = await supabase.from('assistants').select('name');
    const invoicesRes = await supabase.from('invoices').select('*, invoice_items(*)');

    const allResults = [clientsRes, adminTasksRes, appointmentsRes, accountingEntriesRes, assistantsRes, invoicesRes];
    const errors = allResults.map(res => res.error).filter(Boolean);
    if (errors.length > 0) throw new Error(errors.map(e => e!.message).join(', '));

    return {
        clients: clientsRes.data || [],
        adminTasks: adminTasksRes.data || [],
        appointments: appointmentsRes.data || [],
        accountingEntries: accountingEntriesRes.data || [],
        assistants: assistantsRes.data || [],
        invoices: invoicesRes.data || [],
    };
};

/**
 * Replaces the current user's entire dataset in Supabase with the provided local data.
 * This function performs a destructive "delete all then insert all" operation for the user.
 * @param currentData The complete local data state to upload.
 * @param user The authenticated Supabase user object.
 * @throws An error if any step of the deletion or upsertion process fails.
 */
export const uploadDataToSupabase = async (currentData: AppData, user: User) => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not available.');

    const toISOStringOrNull = (date: any): string | null => (date && !isNaN(new Date(date).getTime())) ? new Date(date).toISOString() : null;
    const toISOStringOrNow = (date: any): string => (date && !isNaN(new Date(date).getTime())) ? new Date(date).toISOString() : new Date().toISOString();
    const textToNull = (val: any): string | null => (val === undefined || val === null || String(val).trim() === '') ? null : String(val);

    const clientsToUpsert = currentData.clients.map(({ cases, contactInfo, ...client }) => ({ ...client, contact_info: textToNull(contactInfo), user_id: user.id }));
    const casesToUpsert = currentData.clients.flatMap(c => c.cases.map(({ stages, clientName, opponentName, feeAgreement, ...caseItem }) => ({ ...caseItem, client_id: c.id, client_name: clientName, opponent_name: textToNull(opponentName), fee_agreement: textToNull(feeAgreement), user_id: user.id })));
    const stagesToUpsert = currentData.clients.flatMap(c => c.cases.flatMap(cs => cs.stages.map(({ sessions, caseNumber, firstSessionDate, decisionDate, decisionNumber, decisionSummary, decisionNotes, ...stage }) => ({ ...stage, case_id: cs.id, case_number: textToNull(caseNumber), first_session_date: toISOStringOrNull(firstSessionDate), decision_date: toISOStringOrNull(decisionDate), decision_number: textToNull(decisionNumber), decision_summary: textToNull(decisionSummary), decision_notes: textToNull(decisionNotes), user_id: user.id }))));
    const sessionsToUpsert = currentData.clients.flatMap(c => c.cases.flatMap(cs => cs.stages.flatMap(st => st.sessions.map(({ caseNumber, clientName, opponentName, postponementReason, isPostponed, nextSessionDate, nextPostponementReason, date, stageId, stageDecisionDate, ...session }) => ({ ...session, stage_id: st.id, case_number: textToNull(caseNumber), client_name: clientName, opponent_name: textToNull(opponentName), postponement_reason: textToNull(postponementReason), is_postponed: isPostponed, date: toISOStringOrNow(date), next_session_date: toISOStringOrNull(nextSessionDate), next_postponement_reason: textToNull(nextPostponementReason), user_id: user.id }))));
    const adminTasksToUpsert = currentData.adminTasks.map(({ dueDate, location, ...task }) => ({ ...task, due_date: toISOStringOrNow(dueDate), location: textToNull(location), user_id: user.id }));
    const appointmentsToUpsert = currentData.appointments.map(({ reminderTimeInMinutes, date, ...apt }) => ({ ...apt, date: toISOStringOrNow(date), reminder_time_in_minutes: reminderTimeInMinutes, user_id: user.id }));
    const accountingEntriesToUpsert = currentData.accountingEntries.map(({ clientId, caseId, clientName, date, description, ...entry }) => ({ ...entry, date: toISOStringOrNow(date), description: textToNull(description), client_id: textToNull(clientId), case_id: textToNull(caseId), client_name: clientName, user_id: user.id }));
    const assistantsToUpsert = currentData.assistants.map(name => ({ name, user_id: user.id }));
    const invoicesToUpsert = currentData.invoices.map(({ items, clientId, clientName, caseId, caseSubject, issueDate, dueDate, taxRate, ...inv }) => ({ ...inv, client_id: clientId, client_name: clientName, case_id: textToNull(caseId), case_subject: textToNull(caseSubject), issue_date: toISOStringOrNow(issueDate), due_date: toISOStringOrNow(dueDate), tax_rate: taxRate, user_id: user.id }));
    const invoiceItemsToUpsert = currentData.invoices.flatMap(inv => inv.items.map(item => ({ ...item, invoice_id: inv.id, user_id: user.id })));

    // Deletion Phase
    const topLevelTables = ['clients', 'admin_tasks', 'appointments', 'accounting_entries', 'assistants', 'invoices'];
    const deletePromises = topLevelTables.map(table => supabase.from(table).delete().eq('user_id', user.id));
    const deleteResults = await Promise.all(deletePromises);
    for (const result of deleteResults) {
        if (result.error) throw result.error;
    }
    
    // Sequential Upsert Phase
    const checkResults = (results: { error: any }[], tableNames: string[]) => {
        results.forEach((result, index) => {
            if (result.error) {
                const error = { ...result.error, table: tableNames[index] };
                throw error;
            }
        });
    };

    const level1Promises = [], level1Tables = [];
    if (clientsToUpsert.length > 0) { level1Promises.push(supabase.from('clients').upsert(clientsToUpsert)); level1Tables.push('clients'); }
    if (assistantsToUpsert.length > 0) { level1Promises.push(supabase.from('assistants').upsert(assistantsToUpsert)); level1Tables.push('assistants'); }
    if (adminTasksToUpsert.length > 0) { level1Promises.push(supabase.from('admin_tasks').upsert(adminTasksToUpsert)); level1Tables.push('admin_tasks'); }
    if (appointmentsToUpsert.length > 0) { level1Promises.push(supabase.from('appointments').upsert(appointmentsToUpsert)); level1Tables.push('appointments'); }
    if (level1Promises.length > 0) checkResults(await Promise.all(level1Promises), level1Tables);

    const level2Promises = [], level2Tables = [];
    if (casesToUpsert.length > 0) { level2Promises.push(supabase.from('cases').upsert(casesToUpsert)); level2Tables.push('cases'); }
    if (accountingEntriesToUpsert.length > 0) { level2Promises.push(supabase.from('accounting_entries').upsert(accountingEntriesToUpsert)); level2Tables.push('accounting_entries'); }
    if (level2Promises.length > 0) checkResults(await Promise.all(level2Promises), level2Tables);

    const level3Promises = [], level3Tables = [];
    if (stagesToUpsert.length > 0) { level3Promises.push(supabase.from('stages').upsert(stagesToUpsert)); level3Tables.push('stages'); }
    if (invoicesToUpsert.length > 0) { level3Promises.push(supabase.from('invoices').upsert(invoicesToUpsert)); level3Tables.push('invoices'); }
    if (level3Promises.length > 0) checkResults(await Promise.all(level3Promises), level3Tables);

    const level4Promises = [], level4Tables = [];
    if (sessionsToUpsert.length > 0) { level4Promises.push(supabase.from('sessions').upsert(sessionsToUpsert)); level4Tables.push('sessions'); }
    if (invoiceItemsToUpsert.length > 0) { level4Promises.push(supabase.from('invoice_items').upsert(invoiceItemsToUpsert)); level4Tables.push('invoice_items'); }
    if (level4Promises.length > 0) checkResults(await Promise.all(level4Promises), level4Tables);
};