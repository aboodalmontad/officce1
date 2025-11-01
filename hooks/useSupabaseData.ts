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
const DB_VERSION = 2; // Bump version for schema change
const DATA_STORE_NAME = 'appData';
const DOCS_STORE_NAME = 'documents';


export async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
          if (!db.objectStoreNames.contains(DATA_STORE_NAME)) {
            db.createObjectStore(DATA_STORE_NAME);
          }
      }
      if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(DOCS_STORE_NAME)) {
            // This store will hold objects of type { metadata: CaseDocument, blob: Blob }
            db.createObjectStore(DOCS_STORE_NAME, { keyPath: 'metadata.id' });
          }
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
            clientId: client.id,
            subject: String(caseItem.subject || 'قضية بدون موضوع'),
            clientName: String((caseItem.client_name ?? caseItem.clientName) || client.name || 'موكل غير مسمى'),
            opponentName: sanitizeString(caseItem.opponent_name ?? caseItem.opponentName),
            feeAgreement: String((caseItem.fee_agreement ?? caseItem.feeAgreement) || ''),
            status: ['active', 'closed', 'on_hold'].includes(caseItem.status) ? caseItem.status : 'active',
            updated_at: sanitizeOptionalDate(caseItem.updated_at),
            stages: safeArray(caseItem.stages, (stage: any, stageIndex: number): Stage => ({
                id: stage.id || `stage-${Date.now()}-${stageIndex}`,
                caseId: caseItem.id,
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
                        // FIX: Added missing stageId property.
                        stageId: stage.id,
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
  const ref = React.useRef<T | undefined>(undefined);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

export const useSupabaseData = (user: User | null, isAuthLoading: boolean) => {
    const getLocalStorageKey = React.useCallback(() => user ? `${APP_DATA_KEY}_${user.id}` : APP_DATA_KEY, [user]);
    const userId = user?.id;

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
    const isInitialLoadAfterHydrate = React.useRef(true);
    
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
        isInitialLoadAfterHydrate.current = true; // Prevent marking as dirty on sync
        setData(validatedData);
        if (userId) {
            try {
                const db = await getDb();
                await db.put(DATA_STORE_NAME, validatedData, `${APP_DATA_KEY}_${userId}`);
                setIsDirty(false);
            } catch (e) {
                console.error('Failed to save synced data to IndexedDB', e);
            }
        }
    }, [userId]);
    
    const handleSyncStatusChange = React.useCallback((status: SyncStatus, error: string | null) => {
        setSyncStatus(status);
        setLastSyncError(error);
    }, []);

    const { manualSync, fetchAndRefresh } = useSync({
        user,
        localData: data,
        deletedIds,
        onDataSynced: handleDataSynced,
        onDeletionsSynced,
        onSyncStatusChange: handleSyncStatusChange,
        isOnline,
        isAuthLoading,
        syncStatus,
    });
    
    const manualSyncRef = React.useRef(manualSync);
    const fetchAndRefreshRef = React.useRef(fetchAndRefresh);

    React.useEffect(() => {
        manualSyncRef.current = manualSync;
        fetchAndRefreshRef.current = fetchAndRefresh;
    }, [manualSync, fetchAndRefresh]);
    
    // Effect to automatically sync data when changes are made while online.
    React.useEffect(() => {
        // Guard against running on initial load or while other operations are in progress.
        if (isDataLoading || isAuthLoading || !userId) {
            return;
        }

        // Conditions to trigger auto-sync:
        // - Data has been modified locally (isDirty).
        // - The application is online.
        // - Auto-sync feature is enabled by the user.
        // - No sync is currently in progress.
        if (isDirty && isOnline && isAutoSyncEnabled && syncStatus !== 'syncing') {
            const handler = setTimeout(() => {
                console.log("Auto-syncing dirty data...");
                manualSyncRef.current();
            }, 5000); // 5-second delay to bundle changes

            // Clean up the timeout if dependencies change, resetting the debounce timer.
            return () => clearTimeout(handler);
        }
    }, [isDirty, isOnline, isAutoSyncEnabled, syncStatus, isDataLoading, isAuthLoading, userId]);

    React.useEffect(() => {
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

                const rawDeleted = localStorage.getItem(`lawyerAppDeletedIds_${userId}`);
                setDeletedIds(rawDeleted ? JSON.parse(rawDeleted) : getInitialDeletedIds());
                const autoSyncEnabled = localStorage.getItem(`lawyerAppAutoSyncEnabled_${userId}`);
                setIsAutoSyncEnabled(autoSyncEnabled === null ? true : autoSyncEnabled === 'true');
                const autoBackupEnabled = localStorage.getItem(`lawyerAppAutoBackupEnabled_${userId}`);
                setIsAutoBackupEnabled(autoBackupEnabled === null ? true : autoBackupEnabled === 'true');

                if (rawData) {
                    const parsedData = rawData; 
                    const isEffectivelyEmpty =
                        !parsedData ||
                        (Array.isArray(parsedData.clients) && parsedData.clients.length === 0 &&
                        Array.isArray(parsedData.adminTasks) && parsedData.adminTasks.length === 0 &&
                        Array.isArray(parsedData.appointments) && parsedData.appointments.length === 0 &&
                        Array.isArray(parsedData.accountingEntries) && parsedData.accountingEntries.length === 0 &&
                        Array.isArray(parsedData.invoices) && parsedData.invoices.length === 0);
        
                    if (isEffectivelyEmpty) {
                        hadCacheOnLoad.current = false;
                        setData(getInitialData());
                    } else {
                        isInitialLoadAfterHydrate.current = true; // Prevent marking as dirty on initial load
                        setData(validateAndHydrate(parsedData));
                        setIsDirty(localStorage.getItem(`lawyerAppIsDirty_${userId}`) === 'true');
                        setSyncStatus('synced'); 
                        hadCacheOnLoad.current = true;
                    }
                } else {
                    hadCacheOnLoad.current = false;
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
        if (isAuthLoading || isDataLoading || !userId) return;

        const authJustFinished = prevIsAuthLoading === true && isAuthLoading === false;

        if (authJustFinished && isOnline) {
            manualSyncRef.current(!hadCacheOnLoad.current);
        } else if (!isOnline && !hadCacheOnLoad.current) {
            setSyncStatus('error');
            setLastSyncError('أنت غير متصل ولا توجد بيانات محلية. يرجى الاتصال بالإنترنت للمزامنة الأولية.');
        }
    }, [isAuthLoading, prevIsAuthLoading, isOnline, isDataLoading, userId]);

    React.useEffect(() => {
        const justCameOnline = prevIsOnline === false && isOnline === true;
        let syncOnReconnectTimeout: number | null = null;

        if (justCameOnline && userId && !isAuthLoading && !isDataLoading) {
            syncOnReconnectTimeout = window.setTimeout(() => {
                if (isAutoSyncEnabledRef.current) {
                    if (isDirtyRef.current) {
                        manualSyncRef.current();
                    } else {
                        fetchAndRefreshRef.current();
                    }
                }
            }, 1500);
        }

        return () => { if (syncOnReconnectTimeout) clearTimeout(syncOnReconnectTimeout); };
    }, [isOnline, prevIsOnline, userId, isAuthLoading, isDataLoading]);

    // Effect to mark data as "dirty" (changed) when it's modified after initial load.
    React.useEffect(() => {
        if (isDataLoading) return;

        if (isInitialLoadAfterHydrate.current) {
            isInitialLoadAfterHydrate.current = false;
        } else {
            setIsDirty(true);
        }
    }, [data, deletedIds, isDataLoading]);

    // Debounced save to IndexedDB and localStorage for flags
    React.useEffect(() => {
        if (isDataLoading || !userId) return;

        const handler = setTimeout(async () => {
            console.log('Debounced save: Persisting data to local storage...');
            try {
                const db = await getDb();
                await db.put(DATA_STORE_NAME, dataRef.current, getLocalStorageKey());
                localStorage.setItem(`lawyerAppDeletedIds_${userId}`, JSON.stringify(deletedIds));
                localStorage.setItem(`lawyerAppIsDirty_${userId}`, String(isDirtyRef.current));
            } catch (e) {
                console.error('Debounced save to local storage failed:', e);
            }
        }, 1500); // 1.5 seconds debounce delay

        return () => clearTimeout(handler);
    }, [data, deletedIds, isDataLoading, userId, getLocalStorageKey]);

    // This effect persists simple settings flags to localStorage. It's lightweight and runs on every change.
    React.useEffect(() => {
        if (userId) {
            localStorage.setItem(`lawyerAppAutoSyncEnabled_${userId}`, String(isAutoSyncEnabled));
            localStorage.setItem(`lawyerAppAutoBackupEnabled_${userId}`, String(isAutoBackupEnabled));
        }
    }, [userId, isAutoSyncEnabled, isAutoBackupEnabled]);
    
    const exportData = React.useCallback(() => {
        try {
            const dataToExport = dataRef.current;
            const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const date = new Date().toISOString().split('T')[0];
            a.download = `lawyer_app_backup_${date}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return true;
        } catch (error) {
            console.error("Failed to export data:", error);
            return false;
        }
    }, []);

    // Automatic daily backup effect
    React.useEffect(() => {
        if (isDataLoading || !userId) return;

        const performAutoBackup = () => {
            if (!isAutoBackupEnabledRef.current) return;
            
            const LAST_BACKUP_KEY = `lawyerAppLastBackup_${userId}`;
            const lastBackupDate = localStorage.getItem(LAST_BACKUP_KEY);
            const todayStr = new Date().toISOString().split('T')[0];

            if (lastBackupDate !== todayStr) {
                console.log("Performing automatic daily backup...");
                if (exportData()) {
                    localStorage.setItem(LAST_BACKUP_KEY, todayStr);
                } else {
                    console.error("Automatic daily backup failed.");
                }
            }
        };
        
        // Run once, shortly after the app is loaded and idle.
        const timer = setTimeout(performAutoBackup, 10000); // Wait 10s after load
        return () => clearTimeout(timer);
    }, [isDataLoading, userId, exportData]);


    // Effect for real-time data synchronization
    React.useEffect(() => {
        if (!user || !isOnline || isAuthLoading || isDataLoading) {
            return;
        }

        const supabase = getSupabaseClient();
        if (!supabase) return;

        let debounceTimer: number | null = null;
        const debouncedRefresh = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = window.setTimeout(() => {
                if (syncStatus === 'syncing') {
                    console.log('Real-time refresh skipped: a sync is already in progress.');
                    return;
                }
                console.log('Real-time change detected, refreshing data...');
                fetchAndRefreshRef.current();
            }, 1500); // 1.5s debounce to batch updates
        };

        const channel = supabase.channel(`user-data-channel-${user.id}`);
        
        channel
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                filter: `user_id=eq.${user.id}`
            }, payload => {
                console.log('Real-time change on user table:', payload.table);
                debouncedRefresh();
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'profiles',
                filter: `id=eq.${user.id}`
            }, payload => {
                console.log('Real-time change on user profile.');
                debouncedRefresh();
            })
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    console.log(`Real-time channel subscribed for user ${user.id}`);
                } else if (status === 'CHANNEL_ERROR' || err) {
                    console.error('Real-time subscription error:', err);
                    setLastSyncError('فشل الاتصال بمزامنة الوقت الفعلي.');
                }
            });

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            if (channel) {
                supabase.removeChannel(channel).catch(error => {
                    console.error("Failed to remove real-time channel:", error);
                });
            }
        };
    }, [user, isOnline, isAuthLoading, isDataLoading, syncStatus]);

    return {
        clients: data.clients,
        adminTasks: data.adminTasks,
        appointments: data.appointments,
        accountingEntries: data.accountingEntries,
        invoices: data.invoices,
        assistants: data.assistants,
        setClients: (updater) => setData(prev => ({...prev, clients: typeof updater === 'function' ? updater(prev.clients) : updater})),
        setAdminTasks: (updater) => setData(prev => ({...prev, adminTasks: typeof updater === 'function' ? updater(prev.adminTasks) : updater})),
        setAppointments: (updater) => setData(prev => ({...prev, appointments: typeof updater === 'function' ? updater(prev.appointments) : updater})),
        setAccountingEntries: (updater) => setData(prev => ({...prev, accountingEntries: typeof updater === 'function' ? updater(prev.accountingEntries) : updater})),
        setInvoices: (updater) => setData(prev => ({...prev, invoices: typeof updater === 'function' ? updater(prev.invoices) : updater})),
        setAssistants: (updater) => setData(prev => ({...prev, assistants: typeof updater === 'function' ? updater(prev.assistants) : updater})),
        setFullData: handleDataSynced,
        allSessions: React.useMemo(() => data.clients.flatMap(c => c.cases.flatMap(cs => cs.stages.flatMap(st => st.sessions.map(s => ({...s, stageId: st.id, stageDecisionDate: st.decisionDate})) ))), [data.clients]),
        // FIX: unpostponedSessions implementation now matches its type by adding stageId and stageDecisionDate.
        unpostponedSessions: React.useMemo(() => data.clients.flatMap(c => c.cases.flatMap(cs => cs.stages.flatMap(st => st.sessions.filter(s => !s.isPostponed && isBeforeToday(s.date) && !st.decisionDate).map(s => ({...s, stageId: st.id, stageDecisionDate: st.decisionDate}))))) , [data.clients]),
        syncStatus,
        manualSync: manualSyncRef.current,
        lastSyncError,
        isDirty,
        userId,
        isDataLoading,
        isAuthLoading,
        isAutoSyncEnabled,
        setAutoSyncEnabled: setIsAutoSyncEnabled,
        isAutoBackupEnabled,
        setAutoBackupEnabled: setIsAutoBackupEnabled,
        exportData,
        triggeredAlerts,
        dismissAlert: React.useCallback((appointmentId: string) => { setTriggeredAlerts(prev => prev.filter(a => a.id !== appointmentId)); }, []),
        showUnpostponedSessionsModal,
        setShowUnpostponedSessionsModal,
        deleteClient: React.useCallback((clientId: string) => { setDeletedIds(prev => ({...prev, clients: [...prev.clients, clientId]})); setData(prev => ({...prev, clients: prev.clients.filter(c => c.id !== clientId)})); }, []),
        deleteCase: React.useCallback((caseId: string, clientId: string) => { setDeletedIds(prev => ({...prev, cases: [...prev.cases, caseId]})); setData(prev => ({...prev, clients: prev.clients.map(c => c.id === clientId ? {...c, cases: c.cases.filter(cs => cs.id !== caseId)} : c)})); }, []),
        deleteStage: React.useCallback((stageId: string, caseId: string, clientId: string) => { setDeletedIds(prev => ({...prev, stages: [...prev.stages, stageId]})); setData(prev => ({...prev, clients: prev.clients.map(c => c.id === clientId ? {...c, cases: c.cases.map(cs => cs.id === caseId ? {...cs, stages: cs.stages.filter(st => st.id !== stageId)} : cs)} : c)})); }, []),
        deleteSession: React.useCallback((sessionId: string, stageId: string, caseId: string, clientId: string) => { setDeletedIds(prev => ({...prev, sessions: [...prev.sessions, sessionId]})); setData(prev => ({...prev, clients: prev.clients.map(c => c.id === clientId ? {...c, cases: c.cases.map(cs => cs.id === caseId ? {...cs, stages: cs.stages.map(st => st.id === stageId ? {...st, sessions: st.sessions.filter(s => s.id !== sessionId)} : st)} : cs)} : c)})); }, []),
        deleteAdminTask: React.useCallback((taskId: string) => { setDeletedIds(prev => ({...prev, adminTasks: [...prev.adminTasks, taskId]})); setData(prev => ({...prev, adminTasks: prev.adminTasks.filter(t => t.id !== taskId)})); }, []),
        deleteAppointment: React.useCallback((appointmentId: string) => { setDeletedIds(prev => ({...prev, appointments: [...prev.appointments, appointmentId]})); setData(prev => ({...prev, appointments: prev.appointments.filter(a => a.id !== appointmentId)})); }, []),
        deleteAccountingEntry: React.useCallback((entryId: string) => { setDeletedIds(prev => ({...prev, accountingEntries: [...prev.accountingEntries, entryId]})); setData(prev => ({...prev, accountingEntries: prev.accountingEntries.filter(e => e.id !== entryId)})); }, []),
        deleteInvoice: React.useCallback((invoiceId: string) => { setDeletedIds(prev => ({...prev, invoices: [...prev.invoices, invoiceId]})); setData(prev => ({...prev, invoices: prev.invoices.filter(i => i.id !== invoiceId)})); }, []),
        deleteAssistant: React.useCallback((name: string) => { setDeletedIds(prev => ({...prev, assistants: [...prev.assistants, name]})); setData(prev => ({...prev, assistants: prev.assistants.filter(a => a !== name)})); }, []),
        postponeSession: React.useCallback((sessionId: string, newDate: Date, newReason: string) => {
            setData(prev => {
                const newClients = prev.clients.map(client => ({
                    ...client,
                    cases: client.cases.map(caseItem => ({
                        ...caseItem,
                        stages: caseItem.stages.map(stage => {
                            const sessionIndex = stage.sessions.findIndex(s => s.id === sessionId);
                            if (sessionIndex === -1) return stage;

                            const updatedSessions = [...stage.sessions];
                            const sessionToUpdate = updatedSessions[sessionIndex];
                            
                            updatedSessions[sessionIndex] = {
                                ...sessionToUpdate,
                                isPostponed: true,
                                nextSessionDate: newDate,
                                nextPostponementReason: newReason,
                                updated_at: new Date(),
                            };
                            
                            const newSession: Session = {
                                id: `session-${Date.now()}`,
                                // FIX: Added missing stageId property.
                                stageId: sessionToUpdate.stageId,
                                court: sessionToUpdate.court,
                                caseNumber: sessionToUpdate.caseNumber,
                                date: newDate,
                                clientName: sessionToUpdate.clientName,
                                opponentName: sessionToUpdate.opponentName,
                                isPostponed: false,
                                postponementReason: newReason,
                                assignee: sessionToUpdate.assignee,
                                updated_at: new Date()
                            };
                            updatedSessions.push(newSession);

                            return { ...stage, sessions: updatedSessions, updated_at: new Date() };
                        })
                    }))
                }));
                return { ...prev, clients: newClients };
            });
        }, []),
    };
};