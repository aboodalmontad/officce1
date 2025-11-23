
import { getSupabaseClient } from '../supabaseClient';
import { Client, AdminTask, Appointment, AccountingEntry, Invoice, InvoiceItem, CaseDocument, Profile, SiteFinancialEntry, SystemSetting } from '../types';
// Fix: Use `import type` for User as it is used as a type, not a value.
import type { User } from '@supabase/supabase-js';

// This file defines the shape of data when flattened for sync operations.
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
    invoice_items: any[]; // Changed from InvoiceItem[] to allow foreign keys
    case_documents: CaseDocument[];
    profiles: Profile[];
    site_finances: SiteFinancialEntry[];
    system_settings: SystemSetting[];
};

// Helper to ensure valid date strings for DB.
// Prevents "Invalid Date" objects from becoming null in JSON.stringify and violating NOT NULL constraints.
const safeDate = (date: any): string => {
    if (!date) return new Date().toISOString();
    const d = new Date(date);
    if (isNaN(d.getTime())) return new Date().toISOString(); // Default to now if invalid
    return d.toISOString();
};

// Helper to sanitize payload for Supabase
// 1. Removes undefined values (JSON.stringify does this).
// 2. Converts NaN to 0 for specific numeric fields to prevent DB errors.
// 3. Trims strings.
const sanitizePayload = (data: any[]) => {
    if (!data || !Array.isArray(data)) return [];

    // Deep clone and remove undefineds
    const cleaned = JSON.parse(JSON.stringify(data));

    const fixValues = (obj: any) => {
        if (Array.isArray(obj)) {
            obj.forEach(fixValues);
        } else if (obj && typeof obj === 'object') {
            for (const key in obj) {
                const val = obj[key];
                
                // Fix Numeric Fields
                if (['amount', 'tax_rate', 'discount', 'reminder_time_in_minutes', 'size', 'order_index'].includes(key)) {
                    if (val === null || val === undefined || (typeof val === 'number' && isNaN(val))) {
                        obj[key] = 0;
                    }
                }
                // Fix Strings
                else if (typeof val === 'string') {
                    // Trim whitespace
                    obj[key] = val.trim();
                    // Convert empty strings to null for Foreign Keys to avoid constraint violations
                    if (['client_id', 'case_id', 'stage_id', 'user_id', 'invoice_id'].includes(key)) {
                        if (obj[key] === '' || obj[key] === 'null' || obj[key] === 'undefined') obj[key] = null;
                    }
                }
                // Recurse
                else {
                    fixValues(val);
                }
            }
        }
    };

    fixValues(cleaned);
    return cleaned;
};


export const checkSupabaseSchema = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
        return { success: false, error: 'unconfigured', message: 'Supabase client is not configured.' };
    }

    const tableChecks: { [key: string]: string } = {
        'profiles': 'verification_code', 
        'clients': 'id', 
        'cases': 'id',
        'stages': 'id', 
        'sessions': 'id', 
        'admin_tasks': 'id',
        'appointments': 'id', 
        'accounting_entries': 'id', 
        'assistants': 'name',
        'invoices': 'id', 
        'invoice_items': 'id', 
        'case_documents': 'id',
        'site_finances': 'id',
    };
    
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timed out')), 15000));

    try {
        const checkPromises = Object.entries(tableChecks).map(([table, query]) =>
            supabase.from(table).select(query, { head: true }).then(res => ({ ...res, table }))
        );

        const results: any = await Promise.race([Promise.all(checkPromises), timeoutPromise]);

        for (const result of results) {
            if (result.error) {
                const message = String(result.error.message || '').toLowerCase();
                const code = String(result.error.code || '');
                
                if (
                    code === '42P01' || 
                    code === '42703' || 
                    message.includes('does not exist') || 
                    message.includes('could not find the table') || 
                    message.includes('schema cache') || 
                    message.includes('relation') ||
                    message.includes('column')
                ) {
                    return { success: false, error: 'uninitialized', message: `Database uninitialized. Missing table/column in: ${result.table}. Error: ${message}` };
                } else {
                    throw result.error;
                }
            }
        }
        return { success: true, error: null, message: '' };
    } catch (err: any) {
        let message = err.message || 'Unknown error';
        const lowerMessage = message.toLowerCase();
        
        if (lowerMessage.includes('timeout')) {
             return { success: false, error: 'network', message: 'Connection timed out. Please check your internet connection.' };
        }

        if (lowerMessage.includes('failed to fetch') || lowerMessage.includes('networkerror')) {
            return { success: false, error: 'network', message: 'Failed to connect to the server. Check internet connection.' };
        }
        
        if (lowerMessage.includes('does not exist') || lowerMessage.includes('relation')) {
            return { success: false, error: 'uninitialized', message: 'Database is not fully initialized.' };
        }

        return { success: false, error: 'uninitialized', message: `Database check failed: ${message}` };
    }
};


