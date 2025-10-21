import * as React from 'react';
import { Client, Session, AdminTask, Appointment, AccountingEntry, Case, Stage, Invoice, InvoiceItem } from '../types';
import { useOnlineStatus } from './useOnlineStatus';
import { User } from '@supabase/supabase-js';
import { AppData as OnlineAppData } from './useOnlineData';
import { useSync, SyncStatus as SyncStatusType } from './useSync';

export const APP_DATA_KEY = 'lawyerBusinessManagementData';
export type SyncStatus = SyncStatusType;

export type AppData = {
    clients: Client[];
    adminTasks: AdminTask[];
    appointments: Appointment[];
    accountingEntries: AccountingEntry[];
    invoices: Invoice[];
    assistants: string[];
};

const defaultAssistants = ['أحمد', 'فاطمة', 'سارة', 'بدون تخصيص'];

const getInitialData = (): AppData => ({
    clients: [] as Client[],
    adminTasks: [] as AdminTask[],
    appointments: [] as Appointment[],
    accountingEntries: [] as AccountingEntry[],
    invoices: [] as Invoice[],
    assistants: [...defaultAssistants],
});


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
    const userId = user?.id;

    const [data, setData] = React.useState<AppData>(getInitialData);
    const [syncStatus, setSyncStatus] = React.useState<SyncStatus>('loading');
    const [lastSyncError, setLastSyncError] = React.useState<string | null>(null);
    const [isDirty, setIsDirty] = React.useState(false);
    
    const isOnline = useOnlineStatus();

    React.useEffect(() => {
        if (!userId) {
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
    }, [userId]);

    const handleDataFetched = React.useCallback((fetchedData: any) => {
        if (fetchedData === null) {
            setData(getInitialData());
            return;
        }
        const validatedData = validateAndHydrate({
            ...fetchedData,
            assistants: fetchedData.assistants.map((a: any) => a.name),
        });
        setData(validatedData);
        if (userId) {
            localStorage.setItem(`${APP_DATA_KEY}_${userId}`, JSON.stringify(validatedData));
        }
    }, [userId]);
    
    const handleSyncStatusChange = React.useCallback((status: SyncStatus, error: string | null) => {
        setSyncStatus(status);
        setLastSyncError(error);
    }, []);

    const handleSyncSuccess = React.useCallback(() => {
        setIsDirty(false);
        if (userId) {
            localStorage.setItem(`lawyerAppIsDirty_${userId}`, 'false');
        }
    }, [userId]);

    const { forceSync, manualSync } = useSync({
        user,
        currentData: data,
        onDataFetched: handleDataFetched,
        onSyncStatusChange: handleSyncStatusChange,
        onSyncSuccess: handleSyncSuccess,
        isOnline,
        offlineMode,
    });
    
    React.useEffect(() => {
        if (!userId) return;
        try {
            localStorage.setItem(getLocalStorageKey(), JSON.stringify(data));
            if (isDirty) {
                localStorage.setItem(`lawyerAppIsDirty_${userId}`, 'true');
            } else {
                localStorage.removeItem(`lawyerAppIsDirty_${userId}`);
            }
        } catch (e) {
            console.error("Failed to save data to localStorage:", e);
        }
    }, [data, userId, isDirty]);

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
                    stage.sessions.map(session => ({
                        ...session,
                        stageId: stage.id,
                        stageDecisionDate: stage.decisionDate,
                    }))
                )
            )
        );
    }, [data.clients]);

    return {
        ...data,
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