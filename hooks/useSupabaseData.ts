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
    const sanitizeString = (str: any): string | undefined => typeof str === 'string' && str.trim() ? str : undefined;

    const validatedClients: Client[] = safeArray(data.clients, (client: any): Client => ({
        id: client.id || `client-${Date.now()}-${Math.random()}`,
        name: String(client.name || 'موكل غير مسمى'),
        contactInfo: String(client.contact_info || ''),
        cases: safeArray(client.cases, (caseItem: any): Case => ({
            id: caseItem.id || `case-${Date.now()}-${Math.random()}`,
            subject: String(caseItem.subject || 'قضية بدون موضوع'),
            clientName: String(caseItem.client_name || client.name || 'موكل غير مسمى'),
            opponentName: String(caseItem.opponent_name || 'خصم غير مسمى'),
            feeAgreement: String(caseItem.fee_agreement || ''),
            status: ['active', 'closed', 'on_hold'].includes(caseItem.status) ? caseItem.status : 'active',
            stages: safeArray(caseItem.stages, (stage: any): Stage => ({
                id: stage.id || `stage-${Date.now()}-${Math.random()}`,
                court: String(stage.court || 'محكمة غير محددة'),
                caseNumber: String(stage.case_number || '0'),
                firstSessionDate: sanitizeOptionalDate(stage.first_session_date),
                sessions: safeArray(stage.sessions, (session: any): Session => ({
                    id: session.id || `session-${Date.now()}-${Math.random()}`,
                    court: String(session.court || stage.court || 'محكمة غير محددة'),
                    caseNumber: String(session.case_number || stage.case_number || '0'),
                    date: session.date && !isNaN(new Date(session.date).getTime()) ? new Date(session.date) : new Date(),
                    clientName: String(session.client_name || caseItem.client_name || client.name || 'موكل غير مسمى'),
                    opponentName: String(session.opponent_name || caseItem.opponent_name || 'خصم غير مسمى'),
                    isPostponed: typeof session.is_postponed === 'boolean' ? session.is_postponed : false,
                    postponementReason: sanitizeString(session.postponement_reason),
                    nextPostponementReason: sanitizeString(session.next_postponement_reason),
                    nextSessionDate: sanitizeOptionalDate(session.next_session_date),
                    assignee: isValidAssistant(session.assignee) ? session.assignee : defaultAssignee,
                })),
            })),
        })),
    }));

    const validatedAdminTasks: AdminTask[] = safeArray(data.adminTasks, (task: any): AdminTask => ({
        id: task.id || `task-${Date.now()}-${Math.random()}`,
        task: String(task.task || 'مهمة بدون عنوان'),
        dueDate: task.due_date && !isNaN(new Date(task.due_date).getTime()) ? new Date(task.due_date) : new Date(),
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
        reminderTimeInMinutes: typeof apt.reminder_time_in_minutes === 'number' ? apt.reminder_time_in_minutes : undefined,
        assignee: isValidAssistant(apt.assignee) ? apt.assignee : defaultAssignee,
    }));
    
    const validatedAccountingEntries: AccountingEntry[] = safeArray(data.accountingEntries, (entry: any): AccountingEntry => ({
        id: entry.id || `acc-${Date.now()}`,
        type: ['income', 'expense'].includes(entry.type) ? entry.type : 'income',
        amount: typeof entry.amount === 'number' ? entry.amount : 0,
        date: entry.date && !isNaN(new Date(entry.date).getTime()) ? new Date(entry.date) : new Date(),
        description: String(entry.description || ''),
        clientId: String(entry.client_id || ''),
        caseId: String(entry.case_id || ''),
        clientName: String(entry.client_name || ''),
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
        // FIX: Corrected typo from `validateCredentials` to `validatedCredentials`.
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
            const [
                clientsRes, 
                adminTasksRes, 
                appointmentsRes, 
                accountingEntriesRes, 
                assistantsRes,
                credentialsRes,
            ] = await Promise.all([
                supabase.from('clients').select('*, cases(*, stages(*, sessions(*)))').order('name'),
                supabase.from('admin_tasks').select('*'),
                supabase.from('appointments').select('*'),
                supabase.from('accounting_entries').select('*'),
                supabase.from('assistants').select('name'),
                supabase.from('credentials').select('*').limit(1),
            ]);

            const allResults = [clientsRes, adminTasksRes, appointmentsRes, accountingEntriesRes, assistantsRes, credentialsRes];
            
            // Check for uninitialized database by looking for the specific error code.
            const hasUninitializedError = allResults.some(res => res.error && res.error.code === '42P01');

            if (hasUninitializedError) {
                setSyncStatus('uninitialized');
                setLastSyncError('قاعدة البيانات غير مهيأة. يرجى تشغيل شيفرة التهيئة لإنشاء الجداول اللازمة.');
                return; // Stop execution, guide user to Step 2 of the wizard.
            }
            
            // Check for other types of errors after ruling out uninitialized state.
            const otherErrors = allResults.map(res => res.error).filter(Boolean);
            if (otherErrors.length > 0) {
                 throw new Error(otherErrors.map(e => e!.message).join(', '));
            }

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

        try {
            // Map application's camelCase to database's snake_case before upserting.
            const clientsToUpsert = currentData.clients.map(({ cases, contactInfo, ...client }) => ({
                ...client,
                contact_info: contactInfo,
            }));

            const casesToUpsert = currentData.clients.flatMap(c => c.cases.map(({ stages, clientName, opponentName, feeAgreement, ...caseItem }) => ({
                ...caseItem,
                client_id: c.id,
                client_name: clientName,
                opponent_name: opponentName,
                fee_agreement: feeAgreement,
            })));

            const stagesToUpsert = currentData.clients.flatMap(c => c.cases.flatMap(cs => cs.stages.map(({ sessions, caseNumber, firstSessionDate, ...stage }) => ({
                ...stage,
                case_id: cs.id,
                case_number: caseNumber,
                first_session_date: firstSessionDate,
            }))));

            const sessionsToUpsert = currentData.clients.flatMap(c =>
                c.cases.flatMap(cs =>
                    cs.stages.flatMap(st =>
                        st.sessions.map(({
                            caseNumber, clientName, opponentName, postponementReason, isPostponed, nextSessionDate, nextPostponementReason, ...session
                        }) => ({
                            ...session,
                            stage_id: st.id,
                            case_number: caseNumber,
                            client_name: clientName,
                            opponent_name: opponentName,
                            postponement_reason: postponementReason,
                            is_postponed: isPostponed,
                            next_session_date: nextSessionDate,
                            next_postponement_reason: nextPostponementReason,
                        }))
                    )
                )
            );
            
            const adminTasksToUpsert = currentData.adminTasks.map(({ dueDate, ...task }) => ({
                ...task,
                due_date: dueDate
            }));
            
            const appointmentsToUpsert = currentData.appointments.map(({ reminderTimeInMinutes, ...apt }) => ({
                ...apt,
                reminder_time_in_minutes: reminderTimeInMinutes
            }));
            
            const accountingEntriesToUpsert = currentData.accountingEntries.map(({ clientId, caseId, clientName, ...entry }) => ({
                ...entry,
                client_id: clientId,
                case_id: caseId,
                client_name: clientName,
            }));

            const assistantsToUpsert = currentData.assistants.map(name => ({ name }));
            const credentialsToUpsert = currentData.credentials;


            // Delete all related data first to handle cascades properly in JS, then re-insert.
            // This is safer than relying on complex upsert logic across multiple tables.
            // Start from the deepest nested items and go up.
            await supabase.from('sessions').delete().neq('id', 'placeholder-to-delete-all');
            await supabase.from('stages').delete().neq('id', 'placeholder-to-delete-all');
            await supabase.from('cases').delete().neq('id', 'placeholder-to-delete-all');
            await supabase.from('clients').delete().neq('id', 'placeholder-to-delete-all');
            await supabase.from('admin_tasks').delete().neq('id', 'placeholder-to-delete-all');
            await supabase.from('appointments').delete().neq('id', 'placeholder-to-delete-all');
            await supabase.from('accounting_entries').delete().neq('id', 'placeholder-to-delete-all');
            await supabase.from('assistants').delete().neq('name', 'placeholder-to-delete-all');
            await supabase.from('credentials').delete().neq('id', 'placeholder-to-delete-all');

            // Upsert data sequentially to respect foreign key constraints.
            // Independent tables can be grouped with the first dependent one.
            const [clientsResult, adminTasksResult, appointmentsResult, accountingEntriesResult, assistantsResult, credentialsResult] = await Promise.all([
                supabase.from('clients').upsert(clientsToUpsert),
                supabase.from('admin_tasks').upsert(adminTasksToUpsert),
                supabase.from('appointments').upsert(appointmentsToUpsert),
                supabase.from('accounting_entries').upsert(accountingEntriesToUpsert),
                supabase.from('assistants').upsert(assistantsToUpsert),
                supabase.from('credentials').upsert(credentialsToUpsert),
            ]);

            // Now handle dependent tables sequentially.
            const casesResult = await supabase.from('cases').upsert(casesToUpsert);
            const stagesResult = await supabase.from('stages').upsert(stagesToUpsert);
            const sessionsResult = await supabase.from('sessions').upsert(sessionsToUpsert);

            const results = [
                clientsResult,
                casesResult,
                stagesResult,
                sessionsResult,
                adminTasksResult,
                appointmentsResult,
                accountingEntriesResult,
                assistantsResult,
                credentialsResult,
            ];
            
            const errors = results.map(r => r.error).filter(Boolean);
            if(errors.length > 0) {
                 throw new Error(errors.map(e => e!.message).join(', '));
            }
            
            setIsDirty(false);
            return true;
        } catch (error: any) {
            console.error("Error saving to Supabase:", error.message);
            // FIX: Add specific handling for "Failed to fetch" errors during upload,
            // which are often CORS related. This provides a better user experience.
            if (error instanceof TypeError && error.message.includes('Failed to fetch') || (error.message && error.message.toLowerCase().includes('failed to fetch'))) {
                 setSyncStatus('unconfigured');
                 setLastSyncError('فشل الاتصال بالخادم عند الحفظ. هذه المشكلة غالباً ما تكون بسبب إعدادات CORS. يرجى التأكد من إضافة نطاق هذا التطبيق إلى قائمة النطاقات المسموح بها.');
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
    
    React.useEffect(() => {
        if (allSessions) updateSessionsInDB(allSessions);
    }, [allSessions]);

    return { ...data, setClients, setAdminTasks, setAppointments, setAccountingEntries, allSessions, setFullData, setAssistants, setCredentials, syncStatus, forceSync, manualSync, lastSyncError, isDirty };
};