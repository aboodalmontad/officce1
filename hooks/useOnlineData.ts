import * as React from 'react';
import { Client, Session, AdminTask, Appointment, AccountingEntry, Case, Stage } from '../types';
import { useOnlineStatus } from './useOnlineStatus';

// --- Real-time Cloud Storage Configuration ---
// Using a public JSON store for demonstration. This enables real-time sync across devices.
const CLOUD_STORAGE_URL = 'https://api.npoint.io/e4f553659c04a32b6e1b';

// --- Data Types and Defaults ---
const defaultAssistants = ['أحمد', 'فاطمة', 'سارة', 'بدون تخصيص'];
const getInitialData = () => ({
    clients: [] as Client[],
    adminTasks: [] as AdminTask[],
    appointments: [] as Appointment[],
    accountingEntries: [] as AccountingEntry[],
    assistants: [...defaultAssistants],
});

type AppData = ReturnType<typeof getInitialData>;
export type SyncStatus = 'loading' | 'syncing' | 'synced' | 'error' | 'offline';

// --- Robust Data Validation Functions (from previous useMockData) ---

const validateAssistantsList = (list: any): string[] => {
    if (!Array.isArray(list)) return [...defaultAssistants];
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
        contactInfo: String(client.contactInfo || ''),
        cases: safeArray(client.cases, (caseItem: any): Case => ({
            id: caseItem.id || `case-${Date.now()}-${Math.random()}`,
            subject: String(caseItem.subject || 'قضية بدون موضوع'),
            clientName: String(caseItem.clientName || client.name || 'موكل غير مسمى'),
            opponentName: String(caseItem.opponentName || 'خصم غير مسمى'),
            feeAgreement: String(caseItem.feeAgreement || ''),
            status: ['active', 'closed', 'on_hold'].includes(caseItem.status) ? caseItem.status : 'active',
            stages: safeArray(caseItem.stages, (stage: any): Stage => ({
                id: stage.id || `stage-${Date.now()}-${Math.random()}`,
                court: String(stage.court || 'محكمة غير محددة'),
                caseNumber: String(stage.caseNumber || '0'),
                firstSessionDate: sanitizeOptionalDate(stage.firstSessionDate),
                sessions: safeArray(stage.sessions, (session: any): Session => ({
                    id: session.id || `session-${Date.now()}-${Math.random()}`,
                    court: String(session.court || stage.court || 'محكمة غير محددة'),
                    caseNumber: String(session.caseNumber || stage.caseNumber || '0'),
                    date: session.date && !isNaN(new Date(session.date).getTime()) ? new Date(session.date) : new Date(),
                    clientName: String(session.clientName || caseItem.clientName || client.name || 'موكل غير مسمى'),
                    opponentName: String(session.opponentName || caseItem.opponentName || 'خصم غير مسمى'),
                    isPostponed: typeof session.isPostponed === 'boolean' ? session.isPostponed : false,
                    postponementReason: sanitizeString(session.postponementReason),
                    nextPostponementReason: sanitizeString(session.nextPostponementReason),
                    nextSessionDate: sanitizeOptionalDate(session.nextSessionDate),
                    assignee: isValidAssistant(session.assignee) ? session.assignee : defaultAssignee,
                })),
            })),
        })),
    }));
    const validatedAdminTasks: AdminTask[] = safeArray(data.adminTasks, (task: any): AdminTask => ({
        id: task.id || `task-${Date.now()}-${Math.random()}`,
        task: String(task.task || 'مهمة بدون عنوان'),
        dueDate: task.dueDate && !isNaN(new Date(task.dueDate).getTime()) ? new Date(task.dueDate) : new Date(),
        completed: typeof task.completed === 'boolean' ? task.completed : false,
        importance: ['normal', 'important', 'urgent'].includes(task.importance) ? task.importance : 'normal',
        assignee: isValidAssistant(task.assignee) ? task.assignee : defaultAssignee,
        location: sanitizeString(task.location),
    }));
    const validatedAppointments: Appointment[] = safeArray(data.appointments, (apt: any): Appointment => ({
        id: apt.id || `apt-${Date.now()}-${Math.random()}`,
        title: String(apt.title || 'موعد بدون عنوان'),
        time: typeof apt.time === 'string' && /^\d{2}:\d{2}$/.test(apt.time) ? apt.time : '00:00',
        date: apt.date && !isNaN(new Date(apt.date).getTime()) ? new Date(apt.date) : new Date(),
        importance: ['normal', 'important', 'urgent'].includes(apt.importance) ? apt.importance : 'normal',
        notified: typeof apt.notified === 'boolean' ? apt.notified : false,
        reminderTimeInMinutes: typeof apt.reminderTimeInMinutes === 'number' ? apt.reminderTimeInMinutes : undefined,
        assignee: isValidAssistant(apt.assignee) ? apt.assignee : defaultAssignee,
    }));
    const validatedAccountingEntries: AccountingEntry[] = safeArray(data.accountingEntries, (entry: any): AccountingEntry => ({
        id: entry.id || `acc-${Date.now()}-${Math.random()}`,
        type: ['income', 'expense'].includes(entry.type) ? entry.type : 'income',
        amount: typeof entry.amount === 'number' ? entry.amount : 0,
        date: entry.date && !isNaN(new Date(entry.date).getTime()) ? new Date(entry.date) : new Date(),
        description: String(entry.description || ''),
        clientId: String(entry.clientId || ''),
        caseId: String(entry.caseId || ''),
        clientName: String(entry.clientName || ''),
    }));

    return { clients: validatedClients, adminTasks: validatedAdminTasks, appointments: validatedAppointments, accountingEntries: validatedAccountingEntries, assistants: validatedAssistants };
};

