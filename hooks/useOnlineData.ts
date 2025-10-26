import { getSupabaseClient } from '../supabaseClient';
import { Client, AdminTask, Appointment, AccountingEntry, Invoice, InvoiceItem } from '../types';
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

export type FlatData = {
    clients: Omit<Client, 'cases'>[];
    cases: any[];
    stages: any[];
    sessions: any[];
    admin_tasks: AdminTask[];
    appointments: Appointment[];
    accounting_entries: AccountingEntry[];
    assistants: { name: string }[];
    invoices: Omit<Invoice, 'items'>[];
    invoice_items: InvoiceItem[];
}


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
        'profiles': 'id', 'clients': 'id', 'cases': 'id',
        'stages': 'id', 'sessions': 'id', 'admin_tasks': 'id',
        'appointments': 'id', 'accounting_entries': 'id', 'assistants': 'name',
        'invoices': 'id', 'invoice_items': 'id',
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
export const fetchDataFromSupabase = async (): Promise<FlatData> => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not available.');

    const [
        clientsRes, adminTasksRes, appointmentsRes, accountingEntriesRes,
        assistantsRes, invoicesRes, casesRes, stagesRes, sessionsRes, invoiceItemsRes
    ] = await Promise.all([
        supabase.from('clients').select('*'),
        supabase.from('admin_tasks').select('*'),
        supabase.from('appointments').select('*'),
        supabase.from('accounting_entries').select('*'),
        supabase.from('assistants').select('name'),
        supabase.from('invoices').select('*'),
        supabase.from('cases').select('*'),
        supabase.from('stages').select('*'),
        supabase.from('sessions').select('*'),
        supabase.from('invoice_items').select('*'),
    ]);

    const results = [
        { res: clientsRes, name: 'clients' },
        { res: adminTasksRes, name: 'admin_tasks' },
        { res: appointmentsRes, name: 'appointments' },
        { res: accountingEntriesRes, name: 'accounting_entries' },
        { res: assistantsRes, name: 'assistants' },
        { res: invoicesRes, name: 'invoices' },
        { res: casesRes, name: 'cases' },
        { res: stagesRes, name: 'stages' },
        { res: sessionsRes, name: 'sessions' },
        { res: invoiceItemsRes, name: 'invoice_items' },
    ];

    for (const { res, name } of results) {
        if (res.error) {
            throw new Error(`Failed to fetch ${name}: ${res.error.message}`);
        }
    }

    return {
        clients: clientsRes.data || [],
        cases: casesRes.data || [],
        stages: stagesRes.data || [],
        sessions: sessionsRes.data || [],
        admin_tasks: adminTasksRes.data || [],
        appointments: appointmentsRes.data || [],
        accounting_entries: accountingEntriesRes.data || [],
        assistants: assistantsRes.data || [],
        invoices: invoicesRes.data || [],
        invoice_items: invoiceItemsRes.data || [],
    };
};

export const deleteDataFromSupabase = async (deletions: Partial<FlatData>, user: User) => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not available.');

    // Deletion order matters due to foreign keys. Children first.
    const deletionOrder: (keyof FlatData)[] = [
        'invoice_items', 'sessions', 'stages', 'cases', 'invoices', 
        'admin_tasks', 'appointments', 'accounting_entries', 'assistants', 'clients'
    ];

    for (const table of deletionOrder) {
        const itemsToDelete = (deletions as any)[table];
        if (itemsToDelete && itemsToDelete.length > 0) {
            const primaryKeyColumn = table === 'assistants' ? 'name' : 'id';
            const ids = itemsToDelete.map((i: any) => i[primaryKeyColumn]);
            
            // For assistants, we need to also match the user_id for deletion.
            let query = supabase.from(table).delete().in(primaryKeyColumn, ids);
            if (table === 'assistants') {
                query = query.eq('user_id', user.id);
            }
            
            const { error } = await query;
            if (error) {
                console.error(`Error deleting from ${table}:`, error);
                const newError = new Error(error.message);
                (newError as any).table = table;
                throw newError;
            }
        }
    }
};

