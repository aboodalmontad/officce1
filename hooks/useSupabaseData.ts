import * as React from 'react';
import { Client, Session, AdminTask, Appointment, AccountingEntry, Case, Stage, Invoice, InvoiceItem } from '../types';
import { useOnlineStatus } from './useOnlineStatus';
import { User } from '@supabase/supabase-js';
import { AppData as OnlineAppData } from './useOnlineData';
import { useSync, SyncStatus as SyncStatusType } from './useSync';
import { getSupabaseClient } from '../supabaseClient';
import { isBeforeToday } from '../utils/dateUtils';
import { openDB, IDBPDatabase } from 'idb';


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

export type DeletedIds = {
    clients: string[];
    cases: string[];
    stages: string[];
    sessions: string[];
    adminTasks: string[];
    appointments: string[];
    accountingEntries: string[];
    invoices: string[];
    invoiceItems: string[];
    assistants: string[];
};
const getInitialDeletedIds = (): DeletedIds => ({
    clients: [], cases: [], stages: [], sessions: [], adminTasks: [], appointments: [], accountingEntries: [], invoices: [], invoiceItems: [], assistants: []
});


const defaultAssistants = ['أحمد', 'فاطمة', 'سارة', 'بدون تخصيص'];

const getInitialData = (): AppData => ({
    clients: [] as Client[],
    adminTasks: [] as AdminTask[],
    appointments: [] as Appointment[],
    accountingEntries: [] as AccountingEntry[],
    invoices: [] as Invoice[],
    assistants: [...defaultAssistants],
});