// --- Debounce Utility ---
function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const debounced = (...args: Parameters<F>) => {
        if (timeout !== null) clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), waitFor);
    };
    debounced.cancel = () => { if (timeout !== null) clearTimeout(timeout); };
    return debounced;
}

// --- Main Hook ---
export const useOnlineData = () => {
    const [data, setData] = React.useState<AppData>(getInitialData);
    const [syncStatus, setSyncStatus] = React.useState<SyncStatus>('loading');
    const isOnline = useOnlineStatus();
    const dataRef = React.useRef(data);
    
    React.useEffect(() => { dataRef.current = data; }, [data]);

    const fetchData = React.useCallback(async () => {
        if (!isOnline) {
            setSyncStatus('offline');
            return;
        }
        setSyncStatus('loading');
        try {
            const response = await fetch(CLOUD_STORAGE_URL);
            if (!response.ok) throw new Error('Could not fetch data from cloud.');
            const cloudData = await response.json();
            const validatedData = validateAndHydrate(cloudData);
            setData(validatedData);
            setSyncStatus('synced');
        } catch (error) {
            console.error('Cloud fetch error:', error);
            setSyncStatus('error');
        }
    }, [isOnline]);

    const debouncedSave = React.useCallback(
        debounce(async (currentData: AppData) => {
            if (!isOnline) {
                setSyncStatus('offline');
                return;
            }
            setSyncStatus('syncing');
            try {
                const response = await fetch(CLOUD_STORAGE_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(currentData),
                });
                if (!response.ok) throw new Error('Failed to save to cloud.');
                setSyncStatus('synced');
            } catch (error) {
                console.error('Cloud save error:', error);
                setSyncStatus('error');
            }
        }, 1500),
        [isOnline]
    );
    
    React.useEffect(() => {
        fetchData();
    }, [fetchData]);

    React.useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') fetchData();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [fetchData]);

    React.useEffect(() => {
        if (!isOnline) {
            setSyncStatus('offline');
        } else if (syncStatus === 'offline') {
            debouncedSave(dataRef.current);
        }
    }, [isOnline, syncStatus, debouncedSave]);
    
    const forceSync = React.useCallback(async () => {
        if (!isOnline) {
            setSyncStatus('offline');
            return;
        }
        setSyncStatus('syncing');
        const dataToSave = dataRef.current;
        try {
            const response = await fetch(CLOUD_STORAGE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSave),
            });
            if (!response.ok) throw new Error('Failed to save to cloud.');
            setSyncStatus('synced');
        } catch (error) {
            console.error('Cloud save error (force sync):', error);
            setSyncStatus('error');
        }
    }, [isOnline]);

    const updateAndSave = React.useCallback((updater: (prev: AppData) => AppData) => {
        const newData = updater(dataRef.current);
        setData(newData); // Optimistic UI update
        debouncedSave(newData);
    }, [debouncedSave]);

    const setClients = (updater: React.SetStateAction<Client[]>) => updateAndSave(prev => ({...prev, clients: updater instanceof Function ? updater(prev.clients) : updater}));
    const setAdminTasks = (updater: React.SetStateAction<AdminTask[]>) => updateAndSave(prev => ({...prev, adminTasks: updater instanceof Function ? updater(prev.adminTasks) : updater}));
    const setAppointments = (updater: React.SetStateAction<Appointment[]>) => updateAndSave(prev => ({...prev, appointments: updater instanceof Function ? updater(prev.appointments) : updater}));
    const setAccountingEntries = (updater: React.SetStateAction<AccountingEntry[]>) => updateAndSave(prev => ({...prev, accountingEntries: updater instanceof Function ? updater(prev.accountingEntries) : updater}));
    const setAssistants = (updater: React.SetStateAction<string[]>) => updateAndSave(prev => ({...prev, assistants: updater instanceof Function ? updater(prev.assistants) : updater}));

    const setFullData = (newData: any) => {
        const validatedData = validateAndHydrate(newData);
        setData(validatedData);
        debouncedSave.cancel();
        if (isOnline) {
            setSyncStatus('syncing');
            fetch(CLOUD_STORAGE_URL, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(validatedData)})
                .then(res => setSyncStatus(res.ok ? 'synced' : 'error'))
                .catch(() => setSyncStatus('error'));
        } else {
            setSyncStatus('offline');
        }
    };
    
    const allSessions = React.useMemo(() => {
        return (data.clients || []).flatMap(c => (c.cases || []).flatMap(cs => (cs.stages || []).flatMap(s => s.sessions || [])));
    }, [data.clients]);

    return { ...data, setClients, setAdminTasks, setAppointments, setAccountingEntries, allSessions, setFullData, setAssistants, syncStatus, forceSync };
};