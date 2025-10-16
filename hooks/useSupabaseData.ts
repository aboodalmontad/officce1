import * as React from 'react';
import { Client, Session, AdminTask, Appointment, AccountingEntry, Case, Stage, Credentials } from '../types';
import { getSupabaseClient } from '../supabaseClient';
import { useOnlineStatus } from './useOnlineStatus';

export const APP_DATA_KEY = 'lawyerBusinessManagementData';
export type SyncStatus = 'loading' | 'syncing' | 'synced' | 'error' | 'offline' | 'unconfigured' | 'uninitialized';

// --- IndexedDB Helpers for Service Worker Access ---
const DB_NAME = 'LawyerAppDB';
const DB_VERSION = 1;
const SESSIONS_STORE_NAME = 'sessions';

/**
 * Custom hook to get the previous value of a prop or state.
 * @param value The value to track.
 * @returns The value from the previous render.
 */
const usePrevious = <T,>(value: T): T | undefined => {
  const ref = React.useRef<T>();
  React.useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
};

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject('IndexedDB is not supported');
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject("Error opening DB");
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = event => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(SESSIONS_STORE_NAME)) {
                db.createObjectStore(SESSIONS_STORE_NAME, { keyPath: 'id' });
            }
        };
    });
};

const updateSessionsInDB = async (sessions: Session[]) => {
    try {
        const db = await openDB();
        const transaction = db.transaction([SESSIONS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(SESSIONS_STORE_NAME);
        store.clear();
        sessions.forEach(session => store.put(session));
    } catch (error) {
        console.error("Failed to update sessions in IndexedDB:", error);
    }
};

const defaultAssistants = ['أحمد', 'فاطمة', 'سارة', 'بدون تخصيص'];
const defaultCredentials = { id: 1, username: 'admin', password: 'admin' };

const getInitialData = () => ({
    clients: [] as Client[],
    adminTasks: [] as AdminTask[],
    appointments: [] as Appointment[],
    accountingEntries: [] as AccountingEntry[],
    assistants: [...defaultAssistants],
    credentials: { ...defaultCredentials },
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
        // FIX: Added parentheses to resolve mixed '??' and '||' operator precedence.
        contactInfo: String((client.contact_info ?? client.contactInfo) || ''),
        cases: safeArray(client.cases, (caseItem: any): Case => ({
            id: caseItem.id || `case-${Date.now()}-${Math.random()}`,
            subject: String(caseItem.subject || 'قضية بدون موضوع'),
            // FIX: Added parentheses to resolve mixed '??' and '||' operator precedence.
            clientName: String((caseItem.client_name ?? caseItem.clientName) || client.name || 'موكل غير مسمى'),
            opponentName: sanitizeString(caseItem.opponent_name ?? caseItem.opponentName),
            // FIX: Added parentheses to resolve mixed '??' and '||' operator precedence.
            feeAgreement: String((caseItem.fee_agreement ?? caseItem.feeAgreement) || ''),
            status: ['active', 'closed', 'on_hold'].includes(caseItem.status) ? caseItem.status : 'active',
            stages: safeArray(caseItem.stages, (stage: any): Stage => ({
                id: stage.id || `stage-${Date.now()}-${Math.random()}`,
                court: String(stage.court || 'محكمة غير محددة'),
                caseNumber: sanitizeString(stage.case_number ?? stage.caseNumber),
                firstSessionDate: sanitizeOptionalDate(stage.first_session_date ?? stage.firstSessionDate),
                sessions: safeArray(stage.sessions, (session: any): Session => ({
                    id: session.id || `session-${Date.now()}-${Math.random()}`,
                    court: String(session.court || stage.court || 'محكمة غير محددة'),
                    caseNumber: ('case_number' in session || 'caseNumber' in session) ? sanitizeString(session.case_number ?? session.caseNumber) : sanitizeString(stage.case_number ?? stage.caseNumber),
                    date: session.date && !isNaN(new Date(session.date).getTime()) ? new Date(session.date) : new Date(),
                    // FIX: Added parentheses to resolve mixed '??' and '||' operator precedence.
                    clientName: String((session.client_name ?? session.clientName) || (caseItem.client_name ?? caseItem.clientName) || client.name || 'موكل غير مسمى'),
                    opponentName: ('opponent_name' in session || 'opponentName' in session) ? sanitizeString(session.opponent_name ?? session.opponentName) : sanitizeString(caseItem.opponent_name ?? caseItem.opponentName),
                    isPostponed: typeof (session.is_postponed ?? session.isPostponed) === 'boolean' ? (session.is_postponed ?? session.isPostponed) : false,
                    postponementReason: sanitizeString(session.postponement_reason ?? session.postponementReason),
                    nextPostponementReason: sanitizeString(session.next_postponement_reason ?? session.nextPostponementReason),
                    nextSessionDate: sanitizeOptionalDate(session.next_session_date ?? session.nextSessionDate),
                    assignee: isValidAssistant(session.assignee) ? session.assignee : defaultAssignee,
                })),
                decisionDate: sanitizeOptionalDate(stage.decision_date ?? stage.decisionDate),
                decisionNumber: sanitizeString(stage.decision_number ?? stage.decisionNumber),
                decisionSummary: sanitizeString(stage.decision_summary ?? stage.decisionSummary),
                decisionNotes: sanitizeString(stage.decision_notes ?? stage.decisionNotes),
            })),
        })),
    }));

    const validatedAdminTasks: AdminTask[] = safeArray(data.adminTasks, (task: any): AdminTask => ({
        id: task.id || `task-${Date.now()}-${Math.random()}`,
        task: String(task.task || 'مهمة بدون عنوان'),
        dueDate: (task.due_date ?? task.dueDate) && !isNaN(new Date(task.due_date ?? task.dueDate).getTime()) ? new Date(task.due_date ?? task.dueDate) : new Date(),
        completed: typeof task.completed === 'boolean' ? task.completed : false,
        importance: ['normal', 'important', 'urgent'].includes(task.importance) ? task.importance : 'normal',
        assignee: isValidAssistant(task.assignee) ? task.assignee : defaultAssignee,
        location: sanitizeString(task.location),
    }));

    const validatedAppointments: Appointment[] = safeArray(data.appointments, (apt: any): Appointment => ({
        id: apt.id || `apt-${Date.now()}`,
        title: String(apt.title || 'موعد بدون عنوان'),
        time: typeof apt.time === 'string' && /^\d{2}:\d{2}$/.test(apt.time) ? apt.time : '00:00',
        date: apt.date && !isNaN(new Date(apt.date).getTime()) ? new Date(apt.date) : new Date(),
        importance: ['normal', 'important', 'urgent'].includes(apt.importance) ? apt.importance : 'normal',
        notified: typeof apt.notified === 'boolean' ? apt.notified : false,
        reminderTimeInMinutes: typeof (apt.reminder_time_in_minutes ?? apt.reminderTimeInMinutes) === 'number' ? (apt.reminder_time_in_minutes ?? apt.reminderTimeInMinutes) : undefined,
        assignee: isValidAssistant(apt.assignee) ? apt.assignee : defaultAssignee,
    }));
    
    const validatedAccountingEntries: AccountingEntry[] = safeArray(data.accountingEntries, (entry: any): AccountingEntry => ({
        id: entry.id || `acc-${Date.now()}`,
        type: ['income', 'expense'].includes(entry.type) ? entry.type : 'income',
        amount: typeof entry.amount === 'number' ? entry.amount : 0,
        date: entry.date && !isNaN(new Date(entry.date).getTime()) ? new Date(entry.date) : new Date(),
        description: String(entry.description || ''),
        // FIX: Added parentheses to resolve mixed '??' and '||' operator precedence.
        clientId: String((entry.client_id ?? entry.clientId) || ''),
        // FIX: Added parentheses to resolve mixed '??' and '||' operator precedence.
        caseId: String((entry.case_id ?? entry.caseId) || ''),
        // FIX: Added parentheses to resolve mixed '??' and '||' operator precedence.
        clientName: String((entry.client_name ?? entry.clientName) || ''),
    }));

    const validatedCredentials = (creds: any): Credentials => {
        if (creds && typeof creds.username === 'string' && typeof creds.password === 'string') {
            return { id: 1, username: creds.username, password: creds.password };
        }
        return { ...defaultCredentials };
    };

    return { 
        clients: validatedClients, 
        adminTasks: validatedAdminTasks, 
        appointments: validatedAppointments, 
        accountingEntries: validatedAccountingEntries, 
        assistants: validatedAssistants,
        credentials: validatedCredentials(data.credentials),
    };
};