export const upsertDataToSupabase = async (data: Partial<FlatData>, user: User) => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not available.');

    const userId = user.id;

    // Map application data (camelCase) to database schema (snake_case)
    // AND remove updated_at from the payload, as the database handles it via trigger.
    const dataToUpsert = {
        clients: data.clients?.map(({ contactInfo, updated_at, ...rest }) => ({ ...rest, user_id: userId, contact_info: contactInfo })),
        cases: data.cases?.map(({ clientName, opponentName, feeAgreement, updated_at, ...rest }) => ({ ...rest, user_id: userId, client_name: clientName, opponent_name: opponentName, fee_agreement: feeAgreement })),
        stages: data.stages?.map(({ caseNumber, firstSessionDate, decisionDate, decisionNumber, decisionSummary, decisionNotes, updated_at, ...rest }) => ({ ...rest, user_id: userId, case_number: caseNumber, first_session_date: firstSessionDate, decision_date: decisionDate, decision_number: decisionNumber, decision_summary: decisionSummary, decision_notes: decisionNotes })),
        sessions: data.sessions?.map(({ caseNumber, clientName, opponentName, postponementReason, nextPostponementReason, isPostponed, nextSessionDate, updated_at, ...rest }) => ({ ...rest, user_id: userId, case_number: caseNumber, client_name: clientName, opponent_name: opponentName, postponement_reason: postponementReason, next_postponement_reason: nextPostponementReason, is_postponed: isPostponed, next_session_date: nextSessionDate })),
        admin_tasks: data.admin_tasks?.map(({ dueDate, updated_at, ...rest }) => ({ ...rest, user_id: userId, due_date: dueDate })),
        appointments: data.appointments?.map(({ reminderTimeInMinutes, updated_at, ...rest }) => ({ ...rest, user_id: userId, reminder_time_in_minutes: reminderTimeInMinutes })),
        accounting_entries: data.accounting_entries?.map(({ clientId, caseId, clientName, updated_at, ...rest }) => ({ ...rest, user_id: userId, client_id: clientId, case_id: caseId, client_name: clientName })),
        assistants: data.assistants?.map(item => ({ ...item, user_id: userId })),
        invoices: data.invoices?.map(({ clientId, clientName, caseId, caseSubject, issueDate, dueDate, taxRate, updated_at, ...rest }) => ({ ...rest, user_id: userId, client_id: clientId, client_name: clientName, case_id: caseId, case_subject: caseSubject, issue_date: issueDate, due_date: dueDate, tax_rate: taxRate })),
        invoice_items: data.invoice_items?.map(({ updated_at, ...item }) => ({ ...item, user_id: userId })),
    };
    
    const upsertTable = async (table: string, records: any[] | undefined, options: { onConflict?: string } = {}) => {
        if (!records || records.length === 0) return [];
        const { data: responseData, error } = await supabase.from(table).upsert(records, options).select();
        if (error) {
            console.error(`Error upserting to ${table}:`, error);
            const newError = new Error(error.message);
            (newError as any).table = table;
            throw newError;
        }
        return responseData || [];
    };
    
    const results: Partial<Record<keyof FlatData, any[]>> = {};

    // Upsert assistants with conflict resolution
    results.assistants = await upsertTable('assistants', dataToUpsert.assistants, { onConflict: 'user_id,name' });

    // Upsert independent tables in parallel
    const [adminTasks, appointments, accountingEntries] = await Promise.all([
        upsertTable('admin_tasks', dataToUpsert.admin_tasks),
        upsertTable('appointments', dataToUpsert.appointments),
        upsertTable('accounting_entries', dataToUpsert.accounting_entries),
    ]);
    results.admin_tasks = adminTasks;
    results.appointments = appointments;
    results.accounting_entries = accountingEntries;

    // Upsert tables with dependencies in order
    results.clients = await upsertTable('clients', dataToUpsert.clients);
    results.cases = await upsertTable('cases', dataToUpsert.cases);
    results.stages = await upsertTable('stages', dataToUpsert.stages);
    results.sessions = await upsertTable('sessions', dataToUpsert.sessions);
    
    results.invoices = await upsertTable('invoices', dataToUpsert.invoices);
    results.invoice_items = await upsertTable('invoice_items', dataToUpsert.invoice_items);
    
    return results;
};

// Helper to transform remote snake_case data to local camelCase format
export const transformRemoteToLocal = (remote: any): Partial<FlatData> => {
    if (!remote) return {};
    return {
        clients: remote.clients?.map(({ contact_info, ...r }: any) => ({ ...r, contactInfo: contact_info })),
        cases: remote.cases?.map(({ client_name, opponent_name, fee_agreement, ...r }: any) => ({ ...r, clientName: client_name, opponentName: opponent_name, feeAgreement: fee_agreement })),
        stages: remote.stages?.map(({ case_number, first_session_date, decision_date, decision_number, decision_summary, decision_notes, ...r }: any) => ({ ...r, caseNumber: case_number, firstSessionDate: first_session_date, decisionDate: decision_date, decisionNumber: decision_number, decisionSummary: decision_summary, decisionNotes: decision_notes })),
        sessions: remote.sessions?.map(({ case_number, client_name, opponent_name, postponement_reason, next_postponement_reason, is_postponed, next_session_date, ...r }: any) => ({ ...r, caseNumber: case_number, clientName: client_name, opponentName: opponent_name, postponementReason: postponement_reason, nextPostponementReason: next_postponement_reason, isPostponed: is_postponed, nextSessionDate: next_session_date })),
        admin_tasks: remote.admin_tasks?.map(({ due_date, ...r }: any) => ({ ...r, dueDate: due_date })),
        appointments: remote.appointments?.map(({ reminder_time_in_minutes, ...r }: any) => ({ ...r, reminderTimeInMinutes: reminder_time_in_minutes })),
        accounting_entries: remote.accounting_entries?.map(({ client_id, case_id, client_name, ...r }: any) => ({ ...r, clientId: client_id, caseId: case_id, clientName: client_name })),
        assistants: remote.assistants?.map((a: any) => ({ name: a.name })),
        invoices: remote.invoices?.map(({ client_id, client_name, case_id, case_subject, issue_date, due_date, tax_rate, ...r }: any) => ({ ...r, clientId: client_id, clientName: client_name, caseId: case_id, caseSubject: case_subject, issueDate: issue_date, dueDate: due_date, taxRate: tax_rate })),
        invoice_items: remote.invoice_items,
    };
};