// --- IndexedDB Setup ---
const DB_NAME = 'LawyerAppData';
const DB_VERSION = 1;
const DATA_STORE_NAME = 'appData';

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(DATA_STORE_NAME)) {
        db.createObjectStore(DATA_STORE_NAME);
      }
    },
  });
}


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
    return arr.filter(item => item && typeof item === 'object').map(mapFn);
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

    const validatedClients: Client[] = safeArray(data.clients, (client: any, index: number): Client => ({
        id: client.id || `client-${Date.now()}-${index}`,
        name: String(client.name || 'موكل غير مسمى'),
        contactInfo: String((client.contact_info ?? client.contactInfo) || ''),
        updated_at: sanitizeOptionalDate(client.updated_at),
        cases: safeArray(client.cases, (caseItem: any, caseIndex: number): Case => ({
            id: caseItem.id || `case-${Date.now()}-${caseIndex}`,
            subject: String(caseItem.subject || 'قضية بدون موضوع'),
            clientName: String((caseItem.client_name ?? caseItem.clientName) || client.name || 'موكل غير مسمى'),
            opponentName: sanitizeString(caseItem.opponent_name ?? caseItem.opponentName),
            feeAgreement: String((caseItem.fee_agreement ?? caseItem.feeAgreement) || ''),
            status: ['active', 'closed', 'on_hold'].includes(caseItem.status) ? caseItem.status : 'active',
            updated_at: sanitizeOptionalDate(caseItem.updated_at),
            stages: safeArray(caseItem.stages, (stage: any, stageIndex: number): Stage => ({
                id: stage.id || `stage-${Date.now()}-${stageIndex}`,
                court: String(stage.court || 'محكمة غير محددة'),
                caseNumber: sanitizeString(stage.case_number ?? stage.caseNumber),
                firstSessionDate: sanitizeOptionalDate(stage.first_session_date ?? stage.firstSessionDate),
                updated_at: sanitizeOptionalDate(stage.updated_at),
                sessions: safeArray(stage.sessions, (session: any, sessionIndex: number): Session | null => {
                    const sessionDate = session.date ? new Date(session.date) : null;
                    if (!sessionDate || isNaN(sessionDate.getTime())) {
                        console.warn('Filtering out session with invalid date:', session);
                        return null;
                    }
                    return {
                        id: session.id || `session-${Date.now()}-${sessionIndex}`,
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
                        updated_at: sanitizeOptionalDate(session.updated_at),
                    };
                }).filter((s): s is Session => s !== null),
                decisionDate: sanitizeOptionalDate(stage.decision_date ?? stage.decisionDate),
                decisionNumber: sanitizeString(stage.decision_number ?? stage.decisionNumber),
                decisionSummary: sanitizeString(stage.decision_summary ?? stage.decisionSummary),
                decisionNotes: sanitizeString(stage.decision_notes ?? stage.decisionNotes),
            })),
        })),
    }));

    const validatedAdminTasks: AdminTask[] = safeArray(data.adminTasks, (task: any, index: number): AdminTask | null => {
        const dueDate = (task.due_date ?? task.dueDate) ? new Date(task.due_date ?? task.dueDate) : null;
        if (!dueDate || isNaN(dueDate.getTime())) {
            console.warn('Filtering out admin task with invalid due date:', task);
            return null;
        }
        return {
            id: task.id || `task-${Date.now()}-${index}`,
            task: String(task.task || 'مهمة بدون عنوان'),
            dueDate: dueDate,
            completed: typeof task.completed === 'boolean' ? task.completed : false,
            importance: ['normal', 'important', 'urgent'].includes(task.importance) ? task.importance : 'normal',
            assignee: isValidAssistant(task.assignee) ? task.assignee : defaultAssignee,
            location: sanitizeString(task.location),
            updated_at: sanitizeOptionalDate(task.updated_at),
        };
    }).filter((t): t is AdminTask => t !== null);

    const validatedAppointments: Appointment[] = safeArray(data.appointments, (apt: any, index: number): Appointment | null => {
        const aptDate = apt.date ? new Date(apt.date) : null;
        if (!aptDate || isNaN(aptDate.getTime())) {
            console.warn('Filtering out appointment with invalid date:', apt);
            return null;
        }
        return {
            id: apt.id || `apt-${Date.now()}-${index}`,
            title: String(apt.title || 'موعد بدون عنوان'),
            time: typeof apt.time === 'string' && /^\d{2}:\d{2}$/.test(apt.time) ? apt.time : '00:00',
            date: aptDate,
            importance: ['normal', 'important', 'urgent'].includes(apt.importance) ? apt.importance : 'normal',
            completed: 'completed' in apt ? !!apt.completed : false,
            notified: typeof apt.notified === 'boolean' ? apt.notified : false,
            reminderTimeInMinutes: typeof (apt.reminder_time_in_minutes ?? apt.reminderTimeInMinutes) === 'number' ? (apt.reminder_time_in_minutes ?? apt.reminderTimeInMinutes) : undefined,
            assignee: isValidAssistant(apt.assignee) ? apt.assignee : defaultAssignee,
            updated_at: sanitizeOptionalDate(apt.updated_at),
        };
    }).filter((a): a is Appointment => a !== null);
    
    const validatedAccountingEntries: AccountingEntry[] = safeArray(data.accountingEntries, (entry: any, index: number): AccountingEntry | null => {
        const entryDate = sanitizeOptionalDate(entry.date);
        if (!entryDate) {
            console.warn('Filtering out accounting entry with invalid date:', entry);
            return null;
        }
        return {
            id: entry.id || `acc-${Date.now()}-${index}`,
            type: ['income', 'expense'].includes(entry.type) ? entry.type : 'income',
            amount: typeof entry.amount === 'number' ? entry.amount : 0,
            date: entryDate,
            description: String(entry.description || ''),
            clientId: String((entry.client_id ?? entry.clientId) || ''),
            caseId: String((entry.case_id ?? entry.caseId) || ''),
            clientName: String((entry.client_name ?? entry.clientName) || ''),
            updated_at: sanitizeOptionalDate(entry.updated_at),
        };
    }).filter((e): e is AccountingEntry => e !== null);

    const validatedInvoices: Invoice[] = safeArray(data.invoices, (invoice: any, index: number): Invoice | null => {
        const issueDate = sanitizeOptionalDate(invoice.issue_date ?? invoice.issueDate);
        const dueDate = sanitizeOptionalDate(invoice.due_date ?? invoice.dueDate);

        if (!issueDate || !dueDate) {
            console.warn('Filtering out invoice with invalid date(s):', invoice);
            return null;
        }

        return {
            id: invoice.id || `inv-${Date.now()}-${index}`,
            clientId: String((invoice.client_id ?? invoice.clientId) || ''),
            clientName: String((invoice.client_name ?? invoice.clientName) || ''),
            caseId: sanitizeString(invoice.case_id ?? invoice.caseId),
            caseSubject: sanitizeString(invoice.case_subject ?? invoice.caseSubject),
            issueDate: issueDate,
            dueDate: dueDate,
            updated_at: sanitizeOptionalDate(invoice.updated_at),
            items: safeArray(invoice.invoice_items ?? invoice.items, (item: any, itemIndex: number): InvoiceItem => ({
                id: item.id || `item-${Date.now()}-${itemIndex}`,
                description: String(item.description || ''),
                amount: typeof item.amount === 'number' ? item.amount : 0,
                updated_at: sanitizeOptionalDate(item.updated_at),
            })),
            taxRate: typeof (invoice.tax_rate ?? invoice.taxRate) === 'number' ? (invoice.tax_rate ?? invoice.taxRate) : 0,
            discount: typeof invoice.discount === 'number' ? invoice.discount : 0,
            status: ['draft', 'sent', 'paid', 'overdue'].includes(invoice.status) ? invoice.status : 'draft',
            notes: sanitizeString(invoice.notes),
        };
    }).filter((i): i is Invoice => i !== null);

    return { 
        clients: validatedClients, 
        adminTasks: validatedAdminTasks, 
        appointments: validatedAppointments, 
        accountingEntries: validatedAccountingEntries,
        invoices: validatedInvoices,
        assistants: validatedAssistants,
    };
};

