import * as React from 'react';
import { Client, Session, AdminTask, Appointment, AccountingEntry, Case, Stage, Invoice, InvoiceItem } from '../types';
import { getSupabaseClient } from '../supabaseClient';
import { useOnlineStatus } from './useOnlineStatus';
import { User } from '@supabase/supabase-js';

export const APP_DATA_KEY = 'lawyerBusinessManagementData';
export type SyncStatus = 'loading' | 'syncing' | 'synced' | 'error' | 'offline' | 'unconfigured' | 'uninitialized';

const defaultAssistants = ['أحمد', 'فاطمة', 'سارة', 'بدون تخصيص'];

const getInitialData = () => ({
    clients: [] as Client[],
    adminTasks: [] as AdminTask[],
    appointments: [] as Appointment[],
    accountingEntries: [] as AccountingEntry[],
    invoices: [] as Invoice[],
    assistants: [...defaultAssistants],
});

type AppData = ReturnType<typeof getInitialData>;

const validateAssistantsList = (list: any): string[] => {
    if (!Array.isArray(list)) {
        return [...defaultAssistants];
    }
    const uniqueAssistants = new Set(list.filter(item => typeof item === 'string' && item.trim() !== ''));
    uniqueAssistants.add('بدون تخصيص');
    return Array.from(uniqueAssistants);
};

const safeArray = <T, U>(arr: any, mapFn: (item: T, index: number) => U): U[] => {
    if (!Array.isArray(arr)) return [];
    return arr.filter(item => item && typeof item === 'object').map(mapFn as any);
};

const sanitizeOptionalDate = (date: any): Date | undefined => {
    if (date === null || date === undefined || date === '') return undefined;
    const d = new Date(date);
    return !isNaN(d.getTime()) ? d : undefined;
};

