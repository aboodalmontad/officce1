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
interface UserSettings {
    isAutoSyncEnabled: boolean;
    isAutoBackupEnabled: boolean;
    adminTasksLayout: 'horizontal' | 'vertical';
}

const defaultSettings: UserSettings = {
    isAutoSyncEnabled: true,
    isAutoBackupEnabled: true,
    adminTasksLayout: 'horizontal',
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
const DB_VERSION = 6; // Bump version to force schema correction for all users.
const DATA_STORE_NAME = 'appData';
const DOCS_FILES_STORE_NAME = 'caseDocumentFiles';
const DOCS_METADATA_STORE_NAME = 'caseDocumentMetadata';


async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, tx) {
      console.log(`Upgrading DB from version ${oldVersion} to ${DB_VERSION}`);
      
      // Ensure standard stores exist
      if (!db.objectStoreNames.contains(DATA_STORE_NAME)) {
        db.createObjectStore(DATA_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(DOCS_FILES_STORE_NAME)) {
        db.createObjectStore(DOCS_FILES_STORE_NAME);
      }

      // Robustly handle the metadata store migration
      if (db.objectStoreNames.contains(DOCS_METADATA_STORE_NAME)) {
        const store = tx.objectStore(DOCS_METADATA_STORE_NAME);
        // The old, incorrect schema had a keyPath. The new one does not.
        // If we find a keyPath, it's the wrong schema and must be recreated.
        if (store.keyPath) { 
          console.log(`Recreating '${DOCS_METADATA_STORE_NAME}' to fix keyPath issue.`);
          db.deleteObjectStore(DOCS_METADATA_STORE_NAME);
          db.createObjectStore(DOCS_METADATA_STORE_NAME);
        }
      } else {
        // If the store doesn't exist at all (new install or broken state from a faulty v5 upgrade), create it.
        console.log(`Creating '${DOCS_METADATA_STORE_NAME}'.`);
        db.createObjectStore(DOCS_METADATA_STORE_NAME);
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
                                        postponementReason: session.postponementReason,
                                        nextPostponementReason: session.nextPostponementReason,
                                        isPostponed: !!session.isPostponed,
                                        nextSessionDate: session.nextSessionDate ? reviveDate(session.nextSessionDate) : undefined,
                                        assignee: session.assignee,
                                        stageId: session.stageId,
                                        stageDecisionDate: session.stageDecisionDate,
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
                completed: !!task.completed,
                importance: ['normal', 'important', 'urgent'].includes(task.importance) ? task.importance : 'normal',
                assignee: task.assignee,
                location: task.location,
                updated_at: reviveDate(task.updated_at),
            };
        }),
        appointments: safeArray(loadedData.appointments, (apt) => {
            if (!isValidObject(apt) || !apt.id) return undefined;
            return {
                id: String(apt.id),
                title: String(apt.title || ''),
                time: String(apt.time || '00:00'),
                date: reviveDate(apt.date),
                importance: ['normal', 'important', 'urgent'].includes(apt.importance) ? apt.importance : 'normal',
                completed: !!apt.completed,
                notified: !!apt.notified,
                reminderTimeInMinutes: Number(apt.reminderTimeInMinutes || 15),
                assignee: apt.assignee,
                updated_at: reviveDate(apt.updated_at),
            };
        }),
        accountingEntries: safeArray(loadedData.accountingEntries, (entry) => {
            if (!isValidObject(entry) || !entry.id) return undefined;
            return {
                id: String(entry.id),
                type: ['income', 'expense'].includes(entry.type) ? entry.type : 'income',
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
                caseId: invoice.caseId,
                caseSubject: invoice.caseSubject,
                issueDate: reviveDate(invoice.issueDate),
                dueDate: reviveDate(invoice.dueDate),
                items: safeArray(invoice.items, (item) => {
                    if (!isValidObject(item) || !item.id) return undefined;
                    return {
                        id: String(item.id),
                        description: String(item.description || ''),
                        amount: Number(item.amount || 0),
                        updated_at: reviveDate(item.updated_at),
                    };
                }),
                taxRate: Number(invoice.taxRate || 0),
                discount: Number(invoice.discount || 0),
                status: ['draft', 'sent', 'paid', 'overdue'].includes(invoice.status) ? invoice.status : 'draft',
                notes: invoice.notes,
                updated_at: reviveDate(invoice.updated_at),
            };
        }),
        assistants: validateAssistantsList(loadedData.assistants),
        documents: safeArray(loadedData.documents, (doc) => validateDocuments(doc, userId)),
        profiles: safeArray(loadedData.profiles, (p) => {
            if (!isValidObject(p) || !p.id) return undefined;
            return {
                id: String(p.id),
                full_name: String(p.full_name || ''),
                mobile_number: String(p.mobile_number || ''),
                is_approved: !!p.is_approved,
                is_active: p.is_active !== false,
                subscription_start_date: p.subscription_start_date || null,
                subscription_end_date: p.subscription_end_date || null,
                role: ['user', 'admin'].includes(p.role) ? p.role : 'user',
                created_at: p.created_at,
                updated_at: reviveDate(p.updated_at),
            };
        }),
        siteFinances: safeArray(loadedData.siteFinances, (sf) => {
            if (!isValidObject(sf) || !sf.id) return undefined;
            return {
                id: Number(sf.id),
                user_id: sf.user_id || null,
                type: ['income', 'expense'].includes(sf.type) ? sf.type : 'income',
                payment_date: String(sf.payment_date || ''),
                amount: Number(sf.amount || 0),
                description: sf.description || null,
                payment_method: sf.payment_method || null,
                category: sf.category,
                profile_full_name: sf.profile_full_name,
                updated_at: reviveDate(sf.updated_at),
            };
        }),
    };
    return validatedData;
};