function usePrevious<T>(value: T): T | undefined {
  // FIX: Explicitly provide `undefined` as the initial value to `useRef` and type the ref to allow `undefined`.
  // This resolves the "Expected 1 arguments, but got 0" error which can occur with older React type definitions.
  const ref = React.useRef<T | undefined>(undefined);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

export const useSupabaseData = (user: User | null, isAuthLoading: boolean) => {
    const getLocalStorageKey = React.useCallback(() => user ? `${APP_DATA_KEY}_${user.id}` : APP_DATA_KEY, [user]);
    const userId = user?.id;

    // Initialize state by calling the function to get the initial data object.
    // This ensures we start with a fresh object and avoids potential issues with React's functional updates.
    const [data, setData] = React.useState<AppData>(getInitialData());
    const dataRef = React.useRef(data);
    dataRef.current = data;
    
    const [deletedIds, setDeletedIds] = React.useState<DeletedIds>(getInitialDeletedIds());
    const [isDataLoading, setIsDataLoading] = React.useState(true);
    const [syncStatus, setSyncStatus] = React.useState<SyncStatus>('loading');
    const [lastSyncError, setLastSyncError] = React.useState<string | null>(null);
    const [isDirty, setIsDirty] = React.useState(false);
    const [isAutoSyncEnabled, setIsAutoSyncEnabled] = React.useState(true);
    const [isAutoBackupEnabled, setIsAutoBackupEnabled] = React.useState(true);
    const [triggeredAlerts, setTriggeredAlerts] = React.useState<Appointment[]>([]);
    const [showUnpostponedSessionsModal, setShowUnpostponedSessionsModal] = React.useState(false);
    
    const hadCacheOnLoad = React.useRef(false);
    
    const isOnline = useOnlineStatus();
    const prevIsOnline = usePrevious(isOnline);
    const prevIsAuthLoading = usePrevious(isAuthLoading);

    const isDirtyRef = React.useRef(isDirty);
    isDirtyRef.current = isDirty;
    const isAutoSyncEnabledRef = React.useRef(isAutoSyncEnabled);
    isAutoSyncEnabledRef.current = isAutoSyncEnabled;
    const isAutoBackupEnabledRef = React.useRef(isAutoBackupEnabled);
    isAutoBackupEnabledRef.current = isAutoBackupEnabled;

    const onDeletionsSynced = React.useCallback((syncedDeletions: Partial<DeletedIds>) => {
        setDeletedIds(prev => {
            const newDeleted = { ...prev };
            for (const key of Object.keys(syncedDeletions) as (keyof DeletedIds)[]) {
                const syncedSet = new Set((syncedDeletions[key] || []).map((item: any) => item.id || item.name));
                if (syncedSet.size > 0) {
                     newDeleted[key] = (prev[key] || []).filter(id => !syncedSet.has(id));
                }
            }
            return newDeleted;
        });
    }, []);

    const handleDataSynced = React.useCallback(async (syncedData: AppData) => {
        const validatedData = validateAndHydrate(syncedData);
        setData(validatedData);
        if (userId) {
            try {
                const db = await getDb();
                await db.put(DATA_STORE_NAME, validatedData, `${APP_DATA_KEY}_${userId}`);
                setIsDirty(false);
                localStorage.setItem(`lawyerAppIsDirty_${userId}`, 'false');
                console.log('Synced data saved to IndexedDB.');
            } catch (e) {
                console.error('Failed to save synced data to IndexedDB', e);
            }
        }
    }, [userId]);
    
    const handleSyncStatusChange = React.useCallback((status: SyncStatus, error: string | null) => {
        setSyncStatus(status);
        setLastSyncError(error);
    }, [setSyncStatus, setLastSyncError]);

    const { manualSync, fetchAndRefresh } = useSync({
        user,
        localData: data,
        deletedIds,
        onDataSynced: handleDataSynced,
        onDeletionsSynced,
        onSyncStatusChange: handleSyncStatusChange,
        isOnline,
        isAuthLoading,
    });
    
    const manualSyncRef = React.useRef(manualSync);
    const fetchAndRefreshRef = React.useRef(fetchAndRefresh);

    React.useEffect(() => {
        manualSyncRef.current = manualSync;
        fetchAndRefreshRef.current = fetchAndRefresh;
    }, [manualSync, fetchAndRefresh]);
    
    React.useEffect(() => {
        // This effect handles loading from cache when the user changes.
        if (!userId) {
            setData(getInitialData());
            setDeletedIds(getInitialDeletedIds());
            setIsDirty(false);
            setSyncStatus('loading');
            setIsDataLoading(false);
            setIsAutoSyncEnabled(true);
            setIsAutoBackupEnabled(true);
            hadCacheOnLoad.current = false;
            return;
        }

        setIsDataLoading(true);
        setSyncStatus('loading');
        
        const loadLocalData = async () => {
            try {
                const db = await getDb();
                const rawData = await db.get(DATA_STORE_NAME, getLocalStorageKey());

                // Keep flags in localStorage as they are small and simple.
                const rawDeleted = localStorage.getItem(`lawyerAppDeletedIds_${userId}`);
                setDeletedIds(rawDeleted ? JSON.parse(rawDeleted) : getInitialDeletedIds());
                const autoSyncEnabled = localStorage.getItem(`lawyerAppAutoSyncEnabled_${userId}`);
                setIsAutoSyncEnabled(autoSyncEnabled === null ? true : autoSyncEnabled === 'true');
                const autoBackupEnabled = localStorage.getItem(`lawyerAppAutoBackupEnabled_${userId}`);
                setIsAutoBackupEnabled(autoBackupEnabled === null ? true : autoBackupEnabled === 'true');

                if (rawData) {
                    const parsedData = rawData; // Already an object from IDB
                    const isEffectivelyEmpty =
                        !parsedData ||
                        (Array.isArray(parsedData.clients) && parsedData.clients.length === 0 &&
                        Array.isArray(parsedData.adminTasks) && parsedData.adminTasks.length === 0 &&
                        Array.isArray(parsedData.appointments) && parsedData.appointments.length === 0 &&
                        Array.isArray(parsedData.accountingEntries) && parsedData.accountingEntries.length === 0 &&
                        Array.isArray(parsedData.invoices) && parsedData.invoices.length === 0);
        
                    if (isEffectivelyEmpty) {
                        hadCacheOnLoad.current = false;
                        console.log("Local IndexedDB data found but is empty. Will perform initial pull.");
                        setData(getInitialData());
                    } else {
                        setData(validateAndHydrate(parsedData));
                        const isLocallyDirty = localStorage.getItem(`lawyerAppIsDirty_${userId}`) === 'true';
                        setIsDirty(isLocallyDirty);
                        setSyncStatus('synced'); // Optimistic status
                        hadCacheOnLoad.current = true;
                        console.log("Hydrated state from IndexedDB.");
                    }
                } else {
                    hadCacheOnLoad.current = false;
                    console.log("No local IndexedDB data found. Will perform initial pull.");
                }
            } catch (error) {
                console.error("Error loading cached data from IndexedDB:", error);
                setSyncStatus('error');
                setLastSyncError('خطأ في تحميل البيانات المحلية.');
                hadCacheOnLoad.current = false;
            } finally {
                setIsDataLoading(false);
            }
        };

        loadLocalData();
    }, [userId, getLocalStorageKey]);

    React.useEffect(() => {
        // This effect is the primary trigger for synchronization logic, specifically
        // designed to handle the race condition on internet reconnection.

        // We only want to act when authentication loading is complete.
        if (isAuthLoading || isDataLoading || !userId) {
            return;
        }

        // Condition 1: Authentication just finished (transitioned from true to false).
        // This is the key to solving the race condition.
        const authJustFinished = prevIsAuthLoading === true && isAuthLoading === false;

        if (authJustFinished && isOnline) {
            console.log("Authentication has just completed while online. Triggering sync.");
            // We perform a full sync. If we started with no local data, treat it as an initial pull.
            manualSyncRef.current(!hadCacheOnLoad.current);
        } else if (!isOnline && !hadCacheOnLoad.current) {
            // Condition 2: We are offline and started with no cached data. Show an error.
            setSyncStatus('error');
            setLastSyncError('أنت غير متصل ولا توجد بيانات محلية. يرجى الاتصال بالإنترنت للمزامنة الأولية.');
        }
    }, [isAuthLoading, prevIsAuthLoading, isOnline, isDataLoading, userId]);

    React.useEffect(() => {
        // This effect specifically handles the app reconnecting to the internet.
        const justCameOnline = prevIsOnline === false && isOnline === true;
        let syncOnReconnectTimeout: number | null = null;

        if (justCameOnline && userId && !isAuthLoading && !isDataLoading) {
            console.log('Application reconnected to the internet. Scheduling sync...');
            
            // Schedule the sync after a short delay (e.g., 1.5 seconds) to allow Supabase's auth client
            // to re-establish its connection and refresh tokens if necessary. This helps prevent race conditions.
            syncOnReconnectTimeout = window.setTimeout(() => {
                console.log('Executing scheduled sync on reconnection.');
                
                if (isAutoSyncEnabledRef.current) {
                    if (isDirtyRef.current) {
                        console.log('Local changes detected. Performing full sync.');
                        manualSyncRef.current();
                    } else {
                        console.log('No local changes. Performing a safe refresh from server.');
                        fetchAndRefreshRef.current();
                    }
                } else {
                     console.log('Auto-sync is disabled. Skipping sync on reconnection.');
                }
            }, 1500); // 1.5 second delay
        }

        // Cleanup function to clear the timeout if the component unmounts or dependencies change
        // before the timeout has executed.
        return () => {
            if (syncOnReconnectTimeout) {
                clearTimeout(syncOnReconnectTimeout);
            }