const validateAndHydrate = (data: any): AppData => {
    const defaults = getInitialData();
    if (!data || typeof data !== 'object') return defaults;

    const validatedAssistants = validateAssistantsList(data.assistants);
    const isValidAssistant = (assignee: any): assignee is string => typeof assignee === 'string' && validatedAssistants.includes(assignee);
    const defaultAssignee = 'بدون تخصيص';
    const sanitizeString = (str: any): string => (str === null || str === undefined) ? '' : String(str);

    const validatedClients: Client[] = safeArray(data.clients, (client: any): Client => ({
        id: client.id || `client-${Date.now()}-${Math.random()}`,
        name: String(client.name || 'موكل غير مسمى'),
        contactInfo: String((client.contact_info ?? client.contactInfo) || ''),
        cases: safeArray(client.cases, (caseItem: any): Case => ({
            id: caseItem.id || `case-${Date.now()}-${Math.random()}`,
            subject: String(caseItem.subject || 'قضية بدون موضوع'),
            clientName: String((caseItem.client_name ?? caseItem.clientName) || client.name || 'موكل غير مسمى'),
            opponentName: sanitizeString(caseItem.opponent_name ?? caseItem.opponentName),
            feeAgreement: String((caseItem.fee_agreement ?? caseItem.feeAgreement) || ''),
            status: ['active', 'closed', 'on_hold'].includes(caseItem.status) ? caseItem.status : 'active',
            stages: safeArray(caseItem.stages, (stage: any): Stage => ({
                id: stage.id || `stage-${Date.now()}-${Math.random()}`,
                court: String(stage.court || 'محكمة غير محددة'),
                caseNumber: sanitizeString(stage.case_number ?? stage.caseNumber),
                firstSessionDate: sanitizeOptionalDate(stage.first_session_date ?? stage.firstSessionDate),
                sessions: safeArray(stage.sessions, (session: any): Session | null => {
                    const sessionDate = session.date ? new Date(session.date) : null;
                    if (!sessionDate || isNaN(sessionDate.getTime())) {
                        console.warn('Filtering out session with invalid date:', session);
                        return null;
                    }
                    return {
                        id: session.id || `session-${Date.now()}-${Math.random()}`,
                        court: String(session.court || stage.court || 'محكمة غير محددة'),
                        caseNumber: ('case_number' in session || 'caseNumber' in session) ? sanitizeString(session.case_number ?? session.caseNumber) : sanitizeString(stage.case_number ?? stage.caseNumber),
                        date: sessionDate,
                        clientName: String((session.client_name ?? session.clientName) || (caseItem.client_name ?? caseItem.clientName) || client.name || 'موكل غير مسمى'),
                        opponentName: ('opponent_name' in session || 'opponentName' in session) ? sanitizeString(session.opponent_name ?? session.opponentName) : sanitizeString(caseItem.opponent_name ?? caseItem.opponentName),
                        isPostponed: typeof (session.is_postponed ?? session.isPostponed) === 'boolean' ? (session.is_postponed ?? session.isPostponed) : false,
                        postponementReason: sanitizeString(session.postponement_reason ?? session.postponementReason),
                        nextPostponementReason: sanitizeString(session.next_postponement_reason ?? session.nextPostponementReason),
                        nextSessionDate: sanitizeOptionalDate(session.next_session_date ?? session.nextSessionDate),
                        assignee: isValidAssistant(session.assignee) ? session.assignee : defaultAssignee,
                    };
                }).filter((s): s is Session => s !== null),
                decisionDate: sanitizeOptionalDate(stage.decision_date ?? stage.decisionDate),
                decisionNumber: sanitizeString(stage.decision_number ?? stage.decisionNumber),
                decisionSummary: sanitizeString(stage.decision_summary ?? stage.decisionSummary),
                decisionNotes: sanitizeString(stage.decision_notes ?? stage.decisionNotes),
            })),
        })),
    }));

    const validatedAdminTasks: AdminTask[] = safeArray(data.adminTasks, (task: any): AdminTask | null => {
        const dueDate = (task.due_date ?? task.dueDate) ? new Date(task.due_date ?? task.dueDate) : null;
        if (!dueDate || isNaN(dueDate.getTime())) {
            console.warn('Filtering out admin task with invalid due date:', task);
            return null;
        }
        return {
            id: task.id || `task-${Date.now()}-${Math.random()}`,
            task: String(task.task || 'مهمة بدون عنوان'),
            dueDate: dueDate,
            completed: typeof task.completed === 'boolean' ? task.completed : false,
            importance: ['normal', 'important', 'urgent'].includes(task.importance) ? task.importance : 'normal',
            assignee: isValidAssistant(task.assignee) ? task.assignee : defaultAssignee,
            location: sanitizeString(task.location),
        };
    }).filter((t): t is AdminTask => t !== null);

    const validatedAppointments: Appointment[] = safeArray(data.appointments, (apt: any): Appointment | null => {
        const aptDate = apt.date ? new Date(apt.date) : null;
        if (!aptDate || isNaN(aptDate.getTime())) {
            console.warn('Filtering out appointment with invalid date:', apt);
            return null;
        }
        return {
            id: apt.id || `apt-${Date.now()}`,
            title: String(apt.title || 'موعد بدون عنوان'),
            time: typeof apt.time === 'string' && /^\d{2}:\d{2}$/.test(apt.time) ? apt.time : '00:00',
            date: aptDate,
            importance: ['normal', 'important', 'urgent'].includes(apt.importance) ? apt.importance : 'normal',
            notified: typeof apt.notified === 'boolean' ? apt.notified : false,
            reminderTimeInMinutes: typeof (apt.reminder_time_in_minutes ?? apt.reminderTimeInMinutes) === 'number' ? (apt.reminder_time_in_minutes ?? apt.reminderTimeInMinutes) : undefined,
            assignee: isValidAssistant(apt.assignee) ? apt.assignee : defaultAssignee,
        };
    }).filter((a): a is Appointment => a !== null);
    
    const validatedAccountingEntries: AccountingEntry[] = safeArray(data.accountingEntries, (entry: any): AccountingEntry => ({
        id: entry.id || `acc-${Date.now()}`,
        type: ['income', 'expense'].includes(entry.type) ? entry.type : 'income',
        amount: typeof entry.amount === 'number' ? entry.amount : 0,
        date: entry.date && !isNaN(new Date(entry.date).getTime()) ? new Date(entry.date) : new Date(),
        description: String(entry.description || ''),
        clientId: String((entry.client_id ?? entry.clientId) || ''),
        caseId: String((entry.case_id ?? entry.caseId) || ''),
        clientName: String((entry.client_name ?? entry.clientName) || ''),
    }));

    const validatedInvoices: Invoice[] = safeArray(data.invoices, (invoice: any): Invoice => ({
        id: invoice.id || `inv-${Date.now()}-${Math.random()}`,
        clientId: String((invoice.client_id ?? invoice.clientId) || ''),
        clientName: String((invoice.client_name ?? invoice.clientName) || ''),
        caseId: sanitizeString(invoice.case_id ?? invoice.caseId),
        caseSubject: sanitizeString(invoice.case_subject ?? invoice.caseSubject),
        issueDate: (invoice.issue_date ?? invoice.issueDate) && !isNaN(new Date(invoice.issue_date ?? invoice.issueDate).getTime()) ? new Date(invoice.issue_date ?? invoice.issueDate) : new Date(),
        dueDate: (invoice.due_date ?? invoice.dueDate) && !isNaN(new Date(invoice.due_date ?? invoice.dueDate).getTime()) ? new Date(invoice.due_date ?? invoice.dueDate) : new Date(),
        items: safeArray(invoice.invoice_items ?? invoice.items, (item: any): InvoiceItem => ({
            id: item.id || `item-${Date.now()}-${Math.random()}`,
            description: String(item.description || ''),
            amount: typeof item.amount === 'number' ? item.amount : 0,
        })),
        taxRate: typeof (invoice.tax_rate ?? invoice.taxRate) === 'number' ? (invoice.tax_rate ?? invoice.taxRate) : 0,
        discount: typeof invoice.discount === 'number' ? invoice.discount : 0,
        status: ['draft', 'sent', 'paid', 'overdue'].includes(invoice.status) ? invoice.status : 'draft',
        notes: sanitizeString(invoice.notes),
    }));

    return { 
        clients: validatedClients, 
        adminTasks: validatedAdminTasks, 
        appointments: validatedAppointments, 
        accountingEntries: validatedAccountingEntries,
        invoices: validatedInvoices,
        assistants: validatedAssistants,
    };
};

