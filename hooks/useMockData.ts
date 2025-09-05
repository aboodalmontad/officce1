import { useState, useEffect, useMemo } from 'react';
import { Client, Session, AdminTask, Appointment, AccountingEntry } from '../types';

const createDate = (dayOffset: number = 0, monthOffset: number = 0): Date => {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    date.setMonth(date.getMonth() + monthOffset);
    return date;
};

const MOCK_DATA: Client[] = [
    {
        id: 'client-1',
        name: 'شركة الأمل للتجارة',
        contactInfo: 'هاتف: 0501234567, بريد: contact@alamal.com',
        cases: [
            {
                id: 'case-1-1',
                subject: 'نزاع تجاري حول عقد توريد',
                clientName: 'شركة الأمل للتجارة',
                opponentName: 'شركة المستقبل الصناعية',
                feeAgreement: '50,000 ل.س',
                stages: [
                    {
                        id: 'stage-1-1-1',
                        court: 'المحكمة التجارية بالرياض',
                        caseNumber: '1445/345',
                        firstSessionDate: createDate(-40),
                        sessions: [
                            { id: 'session-1', court: 'المحكمة التجارية بالرياض', caseNumber: '1445/345', date: createDate(-40), clientName: 'شركة الأمل للتجارة', opponentName: 'شركة المستقبل الصناعية', nextPostponementReason: 'لتقديم المستندات', isPostponed: true, nextSessionDate: createDate(-15) },
                            { id: 'session-2', court: 'المحكمة التجارية بالرياض', caseNumber: '1445/345', date: createDate(-15), clientName: 'شركة الأمل للتجارة', opponentName: 'شركة المستقبل الصناعية', nextPostponementReason: 'لإحضار الشهود', isPostponed: true, nextSessionDate: createDate(-5) },
                             { id: 'session-3-unpostponed', court: 'المحكمة التجارية بالرياض', caseNumber: '1445/345', date: createDate(-5), clientName: 'شركة الأمل للتجارة', opponentName: 'شركة المستقبل الصناعية', isPostponed: false },
                            { id: 'session-3', court: 'المحكمة التجارية بالرياض', caseNumber: '1445/345', date: createDate(5), clientName: 'شركة الأمل للتجارة', opponentName: 'شركة المستقبل الصناعية', isPostponed: false },
                        ]
                    }
                ]
            }
        ]
    },
    {
        id: 'client-2',
        name: 'أحمد عبدالله',
        contactInfo: 'هاتف: 0557654321',
        cases: [
            {
                id: 'case-2-1',
                subject: 'قضية عمالية - مستحقات نهاية الخدمة',
                clientName: 'أحمد عبدالله',
                opponentName: 'شركة الإنشاءات الحديثة',
                feeAgreement: '15,000 ل.س',
                stages: [
                     {
                        id: 'stage-2-1-1',
                        court: 'المحكمة العمالية بجدة',
                        caseNumber: '1445/882',
                        firstSessionDate: createDate(-20),
                        sessions: [
                            { id: 'session-4', court: 'المحكمة العمالية بجدة', caseNumber: '1445/882', date: createDate(-20), clientName: 'أحمد عبدالله', opponentName: 'شركة الإنشاءات الحديثة', isPostponed: true, nextPostponementReason: 'للتسوية الودية', nextSessionDate: new Date() },
                            { id: 'session-5', court: 'المحكمة العمالية بجدة', caseNumber: '1445/882', date: new Date(), clientName: 'أحمد عبدالله', opponentName: 'شركة الإنشاءات الحديثة', isPostponed: false },
                        ]
                    }
                ]
            },
            {
                id: 'case-2-2',
                subject: 'مطالبة مالية',
                clientName: 'أحمد عبدالله',
                opponentName: 'خالد محمد',
                feeAgreement: '10% من قيمة المطالبة',
                stages: [
                    {
                        id: 'stage-2-2-1',
                        court: 'المحكمة العامة بالدمام',
                        caseNumber: '1445/910',
                        firstSessionDate: createDate(10),
                        sessions: [
                           { id: 'session-6', court: 'المحكمة العامة بالدمام', caseNumber: '1445/910', date: createDate(10), clientName: 'أحمد عبدالله', opponentName: 'خالد محمد', isPostponed: false },
                           { id: 'session-7', court: 'المحكمة العامة بالدمام', caseNumber: '1445/910', date: createDate(30), clientName: 'أحمد عبدالله', opponentName: 'خالد محمد', isPostponed: false },
                        ]
                    }
                ]
            }
        ]
    }
];
const MOCK_ADMIN_TASKS: AdminTask[] = [
    { id: 'task-1', task: 'مراجعة عقد شركة الأمل', dueDate: new Date(), completed: false, importance: 'important', assignee: 'أحمد' },
    { id: 'task-2', task: 'تجهيز مذكرة الرد في قضية أحمد عبدالله', dueDate: createDate(2), completed: false, importance: 'urgent', assignee: 'فاطمة' },
    { id: 'task-3', task: 'التواصل مع الخبير المحاسبي', dueDate: createDate(-1), completed: true, importance: 'normal', assignee: 'أحمد' },
    { id: 'task-4', task: 'تجديد اشتراك المكتبة القانونية', dueDate: createDate(5), completed: false, importance: 'normal', assignee: 'سارة' },
    { id: 'task-5', task: 'متابعة التحصيل من شركة المستقبل', dueDate: createDate(3), completed: false, importance: 'important', assignee: 'فاطمة' },
];
const MOCK_APPOINTMENTS: Appointment[] = [
    { id: 'apt-1', title: 'اجتماع مع الموكل أحمد عبدالله', time: '10:00', date: new Date(), importance: 'important' },
    { id: 'apt-2', title: 'مكالمة هاتفية مع محامي الخصم', time: '14:30', date: new Date(), importance: 'normal' },
    { id: 'apt-3', title: 'موعد في كتابة العدل', time: '11:00', date: createDate(3), importance: 'urgent' },
];