export const useSupabaseData = (offlineMode: boolean) => {
    const [data, setData] = React.useState<AppData>(() => {
        try {
            const rawData = localStorage.getItem(APP_DATA_KEY);
            return rawData ? validateAndHydrate(JSON.parse(rawData)) : getInitialData();
        } catch (error) {
            console.error("Failed to load or parse data from localStorage, using initial data.", error);
            return getInitialData();
        }
    });
    const [syncStatus, setSyncStatus] = React.useState<SyncStatus>('loading');
    const [lastSyncError, setLastSyncError] = React.useState<string | null>(null);
    const [isDirty, setIsDirty] = React.useState(() => {
        try {
            return localStorage.getItem('lawyerAppIsDirty') === 'true';
        } catch {
            return false;
        }
    });
    const isOnline = useOnlineStatus();
    const isSavingRef = React.useRef(false);
    const saveTimeoutRef = React.useRef<number | null>(null);

    const initialLoadRef = React.useRef(true);
    const prevIsOnline = usePrevious(isOnline);
    const prevOfflineMode = usePrevious(offlineMode);
    
    React.useEffect(() => {
        try {
            localStorage.setItem('lawyerAppIsDirty', String(isDirty));
        } catch (error) {
            console.error('Failed to save dirty state to localStorage', error);
        }
    }, [isDirty]);


    const fetchFromSupabase = React.useCallback(async () => {
        if (offlineMode) {
            setSyncStatus('offline');
            return;
        }

        const supabase = getSupabaseClient();

        if (!isOnline) {
            setSyncStatus('offline');
            return;
        }
        if (!supabase) {
            setSyncStatus('unconfigured');
            return;
        }

        setSyncStatus('syncing');
        setLastSyncError(null);
        
        try {
            // Fetch data sequentially to avoid "Failed to fetch" errors caused by too many concurrent requests.
            const clientsRes = await supabase.from('clients').select('*, cases(*, stages(*, sessions(*)))').order('name');
            const adminTasksRes = await supabase.from('admin_tasks').select('*');
            const appointmentsRes = await supabase.from('appointments').select('*');
            const accountingEntriesRes = await supabase.from('accounting_entries').select('*');
            const assistantsRes = await supabase.from('assistants').select('name');
            const credentialsRes = await supabase.from('credentials').select('*').limit(1);

            const allResults = [clientsRes, adminTasksRes, appointmentsRes, accountingEntriesRes, assistantsRes, credentialsRes];
            
            // Check for uninitialized database by looking for the specific error code '42P01' (table does not exist)
            // or for messages indicating a stale schema cache, which can happen shortly after running the setup script.
            const hasUninitializedError = allResults.some(res => 
                res.error && 
                (res.error.code === '42P01' || res.error.message.includes('in the schema cache'))
            );


            if (hasUninitializedError) {
                setSyncStatus('uninitialized');
                setLastSyncError('قاعدة البيانات غير مهيأة أو أن التغييرات لم تنعكس بعد. يرجى تشغيل شيفرة التهيئة في Supabase والانتظار لمدة دقيقة، ثم المحاولة مرة أخرى.');
                return; // Stop execution, guide user to Step 2 of the wizard.
            }
            
            // Check for other types of errors after ruling out uninitialized state.
            const otherErrors = allResults.map(res => res.error).filter(Boolean);
            if (otherErrors.length > 0) {
                 throw new Error(otherErrors.map(e => e!.message).join(', '));
            }
            
            // --- SAFETY CHECK TO PREVENT DATA LOSS ---
            // If we have sessions locally but the remote fetch returns none, it's a suspicious situation.
            // This prevents an incomplete fetch from wiping out good local data.
            try {
                const localRawData = localStorage.getItem(APP_DATA_KEY);
                const localData = localRawData ? JSON.parse(localRawData) : { clients: [] };
                const getSessionCount = (d: any) => (d?.clients || []).flatMap((c: any) => c.cases?.flatMap((cs: any) => cs.stages?.flatMap((st: any) => st.sessions || []) || []) || []).length;

                const localSessionsCount = getSessionCount(localData);
                const remoteSessionsCount = getSessionCount({ clients: clientsRes.data });

                if (localSessionsCount > 0 && remoteSessionsCount === 0) {
                    console.warn("Safety check failed: Local data has sessions, but remote fetch returned none. Aborting data overwrite to prevent data loss.");
                    setSyncStatus('error');
                    setLastSyncError("فشلت المزامنة: تم استلام بيانات غير مكتملة من الخادم. تم الاحتفاظ بالبيانات المحلية لمنع فقدانها.");
                    return;
                }
            } catch (e) {
                console.error("Error during safety check:", e);
                // Don't block the sync for a meta-error, but log it.
            }
            // --- END SAFETY CHECK ---


            // If no errors, proceed with processing data.
            const remoteData = {
                clients: clientsRes.data || [],
                adminTasks: adminTasksRes.data || [],
                appointments: appointmentsRes.data || [],
                accountingEntries: accountingEntriesRes.data || [],
                assistants: (assistantsRes.data || []).map((a: any) => a.name),
                credentials: (credentialsRes.data && credentialsRes.data[0]) ? credentialsRes.data[0] : null,
            };
            const validatedData = validateAndHydrate(remoteData);
            setData(validatedData);
            localStorage.setItem(APP_DATA_KEY, JSON.stringify(validatedData));
            setIsDirty(false);
            setSyncStatus('synced');

        } catch (error: any) {
            if (error instanceof TypeError && error.message.includes('Failed to fetch') || (error.message && error.message.toLowerCase().includes('failed to fetch'))) {
                 setSyncStatus('unconfigured');
                 setLastSyncError('فشل الاتصال بالخادم. هذه المشكلة غالباً ما تكون بسبب إعدادات CORS. يرجى التأكد من إضافة نطاق هذا التطبيق إلى قائمة النطاقات المسموح بها.');
                 return;
            }
            if (error.message.includes('JWT') || error.message.includes('Unauthorized')) {
                setSyncStatus('unconfigured');
                setLastSyncError('فشل المصادقة: مفتاح API العام (Anon Key) غير صالح. يرجى التحقق منه والمحاولة مرة أخرى.');
                return;
            }
            console.error("Error fetching full data from Supabase:", error.message);
            setSyncStatus('error');
            setLastSyncError(`خطأ في المزامنة: ${error.message}`);
        }
    }, [isOnline, offlineMode]);

    const uploadData = React.useCallback(async (currentData: AppData) => {
        const supabase = getSupabaseClient();
        if (offlineMode || !isOnline || !supabase || syncStatus === 'uninitialized') {
             if(syncStatus === 'uninitialized') setLastSyncError('لا يمكن الحفظ، قاعدة البيانات غير مهيأة.');
            return false;
        }

        if (isSavingRef.current) {
            console.log("Upload already in progress. Skipping.");
            return false;
        }

        isSavingRef.current = true;
        setSyncStatus('syncing');
        setLastSyncError(null);

        // --- Data Sanitization Helpers ---
        const toISOStringOrNull = (date: any): string | null => {
            if (date === null || date === undefined || date === '') return null;
            const d = new Date(date);
            return !isNaN(d.getTime()) ? d.toISOString() : null;
        };
        const toISOStringOrNow = (date: any): string => {
            if (date === null || date === undefined || date === '') return new Date().toISOString();
            const d = new Date(date);
            return !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
        };
        // FIX: Explicitly convert empty strings to null for text fields before upload.
        // This ensures the database correctly interprets a cleared field as NULL,
        // preventing sync issues where old data might reappear.
        const textToNull = (val: any): string | null => {
            return (val === undefined || val === null || String(val).trim() === '') ? null : String(val);
        };


        try {
            // Map application's camelCase to database's snake_case before upserting.
            const clientsToUpsert = currentData.clients.map(({ cases, contactInfo, ...client }) => ({
                ...client,
                contact_info: textToNull(contactInfo),
            }));

            const casesToUpsert = currentData.clients.flatMap(c => c.cases.map(({ stages, clientName, opponentName, feeAgreement, ...caseItem }) => ({
                ...caseItem,
                client_id: c.id,
                client_name: clientName,
                opponent_name: textToNull(opponentName),
                fee_agreement: textToNull(feeAgreement),
            })));

            const stagesToUpsert = currentData.clients.flatMap(c => c.cases.flatMap(cs => cs.stages.map(({ sessions, caseNumber, firstSessionDate, decisionDate, decisionNumber, decisionSummary, decisionNotes, ...stage }) => ({
                ...stage,
                case_id: cs.id,
                case_number: textToNull(caseNumber),
                first_session_date: toISOStringOrNull(firstSessionDate),
                decision_date: toISOStringOrNull(decisionDate),
                decision_number: textToNull(decisionNumber),
                decision_summary: textToNull(decisionSummary),
                decision_notes: textToNull(decisionNotes),
            }))));

            const sessionsToUpsert = currentData.clients.flatMap(c =>
                c.cases.flatMap(cs =>
                    cs.stages.flatMap(st =>
                        st.sessions.map(({
                            caseNumber, clientName, opponentName, postponementReason, isPostponed, nextSessionDate, nextPostponementReason, date, stageId, stageDecisionDate, ...session
                        }) => ({
                            ...session,
                            stage_id: st.id,
                            case_number: textToNull(caseNumber),
                            client_name: clientName,
                            opponent_name: textToNull(opponentName),
                            postponement_reason: textToNull(postponementReason),
                            is_postponed: isPostponed,
                            date: toISOStringOrNow(date),
                            next_session_date: toISOStringOrNull(nextSessionDate),
                            next_postponement_reason: textToNull(nextPostponementReason),
                        }))
                    )
                )
            );
            
            const adminTasksToUpsert = currentData.adminTasks.map(({ dueDate, location, ...task }) => ({
                ...task,
                due_date: toISOStringOrNow(dueDate),
                location: textToNull(location),
            }));
            
            const appointmentsToUpsert = currentData.appointments.map(({ reminderTimeInMinutes, date, ...apt }) => ({
                ...apt,
                date: toISOStringOrNow(date),
                reminder_time_in_minutes: reminderTimeInMinutes
            }));
            
            const accountingEntriesToUpsert = currentData.accountingEntries.map(({ clientId, caseId, clientName, date, description, ...entry }) => ({
                ...entry,
                date: toISOStringOrNow(date),
                description: textToNull(description),
                client_id: textToNull(clientId),
                case_id: textToNull(caseId),
                client_name: clientName,
            }));

            const assistantsToUpsert = currentData.assistants.map(name => ({ name }));
            const credentialsToUpsert = currentData.credentials;
            
            // Define non-existent values for delete queries to ensure all rows are targeted.
            // Using type-appropriate values prevents potential database errors.
            const NON_EXISTENT_UUID = '00000000-0000-0000-0000-000000000000';
            const NON_EXISTENT_NAME = 'non-existent-placeholder-name-for-delete';
            const NON_EXISTENT_ID = 0;


            const { error: sessionsDelError } = await supabase.from('sessions').delete().neq('id', NON_EXISTENT_UUID);
            if (sessionsDelError) throw new Error(`Error clearing sessions: ${sessionsDelError.message}`);

            const { error: stagesDelError } = await supabase.from('stages').delete().neq('id', NON_EXISTENT_UUID);
            if (stagesDelError) throw new Error(`Error clearing stages: ${stagesDelError.message}`);

            const { error: casesDelError } = await supabase.from('cases').delete().neq('id', NON_EXISTENT_UUID);
            if (casesDelError) throw new Error(`Error clearing cases: ${casesDelError.message}`);

            const { error: clientsDelError } = await supabase.from('clients').delete().neq('id', NON_EXISTENT_UUID);
            if (clientsDelError) throw new Error(`Error clearing clients: ${clientsDelError.message}`);

            const { error: adminTasksDelError } = await supabase.from('admin_tasks').delete().neq('id', NON_EXISTENT_UUID);
            if (adminTasksDelError) throw new Error(`Error clearing admin_tasks: ${adminTasksDelError.message}`);

            const { error: appointmentsDelError } = await supabase.from('appointments').delete().neq('id', NON_EXISTENT_UUID);
            if (appointmentsDelError) throw new Error(`Error clearing appointments: ${appointmentsDelError.message}`);

            const { error: accountingDelError } = await supabase.from('accounting_entries').delete().neq('id', NON_EXISTENT_UUID);
            if (accountingDelError) throw new Error(`Error clearing accounting_entries: ${accountingDelError.message}`);

            const { error: assistantsDelError } = await supabase.from('assistants').delete().neq('name', NON_EXISTENT_NAME);
            if (assistantsDelError) throw new Error(`Error clearing assistants: ${assistantsDelError.message}`);

            const { error: credentialsDelError } = await supabase.from('credentials').delete().neq('id', NON_EXISTENT_ID);
            if (credentialsDelError) throw new Error(`Error clearing credentials: ${credentialsDelError.message}`);

            // Upsert data sequentially, from parent to child, throwing on the first error to identify the root cause.
            const { error: clientsError } = await supabase.from('clients').upsert(clientsToUpsert);
            if (clientsError) throw new Error(`Error saving clients: ${clientsError.message}`);

            const { error: casesError } = await supabase.from('cases').upsert(casesToUpsert);
            if (casesError) throw new Error(`Error saving cases: ${casesError.message}`);

            const { error: stagesError } = await supabase.from('stages').upsert(stagesToUpsert);
            if (stagesError) throw new Error(`Error saving stages: ${stagesError.message}`);

            const { error: sessionsError } = await supabase.from('sessions').upsert(sessionsToUpsert);
            if (sessionsError) throw new Error(`Error saving sessions: ${sessionsError.message}`);

            // Upsert independent tables
            const { error: adminTasksError } = await supabase.from('admin_tasks').upsert(adminTasksToUpsert);
            if (adminTasksError) throw new Error(`Error saving admin tasks: ${adminTasksError.message}`);

            const { error: appointmentsError } = await supabase.from('appointments').upsert(appointmentsToUpsert);
            if (appointmentsError) throw new Error(`Error saving appointments: ${appointmentsError.message}`);

            const { error: accountingEntriesError } = await supabase.from('accounting_entries').upsert(accountingEntriesToUpsert);
            if (accountingEntriesError) throw new Error(`Error saving accounting entries: ${accountingEntriesError.message}`);

            const { error: assistantsError } = await supabase.from('assistants').upsert(assistantsToUpsert);
            if (assistantsError) throw new Error(`Error saving assistants: ${assistantsError.message}`);
            
            const { error: credentialsError } = await supabase.from('credentials').upsert(credentialsToUpsert);
            if (credentialsError) throw new Error(`Error saving credentials: ${credentialsError.message}`);
            
            setIsDirty(false);
            return true;
        } catch (error: any) {
            console.error("Error saving to Supabase:", error.message);
            if (error instanceof TypeError && error.message.includes('Failed to fetch') || (error.message && error.message.toLowerCase().includes('failed to fetch'))) {
                 setSyncStatus('unconfigured');
                 setLastSyncError('فشل الاتصال بالخادم عند الحفظ. هذه المشكلة غالباً ما تكون بسبب إعدادات CORS. يرجى التأكد من إضافة نطاق هذا التطبيق إلى قائمة النطاقات المسموح بها.');
            } else if (error.message && (error.message.includes('schema cache') || error.message.includes('does not exist') || error.message.includes('column'))) { // Catch schema-related errors
                 setSyncStatus('uninitialized');
                 setLastSyncError('فشل الحفظ بسبب عدم تطابق مخطط قاعدة البيانات. يرجى تشغيل شيفرة التهيئة في Supabase من صفحة الإعدادات، والانتظار لمدة دقيقة، ثم المحاولة مرة أخرى.');
            } else {
                setSyncStatus('error');
                setLastSyncError(`فشل رفع البيانات: ${error.message}`);
            }
            return false;
        } finally {
            isSavingRef.current = false;
        }
    }, [isOnline, syncStatus, offlineMode]);
    
    const manualSync = React.useCallback(async () => {
        if (offlineMode || !isOnline || syncStatus === 'uninitialized' || syncStatus === 'unconfigured') {
            if (!isOnline) setSyncStatus('offline');
            return;
        }

        const uploadSuccessful = await uploadData(data);

        if (uploadSuccessful) {
            await fetchFromSupabase();
        }
    }, [data, uploadData, fetchFromSupabase, offlineMode, isOnline, syncStatus]);
    
    // Master effect for loading data and handling online/offline transitions
    React.useEffect(() => {
        const isInitialLoad = initialLoadRef.current;
        if (isInitialLoad) {
            initialLoadRef.current = false;
        }

        const wasOfflineAccordingToBrowser = prevIsOnline === false;
        const isReconnecting = wasOfflineAccordingToBrowser && isOnline;

        const wasInUserOfflineMode = prevOfflineMode === true;
        const switchedToOnlineMode = wasInUserOfflineMode && !offlineMode;

        // Highest priority: check for offline status
        if (offlineMode || !isOnline) {
            if (syncStatus !== 'offline') setSyncStatus('offline');
            return;
        }

        // At this point, we are online and not in user-defined offline mode.
        
        // Scenarios that require a full sync (push then pull)
        if (isReconnecting || (isInitialLoad && isDirty)) {
            let reason = isReconnecting ? 'Network reconnected' : 'Initial load with unsaved changes';
            console.log(`${reason}. Triggering full sync.`);
            manualSync();
        } 
        // Scenarios that require just a fetch (pull)
        else if (isInitialLoad || switchedToOnlineMode) {
            let reason = isInitialLoad ? 'Initial Load' : 'Switched to Online Mode';
            console.log(`Triggering data fetch. Reason: ${reason}`);
            fetchFromSupabase();
        }
    }, [isOnline, prevIsOnline, offlineMode, prevOfflineMode, fetchFromSupabase, manualSync, isDirty]);


    React.useEffect(() => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = window.setTimeout(() => {
            localStorage.setItem(APP_DATA_KEY, JSON.stringify(data));
        }, 1500);

        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, [data]);

    const forceSync = React.useCallback(fetchFromSupabase, [fetchFromSupabase]);

    const createSetter = <K extends keyof AppData>(key: K) => (updater: React.SetStateAction<AppData[K]>) => {
        setData(prev => ({ ...prev, [key]: updater instanceof Function ? updater(prev[key]) : updater }));
        setIsDirty(true);
    };

    const setClients = createSetter('clients');
    const setAdminTasks = createSetter('adminTasks');
    const setAppointments = createSetter('appointments');
    const setAccountingEntries = createSetter('accountingEntries');
    const setAssistants = createSetter('assistants');
    const setCredentials = createSetter('credentials');

    const setFullData = (newData: any) => {
        const validatedData = validateAndHydrate(newData);
        setData(validatedData);
        setIsDirty(true);
    };

    const allSessions = React.useMemo(() => data.clients.flatMap(c => c.cases.flatMap(cs => cs.stages.flatMap(s => s.sessions))), [data.clients]);

    return {
        clients: data.clients,
        adminTasks: data.adminTasks,
        appointments: data.appointments,
        accountingEntries: data.accountingEntries,
        assistants: data.assistants,
        credentials: data.credentials,
        setClients,
        setAdminTasks,
        setAppointments,
        setAccountingEntries,
        setAssistants,
        setCredentials,
        allSessions,
        setFullData,
        syncStatus,
        forceSync,
        manualSync,
        lastSyncError,
        isDirty,
    };
};