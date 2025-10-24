import * as React from 'react';
import { Client, Session, AdminTask, Appointment, AccountingEntry, Case, Stage, Invoice, InvoiceItem } from '../types';
import { useOnlineStatus } from './useOnlineStatus';
import { User } from '@supabase/supabase-js';
import { AppData as OnlineAppData } from './useOnlineData';
import { useSync, SyncStatus as SyncStatusType } from './useSync';
import { getSupabaseClient } from '../supabaseClient';

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
        updated_at: sanitizeOptionalDate(client.updated_at),
        cases: safeArray(client.cases, (caseItem: any): Case => ({
            id: caseItem.id || `case-${Date.now()}-${Math.random()}`,
            subject: String(caseItem.subject || 'قضية بدون موضوع'),
            clientName: String((caseItem.client_name ?? caseItem.clientName) || client.name || 'موكل غير مسمى'),
            opponentName: sanitizeString(caseItem.opponent_name ?? caseItem.opponentName),
            feeAgreement: String((caseItem.fee_agreement ?? caseItem.feeAgreement) || ''),
            status: ['active', 'closed', 'on_hold'].includes(caseItem.status) ? caseItem.status : 'active',
            updated_at: sanitizeOptionalDate(caseItem.updated_at),
            stages: safeArray(caseItem.stages, (stage: any): Stage => ({
                id: stage.id || `stage-${Date.now()}-${Math.random()}`,
                court: String(stage.court || 'محكمة غير محددة'),
                caseNumber: sanitizeString(stage.case_number ?? stage.caseNumber),
                firstSessionDate: sanitizeOptionalDate(stage.first_session_date ?? stage.firstSessionDate),
                updated_at: sanitizeOptionalDate(stage.updated_at),
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
            updated_at: sanitizeOptionalDate(task.updated_at),
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
            updated_at: sanitizeOptionalDate(apt.updated_at),
        };
    }).filter((a): a is Appointment => a !== null);
    
    // FIX: Refactor date sanitization to filter out entries with invalid dates for consistency and robustness.
    const validatedAccountingEntries: AccountingEntry[] = safeArray(data.accountingEntries, (entry: any): AccountingEntry | null => {
        const entryDate = sanitizeOptionalDate(entry.date);
        if (!entryDate) {
            console.warn('Filtering out accounting entry with invalid date:', entry);
            return null;
        }
        return {
            id: entry.id || `acc-${Date.now()}`,
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

    // FIX: Refactor date sanitization to filter out invoices with invalid issue or due dates.
    const validatedInvoices: Invoice[] = safeArray(data.invoices, (invoice: any): Invoice | null => {
        const issueDate = sanitizeOptionalDate(invoice.issue_date ?? invoice.issueDate);
        const dueDate = sanitizeOptionalDate(invoice.due_date ?? invoice.dueDate);

        if (!issueDate || !dueDate) {
            console.warn('Filtering out invoice with invalid date(s):', invoice);
            return null;
        }

        return {
            id: invoice.id || `inv-${Date.now()}-${Math.random()}`,
            clientId: String((invoice.client_id ?? invoice.clientId) || ''),
            clientName: String((invoice.client_name ?? invoice.clientName) || ''),
            caseId: sanitizeString(invoice.case_id ?? invoice.caseId),
            caseSubject: sanitizeString(invoice.case_subject ?? invoice.caseSubject),
            issueDate: issueDate,
            dueDate: dueDate,
            updated_at: sanitizeOptionalDate(invoice.updated_at),
            items: safeArray(invoice.invoice_items ?? invoice.items, (item: any): InvoiceItem => ({
                id: item.id || `item-${Date.now()}-${Math.random()}`,
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
  const ref = React.useRef<T>();
  React.useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

export const useSupabaseData = (user: User | null, isAuthLoading: boolean) => {
    // FIX: Memoize getLocalStorageKey with useCallback to prevent stale closures.
    const getLocalStorageKey = React.useCallback(() => user ? `${APP_DATA_KEY}_${user.id}` : APP_DATA_KEY, [user]);
    const userId = user?.id;

    // Initialize state by calling the function to get the initial data object.
    // This ensures we start with a fresh object and avoids potential issues with React's functional updates.
    const [data, setData] = React.useState<AppData>(getInitialData());
    const dataRef = React.useRef(data);
    dataRef.current = data;
    
    const [isDataLoading, setIsDataLoading] = React.useState(true);
    const [syncStatus, setSyncStatus] = React.useState<SyncStatus>('loading');
    const [lastSyncError, setLastSyncError] = React.useState<string | null>(null);
    const [isDirty, setIsDirty] = React.useState(false);
    
    const hadCacheOnLoad = React.useRef(false);
    
    const isOnline = useOnlineStatus();
    const prevIsOnline = usePrevious(isOnline);
    const prevIsAuthLoading = usePrevious(isAuthLoading);

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
    // FIX: Add stable dependencies to useCallback hooks to prevent stale closures.
    // FIX: Add missing dependencies to useCallback.
    }, [setSyncStatus, setLastSyncError]);

    const { manualSync, fetchAndRefresh } = useSync({
        user,
        localData: data,
        onDataSynced: handleDataSynced,
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
            setIsDirty(false);
            setSyncStatus('loading'); // Or another appropriate default state
            setIsDataLoading(false); // Correctly reflect that no data is being loaded.
            hadCacheOnLoad.current = false;
            return;
        }
    
        setIsDataLoading(true);
        setSyncStatus('loading');
        
        try {
            const rawData = localStorage.getItem(getLocalStorageKey());
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
        // FIX: Add getLocalStorageKey to the dependency array to prevent stale closures.
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

        if (justCameOnline && userId && !isAuthLoading && !isDataLoading) {
            console.log('Application reconnected to the internet. Checking for updates.');
            
            // If there are local changes, perform a full two-way sync to push them.
            if (isDirty) {
                console.log('Local changes detected. Performing full sync on reconnection.');
                manualSyncRef.current();
            } else {
                // If there are no local changes, just fetch the latest from the server.
                console.log('No local changes. Performing a safe refresh from server on reconnection.');
                fetchAndRefreshRef.current();
            }
        }
    }, [isOnline, prevIsOnline, userId, isAuthLoading, isDataLoading, isDirty]);
    
    React.useEffect(() => {
        if (!isDirty || !isOnline || isDataLoading || isAuthLoading || syncStatus === 'syncing') {
            return;
        }

        const syncTimeout = setTimeout(() => {
            console.log('Debounced change detected, triggering auto-sync.');
            manualSyncRef.current();
        }, 1500);

        return () => {
            clearTimeout(syncTimeout);
        };
    }, [isDirty, isOnline, isDataLoading, isAuthLoading, syncStatus, data]);

    const syncTimeoutRef = React.useRef<number>();

    React.useEffect(() => {
        if (!isOnline || !userId || isAuthLoading) return;

        const supabase = getSupabaseClient();
        if (!supabase) return;

        const debouncedRefresh = () => {
            clearTimeout(syncTimeoutRef.current);
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
            clearTimeout(syncTimeoutRef.current);
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [isOnline, userId, isAuthLoading, handleSyncStatusChange]);


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
        // FIX: Add getLocalStorageKey to the dependency array.
    }, [data, userId, isDirty, getLocalStorageKey]);

    // New useEffect for daily backup
    React.useEffect(() => {
        if (isDataLoading || !userId) {
            return;
        }

        const performBackupCheck = () => {
            const LAST_BACKUP_KEY = `lawyerAppLastBackupTimestamp_${userId}`;
            const todayString = new Date().toISOString().split('T')[0];

            try {
                const lastBackupTimestamp = localStorage.getItem(LAST_BACKUP_KEY);
                const lastBackupDateString = lastBackupTimestamp ? new Date(parseInt(lastBackupTimestamp, 10)).toISOString().split('T')[0] : null;

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

    // FIX: Add stable dependencies to useCallback hooks to prevent stale closures.
    const setClients = React.useCallback((updater: React.SetStateAction<Client[]>) => {
        setData(prev => ({ ...prev, clients: updater instanceof Function ? updater(prev.clients) : updater }));
        setIsDirty(true);
    }, []);

    const setAdminTasks = React.useCallback((updater: React.SetStateAction<AdminTask[]>) => {
        setData(prev => ({ ...prev, adminTasks: updater instanceof Function ? updater(prev.adminTasks) : updater }));
        setIsDirty(true);
    }, []);

    const setAppointments = React.useCallback((updater: React.SetStateAction<Appointment[]>) => {
        setData(prev => ({ ...prev, appointments: updater instanceof Function ? updater(prev.appointments) : updater }));
        setIsDirty(true);
    }, []);

    const setAccountingEntries = React.useCallback((updater: React.SetStateAction<AccountingEntry[]>) => {
        setData(prev => ({ ...prev, accountingEntries: updater instanceof Function ? updater(prev.accountingEntries) : updater }));
        setIsDirty(true);
    }, []);

    const setInvoices = React.useCallback((updater: React.SetStateAction<Invoice[]>) => {
        setData(prev => ({ ...prev, invoices: updater instanceof Function ? updater(prev.invoices) : updater }));
        setIsDirty(true);
    }, []);

    const setAssistants = React.useCallback((updater: React.SetStateAction<string[]>) => {
        setData(prev => ({ ...prev, assistants: updater instanceof Function ? updater(prev.assistants) : updater }));
        setIsDirty(true);
    }, []);

    const setFullData = React.useCallback((fullData: AppData) => {
        setData(validateAndHydrate(fullData));
        setIsDirty(true);
    // FIX: Add stable dependencies to the useCallback hook to align with best practices and resolve linter warnings.
    // FIX: Add missing dependencies to useCallback.
    }, []);
    
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
        ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
        manualSync,
        lastSyncError,
        isDirty,
        userId,
        isDataLoading,
    };
};