export const useSupabaseData = (user: User | null, isAuthLoading: boolean) => {
    const [data, setData] = React.useState<AppData>(getInitialData);
    const [deletedIds, setDeletedIds] = React.useState<DeletedIds>(getInitialDeletedIds);
    const [isDirty, setDirty] = React.useState(false);
    const [syncStatus, setSyncStatus] = React.useState<SyncStatus>('loading');
    const [lastSyncError, setLastSyncError] = React.useState<string | null>(null);
    const [isDataLoading, setIsDataLoading] = React.useState(true);
    const [triggeredAlerts, setTriggeredAlerts] = React.useState<Appointment[]>([]);
    const [showUnpostponedSessionsModal, setShowUnpostponedSessionsModal] = React.useState(false);
    const [realtimeAlerts, setRealtimeAlerts] = React.useState<RealtimeAlert[]>([]);
    const isOnline = useOnlineStatus();

    // --- User Settings State ---
    const [userSettings, setUserSettings] = React.useState<UserSettings>(defaultSettings);
    const isAutoSyncEnabled = userSettings.isAutoSyncEnabled;
    const isAutoBackupEnabled = userSettings.isAutoBackupEnabled;
    const adminTasksLayout = userSettings.adminTasksLayout;

    const userRef = React.useRef(user);
    userRef.current = user;

    const setFullData = React.useCallback(async (newData: any) => {
        const validated = validateAndFixData(newData, userRef.current);
        setData(validated);
        setDirty(true);
        const db = await getDb();
        await db.put(DATA_STORE_NAME, validated, userRef.current!.id);
        setDirty(true);
    }, []);

    React.useEffect(() => {
        const settingsKey = `userSettings_${user?.id}`;
        try {
            const storedSettings = localStorage.getItem(settingsKey);
            if (storedSettings) {
                setUserSettings(JSON.parse(storedSettings));
            }
        } catch (e) {
            console.error("Failed to load user settings from localStorage", e);
        }
    }, [user?.id]);

    const updateSettings = (updater: (prev: UserSettings) => UserSettings) => {
        const newSettings = updater(userSettings);
        setUserSettings(newSettings);
        const settingsKey = `userSettings_${user?.id}`;
        localStorage.setItem(settingsKey, JSON.stringify(newSettings));
    };

    const setAutoSyncEnabled = (enabled: boolean) => updateSettings(p => ({ ...p, isAutoSyncEnabled: enabled }));
    const setAutoBackupEnabled = (enabled: boolean) => updateSettings(p => ({ ...p, isAutoBackupEnabled: enabled }));
    const setAdminTasksLayout = (layout: 'horizontal' | 'vertical') => updateSettings(p => ({ ...p, adminTasksLayout: layout }));

    const handleSyncStatusChange = React.useCallback((status: SyncStatus, error: string | null) => {
        setSyncStatus(status);
        setLastSyncError(error);
    }, []);

    const handleDataSynced = React.useCallback(async (mergedData: AppData) => {
        try {
            const validatedMergedData = validateAndFixData(mergedData, userRef.current);
            const db = await getDb();
            const localDocsMetadata = await db.getAll(DOCS_METADATA_STORE_NAME);
            
            const finalDocs = safeArray(validatedMergedData.documents, (doc: any) => {
                if (!doc || typeof doc !== 'object' || !doc.id) return undefined;
                // Fix: Explicitly type `meta` as `any` to resolve TypeScript error on property access.
                const localMeta = localDocsMetadata.find((meta: any) => meta.id === doc.id);
                
                const mergedDoc = {
                    ...doc,
                    localState: localMeta?.localState || doc.localState || 'pending_download'
                };
                
                return validateDocuments(mergedDoc, userRef.current?.id || '');
            });

            const finalData = { ...validatedMergedData, documents: finalDocs };

            await db.put(DATA_STORE_NAME, finalData, userRef.current!.id);
            setData(finalData);
            setDirty(false);
        } catch (e) {
            console.error("Critical error in handleDataSynced:", e);
            handleSyncStatusChange('error', 'فشل تحديث البيانات المحلية بعد المزامنة.');
        }
    }, [userRef]);
    
    const handleDeletionsSynced = React.useCallback(async (syncedDeletions: Partial<DeletedIds>) => {
        const newDeletedIds = { ...deletedIds };
        let changed = false;
        for (const key of Object.keys(syncedDeletions) as Array<keyof DeletedIds>) {
            // Fix: Cast array to `any[]` to satisfy `new Set` which expects a single iterable type,
            // but `syncedDeletions[key]` can be `string[]` or `number[]`.
            const synced = new Set((syncedDeletions[key] || []) as any[]);
            if (synced.size > 0) {
                newDeletedIds[key] = newDeletedIds[key].filter(id => !synced.has(id as any));
                changed = true;
            }
        }
        if (changed) {
            setDeletedIds(newDeletedIds);
            const db = await getDb();
            await db.put(DATA_STORE_NAME, newDeletedIds, `deletedIds_${userRef.current!.id}`);
        }
    }, [deletedIds]);

    const { manualSync, fetchAndRefresh } = useSync({
        user, localData: data, deletedIds,
        onDataSynced: handleDataSynced,
        onDeletionsSynced: handleDeletionsSynced,
        onSyncStatusChange: handleSyncStatusChange,
        isOnline, isAuthLoading, syncStatus
    });

    React.useEffect(() => {
        if (!user || isAuthLoading) {
            if (!isAuthLoading) setIsDataLoading(false);
            return;
        }
        setIsDataLoading(true);
        let cancelled = false;

        const loadData = async () => {
            try {
                const db = await getDb();
                const [storedData, storedDeletedIds, localDocsMetadata] = await Promise.all([
                    db.get(DATA_STORE_NAME, user.id),
                    db.get(DATA_STORE_NAME, `deletedIds_${user.id}`),
                    db.getAll(DOCS_METADATA_STORE_NAME)
                ]);
                
                if (cancelled) return;

                const validatedData = validateAndFixData(storedData, user);
                
                const localDocsMetadataMap = new Map(localDocsMetadata.map(meta => [meta.id, meta]));

                const finalDocs = validatedData.documents.map(doc => {
                    const localMeta = localDocsMetadataMap.get(doc.id);
                    return { ...doc, localState: localMeta?.localState || doc.localState || 'pending_download' };
                }).filter(doc => !!doc) as CaseDocument[];
                
                const finalData = { ...validatedData, documents: finalDocs };
                
                setData(finalData);
                setDeletedIds(storedDeletedIds || getInitialDeletedIds());
                
                if (isOnline) {
                    await manualSync(true);
                } else {
                    setSyncStatus('synced'); // Offline but data loaded
                }
            } catch (error) {
                console.error('Failed to load data from IndexedDB:', error);
                setSyncStatus('error', 'فشل تحميل البيانات المحلية.');
            } finally {
                if (!cancelled) setIsDataLoading(false);
            }
        };
        loadData();
        return () => { cancelled = true; };
    }, [user, isAuthLoading]);

    React.useEffect(() => {
        if (isOnline && isDirty && isAutoSyncEnabled && syncStatus !== 'syncing') {
            const handler = setTimeout(() => {
                manualSync();
            }, 3000);
            return () => clearTimeout(handler);
        }
    }, [isOnline, isDirty, isAutoSyncEnabled, syncStatus, manualSync]);
    
    // Auto backup effect
    React.useEffect(() => {
        if (isAutoBackupEnabled && !isDataLoading) {
            const todayStr = toInputDateString(new Date());
            const lastBackupKey = `lastBackupDate_${user?.id}`;
            const lastBackupDate = localStorage.getItem(lastBackupKey);

            if (todayStr !== lastBackupDate) {
                 if (exportData()) {
                    localStorage.setItem(lastBackupKey, todayStr);
                    console.log(`Automatic daily backup created for ${todayStr}.`);
                 }
            }
        }
    }, [isAutoBackupEnabled, isDataLoading, user?.id]);

    React.useEffect(() => {
        const checkAppointments = () => {
            const now = new Date();
            const upcomingAppointments = data.appointments.filter(apt => {
                if (apt.completed || apt.notified || !apt.reminderTimeInMinutes) return false;
                const aptDate = new Date(apt.date);
                const [hours, minutes] = apt.time.split(':').map(Number);
                aptDate.setHours(hours, minutes, 0, 0);
                const reminderTime = new Date(aptDate.getTime() - apt.reminderTimeInMinutes * 60000);
                return now >= reminderTime && now < aptDate;
            });

            if (upcomingAppointments.length > 0) {
                setTriggeredAlerts(prev => {
                    const newAlerts = upcomingAppointments.filter(apt => !prev.find(p => p.id === apt.id));
                    return [...prev, ...newAlerts];
                });

                setData(currentData => ({
                    ...currentData,
                    appointments: currentData.appointments.map(apt =>
                        upcomingAppointments.find(upcoming => upcoming.id === apt.id) ? { ...apt, notified: true, updated_at: new Date() } : apt
                    ),
                }));
                setDirty(true);
            }
        };
        const interval = setInterval(checkAppointments, 30000);
        return () => clearInterval(interval);
    }, [data.appointments]);
    
     // Realtime Subscription
    React.useEffect(() => {
        if (!isOnline || !user) return;

        const supabase = getSupabaseClient();
        if (!supabase) return;

        const handleRealtimeUpdate = (payload: any) => {
            console.log('Realtime change received:', payload);
            setRealtimeAlerts(prev => [...prev, { id: Date.now(), message: `تم تحديث البيانات من قبل مستخدم آخر.` }]);
            fetchAndRefresh();
        };

        const channel = supabase.channel('public:all_tables')
            .on('postgres_changes', { event: '*', schema: 'public' }, handleRealtimeUpdate)
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') console.log('Real-time subscription active.');
                if (err) console.error('Real-time subscription error.', err);
            });

        return () => {
            channel.unsubscribe();
        };
    }, [isOnline, user, fetchAndRefresh]);

    // This effect handles automatic file uploads when the app is online.
    React.useEffect(() => {
        if (!isOnline || !user) return;

        const uploadPendingFiles = async () => {
            const db = await getDb();
            const supabase = getSupabaseClient();
            if (!supabase) return;

            // Find documents that are marked for upload
            const docsToUpload = data.documents.filter(d => d.localState === 'pending_upload');
            if (docsToUpload.length === 0) return;

            let documentsUpdated = false;
            const updatedDocuments = [...data.documents];

            for (const doc of docsToUpload) {
                try {
                    const file = await db.get(DOCS_FILES_STORE_NAME, doc.id);
                    if (!file) throw new Error(`File for doc ${doc.id} not found in local DB for upload.`);
                    
                    const { error: uploadError } = await supabase.storage.from('documents').upload(doc.storagePath, file, { upsert: true });

                    if (uploadError && !uploadError.message.includes('Duplicate')) throw uploadError;

                    await db.put(DOCS_METADATA_STORE_NAME, { ...doc, localState: 'synced' }, doc.id);
                    const docIndex = updatedDocuments.findIndex(d => d.id === doc.id);
                    if (docIndex > -1) {
                        updatedDocuments[docIndex] = { ...updatedDocuments[docIndex], localState: 'synced' };
                        documentsUpdated = true;
                    }
                } catch (error) {
                    console.error(`Failed to upload document ${doc.id}:`, error);
                    await db.put(DOCS_METADATA_STORE_NAME, { ...doc, localState: 'error' }, doc.id);
                    const docIndex = updatedDocuments.findIndex(d => d.id === doc.id);
                    if (docIndex > -1) {
                        updatedDocuments[docIndex] = { ...updatedDocuments[docIndex], localState: 'error' };
                        documentsUpdated = true;
                    }
                }
            }

            if (documentsUpdated) {
                setData(prev => ({ ...prev, documents: updatedDocuments }));
                setDirty(true); // Mark data as dirty to sync the updated 'localState'
            }
        };

        const handler = setTimeout(uploadPendingFiles, 2000); // Debounce to avoid rapid firing
        return () => clearTimeout(handler);

    }, [isOnline, user, data.documents]);

    const dismissAlert = (appointmentId: string) => {
        setTriggeredAlerts(prev => prev.filter(a => a.id !== appointmentId));
    };
    
    const dismissRealtimeAlert = (alertId: number) => {
        setRealtimeAlerts(prev => prev.filter(a => a.id !== alertId));
    };

    const updateNestedState = (clientId: string, caseId: string, stageId: string, sessionId: string | null, updater: (session: Session) => Session) => {
         setData(prev => ({ ...prev, clients: prev.clients.map(c => {
            if (c.id !== clientId) return c;
            return { ...c, updated_at: new Date(), cases: c.cases.map(cs => {
                if (cs.id !== caseId) return cs;
                return { ...cs, updated_at: new Date(), stages: cs.stages.map(st => {
                    if (st.id !== stageId) return st;
                    const sessionIndex = sessionId ? st.sessions.findIndex(s => s.id === sessionId) : -1;
                    if (sessionIndex === -1 && sessionId) return st; // session not found
                    return {
                        ...st,
                        updated_at: new Date(),
                        sessions: sessionId ? st.sessions.map((s, idx) => idx === sessionIndex ? updater(s) : s) : st.sessions,
                    };
                })};
            })};
        })}));
        setDirty(true);
    };

    const postponeSession = (sessionId: string, newDate: Date, newReason: string) => {
        let found = false;
        for (const client of data.clients) {
            for (const caseItem of client.cases) {
                for (const stage of caseItem.stages) {
                    const session = stage.sessions.find(s => s.id === sessionId);
                    if (session) {
                        updateNestedState(client.id, caseItem.id, stage.id, sessionId, s => ({
                            ...s,
                            isPostponed: true,
                            nextSessionDate: newDate,
                            nextPostponementReason: newReason,
                            updated_at: new Date(),
                        }));
                        found = true; break;
                    }
                }
                if (found) break;
            }
            if (found) break;
        }
    };
    
    // --- Memos for derived data ---
    const allSessions = React.useMemo<(Session & { stageId?: string, stageDecisionDate?: Date })[]>(() => {
        const sessions: (Session & { stageId?: string, stageDecisionDate?: Date })[] = [];
        if (data.clients) {
            for (const client of data.clients) {
                if (client && client.cases) {
                    for (const caseItem of client.cases) {
                        if (caseItem && caseItem.stages) {
                            for (const stage of caseItem.stages) {
                                if (stage && stage.sessions) {
                                    for (const session of stage.sessions) {
                                        if (session) {
                                            sessions.push({ ...session, stageId: stage.id, stageDecisionDate: stage.decisionDate });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        return sessions;
    }, [data.clients]);

    const unpostponedSessions = React.useMemo(() => {
        const sessions: (Session & { stageId?: string, stageDecisionDate?: Date })[] = [];
        if (data.clients) {
            for (const client of data.clients) {
                if (!client || !client.cases) continue;
                for (const caseItem of client.cases) {
                    if (!caseItem || !caseItem.stages) continue;
                    for (const stage of caseItem.stages) {
                        if (!stage || !stage.sessions) continue;
                        for (const session of stage.sessions) {
                             if (session && !session.isPostponed && isBeforeToday(session.date) && !stage.decisionDate) {
                                sessions.push({ ...session, stageId: stage.id, stageDecisionDate: stage.decisionDate });
                            }
                        }
                    }
                }
            }
        }
        return sessions;
    }, [data.clients]);

    // --- Deletion functions ---
    const createDeleteFunction = <T extends keyof DeletedIds>(entity: T) => async (id: DeletedIds[T][number]) => {
        const db = await getDb();
        const newDeletedIds = { ...deletedIds, [entity]: [...deletedIds[entity], id] };
        setDeletedIds(newDeletedIds);
        await db.put(DATA_STORE_NAME, newDeletedIds, `deletedIds_${user!.id}`);
        setDirty(true);
    };

    const deleteClient = (clientId: string) => { setData(p => ({ ...p, clients: p.clients.filter(c => c.id !== clientId) })); createDeleteFunction('clients')(clientId); };
    const deleteCase = (caseId: string, clientId: string) => { setData(p => ({ ...p, clients: p.clients.map(c => c.id === clientId ? { ...c, cases: c.cases.filter(cs => cs.id !== caseId) } : c) })); createDeleteFunction('cases')(caseId); };
    const deleteStage = (stageId: string, caseId: string, clientId: string) => { setData(p => ({ ...p, clients: p.clients.map(c => c.id === clientId ? { ...c, cases: p.cases.map(cs => cs.id === caseId ? { ...cs, stages: cs.stages.filter(st => st.id !== stageId) } : cs) } : c) })); createDeleteFunction('stages')(stageId); };
    const deleteSession = (sessionId: string, stageId: string, caseId: string, clientId: string) => { setData(p => ({ ...p, clients: p.clients.map(c => c.id === clientId ? { ...c, cases: p.cases.map(cs => cs.id === caseId ? { ...cs, stages: cs.stages.map(st => st.id === stageId ? { ...st, sessions: st.sessions.filter(s => s.id !== sessionId) } : st) } : cs) } : c) })); createDeleteFunction('sessions')(sessionId); };
    const deleteAdminTask = (taskId: string) => { setData(p => ({...p, adminTasks: p.adminTasks.filter(t => t.id !== taskId)})); createDeleteFunction('adminTasks')(taskId); };
    const deleteAppointment = (appointmentId: string) => { setData(p => ({...p, appointments: p.appointments.filter(a => a.id !== appointmentId)})); createDeleteFunction('appointments')(appointmentId); };
    const deleteAccountingEntry = (entryId: string) => { setData(p => ({...p, accountingEntries: p.accountingEntries.filter(e => e.id !== entryId)})); createDeleteFunction('accountingEntries')(entryId); };
    const deleteInvoice = (invoiceId: string) => { setData(p => ({...p, invoices: p.invoices.filter(i => i.id !== invoiceId)})); createDeleteFunction('invoices')(invoiceId); };
    const deleteAssistant = (name: string) => { setData(p => ({...p, assistants: p.assistants.filter(a => a !== name)})); createDeleteFunction('assistants')(name); };
    const deleteDocument = async (doc: CaseDocument) => {
        const db = await getDb();
        await db.delete(DOCS_FILES_STORE_NAME, doc.id);
        await db.delete(DOCS_METADATA_STORE_NAME, doc.id);
        setData(p => ({ ...p, documents: p.documents.filter(d => d.id !== doc.id) }));
        const newDeletedIds = { ...deletedIds, documents: [...deletedIds.documents, doc.id], documentPaths: [...deletedIds.documentPaths, doc.storagePath] };
        setDeletedIds(newDeletedIds);
        await db.put(DATA_STORE_NAME, newDeletedIds, `deletedIds_${user!.id}`);
        setDirty(true);
    };

    const addDocuments = async (caseId: string, files: FileList) => {
        const db = await getDb();
        const newDocs: CaseDocument[] = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const docId = `doc-${Date.now()}-${i}`;
            
            const lastDot = file.name.lastIndexOf('.');
            const extension = lastDot !== -1 ? file.name.substring(lastDot) : '';
            const safeStoragePath = `${user!.id}/${caseId}/${docId}${extension}`;

            const doc: CaseDocument = {
                id: docId,
                caseId,
                userId: user!.id,
                name: file.name,
                type: file.type || 'application/octet-stream',
                size: file.size,
                addedAt: new Date(),
                storagePath: safeStoragePath,
                localState: 'pending_upload',
                updated_at: new Date(),
            };
            await db.put(DOCS_FILES_STORE_NAME, file, doc.id);
            await db.put(DOCS_METADATA_STORE_NAME, doc, doc.id);
            newDocs.push(doc);
        }
        setData(p => ({...p, documents: [...p.documents, ...newDocs]}));
        setDirty(true);
    };

    const getDocumentFile = async (docId: string): Promise<File | null> => {
        const db = await getDb();
        const supabase = getSupabaseClient();
        const doc = data.documents.find(d => d.id === docId);
    
        if (!doc) {
            console.error(`Document metadata not found for id: ${docId}`);
            return null;
        }
    
        const localFile = await db.get(DOCS_FILES_STORE_NAME, docId);
        if (localFile) {
            return localFile;
        }
    
        if (doc.localState === 'pending_download' && isOnline && supabase) {
            try {
                setData(p => ({...p, documents: p.documents.map(d => d.id === docId ? {...d, localState: 'downloading' } : d)}));
    
                const { data: blob, error: downloadError } = await supabase.storage.from('documents').download(doc.storagePath);
                if (downloadError) throw downloadError;
                if (!blob) throw new Error("Download returned an empty blob.");
    
                const downloadedFile = new File([blob], doc.name, { type: doc.type });
    
                await db.put(DOCS_FILES_STORE_NAME, downloadedFile, doc.id);
                await db.put(DOCS_METADATA_STORE_NAME, { ...doc, localState: 'synced' }, doc.id);
    
                setData(p => ({...p, documents: p.documents.map(d => d.id === docId ? {...d, localState: 'synced'} : d)}));
    
                return downloadedFile;
            } catch (error: any) {
                console.error(`Failed to download document ${docId}:`, error);
                await db.put(DOCS_METADATA_STORE_NAME, { ...doc, localState: 'error' }, doc.id);
                setData(p => ({...p, documents: p.documents.map(d => d.id === docId ? {...d, localState: 'error'} : d)}));
                return null;
            }
        }
        
        return null;
    };
    
    const exportData = (): boolean => {
        try {
            const dataToExport = {
                ...data,
                // We don't export profiles or site finances in user backups
                profiles: undefined,
                siteFinances: undefined,
            };
            const jsonString = JSON.stringify(dataToExport, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            a.download = `lawyer_app_backup_${timestamp}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return true;
        } catch (error) {
            console.error('Failed to export data:', error);
            return false;
        }
    };

    return {
        ...data,
        setClients: (updater) => { setData(prev => ({...prev, clients: updater(prev.clients)})); setDirty(true); },
        setAdminTasks: (updater) => { setData(prev => ({...prev, adminTasks: updater(prev.adminTasks)})); setDirty(true); },
        setAppointments: (updater) => { setData(prev => ({...prev, appointments: updater(prev.appointments)})); setDirty(true); },
        setAccountingEntries: (updater) => { setData(prev => ({...prev, accountingEntries: updater(prev.accountingEntries)})); setDirty(true); },
        setInvoices: (updater) => { setData(prev => ({...prev, invoices: updater(prev.invoices)})); setDirty(true); },
        setAssistants: (updater) => { setData(prev => ({...prev, assistants: updater(prev.assistants)})); setDirty(true); },
        setDocuments: (updater) => { setData(prev => ({...prev, documents: updater(prev.documents)})); setDirty(true); },
        setProfiles: (updater) => { setData(prev => ({...prev, profiles: updater(prev.profiles)})); setDirty(true); },
        setSiteFinances: (updater) => { setData(prev => ({...prev, siteFinances: updater(prev.siteFinances)})); setDirty(true); },
        allSessions,
        unpostponedSessions,
        setFullData,
        syncStatus,
        manualSync,
        lastSyncError,
        isDirty,
        userId: user?.id,
        isDataLoading,
        isAutoSyncEnabled, setAutoSyncEnabled,
        isAutoBackupEnabled, setAutoBackupEnabled,
        adminTasksLayout, setAdminTasksLayout,
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
        setShowUnpostponedSessionsModal
    };
};