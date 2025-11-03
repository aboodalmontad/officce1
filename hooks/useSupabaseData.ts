import * as React from 'react';
import { Client, Session, AdminTask, Appointment, AccountingEntry, Case, Stage, Invoice, InvoiceItem, CaseDocument } from '../types';
import { useOnlineStatus } from './useOnlineStatus';
import { User, RealtimeChannel } from '@supabase/supabase-js';
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
    documents: CaseDocument[];
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
    documents: string[];
    documentPaths: string[];
};
const getInitialDeletedIds = (): DeletedIds => ({
    clients: [], cases: [], stages: [], sessions: [], adminTasks: [], appointments: [], accountingEntries: [], invoices: [], invoiceItems: [], assistants: [],
    documents: [],
    documentPaths: [],
});


const defaultAssistants = ['أحمد', 'فاطمة', 'سارة', 'بدون تخصيص'];

const getInitialData = (): AppData => ({
    clients: [] as Client[],
    adminTasks: [] as AdminTask[],
    appointments: [] as Appointment[],
    accountingEntries: [] as AccountingEntry[],
    invoices: [] as Invoice[],
    assistants: [...defaultAssistants],
    documents: [] as CaseDocument[],
});


// --- IndexedDB Setup ---
const DB_NAME = 'LawyerAppData';
const DB_VERSION = 2; // Bumped version for new stores
const DATA_STORE_NAME = 'appData';
const DOCS_FILES_STORE_NAME = 'caseDocumentFiles';
const DOCS_METADATA_STORE_NAME = 'caseDocumentMetadata';