const MOCK_ACCOUNTING_ENTRIES: AccountingEntry[] = [
    { id: 'acc-1', type: 'income', amount: 25000, date: createDate(-30), description: 'دفعة أولى من أتعاب قضية نزاع تجاري', clientId: 'client-1', caseId: 'case-1-1', clientName: 'شركة الأمل للتجارة' },
    { id: 'acc-2', type: 'expense', amount: 1500, date: createDate(-25), description: 'رسوم تقديم الدعوى', clientId: 'client-1', caseId: 'case-1-1', clientName: 'شركة الأمل للتجارة' },
    { id: 'acc-3', type: 'income', amount: 7500, date: createDate(-15), description: 'دفعة أولى أتعاب قضية عمالية', clientId: 'client-2', caseId: 'case-2-1', clientName: 'أحمد عبدالله' },
    { id: 'acc-4', type: 'expense', amount: 3000, date: createDate(-5), description: 'أتعاب خبير محاسبي', clientId: 'client-1', caseId: 'case-1-1', clientName: 'شركة الأمل للتجارة' },
    { id: 'acc-5', type: 'expense', amount: 5000, date: createDate(0), description: 'إيجار المكتب الشهري', clientId: '', caseId: '', clientName: 'مصاريف عامة' },

];


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

const loadInitialData = () => {
    try {
        const savedData = localStorage.getItem(APP_DATA_KEY);
        if (savedData) {
            const parsedData = JSON.parse(savedData, dateReviver);
            if (parsedData.clients && parsedData.adminTasks && parsedData.appointments && parsedData.accountingEntries) {
                return parsedData;
            }
        }
    } catch (error) {
        console.error("Failed to load data from localStorage", error);
    }
    
    const initialData = {
        clients: MOCK_DATA,
        adminTasks: MOCK_ADMIN_TASKS,
        appointments: MOCK_APPOINTMENTS,
        accountingEntries: MOCK_ACCOUNTING_ENTRIES,
    };
    
    try {
        localStorage.setItem(APP_DATA_KEY, JSON.stringify(initialData));
    } catch (error) {
        console.error("Failed to save initial data to localStorage", error);
    }
    return initialData;
};

type AppData = {
    clients: Client[];
    adminTasks: AdminTask[];
    appointments: Appointment[];
    accountingEntries: AccountingEntry[];
};

export const useMockData = () => {
    const [data, setData] = useState<AppData>(loadInitialData);

    useEffect(() => {
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

    const setFullData = (newData: AppData) => {
        setData(newData);
    };
    
    const allSessions = useMemo(() => {
        return data.clients.flatMap(client => 
            client.cases.flatMap(c => 
                c.stages.flatMap(s => s.sessions)
            )
        );
    }, [data.clients]);

    return { ...data, setClients, setAdminTasks, setAppointments, setAccountingEntries, allSessions, setFullData };
};