export const useSupabaseData = (offlineMode: boolean, user: User | null) => {
    const getLocalStorageKey = () => user ? `${APP_DATA_KEY}_${user.id}` : APP_DATA_KEY;
    const userId = user?.id; // Stable dependency

    // Use a ref to hold the latest user object to prevent stale closures in callbacks
    const userRef = React.useRef(user);
    userRef.current = user;

    const [data, setData] = React.useState<AppData>(getInitialData);
    const [syncStatus, setSyncStatus] = React.useState<SyncStatus>('loading');
    const [lastSyncError, setLastSyncError] = React.useState<string | null>(null);
    const [isDirty, setIsDirty] = React.useState(false);
    const isOnline = useOnlineStatus();
    const isSavingRef = React.useRef(false);

    React.useEffect(() => {
        if (!userId) {
            // Clear data if user logs out
            setData(getInitialData());
            setIsDirty(false);
            return;
        };
        try {
            const rawData = localStorage.getItem(getLocalStorageKey());
            setData(rawData ? validateAndHydrate(JSON.parse(rawData)) : getInitialData());
            setIsDirty(localStorage.getItem(`lawyerAppIsDirty_${userId}`) === 'true');
        } catch (error) {
            console.error("Failed to load or parse data from localStorage for user.", error);
            setData(getInitialData());
        }
    }, [userId]); // Depend on the stable userId

    const performCheckAndFetch = React.useCallback(async () => {
        const currentUser = userRef.current; // Use the latest user object from the ref
        if (offlineMode || !isOnline) {
            setSyncStatus(offlineMode ? 'offline' : (isOnline ? 'synced' : 'offline'));
            return;
        }
        
        const supabase = getSupabaseClient();
        if (!supabase) {
            setSyncStatus('unconfigured');
            return;
        }

        const tableChecks: { [key: string]: string } = {
            'profiles': 'id',
            'clients': 'id, cases(id)',
            'cases': 'id, stages(id)',
            'stages': 'id, sessions(id)',
            'sessions': 'id',
            'admin_tasks': 'id',
            'appointments': 'id',
            'accounting_entries': 'id',
            'assistants': 'id',
            'invoices': 'id, invoice_items(id)',
            'invoice_items': 'id',
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
                        console.warn(`Database uninitialized. Missing table or relation: ${result.table}. Reason: ${result.error.message}`);
                        setSyncStatus('uninitialized');
                        setLastSyncError(`قاعدة البيانات غير مهيأة بالكامل. الجدول '${result.table}' أو علاقاته مفقودة. يرجى تشغيل شيفرة التهيئة.`);
                        return;
                    } else {
                        throw result.error;
                    }
                }
            }
        } catch (error: any) {
            const message = String(error?.message || '').toLowerCase();
            const code = String(error?.code || '');

            if (message.includes('failed to fetch')) {
                console.error("Network error during schema check:", error);
                setSyncStatus('error');
                setLastSyncError('فشل الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت.');
                return;
            }
            
            if (message.includes('does not exist') || code === '42P01' || message.includes('could not find the table') || message.includes('schema cache')) {
                console.warn(`Database uninitialized. A table is missing. Error: ${error.message}`);
                setSyncStatus('uninitialized');
                setLastSyncError(`قاعدة البيانات غير مهيأة بالكامل. يرجى تشغيل شيفرة التهيئة.`);
                return;
            }

            let errorMessage = 'An unknown error occurred during the schema check.';
            if (error?.message) {
                 errorMessage = error.message;
            } else if (error?.details) {
                 errorMessage = error.details;
            }

            console.error("Error during schema check:", error);
            setSyncStatus('error');
            setLastSyncError(`خطأ في التحقق من قاعدة البيانات: ${errorMessage}`);
            return;
        }
        
        if (!currentUser) {
            setData(getInitialData());
            setSyncStatus('synced');
            return;
        }

        setSyncStatus('syncing');
        setLastSyncError(null);
        try {
            const clientsRes = await supabase.from('clients').select('*, cases(*, stages(*, sessions(*)))').order('name');
            const adminTasksRes = await supabase.from('admin_tasks').select('*');
            const appointmentsRes = await supabase.from('appointments').select('*');
            const accountingEntriesRes = await supabase.from('accounting_entries').select('*');
            const assistantsRes = await supabase.from('assistants').select('name');
            const invoicesRes = await supabase.from('invoices').select('*, invoice_items(*)');

            const allResults = [clientsRes, adminTasksRes, appointmentsRes, accountingEntriesRes, assistantsRes, invoicesRes];
            
            const errors = allResults.map(res => res.error).filter(Boolean);
            if (errors.length > 0) throw new Error(errors.map(e => e!.message).join(', '));
            
            const remoteData = {
                clients: clientsRes.data || [],
                adminTasks: adminTasksRes.data || [],
                appointments: appointmentsRes.data || [],
                accountingEntries: accountingEntriesRes.data || [],
                assistants: (assistantsRes.data || []).map((a: any) => a.name),
                invoices: invoicesRes.data || [],
            };

            const validatedData = validateAndHydrate(remoteData);
            setData(validatedData);
            localStorage.setItem(getLocalStorageKey(), JSON.stringify(validatedData));
            setIsDirty(false);
            localStorage.setItem(`lawyerAppIsDirty_${currentUser.id}`, 'false');
            setSyncStatus('synced');
        } catch (error: any) {
            console.error("Error fetching data from Supabase:", error);
            const message = String(error?.message || '').toLowerCase();
            const code = String(error?.code || '');
            
            if (message.includes('failed to fetch')) {
                setSyncStatus('error');
                setLastSyncError('فشل الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.');
            } else if (message.includes('does not exist') || message.includes('could not find the table') || code === '42P01' || message.includes('schema cache')) {
                console.warn(`Database uninitialized during fetch. A table is missing. Error: ${error.message}`);
                setSyncStatus('uninitialized');
                setLastSyncError(`قاعدة البيانات غير مهيأة بالكامل. يرجى تشغيل شيفرة التهيئة.`);
            } else {
                setSyncStatus('error');
                const errorMessage = error?.message ? String(error.message) : 'حدث خطأ غير معروف أثناء جلب البيانات.';
                setLastSyncError(`خطأ في المزامنة: ${errorMessage}`);
            }
        }
    }, [userId, isOnline, offlineMode]);

    React.useEffect(() => {
        performCheckAndFetch();
    }, [performCheckAndFetch]);


    const uploadData = React.useCallback(async (currentData: AppData) => {
        const currentUser = userRef.current;
        const supabase = getSupabaseClient();
        if (offlineMode || !isOnline || !supabase || syncStatus === 'uninitialized' || !currentUser) {
            if (syncStatus === 'uninitialized') setLastSyncError('لا يمكن الحفظ، قاعدة البيانات غير مهيأة.');
            return false;
        }

        if (isSavingRef.current) return false;

        isSavingRef.current = true;
        setSyncStatus('syncing');
        setLastSyncError(null);

        const toISOStringOrNull = (date: any): string | null => (date && !isNaN(new Date(date).getTime())) ? new Date(date).toISOString() : null;
        const toISOStringOrNow = (date: any): string => (date && !isNaN(new Date(date).getTime())) ? new Date(date).toISOString() : new Date().toISOString();
        const textToNull = (val: any): string | null => (val === undefined || val === null || String(val).trim() === '') ? null : String(val);

        try {
            const clientsToUpsert = currentData.clients.map(({ cases, contactInfo, ...client }) => ({ ...client, contact_info: textToNull(contactInfo), user_id: currentUser.id }));
            const casesToUpsert = currentData.clients.flatMap(c => c.cases.map(({ stages, clientName, opponentName, feeAgreement, ...caseItem }) => ({ ...caseItem, client_id: c.id, client_name: clientName, opponent_name: textToNull(opponentName), fee_agreement: textToNull(feeAgreement), user_id: currentUser.id })));
            const stagesToUpsert = currentData.clients.flatMap(c => c.cases.flatMap(cs => cs.stages.map(({ sessions, caseNumber, firstSessionDate, decisionDate, decisionNumber, decisionSummary, decisionNotes, ...stage }) => ({ ...stage, case_id: cs.id, case_number: textToNull(caseNumber), first_session_date: toISOStringOrNull(firstSessionDate), decision_date: toISOStringOrNull(decisionDate), decision_number: textToNull(decisionNumber), decision_summary: textToNull(decisionSummary), decision_notes: textToNull(decisionNotes), user_id: currentUser.id }))));
            const sessionsToUpsert = currentData.clients.flatMap(c => c.cases.flatMap(cs => cs.stages.flatMap(st => st.sessions.map(({ caseNumber, clientName, opponentName, postponementReason, isPostponed, nextSessionDate, nextPostponementReason, date, stageId, stageDecisionDate, ...session }) => ({ ...session, stage_id: st.id, case_number: textToNull(caseNumber), client_name: clientName, opponent_name: textToNull(opponentName), postponement_reason: textToNull(postponementReason), is_postponed: isPostponed, date: toISOStringOrNow(date), next_session_date: toISOStringOrNull(nextSessionDate), next_postponement_reason: textToNull(nextPostponementReason), user_id: currentUser.id })))));
            const adminTasksToUpsert = currentData.adminTasks.map(({ dueDate, location, ...task }) => ({ ...task, due_date: toISOStringOrNow(dueDate), location: textToNull(location), user_id: currentUser.id }));
            const appointmentsToUpsert = currentData.appointments.map(({ reminderTimeInMinutes, date, ...apt }) => ({ ...apt, date: toISOStringOrNow(date), reminder_time_in_minutes: reminderTimeInMinutes, user_id: currentUser.id }));
            const accountingEntriesToUpsert = currentData.accountingEntries.map(({ clientId, caseId, clientName, date, description, ...entry }) => ({ ...entry, date: toISOStringOrNow(date), description: textToNull(description), client_id: textToNull(clientId), case_id: textToNull(caseId), client_name: clientName, user_id: currentUser.id }));
            const assistantsToUpsert = currentData.assistants.map(name => ({ name, user_id: currentUser.id }));
            const invoicesToUpsert = currentData.invoices.map(({ items, clientId, clientName, caseId, caseSubject, issueDate, dueDate, taxRate, ...inv }) => ({ ...inv, client_id: clientId, client_name: clientName, case_id: textToNull(caseId), case_subject: textToNull(caseSubject), issue_date: toISOStringOrNow(issueDate), due_date: toISOStringOrNow(dueDate), tax_rate: taxRate, user_id: currentUser.id }));
            const invoiceItemsToUpsert = currentData.invoices.flatMap(inv => inv.items.map(item => ({ ...item, invoice_id: inv.id, user_id: currentUser.id })));
            
            // --- Deletion Phase ---
            const topLevelTables = ['clients', 'admin_tasks', 'appointments', 'accounting_entries', 'assistants', 'invoices'];
            const deletePromises = topLevelTables.map(table => 
                supabase.from(table).delete().eq('user_id', currentUser.id)
            );
            const deleteResults = await Promise.all(deletePromises);
            for (const result of deleteResults) {
                if (result.error) {
                    console.error('Error during parallel delete:', result.error);
                    throw result.error;
                }
            }
            
            // --- Sequential Upsert Phase ---
            // This ensures that records with foreign key dependencies are inserted in the correct order.
            const checkResults = (results: { error: any }[], tableNames: string[]) => {
                results.forEach((result, index) => {
                    if (result.error) {
                        const error = { ...result.error, table: tableNames[index] };
                        console.error(`Error during upsert on ${tableNames[index]}:`, error);
                        throw error;
                    }
                });
            };

            // Level 1: Independent or top-level tables
            const level1Promises = [];
            const level1Tables = [];
            if (clientsToUpsert.length > 0) { level1Promises.push(supabase.from('clients').upsert(clientsToUpsert)); level1Tables.push('clients'); }
            if (assistantsToUpsert.length > 0) { level1Promises.push(supabase.from('assistants').upsert(assistantsToUpsert)); level1Tables.push('assistants'); }
            if (adminTasksToUpsert.length > 0) { level1Promises.push(supabase.from('admin_tasks').upsert(adminTasksToUpsert)); level1Tables.push('admin_tasks'); }
            if (appointmentsToUpsert.length > 0) { level1Promises.push(supabase.from('appointments').upsert(appointmentsToUpsert)); level1Tables.push('appointments'); }
            if (level1Promises.length > 0) checkResults(await Promise.all(level1Promises), level1Tables);

            // Level 2: Depend on clients
            const level2Promises = [];
            const level2Tables = [];
            if (casesToUpsert.length > 0) { level2Promises.push(supabase.from('cases').upsert(casesToUpsert)); level2Tables.push('cases'); }
            if (accountingEntriesToUpsert.length > 0) { level2Promises.push(supabase.from('accounting_entries').upsert(accountingEntriesToUpsert)); level2Tables.push('accounting_entries'); }
            if (level2Promises.length > 0) checkResults(await Promise.all(level2Promises), level2Tables);

            // Level 3: Depend on cases
            const level3Promises = [];
            const level3Tables = [];
            if (stagesToUpsert.length > 0) { level3Promises.push(supabase.from('stages').upsert(stagesToUpsert)); level3Tables.push('stages'); }
            if (invoicesToUpsert.length > 0) { level3Promises.push(supabase.from('invoices').upsert(invoicesToUpsert)); level3Tables.push('invoices'); }
            if (level3Promises.length > 0) checkResults(await Promise.all(level3Promises), level3Tables);

            // Level 4: Depend on stages and invoices
            const level4Promises = [];
            const level4Tables = [];
            if (sessionsToUpsert.length > 0) { level4Promises.push(supabase.from('sessions').upsert(sessionsToUpsert)); level4Tables.push('sessions'); }
            if (invoiceItemsToUpsert.length > 0) { level4Promises.push(supabase.from('invoice_items').upsert(invoiceItemsToUpsert)); level4Tables.push('invoice_items'); }
            if (level4Promises.length > 0) checkResults(await Promise.all(level4Promises), level4Tables);
            
            setIsDirty(false);
            localStorage.setItem(`lawyerAppIsDirty_${currentUser.id}`, 'false');
            return true;
        } catch (error: any) {
            console.error("Error saving to Supabase:", error);
            setSyncStatus('error');
            
            const message = String(error?.message || '').toLowerCase();
            if (message.includes('failed to fetch')) {
                setLastSyncError('فشل رفع البيانات: لا يمكن الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت.');
                return false;
            }
            
            let errorMessage = 'حدث خطأ غير معروف أثناء حفظ البيانات.';
            if (error && error.message) {
                errorMessage = error.message;
                if (error.table) errorMessage = `[جدول: ${error.table}] ${errorMessage}`;
                if (error.details) errorMessage += ` | التفاصيل: ${error.details}`;
                if (error.hint) errorMessage += ` | تلميح: ${error.hint}`;
            } else if (error) {
                try {
                    errorMessage = JSON.stringify(error);
                } catch {
                    errorMessage = String(error);
                }
            }
            
            setLastSyncError(`فشل رفع البيانات: ${errorMessage}`);
            return false;
        } finally {
            isSavingRef.current = false;
        }
    }, [userId, isOnline, offlineMode, syncStatus]);
    
    const manualSync = React.useCallback(async () => {
        if (!isOnline || offlineMode) return;
        const uploadSuccessful = await uploadData(data);
        if (uploadSuccessful) {
            await performCheckAndFetch();
        }
    }, [data, uploadData, performCheckAndFetch, isOnline, offlineMode]);
    
    React.useEffect(() => {
        // This effect ensures data is immediately persisted to localStorage whenever it changes.
        if (!userId) return;
        try {
            localStorage.setItem(getLocalStorageKey(), JSON.stringify(data));
            // Also persist the dirty status.
            if (isDirty) {
                localStorage.setItem(`lawyerAppIsDirty_${userId}`, 'true');
            } else {
                // Ensure the dirty flag is removed when the state is no longer dirty (e.g., after a sync).
                localStorage.removeItem(`lawyerAppIsDirty_${userId}`);
            }
        } catch (e) {
            console.error("Failed to save data to localStorage:", e);
        }
    }, [data, userId, isDirty]); // Re-run whenever data, user, or dirty state changes.

    const forceSync = React.useCallback(performCheckAndFetch, [performCheckAndFetch]);

    const createSetter = <K extends keyof AppData>(key: K) => (updater: React.SetStateAction<AppData[K]>) => {
        setData(prev => ({ ...prev, [key]: updater instanceof Function ? updater(prev[key]) : updater }));
        setIsDirty(true);
    };

    const setClients = createSetter('clients');
    const setAdminTasks = createSetter('adminTasks');
    const setAppointments = createSetter('appointments');
    const setAccountingEntries = createSetter('accountingEntries');
    const setInvoices = createSetter('invoices');
    const setAssistants = createSetter('assistants');

    const setFullData = (newData: any) => {
        const validatedData = validateAndHydrate(newData);
        setData(validatedData);
        setIsDirty(true);
    };

    const allSessions = React.useMemo(() => {
        return data.clients.flatMap(client =>
            client.cases.flatMap(caseItem =>
                caseItem.stages.flatMap(stage =>
                    stage.sessions.map(session => ({ ...session, stageId: stage.id, stageDecisionDate: stage.decisionDate }))
                )
            )
        );
    }, [data.clients]);

    return {
        clients: data.clients,
        adminTasks: data.adminTasks,
        appointments: data.appointments,
        accountingEntries: data.accountingEntries,
        invoices: data.invoices,
        assistants: data.assistants,
        setClients,
        setAdminTasks,
        setAppointments,
        setAccountingEntries,
        setInvoices,
        setAssistants,
        allSessions,
        setFullData,
        syncStatus,
        forceSync,
        manualSync,
        lastSyncError,
        isDirty,
    };
};