export const fetchDataFromSupabase = async (): Promise<Partial<FlatData>> => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not available.');

    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timed out')), 30000));

    try {
        // Helper to fetch with timeout
        const fetchTable = (table: string, select: string = '*') => 
            supabase.from(table).select(select).then(res => {
                if(res.error) throw res.error;
                return res.data;
            });

        // Parallel fetch is usually fine for reading, but we can group them if needed.
        // For now, Promise.all is efficient.
        const results: any = await Promise.race([
            Promise.all([
                fetchTable('clients'),
                fetchTable('admin_tasks'),
                fetchTable('appointments'),
                fetchTable('accounting_entries'),
                fetchTable('assistants', 'name'),
                fetchTable('invoices'),
                fetchTable('cases'),
                fetchTable('stages'),
                fetchTable('sessions'),
                fetchTable('invoice_items'),
                fetchTable('case_documents'),
                fetchTable('profiles'),
                fetchTable('site_finances'),
            ]),
            timeoutPromise
        ]);

        // Fetch settings separately to be safe
        let systemSettingsData: any[] = [];
        try {
            const { data, error } = await supabase.from('system_settings').select('*');
            if (!error) systemSettingsData = data || [];
        } catch (e) {}

        return {
            clients: results[0] || [],
            admin_tasks: results[1] || [],
            appointments: results[2] || [],
            accounting_entries: results[3] || [],
            assistants: results[4] || [],
            invoices: results[5] || [],
            cases: results[6] || [],
            stages: results[7] || [],
            sessions: results[8] || [],
            invoice_items: results[9] || [],
            case_documents: results[10] || [],
            profiles: results[11] || [],
            site_finances: results[12] || [],
            system_settings: systemSettingsData,
        };
    } catch (err: any) {
        console.error("Exception in fetchDataFromSupabase:", err);
        throw new Error(err.message || "Failed to fetch data from server");
    }
};

export const deleteDataFromSupabase = async (deletions: Partial<FlatData>, user: User) => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not available.');

    // Strict deletion order (Children first)
    const deletionOrder: (keyof FlatData)[] = [
        'case_documents', 'invoice_items', 'sessions', 'stages', 'cases', 'invoices', 
        'admin_tasks', 'appointments', 'accounting_entries', 'assistants', 'clients',
        'site_finances', 'system_settings', 'profiles'
    ];

    // Process sequentially to avoid foreign key issues
    for (const table of deletionOrder) {
        const itemsToDelete = (deletions as any)[table];
        if (itemsToDelete && itemsToDelete.length > 0) {
            let primaryKeyColumn = 'id';
            if (table === 'assistants') primaryKeyColumn = 'name';
            if (table === 'system_settings') primaryKeyColumn = 'key';

            const ids = itemsToDelete.map((i: any) => i[primaryKeyColumn]);
            
            // Chunk deletions too, just in case of huge lists
            const CHUNK_SIZE = 20;
            for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
                const chunk = ids.slice(i, i + CHUNK_SIZE);
                let query = supabase.from(table).delete().in(primaryKeyColumn, chunk);
                
                if (table === 'assistants') {
                    query = query.eq('user_id', user.id);
                }
                
                const { error } = await query;
                if (error) {
                    console.error(`Error deleting from ${table}:`, error);
                    // Continue best effort
                }
            }
        }
    }
};

