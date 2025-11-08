import * as React from 'react';
import { Client, Session, AdminTask, Appointment, AccountingEntry, Case, Stage, Invoice, InvoiceItem, CaseDocument, AppData, DeletedIds, getInitialDeletedIds, Profile, SiteFinancialEntry } from '../types';
import { useOnlineStatus } from './useOnlineStatus';
// Fix: Use `import type` for User and RealtimeChannel as they are used as types, not values. This resolves module resolution errors in some environments.
import type { User, RealtimeChannel } from '@supabase/supabase-js';
import { useSync, SyncStatus as SyncStatusType } from './useSync';
import { getSupabaseClient } from '../supabaseClient';
import { isBeforeToday, toInputDateString } from '../utils/dateUtils';
import { openDB, IDBPDatabase } from 'idb';
import { RealtimeAlert } from '../components/RealtimeNotifier';


export const APP_DATA_KEY = 'lawyerBusinessManagementData';
export type SyncStatus = SyncStatusType;

const defaultAssistants = ['أحمد', 'فاطمة', 'سارة', 'بدون تخصيص'];

// --- User Settings Management ---
interface LocalSettings {
    isAutoSyncEnabled: boolean;
    isAutoBackupEnabled: boolean;
}

const defaultLocalSettings: LocalSettings = {
    isAutoSyncEnabled: true,
    isAutoBackupEnabled: true,
};


const getInitialData = (): AppData => ({
    clients: [] as Client[],
    adminTasks: [] as AdminTask[],
    appointments: [] as Appointment[],
    accountingEntries: [] as AccountingEntry[],
    invoices: [] as Invoice[],
    assistants: [...defaultAssistants],
    documents: [] as CaseDocument[],
    profiles: [] as Profile[],
    siteFinances: [] as SiteFinancialEntry[],
});


// --- IndexedDB Setup ---
const DB_NAME = 'LawyerAppData';
const DB_VERSION = 11; // Bump version for a more forceful schema fix.
const DATA_STORE_NAME = 'appData';
const DOCS_FILES_STORE_NAME = 'caseDocumentFiles';
const DOCS_METADATA_STORE_NAME = 'caseDocumentMetadata';