async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(DATA_STORE_NAME)) {
          db.createObjectStore(DATA_STORE_NAME);
        }
      }
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(DOCS_FILES_STORE_NAME)) {
            db.createObjectStore(DOCS_FILES_STORE_NAME);
        }
        if (!db.objectStoreNames.contains(DOCS_METADATA_STORE_NAME)) {
            db.createObjectStore(DOCS_METADATA_STORE_NAME);
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

    return { 
        clients: validatedClients, 
        adminTasks: validatedAdminTasks, 
        appointments: validatedAppointments, 
        accountingEntries: validatedAccountingEntries,
        invoices: validatedInvoices,
        assistants: validatedAssistants,
        documents: validateDocuments(data.documents),
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
    const isOnlineRef = React.useRef(isOnline);
    isOnlineRef.current = isOnline;
    const userIdRef = React.useRef(userId);
    userIdRef.current = userId;
    
    const isFileSyncingRef = React.useRef(false);

    const onDeletionsSynced = React.useCallback((syncedDeletions: Partial<DeletedIds>) => {
        setDeletedIds(prev => {
            const newDeleted = { ...prev };
            for (const key of Object.keys(syncedDeletions) as (keyof DeletedIds)[]) {
                const syncedIdSet = new Set(syncedDeletions[key] || []);
                if (syncedIdSet.size > 0) {
                    newDeleted[key] = (prev[key] || []).filter(id => !syncedIdSet.has(id));
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
                                d.id === doc.id ? { ...d, localState: 'synced', storagePath: storagePath, updated_at: new Date() } : d
                            );
                            return { ...prev, documents: newDocs };
                        });
                        console.log(`Successfully uploaded ${doc.name}`);

                    } catch (error) {
                        console.error(`Failed to upload document ${doc.id}:`, error);
                        setData(prev => {
                            const newDocs = prev.documents.map(d => d.id === doc.id ? { ...d, localState: 'error' } : d);
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
                            const newDocs = prev.documents.map(d => d.id === doc.id ? { ...d, localState: 'synced' } : d
                            );
                            return { ...prev, documents: newDocs };
                        });
                         console.log(`Successfully downloaded ${doc.name}`);

                    } catch (error: any) {
                        let errorMessage = 'An unknown error occurred during download.';
                        if (error) {
                            if (typeof error === 'object' && String(error.message).toLowerCase().includes('not found')) {
                                errorMessage = `File not found in cloud storage. It might not have been uploaded correctly from the original device. Path: ${doc.storagePath}`;
                            } else if (typeof error === 'object' && error.message) {
                                errorMessage = error.message;
                            } else if (typeof error === 'object' && Object.keys(error).length === 0) {
                                errorMessage = `An empty error object was received from the storage server. This often indicates the file does not exist or there's a permission issue. Path: ${doc.storagePath}`;
                            } else {
                                try { errorMessage = JSON.stringify(error); } 
                                catch { errorMessage = String(error); }
                            }
                        }
                        
                        console.error(`Failed to download document ${doc.id}:`, errorMessage, 'Original error object:', error);

                        setData(prev => {
                            const newDocs = prev.documents.map(d => d.id === doc.id ? { ...d, localState: 'error' } : d);
                            return { ...prev, documents: newDocs };
                        });
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
            const timer = setTimeout(() => {
                console.log("Pending documents detected. Triggering file sync controller.");
                fileSyncController();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [data.documents, isDataLoading, fileSyncController]);


    const handleDataSynced = React.useCallback(async (syncedData: AppData) => {
        const currentLocalDocuments = dataRef.current.documents;
        const localDocMap = new Map(currentLocalDocuments.map(doc => [doc.id, doc]));
        
        const syncedDocsWithLocalState = (syncedData.documents as any[] || [])
            .filter(doc => doc && doc.id)
            // FIX: The original code had a type error when merging remote and local documents due to object spreading with incompatible types (e.g., string vs. Date).
            // This was replaced with a more robust, explicit construction of the merged object to ensure type safety.
            .map((remoteDoc): CaseDocument => {
                const localDoc: CaseDocument | undefined = localDocMap.get(remoteDoc.id);

                if (localDoc) {
                    // Create a new object ensuring all properties are correctly typed.
                    // This avoids type errors from spreading objects with mismatched types (e.g., string vs Date).
                    const mergedDoc: CaseDocument = {
                        id: remoteDoc.id,
                        caseId: remoteDoc.caseId ?? localDoc.caseId,
                        userId: remoteDoc.userId ?? localDoc.userId,
                        name: remoteDoc.name ?? localDoc.name,
                        type: remoteDoc.type ?? localDoc.type,
                        size: remoteDoc.size ?? localDoc.size,
                        storagePath: remoteDoc.storagePath ?? localDoc.storagePath,
                        // Preserve the local state, as it's client-side information.
                        localState: localDoc.localState,
                        // Explicitly create Date objects.
                        addedAt: new Date(remoteDoc.addedAt ?? localDoc.addedAt),
                        updated_at: remoteDoc.updated_at ? new Date(remoteDoc.updated_at) : localDoc.updated_at
                    };
                    
                    // After merging, decide the final state. If it wasn't a pending upload,
                    // and we have a newer version from remote, it's now 'synced'.
                    if (localDoc.localState !== 'pending_upload' && localDoc.localState !== 'error') {
                         mergedDoc.localState = 'synced';
                    }
                    return mergedDoc;
                } else {
                    const newDoc: CaseDocument = {
                        id: remoteDoc.id,
                        caseId: remoteDoc.caseId || '',
                        userId: remoteDoc.userId || userId || '',
                        name: remoteDoc.name || 'unknown file',
                        type: remoteDoc.type || 'application/octet-stream',
                        size: typeof remoteDoc.size === 'number' ? remoteDoc.size : 0,
                        addedAt: remoteDoc.addedAt ? new Date(remoteDoc.addedAt) : new Date(),
                        storagePath: remoteDoc.storagePath || '',
                        localState: 'error', 
                        updated_at: remoteDoc.updated_at ? new Date(remoteDoc.updated_at) : new Date(),
                    };

                    if (remoteDoc.storagePath && String(remoteDoc.storagePath).trim() !== '') {
                        newDoc.localState = 'pending_download';
                    } else {
                        console.warn(`Synced document ${remoteDoc.id} is missing a storagePath. Marking as error.`);
                    }
                    return newDoc;
                }
            });

        currentLocalDocuments.forEach(localDoc => {
            if (!syncedDocsWithLocalState.some(d => d.id === localDoc.id)) {
                syncedDocsWithLocalState.push(localDoc);
            }
        });

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
    
    // Effect to automatically sync data when changes are made while online.
    React.useEffect(() => {
        if (isDataLoading || isAuthLoading || !userId) {
            return;
        }

        if (isDirty && isOnline && isAutoSyncEnabled && syncStatus !== 'syncing') {
            const handler = setTimeout(() => {
                console.log("Auto-syncing dirty data...");
                manualSyncRef.current();
            }, 5000); // 5-second delay to bundle changes
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
                const rawDocuments = await db.get(DOCS_METADATA_STORE_NAME, `documents_${userId}`);


                const rawDeleted = localStorage.getItem(`lawyerAppDeletedIds_${userId}`);
                setDeletedIds(rawDeleted ? JSON.parse(rawDeleted) : getInitialDeletedIds());
                const autoSyncEnabled = localStorage.getItem(`lawyerAppAutoSyncEnabled_${userId}`);
                setIsAutoSyncEnabled(autoSyncEnabled === null ? true : autoSyncEnabled === 'true');
                const autoBackupEnabled = localStorage.getItem(`lawyerAppAutoBackupEnabled_${userId}`);
                setIsAutoBackupEnabled(autoBackupEnabled === null ? true : autoBackupEnabled === 'true');

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
            localStorage.setItem(`lawyerAppAutoSyncEnabled_${userId}`, String(isAutoSyncEnabled));
            localStorage.setItem(`lawyerAppAutoBackupEnabled_${userId}`, String(isAutoBackupEnabled));
        }
    }, [userId, isAutoSyncEnabled, isAutoBackupEnabled]);
    
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

        const channels: RealtimeChannel[] = [];
        
        const tablesWithUserId = [
            'clients', 'cases', 'stages', 'sessions', 'admin_tasks', 
            'appointments', 'accounting_entries', 'invoices', 'invoice_items', 
            'assistants', 'site_finances', 'case_documents'
        ];

        // Create a separate channel for each user-specific table
        tablesWithUserId.forEach(table => {
            const channel = supabase.channel(`public:${table}:${user.id}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: table,
                    filter: `user_id=eq.${user.id}`
                }, payload => {
                    console.log(`Real-time change on user table: ${payload.table}`);
                    debouncedRefresh();
                })
                .subscribe((status, err) => {
                    if (status === 'CHANNEL_ERROR' || err) {
                        console.error(`Real-time subscription error for table ${table}:`, err);
                        setLastSyncError(`فشل الاتصال بمزامنة الوقت الفعلي لجدول ${table}.`);
                    }
                });
            channels.push(channel);
        });

        // Create a specific channel for the profiles table with the correct filter
        const profileChannel = supabase.channel(`public:profiles:${user.id}`)
            .on('postgres_changes', {
                event: '*', 
                schema: 'public',
                table: 'profiles',
                filter: `id=eq.${user.id}`
            }, payload => {
                console.log('Real-time change on user profile.');
                debouncedRefresh();
            })
            .subscribe((status, err) => {
                if (status === 'CHANNEL_ERROR' || err) {
                    console.error('Real-time subscription error for profiles:', err);
                    setLastSyncError('فشل الاتصال بمزامنة الوقت الفعلي لملف المستخدم.');
                }
            });
        channels.push(profileChannel);

        console.log(`Subscribed to ${channels.length} real-time channels.`);

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            console.log(`Unsubscribing from ${channels.length} real-time channels.`);
            channels.forEach(channel => {
                supabase.removeChannel(channel).catch(error => {
                    console.error(`Failed to remove real-time channel ${channel.topic}:`, error);
                });
            });
        };
    }, [user, isOnline, isAuthLoading, isDataLoading, syncStatus]);

    const addDocuments = React.useCallback(async (caseId: string, files: FileList) => {
        if (!userId) throw new Error("User not authenticated");

        const newDocs: CaseDocument[] = [];
        const newDocFiles: { docId: string; file: File }[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const docId = `doc-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 9)}`;
            const newDoc: CaseDocument = {
                id: docId, caseId, userId, name: file.name, type: file.type, size: file.size,
                addedAt: new Date(), storagePath: '', localState: 'pending_upload', updated_at: new Date(),
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

    return {
        clients: data.clients,
        adminTasks: data.adminTasks,
        appointments: data.appointments,
        accountingEntries: data.accountingEntries,
        invoices: data.invoices,
        assistants: data.assistants,
        documents: data.documents,
        setClients: (updater) => setData(prev => ({...prev, clients: typeof updater === 'function' ? updater(prev.clients) : updater})),
        setAdminTasks: (updater) => setData(prev => ({...prev, adminTasks: typeof updater === 'function' ? updater(prev.adminTasks) : updater})),
        setAppointments: (updater) => setData(prev => ({...prev, appointments: typeof updater === 'function' ? updater(prev.appointments) : updater})),
        setAccountingEntries: (updater) => setData(prev => ({...prev, accountingEntries: typeof updater === 'function' ? updater(prev.accountingEntries) : updater})),
        setInvoices: (updater) => setData(prev => ({...prev, invoices: typeof updater === 'function' ? updater(prev.invoices) : updater})),
        setAssistants: (updater) => setData(prev => ({...prev, assistants: typeof updater === 'function' ? updater(prev.assistants) : updater})),
        setDocuments: (updater) => setData(prev => ({ ...prev, documents: typeof updater === 'function' ? updater(prev.documents) : updater })),
        setFullData: (fullData) => {
            handleDataSynced(fullData as AppData);
        },
        allSessions: React.useMemo(() => data.clients.flatMap(c => c.cases.flatMap(cs => cs.stages.flatMap(st => st.sessions.map(s => ({...s, stageId: st.id, stageDecisionDate: st.decisionDate})) ))), [data.clients]),
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
        addDocuments,
        deleteDocument,
        getDocumentFile,
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