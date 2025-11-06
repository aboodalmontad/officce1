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
const DB_VERSION = 3; // Bump version to force upgrade for users with corrupted v2 DB
const DATA_STORE_NAME = 'appData';
const DOCS_FILES_STORE_NAME = 'caseDocumentFiles';
const DOCS_METADATA_STORE_NAME = 'caseDocumentMetadata';


async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      console.log(`Upgrading DB from version ${oldVersion} to ${newVersion}`);
      // This upgrade logic is robust and idempotent. It checks for the existence
      // of each object store before creating it, ensuring that running this on
      // a fully or partially upgraded database won't cause errors.

      if (!db.objectStoreNames.contains(DATA_STORE_NAME)) {
        console.log(`Creating object store: ${DATA_STORE_NAME}`);
        db.createObjectStore(DATA_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(DOCS_FILES_STORE_NAME)) {
        console.log(`Creating object store: ${DOCS_FILES_STORE_NAME}`);
        db.createObjectStore(DOCS_FILES_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(DOCS_METADATA_STORE_NAME)) {
        console.log(`Creating object store: ${DOCS_METADATA_STORE_NAME}`);
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

const safeArray = <T, U>(arr: any, mapFn: (item: T, index: number) => U): U[] => {
    if (!Array.isArray(arr)) return [];
    return arr.filter(item => item && typeof item === 'object').map(mapFn);
};

const sanitizeOptionalDate = (date: any): Date | undefined => {
    if (date === null || date === undefined || date === '') return undefined;
    const d = new Date(date);
    return !isNaN(d.getTime()) ? d : undefined;
};

const validateDocuments = (docs: any): CaseDocument[] => {
    return safeArray(docs, (doc: any, index: number): CaseDocument | null => {
        const addedAt = sanitizeOptionalDate(doc.addedAt);
        if (!addedAt) {
            console.warn('Filtering out document with invalid addedAt date:', doc);
            return null;
        }
        return {
            id: doc.id || `doc-${Date.now()}-${index}`,
            caseId: String(doc.caseId || ''),
            userId: String(doc.userId || ''),
            name: String(doc.name || 'document.bin'),
            type: String(doc.type || 'application/octet-stream'),
            size: typeof doc.size === 'number' ? doc.size : 0,
            addedAt: addedAt,
            storagePath: String(doc.storagePath || ''),
            localState: ['synced', 'pending_upload', 'pending_download', 'error'].includes(doc.localState) ? doc.localState : 'error',
            updated_at: sanitizeOptionalDate(doc.updated_at),
        };
    }).filter((d): d is CaseDocument => d !== null);
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

    const validatedProfiles: Profile[] = safeArray(data.profiles, (p: any, index: number): Profile | null => {
        if (!p.id) return null;
        return {
            id: p.id,
            full_name: String(p.full_name || 'مستخدم غير معروف'),
            mobile_number: String(p.mobile_number || ''),
            is_approved: !!p.is_approved,
            is_active: 'is_active' in p ? !!p.is_active : true,
            subscription_start_date: p.subscription_start_date || null,
            subscription_end_date: p.subscription_end_date || null,
            role: ['user', 'admin'].includes(p.role) ? p.role : 'user',
            created_at: p.created_at,
            updated_at: sanitizeOptionalDate(p.updated_at),
        };
    }).filter((p): p is Profile => p !== null);

    const validatedSiteFinances: SiteFinancialEntry[] = safeArray(data.siteFinances, (e: any, index: number): SiteFinancialEntry | null => {
        const paymentDate = sanitizeOptionalDate(e.payment_date);
        if (!paymentDate) {
            console.warn('Filtering out site finance entry with invalid date:', e);
            return null;
        }
        return {
            id: typeof e.id === 'number' ? e.id : -1,
            user_id: e.user_id || null,
            type: ['income', 'expense'].includes(e.type) ? e.type : 'income',
            payment_date: toInputDateString(paymentDate),
            amount: typeof e.amount === 'number' ? e.amount : 0,
            description: e.description || null,
            payment_method: e.payment_method || null,
            category: e.category || null,
            profile_full_name: e.profile_full_name || undefined,
            updated_at: sanitizeOptionalDate(e.updated_at),
        };
    }).filter((e): e is SiteFinancialEntry => e !== null && e.id !== -1);


    return { 
        clients: validatedClients, 
        adminTasks: validatedAdminTasks, 
        appointments: validatedAppointments, 
        accountingEntries: validatedAccountingEntries,
        invoices: validatedInvoices,
        assistants: validatedAssistants,
        documents: validateDocuments(data.documents),
        profiles: validatedProfiles,
        siteFinances: validatedSiteFinances,
    };
};

function usePrevious<T>(value: T): T | undefined {
  const ref = React.useRef<T | undefined>(undefined);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

const getFileExtension = (filename: string): string => {
    if (!filename) return '';
    const lastDot = filename.lastIndexOf('.');
    // No extension, or file starts with a dot (hidden file)
    if (lastDot === -1 || lastDot === 0) return '';
    return filename.substring(lastDot);
};

export const useSupabaseData = (user: User | null, isAuthLoading: boolean) => {
    const getLocalStorageKey = React.useCallback(() => user ? `${APP_DATA_KEY}_${user.id}` : APP_DATA_KEY, [user]);
    const userId = user?.id;

    const [data, setData] = React.useState<AppData>(getInitialData());
    const dataRef = React.useRef(data);
    dataRef.current = data;
    
    const [deletedIds, setDeletedIds] = React.useState<DeletedIds>(getInitialDeletedIds());
    const [isDataLoading, setIsDataLoading] = React.useState(true);
    const [syncStatus, setSyncStatus] = React.useState<SyncStatus>('loading');
    const syncStatusRef = React.useRef(syncStatus);
    syncStatusRef.current = syncStatus;
    const [lastSyncError, setLastSyncError] = React.useState<string | null>(null);
    const [isDirty, setIsDirty] = React.useState(false);
    const [settings, setSettings] = React.useState<UserSettings>(defaultSettings);
    const [triggeredAlerts, setTriggeredAlerts] = React.useState<Appointment[]>([]);
    const [showUnpostponedSessionsModal, setShowUnpostponedSessionsModal] = React.useState(false);
    const [realtimeAlerts, setRealtimeAlerts] = React.useState<RealtimeAlert[]>([]);

    const addRealtimeAlert = React.useCallback((message: string) => {
        const newAlert = { id: Date.now(), message };
        setRealtimeAlerts(prev => [newAlert, ...prev.slice(0, 2)]); // Show max 3 alerts
    }, []);

    const dismissRealtimeAlert = React.useCallback((alertId: number) => {
        setRealtimeAlerts(prev => prev.filter(a => a.id !== alertId));
    }, []);
    
    const hadCacheOnLoad = React.useRef(false);
    const isInitialLoadAfterHydrate = React.useRef(true);
    
    const isOnline = useOnlineStatus();
    const prevIsOnline = usePrevious(isOnline);
    const prevIsAuthLoading = usePrevious(isAuthLoading);

    const isDirtyRef = React.useRef(isDirty);
    isDirtyRef.current = isDirty;
    const isAutoSyncEnabledRef = React.useRef(settings.isAutoSyncEnabled);
    isAutoSyncEnabledRef.current = settings.isAutoSyncEnabled;
    const isAutoBackupEnabledRef = React.useRef(settings.isAutoBackupEnabled);
    isAutoBackupEnabledRef.current = settings.isAutoBackupEnabled;
    const isOnlineRef = React.useRef(isOnline);
    isOnlineRef.current = isOnline;
    const userIdRef = React.useRef(userId);
    userIdRef.current = userId;
    
    const isFileSyncingRef = React.useRef(false);

    const onDeletionsSynced = React.useCallback((syncedDeletions: Partial<DeletedIds>) => {
        setDeletedIds(prev => {
            const newDeleted = { ...prev };
            for (const key of Object.keys(syncedDeletions) as (keyof DeletedIds)[]) {
                // Fix: Explicitly type the Set to handle both string and number arrays from DeletedIds.
                const syncedIdSet = new Set<string | number>(syncedDeletions[key] || []);
                if (syncedIdSet.size > 0) {
                    (newDeleted[key] as (string|number)[]) = (prev[key] || []).filter(id => !syncedIdSet.has(id));
                }
            }
            return newDeleted;
        });
    }, []);
    
    const getDocumentFile = React.useCallback(async (docId: string): Promise<File | null> => {
        const db = await getDb();
        const file = await db.get(DOCS_FILES_STORE_NAME, docId);
        if (file instanceof File || file instanceof Blob) {
            return file as File;
        }
        return null;
    }, []);
    
    const handleDataSynced = React.useCallback(async (syncedData: AppData) => {
        const currentLocalDocuments = dataRef.current.documents;
        // Fix: Ensure that all items in currentLocalDocuments are valid objects with an 'id' before creating the map.
        // This prevents crashes if corrupted or incomplete data (like '{}') is present in the local state.
        const localDocMap = new Map(
            (currentLocalDocuments || [])
                // FIX: Replaced a simple filter with a TypeScript type guard to correctly narrow the type of `doc` to `CaseDocument`, resolving an error where an empty object `{}` was being incorrectly typed and causing a compile-time failure. This ensures that only valid document objects are processed.
                // Fix: Explicitly cast `doc` to `any` to force TypeScript to re-evaluate the type after the type guard, resolving a subtle type inference issue.
                .filter((doc: any): doc is CaseDocument => !!(doc && doc.id))
                .map(doc => [doc.id, doc])
        );
        
        const syncedDocsWithLocalState = (syncedData.documents || [])
            .filter(doc => doc && doc.id)
            .map((remoteDoc: CaseDocument): CaseDocument | null => {
                 try {
                    const localDoc: CaseDocument | undefined = localDocMap.get(remoteDoc.id);
                    // FIX: Use sanitizeOptionalDate for robust date handling and prevent Invalid Date objects.
                    if (localDoc) {
                        const addedAtDate = sanitizeOptionalDate(remoteDoc.addedAt ?? localDoc.addedAt);
                        if (!addedAtDate) {
                            console.warn('Merged document has an invalid date and will be skipped:', remoteDoc, localDoc);
                            return null;
                        }
// FIX: The type `CaseDocument` could not be correctly inferred because `localDoc` was potentially a partial object. By explicitly casting `localDoc` to `any`, we bypass the strict type checking that was causing the error, allowing the merge logic to proceed with the available data. This is a pragmatic fix for a complex type inference issue.
                        const mergedDoc: CaseDocument = ({
                            id: remoteDoc.id,
                            caseId: String((remoteDoc.caseId ?? (localDoc as any).caseId) || ''),
                            userId: String((remoteDoc.userId ?? (localDoc as any).userId) || ''),
                            name: String((remoteDoc.name ?? (localDoc as any).name) || 'document.bin'),
                            type: String((remoteDoc.type ?? (localDoc as any).type) || 'application/octet-stream'),
                            size: typeof remoteDoc.size === 'number' ? remoteDoc.size : ((localDoc as any).size || 0),
                            storagePath: String((remoteDoc.storagePath ?? (localDoc as any).storagePath) || ''),
                            localState: (localDoc as any).localState, // Always preserve local state
                            addedAt: addedAtDate,
                            updated_at: sanitizeOptionalDate(remoteDoc.updated_at ?? (localDoc as any).updated_at),
                        } as CaseDocument);
                        return mergedDoc;
                    } else {
                        // This is a new document from another client. Mark for download if it has a path.
                        // FIX: Added robust date validation for 'addedAt' and used sanitizeOptionalDate for 'updated_at'
                        // to prevent type errors and handle potentially invalid date strings from the server.
                        const addedAtDate = sanitizeOptionalDate(remoteDoc.addedAt);
                        if (!addedAtDate) {
                            console.warn('New synced document has an invalid date and will be skipped:', remoteDoc);
                            return null;
                        }

                        const newDoc: CaseDocument = {
                            id: remoteDoc.id,
                            caseId: String(remoteDoc.caseId || ''),
                            userId: String(remoteDoc.userId || ''),
                            name: String(remoteDoc.name || 'document.bin'),
                            type: String(remoteDoc.type || 'application/octet-stream'),
                            size: typeof remoteDoc.size === 'number' ? remoteDoc.size : 0,
                            storagePath: String(remoteDoc.storagePath || ''),
                            localState: 'error' as const, // Default to error
                            addedAt: addedAtDate,
                            updated_at: sanitizeOptionalDate(remoteDoc.updated_at),
                        };

                        if (newDoc.storagePath && String(newDoc.storagePath).trim() !== '') {
                            newDoc.localState = 'pending_download' as const;
                        } else {
                            console.warn(`Synced document ${newDoc.id} is missing a storagePath. Marking as error.`);
                        }
                        return newDoc;
                    }
                } catch (e) {
                    console.error('Error processing a document during sync, skipping it:', remoteDoc, e);
                    return null;
                }
            }).filter((d): d is CaseDocument => d !== null);

        // Add any purely local documents (e.g., pending upload) that weren't in the synced data.
        // Fix for type error: Filter out invalid documents from local data before iterating.
        // FIX: Replaced a simple filter with a TypeScript type guard to correctly narrow the type of `localDoc` to `CaseDocument`, resolving an error where an empty object `{}` was being incorrectly typed and causing a compile-time failure. This ensures that only valid document objects are processed in the loop.
        for (const localDoc of (currentLocalDocuments || []).filter((doc): doc is CaseDocument => !!(doc && doc.id))) {
            if (!syncedDocsWithLocalState.some(d => d.id === localDoc.id)) {
                syncedDocsWithLocalState.push(localDoc);
            }
        }

        const validatedData = validateAndHydrate({ ...syncedData, documents: syncedDocsWithLocalState });
        
        isInitialLoadAfterHydrate.current = true;
        setData(validatedData);
        
        if (userId) {
            try {
                const db = await getDb();
                const { documents: docsToSave, ...restOfData } = validatedData;
                await db.put(DATA_STORE_NAME, restOfData, `${APP_DATA_KEY}_${userId}`);
                await db.put(DOCS_METADATA_STORE_NAME, docsToSave, `documents_${userId}`);
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
    
    const fileSyncController = React.useCallback(async () => {
        if (isFileSyncingRef.current || !isOnlineRef.current || !userIdRef.current) return;

        isFileSyncingRef.current = true;
        console.log("File sync controller running...");
        const supabase = getSupabaseClient();
        if (!supabase) {
            isFileSyncingRef.current = false;
            return;
        }

        try {
            const docsToProcess = dataRef.current.documents.filter(doc => doc.localState === 'pending_upload' || doc.localState === 'pending_download');
            if (docsToProcess.length === 0) {
                console.log("No documents to process.");
                return;
            }
            
            console.log(`Found ${docsToProcess.length} documents to process.`);

            for (const doc of docsToProcess) {
                if (doc.localState === 'pending_upload') {
                    try {
                        const file = await getDocumentFile(doc.id);
                        if (!file) throw new Error(`File blob not found in IndexedDB for doc ${doc.id}`);

                        const storagePath = `${userIdRef.current}/${doc.caseId}/${doc.id}${getFileExtension(doc.name)}`;
                        
                        const { error: uploadError } = await supabase.storage
                            .from('documents')
                            .upload(storagePath, file, { upsert: true });

                        if (uploadError) throw uploadError;

                        setData(prev => {
                            const newDocs = prev.documents.map(d =>
                                d.id === doc.id ? { ...d, localState: 'synced' as const, storagePath: storagePath, updated_at: new Date() } : d
                            );
                            return { ...prev, documents: newDocs };
                        });
                        console.log(`Successfully uploaded ${doc.name}`);

                    } catch (error) {
                        console.error(`Failed to upload document ${doc.id}:`, error);
                        setData(prev => {
                            const newDocs = prev.documents.map(d => d.id === doc.id ? { ...d, localState: 'error' as const } : d);
                            return { ...prev, documents: newDocs };
                        });
                    }
                } else if (doc.localState === 'pending_download') {
                    try {
                        if (!doc.storagePath) throw new Error(`Cannot download doc ${doc.id}, storagePath is missing.`);
                        
                        const { data: blob, error: downloadError } = await supabase.storage
                            .from('documents')
                            .download(doc.storagePath);

                        if (downloadError) throw downloadError;
                        if (!blob) throw new Error("Downloaded blob is null.");

                        const db = await getDb();
                        await db.put(DOCS_FILES_STORE_NAME, blob, doc.id);

                        setData(prev => {
                            const newDocs = prev.documents.map(d => d.id === doc.id ? { ...d, localState: 'synced' as const } : d
                            );
                            return { ...prev, documents: newDocs };
                        });
                         console.log(`Successfully downloaded ${doc.name}`);

                    } catch (error) {
                        const err = error as any;
                        
                        const isNotFound = (e: any): boolean => {
                            if (!e) return false;
                            if (typeof e.statusCode === 'number' && e.statusCode === 404) return true;
                            if (typeof e.message === 'string' && e.message.toLowerCase().includes('not found')) return true;
                            // The check for an empty object `{}` is brittle. Safest to assume it's a transient error.
                            return false;
                        };


                        if (isNotFound(err)) {
                            // PERMANENT "Not Found" ERROR
                            const detailedMessage = `The file was not found or access was denied. It may not exist in cloud storage or permissions may be incorrect. Path: ${doc.storagePath}`;
                            console.error(`Failed to download document ${doc.id}. Reason: ${detailedMessage}. Original error object:`, error);
                            setData(prev => {
                                const newDocs = prev.documents.map(d => d.id === doc.id ? { ...d, localState: 'error' as const } : d);
                                return { ...prev, documents: newDocs };
                            });
                        } else {
                            // TRANSIENT ERROR (e.g., network failure, server 5xx)
                            console.warn(`Transient error downloading doc ${doc.id}, will retry later.`, error);
                            continue;
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Critical error in file sync controller:", e);
        } finally {
            isFileSyncingRef.current = false;
        }
    }, [getDocumentFile]);

    // This is the primary trigger for the file sync controller. It runs whenever the document list changes.
    React.useEffect(() => {
        if (isDataLoading) return;

        const hasPendingFiles = data.documents.some(
            doc => doc.localState === 'pending_upload' || doc.localState === 'pending_download'
        );

        if (hasPendingFiles) {
            // No longer uses a timer, but we keep the async nature
            console.log("Pending documents detected. Triggering file sync controller immediately.");
            fileSyncController();
        }
    }, [data.documents, isDataLoading, fileSyncController]);


    // Effect to automatically sync data when changes are made while online.
    React.useEffect(() => {
        if (isDataLoading || isAuthLoading || !userId) {
            return;
        }

        if (isDirty && isOnline && settings.isAutoSyncEnabled && syncStatus !== 'syncing') {
            const handler = setTimeout(() => {
                console.log("Auto-syncing dirty data...");
                manualSyncRef.current();
            }, 5000); // 5-second delay to bundle changes
            return () => clearTimeout(handler);
        }
    }, [isDirty, isOnline, settings.isAutoSyncEnabled, syncStatus, isDataLoading, isAuthLoading, userId]);

    React.useEffect(() => {
        if (!userId) {
            setData(getInitialData());
            setDeletedIds(getInitialDeletedIds());
            setIsDirty(false);
            setSyncStatus('loading');
            setIsDataLoading(false);
            setSettings(defaultSettings);
            hadCacheOnLoad.current = false;
            return;
        }

        setIsDataLoading(true);
        setSyncStatus('loading');
        
        const loadLocalData = async () => {
            try {
                const db = await getDb();
                const rawData = await db.get(DATA_STORE_NAME, getLocalStorageKey());
                const rawDocuments = await db.get(DOCS_METADATA_STORE_NAME, `documents_${userId}`);


                const rawDeleted = localStorage.getItem(`lawyerAppDeletedIds_${userId}`);
                setDeletedIds(rawDeleted ? JSON.parse(rawDeleted) : getInitialDeletedIds());
                
                // --- Refactored User Settings Loading & Migration ---
                const settingsKey = `lawyerAppSettings_${userId}`;
                let userSettings: UserSettings;

                const savedSettingsRaw = localStorage.getItem(settingsKey);
                if (savedSettingsRaw) {
                    try {
                        const savedSettings = JSON.parse(savedSettingsRaw);
                        // Ensure all properties exist, falling back to defaults for any missing ones.
                        userSettings = { ...defaultSettings, ...savedSettings };
                    } catch (e) {
                        console.error("Failed to parse user settings, falling back to defaults.", e);
                        userSettings = defaultSettings;
                    }
                } else {
                    // No unified settings object found, attempt migration from old individual keys.
                    const autoSyncKey = `lawyerAppAutoSyncEnabled_${userId}`;
                    const autoBackupKey = `lawyerAppAutoBackupEnabled_${userId}`;
                    const layoutKey = `lawyerAppAdminTasksLayout_${userId}`;

                    const oldAutoSync = localStorage.getItem(autoSyncKey);
                    const oldAutoBackup = localStorage.getItem(autoBackupKey);
                    const oldLayout = localStorage.getItem(layoutKey);

                    const needsMigration = oldAutoSync !== null || oldAutoBackup !== null || oldLayout !== null;

                    if (needsMigration) {
                        console.log("Migrating old user settings to new unified format.");
                        const migratedSettings: UserSettings = {
                            isAutoSyncEnabled: oldAutoSync === null ? defaultSettings.isAutoSyncEnabled : oldAutoSync === 'true',
                            isAutoBackupEnabled: oldAutoBackup === null ? defaultSettings.isAutoBackupEnabled : oldAutoBackup === 'true',
                            adminTasksLayout: (oldLayout === 'vertical' ? 'vertical' : 'horizontal'),
                        };
                        
                        // Immediately save the migrated settings under the new key before removing old keys.
                        try {
                            localStorage.setItem(settingsKey, JSON.stringify(migratedSettings));
                            localStorage.removeItem(autoSyncKey);
                            localStorage.removeItem(autoBackupKey);
                            localStorage.removeItem(layoutKey);
                        } catch(e) {
                             console.error("Failed to persist migrated settings.", e);
                        }
                        userSettings = migratedSettings;

                    } else {
                        // No old or new settings found, use defaults and save them for next time.
                        userSettings = defaultSettings;
                        try {
                            localStorage.setItem(settingsKey, JSON.stringify(defaultSettings));
                        } catch (e) {
                            console.error("Failed to save default settings.", e);
                        }
                    }
                }
                setSettings(userSettings);


                const combinedData = { ...(rawData || {}), documents: rawDocuments || [] };

                if (combinedData) {
                    const parsedData = combinedData; 
                    const isEffectivelyEmpty =
                        !parsedData ||
                        (Array.isArray(parsedData.clients) && parsedData.clients.length === 0 &&
                        Array.isArray(parsedData.adminTasks) && parsedData.adminTasks.length === 0 &&
                        Array.isArray(parsedData.appointments) && parsedData.appointments.length === 0 &&
                        Array.isArray(parsedData.accountingEntries) && parsedData.accountingEntries.length === 0 &&
                        Array.isArray(parsedData.invoices) && parsedData.invoices.length === 0 &&
                        Array.isArray(parsedData.documents) && parsedData.documents.length === 0);
        
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
                const { documents: docsToSave, ...restOfData } = dataRef.current;
                await db.put(DATA_STORE_NAME, restOfData, getLocalStorageKey());
                await db.put(DOCS_METADATA_STORE_NAME, docsToSave, `documents_${userId}`);
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
            localStorage.setItem(`lawyerAppSettings_${userId}`, JSON.stringify(settings));
        }
    }, [userId, settings]);
    
    // Effect for real-time data synchronization
    const channelRef = React.useRef<RealtimeChannel | null>(null);
    const userRefForRealtime = React.useRef(user);
    userRefForRealtime.current = user;
    const debounceTimerRef = React.useRef<number | null>(null);

    const tableNameMap: Record<string, string> = {
        clients: 'موكل', cases: 'قضية', stages: 'مرحلة', sessions: 'جلسة',
        admin_tasks: 'مهمة إدارية', appointments: 'موعد', accounting_entries: 'قيد محاسبي',
        invoices: 'فاتورة', case_documents: 'وثيقة', assistants: 'مساعد',
        profiles: 'ملف شخصي', site_finances: 'قيد مالي عام'
    };

    React.useEffect(() => {
        const supabase = getSupabaseClient();
        if (!supabase) return;

        if (user && !channelRef.current) {
            console.log(`User detected, creating real-time channel object: lawyer-app-changes-${user.id}`);
            const newChannel = supabase.channel('lawyer-app-changes-' + user.id);
            newChannel.on('postgres_changes', { event: '*', schema: 'public' }, payload => {
                const currentUser = userRefForRealtime.current;
                if (!currentUser) return;

                if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = window.setTimeout(() => {
                    if (syncStatusRef.current !== 'syncing') {
                        fetchAndRefreshRef.current();
                    }
                }, 1000);
                
                const { table, eventType, new: newRecord, old: oldRecord } = payload as any;
                let message: string | null = null;
    
                // 1. Handle UPDATE events for specific state changes
                if (eventType === 'UPDATE') {
                    // Session postponed
                    if (table === 'sessions' && oldRecord.is_postponed === false && newRecord.is_postponed === true) {
                        message = `تم ترحيل جلسة قضية (${newRecord.client_name || ''})`;
                    }
                    // Admin task completed/reopened
                    else if (table === 'admin_tasks') {
                        if (oldRecord.completed === false && newRecord.completed === true) {
                            message = `تم إتمام المهمة: "${newRecord.task || ''}"`;
                        } else if (oldRecord.completed === true && newRecord.completed === false) {
                            message = `أُعيد فتح المهمة: "${newRecord.task || ''}"`;
                        }
                    }
                    // Appointment completed/reopened
                    else if (table === 'appointments') {
                        if (oldRecord.completed === false && newRecord.completed === true) {
                            message = `تم إتمام الموعد: "${newRecord.title || ''}"`;
                        } else if (oldRecord.completed === true && newRecord.completed === false) {
                            message = `أُعيد فتح الموعد: "${newRecord.title || ''}"`;
                        }
                    }
                } 
                // 2. Handle INSERT events, but suppress noise
                else if (eventType === 'INSERT') {
                    // Suppress notification for the new session created by a postponement action.
                    if (table === 'sessions' && newRecord.postponement_reason) {
                        // Do nothing, this is handled by the UPDATE event on the old session.
                    } 
                    else if (table === 'clients') {
                        message = `تمت إضافة موكل جديد: ${newRecord.name || ''}`;
                    } else if (table === 'cases') {
                        message = `تمت إضافة قضية جديدة: ${newRecord.subject || ''}`;
                    }
                } 
                // 3. Handle DELETE events
                else if (eventType === 'DELETE') {
                    const tableName = tableNameMap[table] || 'بيان';
                    const name = oldRecord.full_name || oldRecord.name || oldRecord.subject || oldRecord.task || oldRecord.title || oldRecord.description || '';
                    message = `تم حذف ${tableName}${name ? `: "${name}"` : '.'}`;
                }

                if (message) {
                    addRealtimeAlert(message);
                }
            });
            channelRef.current = newChannel;
        } else if (!user && channelRef.current) {
            console.log("User logged out, removing real-time channel.");
            supabase.removeChannel(channelRef.current).catch(err => console.error("Error removing channel on logout:", err));
            channelRef.current = null;
        }
        return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
    }, [user, addRealtimeAlert]);

    React.useEffect(() => {
        const channel = channelRef.current;
        if (!channel) return;

        const isReadyToSubscribe = isOnline && !isAuthLoading && !isDataLoading;

        if (isReadyToSubscribe && channel.state !== 'joined') {
            console.log(`Channel state is '${channel.state}', attempting to subscribe.`);
            channel.subscribe((status, err) => {
                const REALTIME_ERROR_MSG = `فشل الاتصال بمزامنة الوقت الفعلي.`;
                if (status === 'SUBSCRIBED') {
                    if (lastSyncError === REALTIME_ERROR_MSG) handleSyncStatusChange('synced', null);
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || err) {
                    console.error(`Real-time subscription error. Status: ${status}`, err);
                    handleSyncStatusChange('error', REALTIME_ERROR_MSG);
                }
            });
        } else if (!isReadyToSubscribe && channel.state === 'joined') {
            console.log(`Conditions not met, unsubscribing from channel.`);
            channel.unsubscribe().catch(err => console.error("Error on unsubscribe:", err));
        }

    }, [isOnline, isAuthLoading, isDataLoading, lastSyncError, handleSyncStatusChange]);
    

    const addDocuments = React.useCallback(async (caseId: string, files: FileList) => {
        const currentUserId = userId;
        if (!currentUserId) throw new Error("User not authenticated");

        const newDocs: CaseDocument[] = [];
        const newDocFiles: { docId: string; file: File }[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const docId = `doc-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 9)}`;
            const newDoc: CaseDocument = {
                id: docId,
                caseId: caseId,
                userId: currentUserId,
                name: file.name,
                type: file.type,
                size: file.size,
                addedAt: new Date(),
                storagePath: '',
                localState: 'pending_upload' as const,
                updated_at: new Date(),
            };
            newDocs.push(newDoc);
            newDocFiles.push({ docId, file });
        }

        setData(prev => ({ ...prev, documents: [...prev.documents, ...newDocs] }));

        try {
            const db = await getDb();
            const tx = db.transaction(DOCS_FILES_STORE_NAME, 'readwrite');
            await Promise.all(newDocFiles.map(({ docId, file }) => tx.store.put(file, docId)));
            await tx.done;
        } catch (error) {
            console.error("Failed to save documents to IndexedDB:", error);
            setData(prev => ({
                ...prev,
                documents: prev.documents.filter(doc => !newDocs.some(nd => nd.id === doc.id))
            }));
            throw new Error("فشل حفظ الوثيقة في قاعدة البيانات المحلية.");
        }
    }, [userId]);

    const deleteDocument = React.useCallback(async (doc: CaseDocument) => {
        const docToDelete = doc;
    
        try {
            const db = await getDb();
            // Try to delete the local file, but don't fail if it's not there.
            // This allows deleting a document from a device that hasn't downloaded it yet.
            await db.delete(DOCS_FILES_STORE_NAME, docToDelete.id).catch(err => {
                console.warn(`Could not delete local file blob for doc ${docToDelete.id}, it might not exist. Proceeding with metadata deletion.`, err);
            });
            
            // Always proceed with metadata deletion from state and add to pending deletions.
            setData(prev => ({ ...prev, documents: prev.documents.filter(d => d.id !== docToDelete.id) }));
    
            setDeletedIds(prev => ({
                ...prev,
                documents: [...prev.documents, docToDelete.id],
                documentPaths: docToDelete.storagePath ? [...prev.documentPaths, docToDelete.storagePath] : prev.documentPaths
            }));
    
        } catch (error) {
            console.error("An unexpected error occurred during document deletion:", error);
            throw new Error("فشل حذف الوثيقة.");
        }
    }, []);
    
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

    // Fix: Add implementations for delete and postpone functions
    const deleteClient = React.useCallback((clientId: string) => {
        const client = dataRef.current.clients.find(c => c.id === clientId);
        if (!client) return;
        const caseIds = client.cases.map(c => c.id);
        const stageIds = client.cases.flatMap(c => c.stages.map(s => s.id));
        const sessionIds = client.cases.flatMap(c => c.stages.flatMap(s => s.sessions.map(sess => sess.id)));
        const invoiceIds = dataRef.current.invoices.filter(i => i.clientId === clientId).map(i => i.id);
        const invoiceItemIds = dataRef.current.invoices.filter(i => i.clientId === clientId).flatMap(i => i.items.map(item => item.id));
        const docIdsToDelete = dataRef.current.documents.filter(d => caseIds.includes(d.caseId)).map(d => d.id);
        const docPathsToDelete = dataRef.current.documents.filter(d => caseIds.includes(d.caseId) && d.storagePath).map(d => d.storagePath);

        setData(prev => ({
            ...prev,
            clients: prev.clients.filter(c => c.id !== clientId),
            accountingEntries: prev.accountingEntries.filter(e => e.clientId !== clientId),
            invoices: prev.invoices.filter(i => i.clientId !== clientId),
            documents: prev.documents.filter(d => !caseIds.includes(d.caseId)),
        }));
        
        setDeletedIds(prev => ({
            ...prev,
            clients: [...new Set([...prev.clients, clientId])],
            cases: [...new Set([...prev.cases, ...caseIds])],
            stages: [...new Set([...prev.stages, ...stageIds])],
            sessions: [...new Set([...prev.sessions, ...sessionIds])],
            invoices: [...new Set([...prev.invoices, ...invoiceIds])],
            invoiceItems: [...new Set([...prev.invoiceItems, ...invoiceItemIds])],
            documents: [...new Set([...prev.documents, ...docIdsToDelete])],
            documentPaths: [...new Set([...prev.documentPaths, ...docPathsToDelete])],
        }));
    }, []);

    const deleteCase = React.useCallback((caseId: string, clientId: string) => {
        const client = dataRef.current.clients.find(c => c.id === clientId);
        const caseToDelete = client?.cases.find(c => c.id === caseId);
        if (!caseToDelete) return;

        const stageIds = caseToDelete.stages.map(s => s.id);
        const sessionIds = caseToDelete.stages.flatMap(s => s.sessions.map(sess => sess.id));
        const invoiceIds = dataRef.current.invoices.filter(i => i.caseId === caseId).map(i => i.id);
        const invoiceItemIds = dataRef.current.invoices.filter(i => i.caseId === caseId).flatMap(i => i.items.map(item => item.id));
        const docIdsToDelete = dataRef.current.documents.filter(d => d.caseId === caseId).map(d => d.id);
        const docPathsToDelete = dataRef.current.documents.filter(d => d.caseId === caseId && d.storagePath).map(d => d.storagePath);

        setData(prev => ({
            ...prev,
            clients: prev.clients.map(c => c.id === clientId ? { ...c, cases: c.cases.filter(cs => cs.id !== caseId), updated_at: new Date() } : c),
            accountingEntries: prev.accountingEntries.filter(e => e.caseId !== caseId),
            invoices: prev.invoices.filter(i => i.caseId !== caseId),
            documents: prev.documents.filter(d => d.caseId !== caseId),
        }));
        setDeletedIds(prev => ({
            ...prev,
            cases: [...new Set([...prev.cases, caseId])],
            stages: [...new Set([...prev.stages, ...stageIds])],
            sessions: [...new Set([...prev.sessions, ...sessionIds])],
            invoices: [...new Set([...prev.invoices, ...invoiceIds])],
            invoiceItems: [...new Set([...prev.invoiceItems, ...invoiceItemIds])],
            documents: [...new Set([...prev.documents, ...docIdsToDelete])],
            documentPaths: [...new Set([...prev.documentPaths, ...docPathsToDelete])],
        }));
    }, []);

    const deleteStage = React.useCallback((stageId: string, caseId: string, clientId: string) => {
        const client = dataRef.current.clients.find(c => c.id === clientId);
        const caseItem = client?.cases.find(c => c.id === caseId);
        const stageToDelete = caseItem?.stages.find(s => s.id === stageId);
        if (!stageToDelete) return;

        const sessionIds = stageToDelete.sessions.map(s => s.id);

        setData(prev => ({
            ...prev,
            clients: prev.clients.map(c => c.id === clientId ? { ...c, updated_at: new Date(), cases: c.cases.map(cs => cs.id === caseId ? { ...cs, updated_at: new Date(), stages: cs.stages.filter(st => st.id !== stageId)} : cs) } : c)
        }));
        setDeletedIds(prev => ({
            ...prev,
            stages: [...new Set([...prev.stages, stageId])],
            sessions: [...new Set([...prev.sessions, ...sessionIds])]
        }));
    }, []);

    const deleteSession = React.useCallback((sessionId: string, stageId: string, caseId: string, clientId: string) => {
        setData(prev => ({
            ...prev,
            clients: prev.clients.map(c => c.id === clientId ? { ...c, updated_at: new Date(), cases: c.cases.map(cs => cs.id === caseId ? { ...cs, updated_at: new Date(), stages: cs.stages.map(st => st.id === stageId ? { ...st, updated_at: new Date(), sessions: st.sessions.filter(s => s.id !== sessionId)} : st)} : cs) } : c)
        }));
        setDeletedIds(prev => ({ ...prev, sessions: [...new Set([...prev.sessions, sessionId])] }));
    }, []);

    const deleteAdminTask = React.useCallback((taskId: string) => {
        setData(prev => ({ ...prev, adminTasks: prev.adminTasks.filter(t => t.id !== taskId) }));
        setDeletedIds(prev => ({ ...prev, adminTasks: [...new Set([...prev.adminTasks, taskId])] }));
    }, []);

    const deleteAppointment = React.useCallback((appointmentId: string) => {
        setData(prev => ({ ...prev, appointments: prev.appointments.filter(a => a.id !== appointmentId) }));
        setDeletedIds(prev => ({ ...prev, appointments: [...new Set([...prev.appointments, appointmentId])] }));
    }, []);

    const deleteAccountingEntry = React.useCallback((entryId: string) => {
        setData(prev => ({ ...prev, accountingEntries: prev.accountingEntries.filter(e => e.id !== entryId) }));
        setDeletedIds(prev => ({ ...prev, accountingEntries: [...new Set([...prev.accountingEntries, entryId])] }));
    }, []);

    const deleteInvoice = React.useCallback((invoiceId: string) => {
        const invoice = dataRef.current.invoices.find(i => i.id === invoiceId);
        if (!invoice) return;

        const itemIds = invoice.items.map(item => item.id);
        setData(prev => ({ ...prev, invoices: prev.invoices.filter(i => i.id !== invoiceId) }));
        setDeletedIds(prev => ({
            ...prev,
            invoices: [...new Set([...prev.invoices, invoiceId])],
            invoiceItems: [...new Set([...prev.invoiceItems, ...itemIds])]
        }));
    }, []);
    
    const deleteAssistant = React.useCallback((name: string) => {
        if (name === 'بدون تخصيص') return;
        setData(prev => ({...prev, assistants: prev.assistants.filter(a => a !== name)}));
        setDeletedIds(prev => ({...prev, assistants: [...new Set([...prev.assistants, name])]}));
    }, []);

    const postponeSession = React.useCallback((sessionId: string, newDate: Date, newReason: string) => {
        setData(prev => {
            const newClients = prev.clients.map(client => ({
                ...client,
                updated_at: new Date(),
                cases: client.cases.map(caseItem => ({
                    ...caseItem,
                    updated_at: new Date(),
                    stages: caseItem.stages.map(stage => {
                        const sessionIndex = stage.sessions.findIndex(s => s.id === sessionId);
                        if (sessionIndex === -1) {
                            return stage;
                        }

                        const updatedSessions = [...stage.sessions];
                        const oldSession = updatedSessions[sessionIndex];

                        // Mark the old session as postponed
                        updatedSessions[sessionIndex] = {
                            ...oldSession,
                            isPostponed: true,
                            nextSessionDate: newDate,
                            nextPostponementReason: newReason,
                            updated_at: new Date(),
                        };

                        // Create the new session for the future date
                        const newSession: Session = {
                            id: `session-${Date.now()}`,
                            court: oldSession.court,
                            caseNumber: oldSession.caseNumber,
                            date: newDate,
                            clientName: oldSession.clientName,
                            opponentName: oldSession.opponentName,
                            isPostponed: false,
                            postponementReason: newReason, // The reason for this new session is the postponement of the old one
                            assignee: oldSession.assignee, // Carry over the assignee
                            updated_at: new Date(),
                        };
                        
                        updatedSessions.push(newSession);

                        return { ...stage, sessions: updatedSessions, updated_at: new Date() };
                    })
                }))
            }));
            return { ...prev, clients: newClients };
        });
    }, []);

    return {
        ...data,
        setClients: (updater) => setData(prev => ({...prev, clients: typeof updater === 'function' ? updater(prev.clients) : updater})),
        setAdminTasks: (updater) => setData(prev => ({...prev, adminTasks: typeof updater === 'function' ? updater(prev.adminTasks) : updater})),
        setAppointments: (updater) => setData(prev => ({...prev, appointments: typeof updater === 'function' ? updater(prev.appointments) : updater})),
        setAccountingEntries: (updater) => setData(prev => ({...prev, accountingEntries: typeof updater === 'function' ? updater(prev.accountingEntries) : updater})),
        setInvoices: (updater) => setData(prev => ({...prev, invoices: typeof updater === 'function' ? updater(prev.invoices) : updater})),
        setAssistants: (updater) => setData(prev => ({...prev, assistants: typeof updater === 'function' ? updater(prev.assistants) : updater})),
        setDocuments: (updater) => setData(prev => ({ ...prev, documents: typeof updater === 'function' ? updater(prev.documents) : updater })),
        setProfiles: (updater) => setData(prev => ({...prev, profiles: typeof updater === 'function' ? updater(prev.profiles) : updater})),
        setSiteFinances: (updater) => setData(prev => ({...prev, siteFinances: typeof updater === 'function' ? updater(prev.siteFinances) : updater})),
        setFullData: (fullData) => {
            handleDataSynced(fullData as AppData);
        },
        allSessions: React.useMemo(() => data.clients.flatMap(c => c.cases.flatMap(cs => cs.stages.flatMap(st => st.sessions.map(s => ({...s, stageId: st.id, stageDecisionDate: st.decisionDate})) ))), [data.clients]),
        // Fix: Corrected corrupted code and completed the function logic.
        // FIX: Replaced potentially problematic flatMap chain with a more robust and defensive implementation to avoid errors with malformed data structures before full hydration.
        unpostponedSessions: React.useMemo(() =>
            (data.clients || []).flatMap(c =>
                (c.cases || []).flatMap(cs =>
                    (cs.stages || []).flatMap(st =>
                        (st.sessions || [])
                            .filter(s => s && s.date && !s.isPostponed && isBeforeToday(new Date(s.date)) && !st.decisionDate)
                            .map(s => ({...s, stageId: st.id, stageDecisionDate: st.decisionDate}))
                    )
                )
            ),
        [data.clients]),
        syncStatus,
        manualSync,
        lastSyncError,
        isDirty,
        userId,
        isDataLoading,
        isAutoSyncEnabled: settings.isAutoSyncEnabled,
        setAutoSyncEnabled: (enabled) => setSettings(s => ({ ...s, isAutoSyncEnabled: enabled })),
        isAutoBackupEnabled: settings.isAutoBackupEnabled,
        setAutoBackupEnabled: (enabled) => setSettings(s => ({ ...s, isAutoBackupEnabled: enabled })),
        adminTasksLayout: settings.adminTasksLayout,
        setAdminTasksLayout: (layout) => setSettings(s => ({ ...s, adminTasksLayout: layout })),
        exportData,
        triggeredAlerts,
        dismissAlert: (appointmentId: string) => setTriggeredAlerts(prev => prev.filter(a => a.id !== appointmentId)),
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
