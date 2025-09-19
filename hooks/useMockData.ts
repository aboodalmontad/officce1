import * as React from 'react';
import { Client, Session, AdminTask, Appointment, AccountingEntry } from '../types';

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

/**
 * A robust function to validate and clean up the assistants list from storage.
 * Ensures "بدون تخصیص" is always present and handles corrupted/old data.
 * @param list The list from the parsed data.
 * @returns A valid, clean array of strings.
 */
const validateAssistantsList = (list: any): string[] => {
    // Case 1: List is missing, null, or not an array (handles old data format & corruption)
    if (!Array.isArray(list)) {
        return [...defaultAssistants];
    }

    // Case 2: List is an array, potentially empty or malformed.
    // Use a Set to handle duplicates and ensure "بدون تخصیص" is present.
    const uniqueAssistants = new Set(list.filter(item => typeof item === 'string' && item.trim() !== ''));
    uniqueAssistants.add('بدون تخصيص');

    return Array.from(uniqueAssistants);
};


const loadInitialData = () => {
    try {
        const savedData = localStorage.getItem(APP_DATA_KEY);
        if (savedData) {
            const parsedData = JSON.parse(savedData, dateReviver);
            // Basic validation for the main structure
            if (parsedData && typeof parsedData === 'object') {
                return {
                    clients: Array.isArray(parsedData.clients) ? parsedData.clients : [],
                    adminTasks: Array.isArray(parsedData.adminTasks) ? parsedData.adminTasks : [],
                    appointments: Array.isArray(parsedData.appointments) ? parsedData.appointments : [],
                    accountingEntries: Array.isArray(parsedData.accountingEntries) ? parsedData.accountingEntries : [],
                    assistants: validateAssistantsList(parsedData.assistants),
                };
            }
        }
    } catch (error) {
        console.error("Failed to load or parse data from localStorage", error);
    }

    // Fallback to a completely empty state if anything fails
    return {
        clients: [],
        adminTasks: [],
        appointments: [],
        accountingEntries: [],
        assistants: [...defaultAssistants],
    };
};


type AppData = {
    clients: Client[];
    adminTasks: AdminTask[];
    appointments: Appointment[];
    accountingEntries: AccountingEntry[];
    assistants: string[];
};

export const useMockData = () => {
    const [data, setData] = React.useState<AppData>(loadInitialData);

    React.useEffect(() => {
        try {
            const serializedData = JSON.stringify(data);
            localStorage.setItem(APP_DATA_KEY, serializedData);
        } catch (error) {
            console.error("Failed to save data to localStorage", error);
        }
    }, [data]);

    const setClients = (updater: Client[] | ((prevClients: Client[]) => Client[])) => {
        setData(prevData => ({
            ...prevData,
            clients: typeof updater === 'function' ? updater(prevData.clients) : updater
        }));
    };

    const setAdminTasks = (updater: AdminTask[] | ((prevTasks: AdminTask[]) => AdminTask[])) => {
        setData(prevData => ({
            ...prevData,
            adminTasks: typeof updater === 'function' ? updater(prevData.adminTasks) : updater
        }));
    };
    
    const setAppointments = (updater: Appointment[] | ((prevAppointments: Appointment[]) => Appointment[])) => {
         setData(prevData => ({
            ...prevData,
            appointments: typeof updater === 'function' ? updater(prevData.appointments) : updater
        }));
    };

    const setAccountingEntries = (updater: AccountingEntry[] | ((prevEntries: AccountingEntry[]) => AccountingEntry[])) => {
        setData(prevData => ({
            ...prevData,
            accountingEntries: typeof updater === 'function' ? updater(prevData.accountingEntries) : updater
        }));
    };

    const setAssistants = (updater: string[] | ((prevAssistants: string[]) => string[])) => {
        setData(prevData => ({
            ...prevData,
            assistants: typeof updater === 'function' ? updater(prevData.assistants) : updater
        }));
    };


    const setFullData = (newData: any) => {
        if (!newData || typeof newData !== 'object') {
            console.error("Attempted to restore with invalid data format.");
            return;
        }

        const validatedData: AppData = {
            clients: Array.isArray(newData.clients) ? newData.clients : [],
            adminTasks: Array.isArray(newData.adminTasks) ? newData.adminTasks : [],
            appointments: Array.isArray(newData.appointments) ? newData.appointments : [],
            accountingEntries: Array.isArray(newData.accountingEntries) ? newData.accountingEntries : [],
            assistants: validateAssistantsList(newData.assistants),
        };
        
        setData(validatedData);
    };
    
    const allSessions = React.useMemo(() => {
        return data.clients.flatMap(client => 
            client.cases.flatMap(c => 
                c.stages.flatMap(s => s.sessions)
            )
        );
    }, [data.clients]);

    return { ...data, setClients, setAdminTasks, setAppointments, setAccountingEntries, allSessions, setFullData, setAssistants };
};