export const upsertDataToSupabase = async (data: Partial<FlatData>, user: User) => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not available.');

    const userId = user.id;

    // --- 1. Transform Objects to Database Format (Snake Case) & Enforce Safe Data Types ---
    
    const rawProfiles = data.profiles?.map(({ full_name, mobile_number, is_approved, is_active, subscription_start_date, subscription_end_date, verification_code, ...rest }) => ({ 
        ...rest, 
        full_name, 
        mobile_number, 
        is_approved, 
        is_active, 
        subscription_start_date, 
        subscription_end_date, 
        verification_code 
    })) || [];

    const rawSettings = data.system_settings || [];
    
    const rawAssistants = data.assistants?.map(item => ({ ...item, user_id: userId })) || [];
    
    const rawAdminTasks = data.admin_tasks?.map(({ dueDate, orderIndex, ...rest }) => ({ 
        ...rest, 
        user_id: userId, 
        due_date: safeDate(dueDate), // MANDATORY: Safe Date
        order_index: orderIndex 
    })) || [];
    
    const rawAppointments = data.appointments?.map(({ reminderTimeInMinutes, date, ...rest }) => ({ 
        ...rest, 
        user_id: userId, 
        date: safeDate(date), // MANDATORY: Safe Date
        reminder_time_in_minutes: reminderTimeInMinutes 
    })) || [];
    
    const rawSiteFinances = data.site_finances?.map(({ user_id, payment_date, ...rest }) => ({ 
        ...rest, 
        user_id, 
        payment_date: safeDate(payment_date) // MANDATORY: Safe Date
    })) || [];
    
    const rawAccountingEntries = data.accounting_entries?.map(({ clientId, caseId, clientName, date, ...rest }) => ({ 
        ...rest, 
        user_id: userId, 
        client_id: clientId, 
        case_id: caseId, 
        client_name: clientName,
        date: safeDate(date) // MANDATORY: Safe Date
    })) || [];

    // Parent: Clients
    const rawClients = data.clients?.map(({ contactInfo, ...rest }) => ({ ...rest, user_id: userId, contact_info: contactInfo })) || [];
    
    // --- 2. STRICT Referential Integrity Filtering ---
    // We filter children based on the *actual* parents we are about to upload (or assume exist).
    // This prevents "Orphan" records from causing Foreign Key violations.

    // Step 2a: Filter Clients
    // (Assume all clients with a name are valid)
    const validClients = rawClients.filter(c => c.name && c.name.trim() !== '');
    const validClientIds = new Set(validClients.map(c => c.id));

    // Step 2b: Filter Cases (Must have a valid Client ID)
    const rawCases = data.cases?.map(({ clientName, opponentName, feeAgreement, ...rest }) => ({ ...rest, user_id: userId, client_name: clientName, opponent_name: opponentName, fee_agreement: feeAgreement })) || [];
    const validCases = rawCases.filter(c => c.client_id && validClientIds.has(c.client_id));
    const validCaseIds = new Set(validCases.map(c => c.id));

    // Step 2c: Filter Stages (Must have a valid Case ID)
    const rawStages = data.stages?.map(({ caseNumber, firstSessionDate, decisionDate, decisionNumber, decisionSummary, decisionNotes, ...rest }) => ({ 
        ...rest, 
        user_id: userId, 
        case_number: caseNumber, 
        first_session_date: firstSessionDate ? safeDate(firstSessionDate) : null, // Safe Optional Date
        decision_date: decisionDate ? safeDate(decisionDate) : null, 
        decision_number: decisionNumber, 
        decision_summary: decisionSummary, 
        decision_notes: decisionNotes 
    })) || [];
    const validStages = rawStages.filter(s => s.case_id && validCaseIds.has(s.case_id));
    const validStageIds = new Set(validStages.map(s => s.id));

    // Step 2d: Filter Sessions (Must have a valid Stage ID)
    const rawSessions = data.sessions?.map((s: any) => ({
        id: s.id,
        user_id: userId,
        stage_id: s.stage_id,
        court: s.court,
        case_number: s.caseNumber,
        date: safeDate(s.date), // MANDATORY: Safe Date
        client_name: s.clientName,
        opponent_name: s.opponentName,
        postponement_reason: s.postponementReason,
        next_postponement_reason: s.nextPostponementReason,
        is_postponed: s.isPostponed,
        next_session_date: s.nextSessionDate ? safeDate(s.nextSessionDate) : null,
        assignee: s.assignee,
        updated_at: s.updated_at
    })) || [];
    const validSessions = rawSessions.filter(s => s.stage_id && validStageIds.has(s.stage_id));

    // Step 2e: Filter Invoices (Must have a valid Client ID)
    const rawInvoices = data.invoices?.map(({ clientId, clientName, caseId, caseSubject, issueDate, dueDate, taxRate, ...rest }) => ({ 
        ...rest, 
        user_id: userId, 
        client_id: clientId, 
        client_name: clientName, 
        case_id: caseId, 
        case_subject: caseSubject, 
        issue_date: safeDate(issueDate), // MANDATORY: Safe Date
        due_date: safeDate(dueDate), // MANDATORY: Safe Date
        tax_rate: taxRate 
    })) || [];
    const validInvoices = rawInvoices.filter(i => i.client_id && validClientIds.has(i.client_id));
    const validInvoiceIds = new Set(validInvoices.map(i => i.id));

    // Step 2f: Filter Invoice Items (Must have a valid Invoice ID)
    const rawInvoiceItems = data.invoice_items?.map((item: any) => ({ ...item, user_id: userId })) || [];
    const validInvoiceItems = rawInvoiceItems.filter(item => item.invoice_id && validInvoiceIds.has(item.invoice_id));

    // Step 2g: Filter Documents (Must have a valid Case ID)
    const rawDocuments = data.case_documents?.map(({ caseId, userId: localUserId, addedAt, storagePath, localState, ...rest }) => ({ 
        ...rest, 
        user_id: localUserId || userId, 
        case_id: caseId, 
        added_at: safeDate(addedAt), // MANDATORY: Safe Date
        storage_path: storagePath 
    })) || [];
    const validDocuments = rawDocuments.filter(d => d.case_id && validCaseIds.has(d.case_id));


    // --- 3. Batch Upsert Execution ---
    const results: Partial<Record<keyof FlatData, any[]>> = {};

    // Helper function for batching with retry logic
    const upsertTable = async (table: string, records: any[], options: { onConflict?: string } = {}) => {
        if (!records || records.length === 0) return [];
        
        const CHUNK_SIZE = 3; // Ultra-conservative chunk size for mobile reliability
        const tableResults = [];

        for (let i = 0; i < records.length; i += CHUNK_SIZE) {
            const chunk = records.slice(i, i + CHUNK_SIZE);
            const sanitizedChunk = sanitizePayload(chunk);

            let attempts = 0;
            const maxAttempts = 3;
            
            while (attempts < maxAttempts) {
                try {
                    const { data: responseData, error } = await supabase.from(table).upsert(sanitizedChunk, options).select();
                    if (error) throw error;
                    if (responseData) tableResults.push(...responseData);
                    break; // Success
                } catch (err: any) {
                    attempts++;
                    console.warn(`Sync error for ${table} (Attempt ${attempts}/${maxAttempts}):`, err.message);
                    if (attempts >= maxAttempts) {
                        const newError = new Error(err.message || JSON.stringify(err));
                        (newError as any).table = table;
                        throw newError;
                    }
                    // Exponential backoff: 1s, 2s, 4s
                    await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempts - 1)));
                }
            }
        }
        return tableResults;
    };

    // STRICT SEQUENTIAL EXECUTION
    // 1. Users & Config
    results.profiles = await upsertTable('profiles', rawProfiles);
    results.system_settings = await upsertTable('system_settings', rawSettings);
    results.assistants = await upsertTable('assistants', rawAssistants, { onConflict: 'user_id,name' });

    // 2. Independent Data
    results.admin_tasks = await upsertTable('admin_tasks', rawAdminTasks);
    results.appointments = await upsertTable('appointments', rawAppointments);
    results.site_finances = await upsertTable('site_finances', rawSiteFinances);

    // 3. Hierarchical Data (Order is critical to satisfy foreign keys)
    results.clients = await upsertTable('clients', validClients);
    results.cases = await upsertTable('cases', validCases); 
    results.stages = await upsertTable('stages', validStages);
    results.sessions = await upsertTable('sessions', validSessions);
    
    // Note: Accounting entries often link to clients/cases, so safe to do after them.
    results.accounting_entries = await upsertTable('accounting_entries', rawAccountingEntries); 
    results.case_documents = await upsertTable('case_documents', validDocuments);

    // 4. Billing (Depends on clients/cases)
    results.invoices = await upsertTable('invoices', validInvoices);
    results.invoice_items = await upsertTable('invoice_items', validInvoiceItems);
    
    return results;
};

