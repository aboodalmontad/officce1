import * as React from 'react';
import { Client, Session, AdminTask, Appointment, AccountingEntry, Case, Stage, Invoice, InvoiceItem } from '../types';
import { useOnlineStatus } from './useOnlineStatus';
import { User } from '@supabase/supabase-js';
import { AppData as OnlineAppData } from './useOnlineData';
import { useSync, SyncStatus as SyncStatusType } from './useSync';
import { getSupabaseClient } from '../supabaseClient';
import { isBeforeToday } from '../utils/dateUtils';


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

    const handleDataSynced = React.useCallback((syncedData: AppData) => {
        const validatedData = validateAndHydrate(syncedData);
        setData(validatedData);
        if (userId) {
            localStorage.setItem(`${APP_DATA_KEY}_${userId}`, JSON.stringify(validatedData));
            setIsDirty(false);
            localStorage.setItem(`lawyerAppIsDirty_${userId}`, 'false');
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
        // It's separate to ensure data is loaded before any sync logic runs.
        if (!userId) {
            // When there's no user, reset to a clean initial state.
            setData(getInitialData());
            setDeletedIds(getInitialDeletedIds());
            setIsDirty(false);
            setSyncStatus('loading'); // Or another appropriate default state
            setIsDataLoading(false); // Correctly reflect that no data is being loaded.
            setIsAutoSyncEnabled(true);
            setIsAutoBackupEnabled(true);
            hadCacheOnLoad.current = false;
            return;
        }
    
        setIsDataLoading(true);
        setSyncStatus('loading');
        
        try {
            const rawData = localStorage.getItem(getLocalStorageKey());
            const rawDeleted = localStorage.getItem(`lawyerAppDeletedIds_${userId}`);
            setDeletedIds(rawDeleted ? JSON.parse(rawDeleted) : getInitialDeletedIds());
            const autoSyncEnabled = localStorage.getItem(`lawyerAppAutoSyncEnabled_${userId}`);
            setIsAutoSyncEnabled(autoSyncEnabled === null ? true : autoSyncEnabled === 'true');
            const autoBackupEnabled = localStorage.getItem(`lawyerAppAutoBackupEnabled_${userId}`);
            setIsAutoBackupEnabled(autoBackupEnabled === null ? true : autoBackupEnabled === 'true');

            if (rawData) {
                const parsedData = JSON.parse(rawData);
                const isEffectivelyEmpty =
                    !parsedData ||
                    (Array.isArray(parsedData.clients) && parsedData.clients.length === 0 &&
                    Array.isArray(parsedData.adminTasks) && parsedData.adminTasks.length === 0 &&
                    Array.isArray(parsedData.appointments) && parsedData.appointments.length === 0 &&
                    Array.isArray(parsedData.accountingEntries) && parsedData.accountingEntries.length === 0 &&
                    Array.isArray(parsedData.invoices) && parsedData.invoices.length === 0);
    
                if (isEffectivelyEmpty) {
                    hadCacheOnLoad.current = false;
                    console.log("Local cache found but is empty. Will perform initial pull.");
                    setData(getInitialData()); // Ensure state is clean
                } else {
                    setData(validateAndHydrate(parsedData));
                    const isLocallyDirty = localStorage.getItem(`lawyerAppIsDirty_${userId}`) === 'true';
                    setIsDirty(isLocallyDirty);
                    setSyncStatus('synced'); // Optimistic status
                    hadCacheOnLoad.current = true;
                    console.log("Hydrated state from local storage.");
                }
            } else {
                hadCacheOnLoad.current = false;
                console.log("No local cache found. Will perform initial pull.");
            }
        } catch (error) {
            console.error("Error loading cached data:", error);
            setSyncStatus('error');
            setLastSyncError('خطأ في تحميل البيانات المحلية.');
            hadCacheOnLoad.current = false;
        } finally {
            setIsDataLoading(false); // Signal that loading is complete
        }
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
        };
    }, [isOnline, prevIsOnline, userId, isAuthLoading, isDataLoading]);
    
    React.useEffect(() => {
        if (!isDirty || !isOnline || isDataLoading || isAuthLoading || syncStatus === 'syncing' || syncStatus === 'uninitialized' || syncStatus === 'unconfigured' || !isAutoSyncEnabled) {
            return;
        }

        const syncTimeout = window.setTimeout(() => {
            console.log('Debounced change detected, triggering auto-sync.');
            manualSyncRef.current();
        }, 1500);

        return () => {
            if (syncTimeout) {
                window.clearTimeout(syncTimeout);
            }
        };
    }, [isDirty, isOnline, isDataLoading, isAuthLoading, syncStatus, data, isAutoSyncEnabled]);

    const syncTimeoutRef = React.useRef<number | null>(null);

    React.useEffect(() => {
        if (!isOnline || !userId || isAuthLoading) return;

        const supabase = getSupabaseClient();
        if (!supabase) return;

        const debouncedRefresh = () => {
            if (syncTimeoutRef.current !== null) {
                window.clearTimeout(syncTimeoutRef.current);
            }
            syncTimeoutRef.current = window.setTimeout(() => {
                console.log('Realtime change detected, triggering refresh.');
                fetchAndRefreshRef.current();
            }, 1500);
        };

        const channel = supabase.channel('public-data-changes')
            .on('postgres_changes', 
                { event: '*', schema: 'public' }, 
                debouncedRefresh
            )
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    console.log('Successfully subscribed to realtime changes.');
                }
                if (err) {
                    console.error('Realtime subscription error:', err);
                    handleSyncStatusChange('error', 'فشل الاتصال بالتحديثات الفورية.');
                }
            });

        return () => {
            console.log('Unsubscribing from realtime changes.');
            if (syncTimeoutRef.current !== null) {
                window.clearTimeout(syncTimeoutRef.current);
                syncTimeoutRef.current = null;
            }
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [isOnline, userId, isAuthLoading, handleSyncStatusChange]);


    React.useEffect(() => {
        if (!userId || isDataLoading) return;
        try {
            localStorage.setItem(getLocalStorageKey(), JSON.stringify(data));
            localStorage.setItem(`lawyerAppDeletedIds_${userId}`, JSON.stringify(deletedIds));
            localStorage.setItem(`lawyerAppAutoSyncEnabled_${userId}`, String(isAutoSyncEnabled));
            localStorage.setItem(`lawyerAppAutoBackupEnabled_${userId}`, String(isAutoBackupEnabled));
            if (isDirty) {
                localStorage.setItem(`lawyerAppIsDirty_${userId}`, 'true');
            } else {
                localStorage.removeItem(`lawyerAppIsDirty_${userId}`);
            }
        } catch (e) {
            console.error("Failed to save data to localStorage:", e);
        }
    }, [data, deletedIds, userId, isDirty, getLocalStorageKey, isAutoSyncEnabled, isAutoBackupEnabled, isDataLoading]);

    // New useEffect for daily backup
    React.useEffect(() => {
        if (isDataLoading || !userId) {
            return;
        }

        const performBackupCheck = () => {
            if (!isAutoBackupEnabledRef.current) {
                console.log('Daily automatic backup is disabled by the user.');
                return;
            }

            const LAST_BACKUP_KEY = `lawyerAppLastBackupTimestamp_${userId}`;
            const todayString = new Date().toISOString().split('T')[0];

            try {
                const lastBackupTimestamp = localStorage.getItem(LAST_BACKUP_KEY);
                const parsedTimestamp = lastBackupTimestamp ? parseInt(lastBackupTimestamp, 10) : NaN;
                const lastBackupDateString = !isNaN(parsedTimestamp) ? new Date(parsedTimestamp).toISOString().split('T')[0] : null;

                if (lastBackupDateString === todayString) {
                    console.log('Daily backup already performed today.');
                    return;
                }

                const currentData = dataRef.current; 

                const isDataEffectivelyEmpty =
                    !currentData ||
                    (Array.isArray(currentData.clients) && currentData.clients.length === 0 &&
                    Array.isArray(currentData.adminTasks) && currentData.adminTasks.length === 0 &&
                    Array.isArray(currentData.appointments) && currentData.appointments.length === 0 &&
                    Array.isArray(currentData.accountingEntries) && currentData.accountingEntries.length === 0 &&
                    Array.isArray(currentData.invoices) && currentData.invoices.length === 0);

                if (isDataEffectivelyEmpty) {
                    console.log('No data to back up. Skipping daily backup.');
                    localStorage.setItem(LAST_BACKUP_KEY, Date.now().toString());
                    return;
                }

                console.log('Performing daily automatic backup...');

                const dataToBackup = JSON.stringify(currentData, null, 2);
                const blob = new Blob([dataToBackup], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `lawyer_app_backup_${todayString}.json`;
                
                document.body.appendChild(a);
                a.click();
                
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                localStorage.setItem(LAST_BACKUP_KEY, Date.now().toString());
                console.log('Daily backup complete.');

            } catch (error) {
                console.error('Failed to perform daily automatic backup:', error);
            }
        };
        
        performBackupCheck();

    }, [isDataLoading, userId]);
    
    const setClients = React.useCallback((updater: React.SetStateAction<Client[]>) => {
        setData(prev => ({ ...prev, clients: updater instanceof Function ? updater(prev.clients) : updater }));
        setIsDirty(true);
    }, [setData, setIsDirty]);

    const setAdminTasks = React.useCallback((updater: React.SetStateAction<AdminTask[]>) => {
        setData(prev => ({ ...prev, adminTasks: updater instanceof Function ? updater(prev.adminTasks) : updater }));
        setIsDirty(true);
    }, [setData, setIsDirty]);

    const setAppointments = React.useCallback((updater: React.SetStateAction<Appointment[]>) => {
        setData(prev => ({ ...prev, appointments: updater instanceof Function ? updater(prev.appointments) : updater }));
        setIsDirty(true);
    }, [setData, setIsDirty]);

    const setAccountingEntries = React.useCallback((updater: React.SetStateAction<AccountingEntry[]>) => {
        setData(prev => ({ ...prev, accountingEntries: updater instanceof Function ? updater(prev.accountingEntries) : updater }));
        setIsDirty(true);
    }, [setData, setIsDirty]);

    const setInvoices = React.useCallback((updater: React.SetStateAction<Invoice[]>) => {
        setData(prev => ({ ...prev, invoices: updater instanceof Function ? updater(prev.invoices) : updater }));
        setIsDirty(true);
    }, [setData, setIsDirty]);

    const setAssistants = React.useCallback((updater: React.SetStateAction<string[]>) => {
        setData(prev => ({ ...prev, assistants: updater instanceof Function ? updater(prev.assistants) : updater }));
        setIsDirty(true);
    }, [setData, setIsDirty]);

    const setFullData = React.useCallback((fullData: AppData) => {
        setData(validateAndHydrate(fullData));
        setIsDirty(true);
    }, [setData, setIsDirty]);
    
    const setAutoSyncEnabled = React.useCallback((enabled: boolean) => {
        setIsAutoSyncEnabled(enabled);
    }, []);

    const setAutoBackupEnabled = React.useCallback((enabled: boolean) => {
        setIsAutoBackupEnabled(enabled);
    }, []);

    // --- Notification Logic ---
    const dismissAlert = React.useCallback((appointmentId: string) => {
        setTriggeredAlerts(prev => prev.filter(a => a.id !== appointmentId));
    }, []);

    React.useEffect(() => {
        const checkReminders = () => {
            const now = new Date();
            const upcomingAlerts: Appointment[] = [];
            
            // Use a functional update to ensure we're working with the latest state
            setData(currentData => {
                const updatedAppointments = currentData.appointments.map(apt => {
                    if (apt.completed || apt.notified || !apt.reminderTimeInMinutes) {
                        return apt;
                    }

                    const [hours, minutes] = apt.time.split(':').map(Number);
                    const appointmentDateTime = new Date(apt.date);
                    appointmentDateTime.setHours(hours, minutes, 0, 0);

                    const reminderTime = new Date(appointmentDateTime.getTime() - apt.reminderTimeInMinutes * 60000);

                    if (now >= reminderTime && now < appointmentDateTime) {
                        upcomingAlerts.push(apt);
                        return { ...apt, notified: true, updated_at: new Date() }; // Mark as notified
                    }

                    return apt;
                });
                
                if (upcomingAlerts.length > 0) {
                    setTriggeredAlerts(prev => {
                        const existingIds = new Set(prev.map(a => a.id));
                        const newAlerts = upcomingAlerts.filter(a => !existingIds.has(a.id));
                        return [...prev, ...newAlerts];
                    });
                    setIsDirty(true);
                    return { ...currentData, appointments: updatedAppointments };
                }

                return currentData; // No changes needed
            });
        };

        const intervalId = setInterval(checkReminders, 30 * 1000); // Check every 30 seconds
        checkReminders(); // Run once on mount

        return () => clearInterval(intervalId);
    }, [setData, setIsDirty]);


    const trackDeletion = React.useCallback((type: keyof DeletedIds, id: string) => {
        setDeletedIds(prev => ({
            ...prev,
            [type]: [...new Set([...(prev[type] || []), id])]
        }));
        setIsDirty(true);
    }, [setDeletedIds, setIsDirty]);

    const deleteClient = React.useCallback((clientId: string) => {
        const client = dataRef.current.clients.find(c => c.id === clientId);
        if (!client) return;
    
        const caseIdsToDelete = client.cases.map(c => c.id);
        const stageIdsToDelete = client.cases.flatMap(c => c.stages.map(s => s.id));
        const sessionIdsToDelete = client.cases.flatMap(c => c.stages.flatMap(s => s.sessions.map(sess => sess.id)));
    
        setAccountingEntries(prev => prev.filter(e => e.clientId !== clientId && !caseIdsToDelete.includes(e.caseId)));
        setClients(prev => prev.filter(c => c.id !== clientId));
    
        trackDeletion('clients', clientId);
        caseIdsToDelete.forEach(id => trackDeletion('cases', id));
        stageIdsToDelete.forEach(id => trackDeletion('stages', id));
        sessionIdsToDelete.forEach(id => trackDeletion('sessions', id));
    
    }, [setAccountingEntries, setClients, trackDeletion]);

    const deleteCase = React.useCallback((caseId: string, clientId: string) => {
        const client = dataRef.current.clients.find(c => c.id === clientId);
        const caseToDelete = client?.cases.find(c => c.id === caseId);
        if(!caseToDelete) return;

        const stageIdsToDelete = caseToDelete.stages.map(s => s.id);
        const sessionIdsToDelete = caseToDelete.stages.flatMap(s => s.sessions.map(sess => sess.id));

        setAccountingEntries(prev => prev.filter(e => e.caseId !== caseId));
        setClients(prev => prev.map(c => c.id === clientId ? { ...c, cases: c.cases.filter(cs => cs.id !== caseId), updated_at: new Date() } : c));
        
        trackDeletion('cases', caseId);
        stageIdsToDelete.forEach(id => trackDeletion('stages', id));
        sessionIdsToDelete.forEach(id => trackDeletion('sessions', id));
    }, [setAccountingEntries, setClients, trackDeletion]);

    const deleteStage = React.useCallback((stageId: string, caseId: string, clientId: string) => {
        const client = dataRef.current.clients.find(c => c.id === clientId);
        const caseItem = client?.cases.find(c => c.id === caseId);
        const stageToDelete = caseItem?.stages.find(s => s.id === stageId);
        if(!stageToDelete) return;

        const sessionIdsToDelete = stageToDelete.sessions.map(sess => sess.id);
        
        setClients(prev => prev.map(c => c.id === clientId ? { ...c, cases: c.cases.map(cs => cs.id === caseId ? { ...cs, stages: cs.stages.filter(st => st.id !== stageId), updated_at: new Date() } : cs), updated_at: new Date() } : c));

        trackDeletion('stages', stageId);
        sessionIdsToDelete.forEach(id => trackDeletion('sessions', id));
    }, [setClients, trackDeletion]);

    const deleteSession = React.useCallback((sessionId: string, stageId: string, caseId: string, clientId: string) => {
        setClients(prev => prev.map(c => c.id === clientId ? { ...c, updated_at: new Date(), cases: c.cases.map(cs => cs.id === caseId ? { ...cs, updated_at: new Date(), stages: cs.stages.map(st => st.id === stageId ? { ...st, sessions: st.sessions.filter(s => s.id !== sessionId), updated_at: new Date() } : st) } : cs) } : c));
        trackDeletion('sessions', sessionId);
    }, [setClients, trackDeletion]);

    const deleteAdminTask = React.useCallback((taskId: string) => {
        setAdminTasks(prev => prev.filter(t => t.id !== taskId));
        trackDeletion('adminTasks', taskId);
    }, [setAdminTasks, trackDeletion]);

    const deleteAppointment = React.useCallback((appointmentId: string) => {
        setAppointments(prev => prev.filter(a => a.id !== appointmentId));
        trackDeletion('appointments', appointmentId);
    }, [setAppointments, trackDeletion]);

    const deleteAccountingEntry = React.useCallback((entryId: string) => {
        setAccountingEntries(prev => prev.filter(e => e.id !== entryId));
        trackDeletion('accountingEntries', entryId);
    }, [setAccountingEntries, trackDeletion]);
    
    const deleteInvoice = React.useCallback((invoiceId: string) => {
        const invoiceToDelete = dataRef.current.invoices.find(inv => inv.id === invoiceId);
        if (invoiceToDelete) {
            invoiceToDelete.items.forEach(item => trackDeletion('invoiceItems', item.id));
        }
        setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
        trackDeletion('invoices', invoiceId);
    }, [setInvoices, trackDeletion]);

    const deleteAssistant = React.useCallback((name: string) => {
        // Also update any items assigned to this assistant
        setAdminTasks(prev => prev.map(t => t.assignee === name ? { ...t, assignee: 'بدون تخصيص', updated_at: new Date() } : t));
        setAppointments(prev => prev.map(a => a.assignee === name ? { ...a, assignee: 'بدون تخصيص', updated_at: new Date() } : a));
        setClients(prev => prev.map(c => ({
            ...c,
            updated_at: new Date(),
            cases: c.cases.map(cs => ({
                ...cs,
                updated_at: new Date(),
                stages: cs.stages.map(st => ({
                    ...st,
                    updated_at: new Date(),
                    sessions: st.sessions.map(s => s.assignee === name ? { ...s, assignee: 'بدون تخصيص', updated_at: new Date() } : s)
                }))
            }))
        })));

        setAssistants(prev => prev.filter(a => a !== name));
        trackDeletion('assistants', name);
    }, [setAdminTasks, setAppointments, setClients, setAssistants, trackDeletion]);

    const postponeSession = React.useCallback((sessionId: string, newDate: Date, newReason: string) => {
        setClients(currentClients => {
            let sessionToPostpone: Session | undefined;
            let stageOfSession: Stage | undefined;
            let caseOfSession: Case | undefined;
            let clientOfSession: Client | undefined;

            for (const client of currentClients) {
                for (const caseItem of client.cases) {
                    for (const stage of caseItem.stages) {
                        const foundSession = stage.sessions.find(s => s.id === sessionId);
                        if (foundSession) {
                            sessionToPostpone = foundSession;
                            stageOfSession = stage;
                            caseOfSession = caseItem;
                            clientOfSession = client;
                            break;
                        }
                    }
                    if (stageOfSession) break;
                }
                if (stageOfSession) break;
            }

            if (!sessionToPostpone || !stageOfSession || !caseOfSession || !clientOfSession) {
                console.error("Could not find complete context for session to postpone:", sessionId);
                return currentClients;
            }

            const newSession: Session = {
                ...sessionToPostpone,
                id: `session-${Date.now()}`,
                date: newDate,
                isPostponed: false,
                postponementReason: newReason,
                nextPostponementReason: undefined,
                nextSessionDate: undefined,
                updated_at: new Date(),
            };

            return currentClients.map(client => {
                if (client.id !== clientOfSession!.id) return client;
                return {
                    ...client,
                    updated_at: new Date(),
                    cases: client.cases.map(caseItem => {
                        if (caseItem.id !== caseOfSession!.id) return caseItem;
                        return {
                            ...caseItem,
                            updated_at: new Date(),
                            stages: caseItem.stages.map(stage => {
                                if (stage.id !== stageOfSession!.id) return stage;
                                
                                return {
                                    ...stage,
                                    updated_at: new Date(),
                                    sessions: [
                                        ...stage.sessions.map(s =>
                                            s.id === sessionId
                                                ? { ...s, isPostponed: true, nextPostponementReason: newReason, nextSessionDate: newDate, updated_at: new Date() }
                                                : s
                                        ),
                                        newSession,
                                    ],
                                };
                            }),
                        };
                    }),
                };
            });
        });
    }, [setClients]);


    // allSessions derivation
    const allSessions = React.useMemo(() => {
        return data.clients.flatMap(client =>
            client.cases.flatMap(caseItem =>
                caseItem.stages.flatMap(stage =>
                    stage.sessions.map(session => ({
                        ...session,
                        stageId: stage.id, // Add stageId for context
                        stageDecisionDate: stage.decisionDate, // Add stage decision date
                    }))
                )
            )
        );
    }, [data.clients]);
    
    const unpostponedSessions = React.useMemo(() => {
        return allSessions.filter(s => !s.isPostponed && isBeforeToday(s.date) && !s.stageDecisionDate);
    }, [allSessions]);

    return {
        ...data,
        setClients,
        setAdminTasks,
        setAppointments,
        setAccountingEntries,
        setInvoices,
        setAssistants,
        setFullData,
        allSessions,
        unpostponedSessions,
        syncStatus,
        manualSync,
        lastSyncError,
        isDirty,
        userId,
        isDataLoading,
        isAutoSyncEnabled,
        setAutoSyncEnabled,
        isAutoBackupEnabled,
        setAutoBackupEnabled,
        deleteClient,
        deleteCase,
        deleteStage,
        deleteSession,
        deleteAdminTask,
        deleteAppointment,
        deleteAccountingEntry,
        deleteInvoice,
        deleteAssistant,
        triggeredAlerts,
        dismissAlert,
        postponeSession,
        showUnpostponedSessionsModal,
        setShowUnpostponedSessionsModal,
    };
};