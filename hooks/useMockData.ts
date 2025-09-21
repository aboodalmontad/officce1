import * as React from 'react';
import { Client, Session, AdminTask, Appointment, AccountingEntry, Case, Stage } from '../types';

const APP_DATA_KEY = 'lawyerBusinessManagementData';

const dateReviver = (key: string, value: any) => {
    const dateKeys = ['date', 'dueDate', 'firstSessionDate', 'nextSessionDate'];
    if (dateKeys.includes(key) && typeof value === 'string') {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
            return date;
        }
    }
    return value;
};

const defaultAssistants = ['أحمد', 'فاطمة', 'سارة', 'بدون تخصيص'];

const getInitialData = () => ({
    clients: [] as Client[],
    adminTasks: [] as AdminTask[],
    appointments: [] as Appointment[],
    accountingEntries: [] as AccountingEntry[],
    assistants: [...defaultAssistants],
});

type AppData = ReturnType<typeof getInitialData>;

/**
 * A robust function to validate and clean up the assistants list from storage.
 * Ensures "بدون تخصيص" is always present and handles corrupted/old data.
 * @param list The list from the parsed data.
 * @returns A valid, clean array of strings.
 */
const validateAssistantsList = (list: any): string[] => {
    if (!Array.isArray(list)) {
        return [...defaultAssistants];
    }
    const uniqueAssistants = new Set(list.filter(item => typeof item === 'string' && item.trim() !== ''));
    uniqueAssistants.add('بدون تخصيص');
    return Array.from(uniqueAssistants);
};


/**
 * Helper to safely filter and map arrays, preventing crashes from null/undefined/non-object entries.
 * @param arr The array to process.
 * @param mapFn The mapping function to apply to each valid item.
 * @returns A new array with the mapped items.
 */
const safeArray = <T, U>(arr: any, mapFn: (item: T, index: number) => U): U[] => {
    if (!Array.isArray(arr)) {
        return [];
    }
    // Filter out anything that is not a non-null object before mapping
    return arr.filter(item => item && typeof item === 'object').map(mapFn as any);
};

/**
 * A robust helper to sanitize optional date fields. It ensures the value is
 * either a valid Date object or undefined, preventing crashes from null values.
 * @param date The date value from storage.
 * @returns A valid Date or undefined.
 */
const sanitizeOptionalDate = (date: any): Date | undefined => {
    if (date === null || date === undefined || date === '') {
        return undefined;
    }
    const d = new Date(date);
    if (!isNaN(d.getTime())) {
        return d;
    }
    return undefined;
};


/**
 * Validates data loaded from localStorage, merging it with defaults
 * and deeply ensuring the state shape is always correct to prevent runtime errors.
 * This function is designed to be extremely defensive against corrupted or legacy data.
 * @param data The data loaded from storage.
 * @returns A valid, hydrated AppData object.
 */
const validateAndHydrate = (data: any): AppData => {
    const defaults = getInitialData();
    if (!data || typeof data !== 'object') {
        return defaults;
    }

    // 1. Validate assistants list first as other data depends on it.
    const validatedAssistants = validateAssistantsList(data.assistants);
    const isValidAssistant = (assignee: any): assignee is string => 
        typeof assignee === 'string' && validatedAssistants.includes(assignee);
    const defaultAssignee = 'بدون تخصيص';

    // Helper to sanitize optional string fields, converting null or empty strings to undefined.
    const sanitizeString = (str: any): string | undefined => 
        typeof str === 'string' && str.trim() ? str : undefined;

    // 2. Validate all other data structures, using the validated assistants list.
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

    return {
        clients: validatedClients,
        adminTasks: validatedAdminTasks,
        appointments: validatedAppointments,
        accountingEntries: validatedAccountingEntries,
        assistants: validatedAssistants,
    };
};

export const useMockData = () => {
    // Initialize state by synchronously reading and validating data from localStorage.
    // This ensures the app has valid data from the very first render.
    const [data, setData] = React.useState<AppData>(() => {
        try {
            const rawData = localStorage.getItem(APP_DATA_KEY);
            if (rawData) {
                const parsedData = JSON.parse(rawData, dateReviver);
                return validateAndHydrate(parsedData);
            }
        } catch (error) {
            console.error("Failed to load or parse data from localStorage, using initial data.", error);
        }
        return getInitialData();
    });

    // Persist state changes back to localStorage.
    React.useEffect(() => {
        try {
            localStorage.setItem(APP_DATA_KEY, JSON.stringify(data));
        } catch (e) {
            console.error("Failed to save data to localStorage:", e);
        }
    }, [data]);


    const markForSync = () => {
        try {
            localStorage.setItem('lawyerAppNeedsSync', 'true');
        } catch (e) {
            console.error("Failed to mark data for sync:", e);
        }
    };

    const setClients = (updater: Client[] | ((prevClients: Client[]) => Client[])) => {
        setData(prevData => ({
            ...prevData,
            clients: typeof updater === 'function' ? updater(prevData.clients) : updater
        }));
        markForSync();
    };

    const setAdminTasks = (updater: AdminTask[] | ((prevTasks: AdminTask[]) => AdminTask[])) => {
        setData(prevData => ({
            ...prevData,
            adminTasks: typeof updater === 'function' ? updater(prevData.adminTasks) : updater
        }));
        markForSync();
    };
    
    const setAppointments = (updater: Appointment[] | ((prevAppointments: Appointment[]) => Appointment[])) => {
         setData(prevData => ({
            ...prevData,
            appointments: typeof updater === 'function' ? updater(prevData.appointments) : updater
        }));
        markForSync();
    };

    const setAccountingEntries = (updater: AccountingEntry[] | ((prevEntries: AccountingEntry[]) => AccountingEntry[])) => {
        setData(prevData => ({
            ...prevData,
            accountingEntries: typeof updater === 'function' ? updater(prevData.accountingEntries) : updater
        }));
        markForSync();
    };

    const setAssistants = (updater: string[] | ((prevAssistants: string[]) => string[])) => {
        setData(prevData => ({
            ...prevData,
            assistants: typeof updater === 'function' ? updater(prevData.assistants) : updater
        }));
        markForSync();
    };

    const setFullData = (newData: any) => {
        const validatedData = validateAndHydrate(newData);
        setData(validatedData);
        markForSync();
    };
    
    const allSessions = React.useMemo(() => {
        return (data.clients || []).flatMap(client => 
            (client.cases || []).flatMap(c => 
                (c.stages || []).flatMap(s => s.sessions || [])
            )
        );
    }, [data.clients]);

    return { ...data, setClients, setAdminTasks, setAppointments, setAccountingEntries, allSessions, setFullData, setAssistants };
};