async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, tx) {
      console.log(`Upgrading DB from version ${oldVersion} to ${newVersion}.`);

      // Forceful recreation of the metadata store to fix recurring schema issues.
      // This is safe because metadata is ephemeral and repopulated on load.
      if (oldVersion < 11) {
        console.log(`Running upgrade for v11: Recreating '${DOCS_METADATA_STORE_NAME}' with explicit keys.`);
        if (db.objectStoreNames.contains(DOCS_METADATA_STORE_NAME)) {
          db.deleteObjectStore(DOCS_METADATA_STORE_NAME);
        }
        // Create store without a keyPath, as we'll provide the key explicitly.
        db.createObjectStore(DOCS_METADATA_STORE_NAME);
      }
      
      // Ensure other stores exist, creating them if they don't.
      if (!db.objectStoreNames.contains(DATA_STORE_NAME)) {
        db.createObjectStore(DATA_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(DOCS_FILES_STORE_NAME)) {
        db.createObjectStore(DOCS_FILES_STORE_NAME);
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

const safeArray = <T, U>(arr: any, mapFn: (doc: any, index: number) => U | undefined): U[] => {
    if (!Array.isArray(arr)) return [];
    return arr.reduce((acc: U[], doc: any, index: number) => {
        if (!doc) return acc;
        try {
            const result = mapFn(doc, index);
            if (result !== undefined) {
                acc.push(result);
            }
        } catch (e) {
            console.error('Error processing item in safeArray:', e, 'Item:', doc);
        }
        return acc;
    }, []);
};

const reviveDate = (date: any): Date => {
    if (!date) return new Date(); // Return current date for null/undefined
    const d = new Date(date);
    if (isNaN(d.getTime())) {
        console.warn('Revived an invalid date. Original value:', date);
        return new Date();
    }
    return d;
};

const validateDocuments = (doc: any, userId: string): CaseDocument | undefined => {
    // FIX: Add stricter validation. An empty object `doc` was passing `!doc` but failing later.
    // Now we ensure critical properties `id` and `name` exist.
    if (!doc || typeof doc !== 'object' || !doc.id || !doc.name) {
        console.warn('Skipping invalid document during validation:', doc);
        return undefined;
    }

    return {
        id: String(doc.id),
        caseId: String(doc.caseId),
        userId: String(doc.userId || userId),
        name: String(doc.name),
        type: String(doc.type || 'application/octet-stream'),
        size: Number(doc.size || 0),
        addedAt: reviveDate(doc.addedAt),
        storagePath: String(doc.storagePath || ''),
        // This is a client-side only state, it will be populated from IndexedDB later
        localState: doc.localState || 'pending_download', 
        updated_at: reviveDate(doc.updated_at),
    };
};


// Fix: The entire function has been rewritten to explicitly map all required properties for each type.
// This resolves multiple TypeScript errors where properties were considered "missing" because TypeScript
// couldn't infer them from the 'any' type when using the spread operator (...).
const validateAndFixData = (loadedData: any, user: User | null): AppData => {
    const userId = user?.id || '';
    if (!loadedData || typeof loadedData !== 'object') return getInitialData();
    
    // Type guard function to ensure items in arrays are valid objects
    const isValidObject = (item: any): item is Record<string, any> => item && typeof item === 'object' && !Array.isArray(item);

    const validatedData: AppData = {
        clients: safeArray(loadedData.clients, (client) => {
            if (!isValidObject(client) || !client.id || !client.name) return undefined;
            return {
                id: String(client.id),
                name: String(client.name),
                contactInfo: String(client.contactInfo || ''),
                updated_at: reviveDate(client.updated_at),
                cases: safeArray(client.cases, (caseItem) => {
                    if (!isValidObject(caseItem) || !caseItem.id) return undefined;
                    return {
                        id: String(caseItem.id),
                        subject: String(caseItem.subject || ''),
                        clientName: String(caseItem.clientName || client.name),
                        opponentName: String(caseItem.opponentName || ''),
                        feeAgreement: String(caseItem.feeAgreement || ''),
                        status: ['active', 'closed', 'on_hold'].includes(caseItem.status) ? caseItem.status : 'active',
                        updated_at: reviveDate(caseItem.updated_at),
                        stages: safeArray(caseItem.stages, (stage) => {
                            if (!isValidObject(stage) || !stage.id) return undefined;
                            return {
                                id: String(stage.id),
                                court: String(stage.court || ''),
                                caseNumber: String(stage.caseNumber || ''),
                                firstSessionDate: stage.firstSessionDate ? reviveDate(stage.firstSessionDate) : undefined,
                                decisionDate: stage.decisionDate ? reviveDate(stage.decisionDate) : undefined,
                                decisionNumber: String(stage.decisionNumber || ''),
                                decisionSummary: String(stage.decisionSummary || ''),
                                decisionNotes: String(stage.decisionNotes || ''),
                                updated_at: reviveDate(stage.updated_at),
                                sessions: safeArray(stage.sessions, (session) => {
                                    if (!isValidObject(session) || !session.id) return undefined;
                                    return {
                                        id: String(session.id),
                                        court: String(session.court || stage.court),
                                        caseNumber: String(session.caseNumber || stage.caseNumber),
                                        date: reviveDate(session.date),
                                        clientName: String(session.clientName || caseItem.clientName),
                                        opponentName: String(session.opponentName || caseItem.opponentName),
                                        postponementReason: session.postponementReason ? String(session.postponementReason) : undefined,
                                        nextPostponementReason: session.nextPostponementReason ? String(session.nextPostponementReason) : undefined,
                                        isPostponed: Boolean(session.isPostponed),
                                        nextSessionDate: session.nextSessionDate ? reviveDate(session.nextSessionDate) : undefined,
                                        assignee: session.assignee ? String(session.assignee) : undefined,
                                        updated_at: reviveDate(session.updated_at),
                                    };
                                }),
                            };
                        }),
                    };
                }),
            };
        }),
        adminTasks: safeArray(loadedData.adminTasks, (task) => {
            if (!isValidObject(task) || !task.id) return undefined;
            return {
                id: String(task.id),
                task: String(task.task || ''),
                dueDate: reviveDate(task.dueDate),
                completed: Boolean(task.completed),
                importance: ['normal', 'important', 'urgent'].includes(task.importance) ? task.importance : 'normal',
                assignee: task.assignee ? String(task.assignee) : undefined,
                location: task.location ? String(task.location) : undefined,
                updated_at: reviveDate(task.updated_at),
            };
        }),
        appointments: safeArray(loadedData.appointments, (apt) => {
            if (!isValidObject(apt) || !apt.id) return undefined;
            return {
                id: String(apt.id),
                title: String(apt.title || ''),
                time: String(apt.time || ''),
                date: reviveDate(apt.date),
                importance: ['normal', 'important', 'urgent'].includes(apt.importance) ? apt.importance : 'normal',
                completed: Boolean(apt.completed),
                notified: Boolean(apt.notified),
                reminderTimeInMinutes: Number(apt.reminderTimeInMinutes || 15),
                assignee: apt.assignee ? String(apt.assignee) : undefined,
                updated_at: reviveDate(apt.updated_at),
            };
        }),
        accountingEntries: safeArray(loadedData.accountingEntries, (entry) => {
            if (!isValidObject(entry) || !entry.id) return undefined;
            return {
                id: String(entry.id),
                type: ['income', 'expense'].includes(entry.type) ? entry.type : 'expense',
                amount: Number(entry.amount || 0),
                date: reviveDate(entry.date),
                description: String(entry.description || ''),
                clientId: String(entry.clientId || ''),
                caseId: String(entry.caseId || ''),
                clientName: String(entry.clientName || ''),
                updated_at: reviveDate(entry.updated_at),
            };
        }),
        invoices: safeArray(loadedData.invoices, (invoice) => {
            if (!isValidObject(invoice) || !invoice.id) return undefined;
            return {
                id: String(invoice.id),
                clientId: String(invoice.clientId || ''),
                clientName: String(invoice.clientName || ''),
                caseId: invoice.caseId ? String(invoice.caseId) : undefined,
                caseSubject: invoice.caseSubject ? String(invoice.caseSubject) : undefined,
                issueDate: reviveDate(invoice.issueDate),
                dueDate: reviveDate(invoice.dueDate),
                taxRate: Number(invoice.taxRate || 0),
                discount: Number(invoice.discount || 0),
                status: ['draft', 'sent', 'paid', 'overdue'].includes(invoice.status) ? invoice.status : 'draft',
                notes: invoice.notes ? String(invoice.notes) : undefined,
                updated_at: reviveDate(invoice.updated_at),
                items: safeArray(invoice.items, (item) => {
                    if (!isValidObject(item) || !item.id) return undefined;
                    return {
                        id: String(item.id),
                        description: String(item.description || ''),
                        amount: Number(item.amount || 0),
                        updated_at: reviveDate(item.updated_at),
                    };
                }),
            };
        }),
        assistants: validateAssistantsList(loadedData.assistants),
        documents: safeArray(loadedData.documents, (doc) => validateDocuments(doc, userId)),
        profiles: safeArray(loadedData.profiles, (profile) => {
            if (!isValidObject(profile) || !profile.id) return undefined;
            return {
                id: String(profile.id),
                full_name: String(profile.full_name || ''),
                mobile_number: String(profile.mobile_number || ''),
                is_approved: Boolean(profile.is_approved),
                is_active: Boolean(profile.is_active),
                subscription_start_date: profile.subscription_start_date ? String(profile.subscription_start_date) : null,
                subscription_end_date: profile.subscription_end_date ? String(profile.subscription_end_date) : null,
                role: ['user', 'admin'].includes(profile.role) ? profile.role : 'user',
                created_at: profile.created_at,
                updated_at: reviveDate(profile.updated_at),
                admin_tasks_layout: ['horizontal', 'vertical'].includes(profile.admin_tasks_layout) ? profile.admin_tasks_layout : 'vertical',
            };
        }),
        siteFinances: safeArray(loadedData.siteFinances, (entry) => {
            if (!isValidObject(entry) || !entry.id) return undefined;
            return {
                id: Number(entry.id),
                user_id: entry.user_id ? String(entry.user_id) : null,
                type: ['income', 'expense'].includes(entry.type) ? entry.type : 'income',
                payment_date: String(entry.payment_date),
                amount: Number(entry.amount || 0),
                description: entry.description ? String(entry.description) : null,
                payment_method: entry.payment_method ? String(entry.payment_method) : null,
                category: entry.category ? String(entry.category) : null,
                profile_full_name: entry.profile_full_name ? String(entry.profile_full_name) : undefined,
                updated_at: reviveDate(entry.updated_at),
            };
        }),
    };
    
    return validatedData;
};

// Fix: The 'useSupabaseData' hook was missing. It has been implemented here to manage all application data.
export const useSupabaseData = (user: User | null, isAuthLoading: boolean) => {
    const [data, setData] = React.useState<AppData>(getInitialData());
    const [deletedIds, setDeletedIds] = React.useState<DeletedIds>(getInitialDeletedIds());
    const [isDataLoading, setIsDataLoading] = React.useState(true);
    const [isDirty, setIsDirty] = React.useState(false);
    const [syncStatus, setSyncStatus] = React.useState<SyncStatus>('uninitialized');
    const [lastSyncError, setLastSyncError] = React.useState<string | null>(null);

    const isOnline = useOnlineStatus();
    const supabase = getSupabaseClient();
    const userId = user?.id;

    // Local, per-device settings
    const LOCAL_SETTINGS_KEY = `lawyerAppSettings_${userId}`;
    const [localSettings, setLocalSettings] = React.useState<LocalSettings>(defaultLocalSettings);
    
    const [triggeredAlerts, setTriggeredAlerts] = React.useState<Appointment[]>([]);
    const [realtimeAlerts, setRealtimeAlerts] = React.useState<RealtimeAlert[]>([]);
    const [showUnpostponedSessionsModal, setShowUnpostponedSessionsModal] = React.useState(false);

    const dbRef = React.useRef<IDBPDatabase | null>(null);
    const syncTimeoutRef = React.useRef<number | null>(null);
    
    // Load and save local settings
    React.useEffect(() => {
        if (!userId) return;
        try {
            const savedSettingsRaw = localStorage.getItem(LOCAL_SETTINGS_KEY);
            if (savedSettingsRaw) {
                const savedSettings = JSON.parse(savedSettingsRaw);
                setLocalSettings({ ...defaultLocalSettings, ...savedSettings });
            }
        } catch (error) {
            console.error('Failed to load local settings from localStorage:', error);
        }
    }, [userId]);

    const saveLocalSettings = React.useCallback((newSettings: Partial<LocalSettings>) => {
        if (!userId) return;
        try {
            const updatedSettings = { ...localSettings, ...newSettings };
            setLocalSettings(updatedSettings);
            localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(updatedSettings));
        } catch (error) {
            console.error('Failed to save local settings to localStorage:', error);
        }
    }, [userId, localSettings]);

    const isAutoSyncEnabled = localSettings.isAutoSyncEnabled;
    const setAutoSyncEnabled = (enabled: boolean) => saveLocalSettings({ isAutoSyncEnabled: enabled });
    const isAutoBackupEnabled = localSettings.isAutoBackupEnabled;
    const setAutoBackupEnabled = (enabled: boolean) => saveLocalSettings({ isAutoBackupEnabled: enabled });
    
    // User profile settings (synced)
    const adminTasksLayout = React.useMemo(() => 
        data.profiles.find(p => p.id === userId)?.admin_tasks_layout || 'vertical', 
        [data.profiles, userId]
    );

    const setAdminTasksLayout = (layout: 'horizontal' | 'vertical') => {
        if (!userId) return;
        setData(prevData => ({
            ...prevData,
            profiles: prevData.profiles.map(p => 
                p.id === userId ? { ...p, admin_tasks_layout: layout, updated_at: new Date() } : p
            )
        }));
        setIsDirty(true);
    };

    // --- IndexedDB and Initial Data Load ---
    React.useEffect(() => {
        let didCancel = false;
        async function loadData() {
            setIsDataLoading(true);
            try {
                const db = await getDb();
                dbRef.current = db;
                
                const storedData = await db.get(DATA_STORE_NAME, APP_DATA_KEY);
                const storedDeletedIds = await db.get(DATA_STORE_NAME, 'deletedIds');

                if (didCancel) return;

                if (storedData) {
                    const validated = validateAndFixData(storedData, user);
                    
                    const docStateMap = new Map<string, CaseDocument['localState']>();
                    const tx = db.transaction(DOCS_METADATA_STORE_NAME, 'readonly');
                    const validStates: Set<CaseDocument['localState']> = new Set(['synced', 'pending_upload', 'pending_download', 'error', 'downloading']);
                    
                    for await (const cursor of tx.store) {
                        const stateValue = cursor.value?.localState;
                        if (typeof stateValue === 'string' && validStates.has(stateValue as any)) {
                            docStateMap.set(cursor.key as string, stateValue as CaseDocument['localState']);
                        }
                    }
                    
                    validated.documents = validated.documents.map(doc => ({
                        ...doc,
                        localState: docStateMap.get(doc.id) || 'pending_download'
                    }));

                    setData(validated);
                }
                if (storedDeletedIds) {
                    setDeletedIds(storedDeletedIds);
                }
            } catch (error) {
                console.error('Failed to load data from IndexedDB:', error);
            } finally {
                if (!didCancel) {
                    setIsDataLoading(false);
                }
            }
        }
        loadData();
        return () => { didCancel = true; };
    }, [user]);

    // --- Data Persistence ---
    React.useEffect(() => {
        const db = dbRef.current;
        if (!db || isDataLoading) return;

        const saveData = async () => {
            try {
                await db.put(DATA_STORE_NAME, data, APP_DATA_KEY);
                await db.put(DATA_STORE_NAME, deletedIds, 'deletedIds');
                // Persist document states separately
                const tx = db.transaction(DOCS_METADATA_STORE_NAME, 'readwrite');
                await Promise.all(
                    data.documents.map(doc => tx.store.put({ localState: doc.localState }, doc.id))
                );
                await tx.done;
            } catch (error) {
                console.error("Failed to save data to IndexedDB:", error);
            }
        };
        saveData();
    }, [data, deletedIds, isDataLoading]);

    // --- Data Manipulation Wrappers ---
    const createSetter = <K extends keyof AppData>(key: K) => (updater: React.SetStateAction<AppData[K]>) => {
        setData(prevData => {
            const oldValue = prevData[key];
            const newValue = typeof updater === 'function' ? (updater as (prevState: AppData[K]) => AppData[K])(oldValue) : updater;
            
            if (newValue !== oldValue) {
                setIsDirty(true);
                return { ...prevData, [key]: newValue };
            }
            return prevData;
        });
    };

    const setClients = createSetter('clients');
    const setAdminTasks = createSetter('adminTasks');
    const setAppointments = createSetter('appointments');
    const setAccountingEntries = createSetter('accountingEntries');
    const setInvoices = createSetter('invoices');
    const setAssistants = createSetter('assistants');
    const setDocuments = createSetter('documents');
    const setProfiles = createSetter('profiles');
    const setSiteFinances = createSetter('siteFinances');
    
    const setFullData = (newData: any) => {
        const validated = validateAndFixData(newData, user);
        setData(validated);
        setDeletedIds(getInitialDeletedIds());
        setIsDirty(true);
    };

    // --- Synchronization ---
    const { manualSync, fetchAndRefresh } = useSync({
        user,
        localData: data,
        deletedIds,
        onDataSynced: (mergedData) => {
            const validatedData = validateAndFixData(mergedData, user);
            setData(validatedData);
            setIsDirty(false);
        },
        onDeletionsSynced: (syncedDeletions) => {
            const newDeletedIds = getInitialDeletedIds();
            for (const key of Object.keys(deletedIds) as Array<keyof DeletedIds>) {
                const currentSet = new Set(deletedIds[key]);
                (syncedDeletions[key] || []).forEach(id => currentSet.delete(typeof id === 'number' ? id : String(id)));
                newDeletedIds[key] = Array.from(currentSet) as any;
            }
            setDeletedIds(newDeletedIds);
        },
        onSyncStatusChange: (status, error) => {
            setSyncStatus(status);
            setLastSyncError(error);
        },
        isOnline,
        isAuthLoading,
        syncStatus
    });

    React.useEffect(() => {
        if (!isOnline || isDataLoading) return;
        manualSync(true); // Initial pull
    }, [isOnline, user, isDataLoading]);

    React.useEffect(() => {
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        if (isOnline && isDirty && isAutoSyncEnabled && !isAuthLoading && user) {
            syncTimeoutRef.current = setTimeout(() => {
                manualSync();
            }, 3000); // Debounce sync
        }
        return () => { if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current) };
    }, [isOnline, isDirty, isAutoSyncEnabled, user, isAuthLoading, data, deletedIds]);
    
    // --- Realtime ---
    React.useEffect(() => {
        if (!isOnline || !supabase || !user) return;
        const channel: RealtimeChannel = supabase.channel('public:tables');
        channel
            .on('postgres_changes', { event: '*', schema: 'public' }, payload => {
                console.log('Realtime change received:', payload);
                fetchAndRefresh();
            })
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') console.log('Realtime channel subscribed.');
                if (err) console.error('Realtime subscription error:', err);
            });
        return () => { supabase.removeChannel(channel); };
    }, [isOnline, supabase, user, fetchAndRefresh]);

    // --- Memos ---
    const allSessions = React.useMemo(() => data.clients.flatMap(c => c.cases.flatMap(cs => cs.stages.flatMap(st => st.sessions.map(s => ({...s, stageId: st.id, stageDecisionDate: st.decisionDate }))))), [data.clients]);
    const unpostponedSessions = React.useMemo(() => allSessions.filter(s => !s.isPostponed && isBeforeToday(s.date) && !s.stageDecisionDate), [allSessions]);
    
    // --- Business Logic ---
    const postponeSession = (sessionId: string, newDate: Date, newReason: string) => {
        setClients(clients => {
            let sessionToClone: Session | null = null;
            let targetStageId: string | null = null;
            let wasUpdated = false;
            
            // First pass: mark old session and find details for the new one
            const updatedClientsWithPostponed = clients.map(client => ({
                ...client,
                cases: client.cases.map(caseItem => ({
                    ...caseItem,
                    stages: caseItem.stages.map(stage => {
                        const sessionIndex = stage.sessions.findIndex(s => s.id === sessionId);
                        if (sessionIndex > -1 && !stage.sessions[sessionIndex].isPostponed) {
                            wasUpdated = true;
                            sessionToClone = { ...stage.sessions[sessionIndex] };
                            targetStageId = stage.id;
                            
                            const updatedSessions = [...stage.sessions];
                            updatedSessions[sessionIndex] = {
                                ...updatedSessions[sessionIndex],
                                isPostponed: true,
                                nextSessionDate: newDate,
                                nextPostponementReason: newReason,
                                updated_at: new Date(),
                            };
                            return { ...stage, sessions: updatedSessions, updated_at: new Date() };
                        }
                        return stage;
                    })
                }))
            }));
            
            if (!wasUpdated || !sessionToClone || !targetStageId) {
                return clients; // Session not found or already postponed, return original state
            }
            
            // Create the new session
            const newSession: Session = {
                id: `session-${Date.now()}`,
                court: sessionToClone.court,
                caseNumber: sessionToClone.caseNumber,
                date: newDate,
                clientName: sessionToClone.clientName,
                opponentName: sessionToClone.opponentName,
                postponementReason: newReason,
                isPostponed: false,
                assignee: sessionToClone.assignee,
                updated_at: new Date(),
            };

            // Second pass: insert the new session into the correct stage
            return updatedClientsWithPostponed.map(client => ({
                ...client,
                updated_at: client.cases.some(cs => cs.stages.some(st => st.id === targetStageId)) ? new Date() : client.updated_at,
                cases: client.cases.map(caseItem => ({
                    ...caseItem,
                    updated_at: caseItem.stages.some(st => st.id === targetStageId) ? new Date() : caseItem.updated_at,
                    stages: caseItem.stages.map(stage => {
                        if (stage.id === targetStageId) {
                            return { ...stage, sessions: [...stage.sessions, newSession], updated_at: new Date() };
                        }
                        return stage;
                    })
                }))
            }));
        });
    };

    const deleteFromData = (key: keyof AppData, id: string) => {
        (setData as any)( (prev: AppData) => ({ ...prev, [key]: (prev[key] as any[]).filter(item => item.id !== id) }));
        setIsDirty(true);
    };

    const deleteClient = (clientId: string) => {
        const client = data.clients.find(c => c.id === clientId);
        if (!client) return;
        const caseIds = client.cases.map(c => c.id);
        const stageIds = client.cases.flatMap(c => c.stages.map(s => s.id));
        const sessionIds = client.cases.flatMap(c => c.stages.flatMap(s => s.sessions.map(session => session.id)));
        const invoiceIds = data.invoices.filter(inv => inv.clientId === clientId).map(inv => inv.id);
        const invoiceItemIds = data.invoices.filter(inv => inv.clientId === clientId).flatMap(inv => inv.items.map(item => item.id));

        deleteFromData('clients', clientId);
        setDeletedIds(prev => ({
            ...prev,
            clients: [...prev.clients, clientId],
            cases: [...prev.cases, ...caseIds],
            stages: [...prev.stages, ...stageIds],
            sessions: [...prev.sessions, ...sessionIds],
            invoices: [...prev.invoices, ...invoiceIds],
            invoiceItems: [...prev.invoiceItems, ...invoiceItemIds],
        }));
    };

    const deleteCase = (caseId: string, clientId: string) => {
        const client = data.clients.find(c => c.id === clientId);
        const caseToDelete = client?.cases.find(c => c.id === caseId);
        if (!client || !caseToDelete) return;

        const stageIds = caseToDelete.stages.map(s => s.id);
        const sessionIds = caseToDelete.stages.flatMap(s => s.sessions.map(session => session.id));
        
        setClients(prev => prev.map(c => c.id === clientId ? { ...c, cases: c.cases.filter(cs => cs.id !== caseId) } : c));
        setDeletedIds(prev => ({ ...prev, cases: [...prev.cases, caseId], stages: [...prev.stages, ...stageIds], sessions: [...prev.sessions, ...sessionIds] }));
    };

    const deleteStage = (stageId: string, caseId: string, clientId: string) => {
        const stage = data.clients.find(c => c.id === clientId)?.cases.find(cs => cs.id === caseId)?.stages.find(st => st.id === stageId);
        if (!stage) return;
        const sessionIds = stage.sessions.map(s => s.id);

        setClients(prev => prev.map(c => c.id === clientId ? { ...c, cases: c.cases.map(cs => cs.id === caseId ? { ...cs, stages: cs.stages.filter(st => st.id !== stageId)} : cs)} : c));
        setDeletedIds(prev => ({ ...prev, stages: [...prev.stages, stageId], sessions: [...prev.sessions, ...sessionIds] }));
    };

    const deleteSession = (sessionId: string, stageId: string, caseId: string, clientId: string) => {
        setClients(prev => prev.map(c => c.id === clientId ? { ...c, cases: c.cases.map(cs => cs.id === caseId ? { ...cs, stages: cs.stages.map(st => st.id === stageId ? {...st, sessions: st.sessions.filter(s => s.id !== sessionId)} : st) } : cs) } : c));
        setDeletedIds(prev => ({...prev, sessions: [...prev.sessions, sessionId]}));
    };

    const deleteAdminTask = (taskId: string) => { deleteFromData('adminTasks', taskId); setDeletedIds(p => ({ ...p, adminTasks: [...p.adminTasks, taskId]})); };
    const deleteAppointment = (appointmentId: string) => { deleteFromData('appointments', appointmentId); setDeletedIds(p => ({ ...p, appointments: [...p.appointments, appointmentId]})); };
    const deleteAccountingEntry = (entryId: string) => { deleteFromData('accountingEntries', entryId); setDeletedIds(p => ({ ...p, accountingEntries: [...p.accountingEntries, entryId]})); };
    
    const deleteInvoice = (invoiceId: string) => {
        const invoice = data.invoices.find(i => i.id === invoiceId);
        if (!invoice) return;
        const itemIds = invoice.items.map(item => item.id);
        deleteFromData('invoices', invoiceId);
        setDeletedIds(p => ({ ...p, invoices: [...p.invoices, invoiceId], invoiceItems: [...p.invoiceItems, ...itemIds]}));
    };

    const deleteAssistant = (name: string) => {
        setData(d => ({...d, assistants: d.assistants.filter(a => a !== name)}));
        setDeletedIds(p => ({...p, assistants: [...p.assistants, name]}));
    };

    // --- Documents ---
    const addDocuments = async (caseId: string, files: FileList) => {
        if (!userId) return;
        const db = dbRef.current;
        if (!db) return;
    
        const newDocs: CaseDocument[] = [];
        const fileEntries: { id: string; file: File }[] = [];
    
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const docId = `doc-${Date.now()}-${i}`;
            const newDoc: CaseDocument = {
                id: docId,
                caseId,
                userId,
                name: file.name,
                type: file.type,
                size: file.size,
                addedAt: new Date(),
                storagePath: `${userId}/${caseId}/${docId}-${file.name}`,
                localState: 'pending_upload',
                updated_at: new Date(),
            };
            newDocs.push(newDoc);
            fileEntries.push({ id: docId, file });
        }
    
        setDocuments(prev => [...newDocs, ...prev]);
        
        try {
            const tx = db.transaction([DOCS_FILES_STORE_NAME, DOCS_METADATA_STORE_NAME], 'readwrite');
            await Promise.all([
                ...fileEntries.map(entry => tx.objectStore(DOCS_FILES_STORE_NAME).put(entry.file, entry.id)),
                ...newDocs.map(doc => tx.objectStore(DOCS_METADATA_STORE_NAME).put({ localState: doc.localState }, doc.id))
            ]);
            await tx.done;
        } catch (error) {
            console.error('Failed to save documents to IndexedDB:', error);
        }
    };
    
    const deleteDocument = async (doc: CaseDocument) => {
        const db = dbRef.current;
        if (!db) return;
        
        setDocuments(prev => prev.filter(d => d.id !== doc.id));
        setDeletedIds(p => ({ ...p, documents: [...p.documents, doc.id], documentPaths: [...p.documentPaths, doc.storagePath] }));
        
        try {
            await Promise.all([
                db.delete(DOCS_FILES_STORE_NAME, doc.id),
                db.delete(DOCS_METADATA_STORE_NAME, doc.id)
            ]);
        } catch (error) {
            console.error('Failed to delete document from IndexedDB:', error);
        }
    };

    const getDocumentFile = async (doc: CaseDocument): Promise<File | null> => {
        const db = dbRef.current;
        if (!db) return null;
        
        let file = await db.get(DOCS_FILES_STORE_NAME, doc.id);
        if (file) return file;
        
        if (isOnline && supabase) {
            setDocuments(docs => docs.map(d => d.id === doc.id ? {...d, localState: 'downloading'} : d));
            const { data: blob, error } = await supabase.storage.from('documents').download(doc.storagePath);
            if (error || !blob) {
                console.error("Failed to download file:", error);
                setDocuments(docs => docs.map(d => d.id === doc.id ? {...d, localState: 'error'} : d));
                return null;
            }
            file = new File([blob], doc.name, { type: doc.type });
            await db.put(DOCS_FILES_STORE_NAME, file, doc.id);
            await db.put(DOCS_METADATA_STORE_NAME, { localState: 'synced' }, doc.id);
            setDocuments(docs => docs.map(d => d.id === doc.id ? {...d, localState: 'synced'} : d));
            return file;
        }
        return null;
    };
    
    // --- Appointment Notifier ---
    React.useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date();
            const upcoming = data.appointments.filter(apt => {
                if (apt.completed || apt.notified) return false;
                const aptDate = new Date(apt.date);
                const [hours, minutes] = apt.time.split(':').map(Number);
                aptDate.setHours(hours, minutes, 0, 0);
                const reminderTime = aptDate.getTime() - (apt.reminderTimeInMinutes || 15) * 60 * 1000;
                return now.getTime() >= reminderTime && now.getTime() < aptDate.getTime();
            });
            if (upcoming.length > 0) {
                setTriggeredAlerts(prev => [...prev, ...upcoming]);
                setAppointments(apts => apts.map(a => upcoming.find(u => u.id === a.id) ? { ...a, notified: true } : a));
            }
        }, 15000); // Check every 15 seconds
        return () => clearInterval(interval);
    }, [data.appointments]);

    const dismissAlert = (appointmentId: string) => {
        setTriggeredAlerts(prev => prev.filter(a => a.id !== appointmentId));
    };
    const dismissRealtimeAlert = (alertId: number) => {
        setRealtimeAlerts(prev => prev.filter(a => a.id !== alertId));
    };

    // --- Daily Backup ---
    const exportData = React.useCallback(() => {
        try {
            const jsonData = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lawyer-app-backup-${toInputDateString(new Date())}.json`;
            a.click();
            URL.revokeObjectURL(url);
            return true;
        } catch (e) {
            console.error("Export failed", e);
            return false;
        }
    }, [data]);

    React.useEffect(() => {
        if (isAutoBackupEnabled && !isDataLoading) {
            const LAST_BACKUP_KEY = 'lawyerAppLastBackupDate';
            const today = toInputDateString(new Date());
            const lastBackup = localStorage.getItem(LAST_BACKUP_KEY);
            if (lastBackup !== today) {
                exportData();
                localStorage.setItem(LAST_BACKUP_KEY, today);
            }
        }
    }, [isAutoBackupEnabled, isDataLoading, exportData]);

    return {
        ...data,
        setClients,
        setAdminTasks,
        setAppointments,
        setAccountingEntries,
        setInvoices,
        setAssistants,
        setDocuments,
        setProfiles,
        setSiteFinances,
        allSessions,
        unpostponedSessions,
        setFullData,
        syncStatus,
        manualSync,
        lastSyncError,
        isDirty,
        userId,
        isDataLoading,
        isAuthLoading,
        isAutoSyncEnabled,
        setAutoSyncEnabled,
        isAutoBackupEnabled,
        setAutoBackupEnabled,
        adminTasksLayout,
        setAdminTasksLayout,
        exportData,
        triggeredAlerts,
        dismissAlert,
        realtimeAlerts,
        dismissRealtimeAlert,
        deleteClient,
        deleteCase,
        deleteStage,
        deleteSession,
        deleteAdminTask,
        deleteAppointment,
        deleteAccountingEntry,
        deleteInvoice,
        deleteAssistant,
        deleteDocument,
        addDocuments,
        getDocumentFile,
        postponeSession,
        showUnpostponedSessionsModal,
        setShowUnpostponedSessionsModal,
    };
};