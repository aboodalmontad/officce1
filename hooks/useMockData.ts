import * as React from 'react';
import { Client, Session, AdminTask, Appointment, AccountingEntry } from '../types';
import { useLocalStorage } from './useLocalStorage';

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
 * Validates data loaded from localStorage, merging it with defaults
 * to ensure the state shape is always correct.
 * @param data The data loaded from storage.
 * @returns A valid, hydrated AppData object.
 */
const validateAndHydrate = (data: any): AppData => {
    const defaults = getInitialData();
    if (!data || typeof data !== 'object') {
        return defaults;
    }
    return {
        clients: Array.isArray(data.clients) ? data.clients : defaults.clients,
        adminTasks: Array.isArray(data.adminTasks) ? data.adminTasks : defaults.adminTasks,
        appointments: Array.isArray(data.appointments) ? data.appointments : defaults.appointments,
        accountingEntries: Array.isArray(data.accountingEntries) ? data.accountingEntries : defaults.accountingEntries,
        assistants: validateAssistantsList(data.assistants),
    };
};

export const useMockData = () => {
    const [data, setData] = useLocalStorage<AppData>(APP_DATA_KEY, getInitialData(), dateReviver);

    // This effect runs once on mount to validate the data loaded from localStorage.
    // This protects against corrupted or old data formats causing issues.
    const hasHydrated = React.useRef(false);
    React.useEffect(() => {
        if (!hasHydrated.current) {
            setData(currentData => validateAndHydrate(currentData));
            hasHydrated.current = true;
        }
    }, [setData]);

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
            client.cases.flatMap(c => 
                c.stages.flatMap(s => s.sessions)
            )
        );
    }, [data.clients]);

    return { ...data, setClients, setAdminTasks, setAppointments, setAccountingEntries, allSessions, setFullData, setAssistants };
};