export const transformRemoteToLocal = (remote: any): Partial<FlatData> => {
    if (!remote) return {};
    return {
        clients: remote.clients?.map(({ contact_info, ...r }: any) => ({ ...r, contactInfo: contact_info })),
        cases: remote.cases?.map(({ client_name, opponent_name, fee_agreement, ...r }: any) => ({ ...r, clientName: client_name, opponentName: opponent_name, feeAgreement: fee_agreement })),
        stages: remote.stages?.map(({ case_number, first_session_date, decision_date, decision_number, decision_summary, decision_notes, ...r }: any) => ({ ...r, caseNumber: case_number, firstSessionDate: first_session_date, decisionDate: decision_date, decisionNumber: decision_number, decisionSummary: decision_summary, decisionNotes: decision_notes })),
        sessions: remote.sessions?.map(({ case_number, client_name, opponent_name, postponement_reason, next_postponement_reason, is_postponed, next_session_date, ...r }: any) => ({ ...r, caseNumber: case_number, clientName: client_name, opponentName: opponent_name, postponementReason: postponement_reason, nextPostponementReason: next_postponement_reason, isPostponed: is_postponed, nextSessionDate: next_session_date })),
        admin_tasks: remote.admin_tasks?.map(({ due_date, order_index, ...r }: any) => ({ ...r, dueDate: due_date, orderIndex: order_index })),
        appointments: remote.appointments?.map(({ reminder_time_in_minutes, ...r }: any) => ({ ...r, reminderTimeInMinutes: reminder_time_in_minutes })),
        accounting_entries: remote.accounting_entries?.map(({ client_id, case_id, client_name, ...r }: any) => ({ ...r, clientId: client_id, caseId: case_id, clientName: client_name })),
        assistants: remote.assistants?.map((a: any) => ({ name: a.name })),
        invoices: remote.invoices?.map(({ client_id, client_name, case_id, case_subject, issue_date, due_date, tax_rate, ...r }: any) => ({ ...r, clientId: client_id, clientName: client_name, caseId: case_id, caseSubject: case_subject, issueDate: issue_date, dueDate: due_date, taxRate: tax_rate })),
        invoice_items: remote.invoice_items?.map(({ invoice_id, ...r }: any) => ({ ...r, invoiceId: invoice_id, invoice_id })), // Keep invoice_id for flat linking
        case_documents: remote.case_documents?.map(({ user_id, case_id, added_at, storage_path, ...r }: any) => ({...r, userId: user_id, caseId: case_id, addedAt: added_at, storagePath: storage_path })),
        profiles: remote.profiles?.map(({ full_name, mobile_number, is_approved, is_active, subscription_start_date, subscription_end_date, verification_code, ...r }: any) => ({ ...r, full_name, mobile_number, is_approved, is_active, subscription_start_date, subscription_end_date, verification_code })),
        site_finances: remote.site_finances,
        system_settings: remote.system_settings,
    };
};
