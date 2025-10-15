import * as React from 'react';
import Calendar from '../components/Calendar';
import { Session, AdminTask, Appointment, Stage, Client } from '../types';
import { formatDate, isSameDay, isBeforeToday } from '../utils/dateUtils';
import { PrintIcon, PlusIcon, PencilIcon, TrashIcon, SearchIcon, ExclamationTriangleIcon, CalendarIcon, ChevronLeftIcon, ScaleIcon } from '../components/icons';
import SessionsTable from '../components/SessionsTable';
import PrintableReport from '../components/PrintableReport';
import { printElement } from '../utils/printUtils';

const importanceMap: { [key: string]: { text: string, className: string } } = {
    normal: { text: 'عادي', className: 'bg-gray-100 text-gray-800' },
    important: { text: 'مهم', className: 'bg-yellow-100 text-yellow-800' },
    urgent: { text: 'عاجل', className: 'bg-red-100 text-red-800' },
};

const importanceMapAdminTasks: { [key: string]: { text: string, className: string } } = {
    normal: { text: 'عادي', className: 'bg-gray-200 text-gray-800' },
    important: { text: 'مهم', className: 'bg-yellow-200 text-yellow-800' },
    urgent: { text: 'عاجل', className: 'bg-red-200 text-red-800' },
};

const formatTime = (time: string) => {
    if (!time) return '';
    let [hours, minutes] = time.split(':');
    let hh = parseInt(hours, 10);
    const ampm = hh >= 12 ? 'مساءً' : 'صباحًا';
    hh = hh % 12;
    hh = hh ? hh : 12; 
    const finalHours = hh.toString().padStart(2, '0');
    return `${finalHours}:${minutes} ${ampm}`;
};

const AppointmentsTable: React.FC<{ appointments: Appointment[], onAddAppointment: () => void, onEdit: (appointment: Appointment) => void, onDelete: (appointment: Appointment) => void }> = ({ appointments, onAddAppointment, onEdit, onDelete }) => (
    <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="flex justify-between items-center p-4 bg-gray-50 border-b">
            <h3 className="text-lg font-bold">سجل المواعيد</h3>
            <button onClick={onAddAppointment} className="no-print flex items-center gap-2 px-3 py-1 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                <PlusIcon className="w-4 h-4" />
                <span>موعد جديد</span>
            </button>
        </div>
        {appointments.length > 0 ? (
             <div className="overflow-x-auto">
                <table className="w-full text-sm text-right text-gray-600">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                        <tr>
                            <th className="px-6 py-3">الموعد</th>
                            <th className="px-6 py-3">الوقت</th>
                            <th className="px-6 py-3">الشخص المسؤول</th>
                            <th className="px-6 py-3">الأهمية</th>
                            <th className="px-6 py-3">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {appointments.map(a => (
                            <tr key={a.id} className="bg-white border-b hover:bg-gray-50">
                                <td className="px-6 py-4">{a.title}</td>
                                <td className="px-6 py-4">{formatTime(a.time)}</td>
                                <td className="px-6 py-4">{a.assignee}</td>
                                <td className="px-6 py-4">
                                     <span className={`px-2 py-1 text-xs font-medium rounded-full ${importanceMap[a.importance]?.className}`}>
                                        {importanceMap[a.importance]?.text}
                                    </span>
                                </td>
                                <td className="px-6 py-4 flex items-center gap-2">
                                    <button onClick={() => onEdit(a)} className="p-2 text-gray-500 hover:text-blue-600" aria-label="تعديل"><PencilIcon className="w-4 h-4" /></button>
                                    <button onClick={() => onDelete(a)} className="p-2 text-gray-500 hover:text-red-600" aria-label="حذف"><TrashIcon className="w-4 h-4" /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        ) : <p className="p-4 text-gray-500">لا توجد مواعيد لهذا اليوم.</p>}
    </div>
);

interface HomePageProps {
    appointments: Appointment[];
    setClients: (updater: (prevClients: Client[]) => Client[]) => void;
    allSessions: Session[];
    setAppointments: (updater: (prevAppointments: Appointment[]) => Appointment[]) => void;
    adminTasks: AdminTask[];
    setAdminTasks: (updater: (prevTasks: AdminTask[]) => AdminTask[]) => void;
    assistants: string[];
}

const HomePage: React.FC<HomePageProps> = ({ appointments, setClients, allSessions, setAppointments, adminTasks, setAdminTasks, assistants }) => {
    const [selectedDate, setSelectedDate] = React.useState(new Date());
    const [calendarViewDate, setCalendarViewDate] = React.useState(new Date());
    type ViewMode = 'daily' | 'unpostponed' | 'upcoming';
    const [viewMode, setViewMode] = React.useState<ViewMode>('daily');
    const [isAppointmentModalOpen, setIsAppointmentModalOpen] = React.useState(false);
    const [editingAppointment, setEditingAppointment] = React.useState<Appointment | null>(null);
    const [newAppointment, setNewAppointment] = React.useState<{ title: string; date: string; time: string; importance: 'normal' | 'important' | 'urgent'; reminderTimeInMinutes: number; assignee: string; }>({ title: '', date: '', time: '', importance: 'normal', reminderTimeInMinutes: 15, assignee: 'بدون تخصيص' });

    const [activeTaskTab, setActiveTaskTab] = React.useState<'pending' | 'completed'>('pending');
    const [isTaskModalOpen, setIsTaskModalOpen] = React.useState(false);
    const [editingTask, setEditingTask] = React.useState<AdminTask | null>(null);
    const [taskFormData, setTaskFormData] = React.useState<Omit<AdminTask, 'id' | 'dueDate'> & { dueDate: string }>({
        task: '',
        dueDate: '',
        importance: 'normal',
        assignee: 'بدون تخصيص',
        completed: false,
        location: '',
    });
    const [adminTaskSearch, setAdminTaskSearch] = React.useState('');
    const [isDeleteAppointmentModalOpen, setIsDeleteAppointmentModalOpen] = React.useState(false);
    const [appointmentToDelete, setAppointmentToDelete] = React.useState<Appointment | null>(null);
    const [isDeleteTaskModalOpen, setIsDeleteTaskModalOpen] = React.useState(false);
    const [taskToDelete, setTaskToDelete] = React.useState<AdminTask | null>(null);
    const [isPrintModalOpen, setIsPrintModalOpen] = React.useState(false);
    const [isPrintAssigneeModalOpen, setIsPrintAssigneeModalOpen] = React.useState(false);
    const [printableReportData, setPrintableReportData] = React.useState<any | null>(null);
    const printReportRef = React.useRef<HTMLDivElement>(null);
    
    // State for drag-and-drop of task groups
    const [locationOrder, setLocationOrder] = React.useState<string[]>([]);
    const [draggedGroupLocation, setDraggedGroupLocation] = React.useState<string | null>(null);
    const [dropIndicator, setDropIndicator] = React.useState<{target: string, position: 'before' | 'after'} | null>(null);
    
    // State for inline assignee editing
    const [editingAssigneeTaskId, setEditingAssigneeTaskId] = React.useState<string | null>(null);
    
    // State for Decide Session Modal
    const [decideModal, setDecideModal] = React.useState<{ isOpen: boolean; session?: Session }>({ isOpen: false });
    const [decideFormData, setDecideFormData] = React.useState({ decisionNumber: '', decisionSummary: '', decisionNotes: '' });


    const toInputDateString = (date: Date) => {
        const y = date.getFullYear();
        const m = date.getMonth() + 1;
        const d = date.getDate();
        return `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    }

    // Appointment Handlers
    const handleOpenAddAppointmentModal = () => {
        setEditingAppointment(null);
        setNewAppointment({ title: '', date: toInputDateString(selectedDate), time: '', importance: 'normal', reminderTimeInMinutes: 15, assignee: 'بدون تخصيص' });
        setIsAppointmentModalOpen(true);
    };

    const handleOpenEditAppointmentModal = (apt: Appointment) => {
        setEditingAppointment(apt);
        setNewAppointment({
            title: apt.title,
            date: toInputDateString(apt.date),
            time: apt.time,
            importance: apt.importance,
            reminderTimeInMinutes: apt.reminderTimeInMinutes ?? 15,
            assignee: apt.assignee ?? 'بدون تخصيص',
        });
        setIsAppointmentModalOpen(true);
    }

    const handleCloseAppointmentModal = () => {
        setIsAppointmentModalOpen(false);
        setEditingAppointment(null);
    }

    const handleAppointmentFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        const processedValue = name === 'reminderTimeInMinutes' ? Number(value) : value;
        setNewAppointment(prev => ({ ...prev, [name]: processedValue }));
    };

    const handleSaveAppointment = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newAppointment.title || !newAppointment.time || !newAppointment.date) return;
        
        const [year, month, day] = newAppointment.date.split('-').map(Number);
        const appointmentDate = new Date(year, month - 1, day);

        if (editingAppointment) {
            setAppointments(prev => prev.map(apt => apt.id === editingAppointment.id ? {
                ...apt,
                title: newAppointment.title,
                date: appointmentDate,
                time: newAppointment.time,
                importance: newAppointment.importance,
                reminderTimeInMinutes: newAppointment.reminderTimeInMinutes,
                assignee: newAppointment.assignee,
                notified: false, // Reset notification status on edit
            } : apt));
        } else {
            const newAppointmentObject: Appointment = {
                id: `apt-${Date.now()}`,
                title: newAppointment.title,
                time: newAppointment.time,
                date: appointmentDate,
                importance: newAppointment.importance,
                reminderTimeInMinutes: newAppointment.reminderTimeInMinutes,
                assignee: newAppointment.assignee,
                notified: false,
            };
            setAppointments(prevAppointments => [...prevAppointments, newAppointmentObject]);
        }
        handleCloseAppointmentModal();
    };
    
    const openDeleteAppointmentModal = (appointment: Appointment) => {
        setAppointmentToDelete(appointment);
        setIsDeleteAppointmentModalOpen(true);
    };

    const closeDeleteAppointmentModal = () => {
        setAppointmentToDelete(null);
        setIsDeleteAppointmentModalOpen(false);
    };

    const handleConfirmDeleteAppointment = () => {
        if (appointmentToDelete) {
            setAppointments(prev => prev.filter(apt => apt.id !== appointmentToDelete.id));
            closeDeleteAppointmentModal();
        }
    };

    // Admin Task Handlers
    const handleOpenTaskModal = (task: AdminTask | null = null) => {
        setEditingTask(task);
        if (task) {
            setTaskFormData({
                ...task,
                dueDate: toInputDateString(task.dueDate),
                location: task.location || '',
            });
        } else {
            setTaskFormData({
                task: '',
                dueDate: toInputDateString(new Date()),
                importance: 'normal',
                assignee: 'بدون تخصيص',
                completed: false,
                location: ''
            });
        }
        setIsTaskModalOpen(true);
    };

    const handleCloseTaskModal = () => {
        setIsTaskModalOpen(false);
        setEditingTask(null);
    };
    
    const handleTaskFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setTaskFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleTaskSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!taskFormData.task || !taskFormData.dueDate) return;

        const [year, month, day] = taskFormData.dueDate.split('-').map(Number);
        const taskDate = new Date(year, month - 1, day);

        const taskData: Omit<AdminTask, 'id'> = {
            task: taskFormData.task,
            dueDate: taskDate,
            importance: taskFormData.importance,
            assignee: taskFormData.assignee,
            completed: taskFormData.completed,
            location: taskFormData.location || 'غير محدد',
        };

        if (editingTask) {
            setAdminTasks(prev => prev.map(t => t.id === editingTask.id ? { ...t, ...taskData } : t));
        } else {
            setAdminTasks(prev => [...prev, { ...taskData, id: `task-${Date.now()}`, completed: false }]);
        }
        handleCloseTaskModal();
    };
    
    const openDeleteTaskModal = (task: AdminTask) => {
        setTaskToDelete(task);
        setIsDeleteTaskModalOpen(true);
    };

    const closeDeleteTaskModal = () => {
        setTaskToDelete(null);
        setIsDeleteTaskModalOpen(false);
    };

    const handleConfirmDeleteTask = () => {
        if (taskToDelete) {
            setAdminTasks(prev => prev.filter(t => t.id !== taskToDelete.id));
            closeDeleteTaskModal();
        }
    };

    const handleToggleTaskComplete = (id: string) => {
        setAdminTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
    };

    const handleAssigneeChange = (taskId: string, newAssignee: string) => {
        setAdminTasks(prevTasks =>
            prevTasks.map(t =>
                t.id === taskId ? { ...t, assignee: newAssignee } : t
            )
        );
        setEditingAssigneeTaskId(null); // Exit edit mode
    };

    // Printing Logic
    const handleGenerateAssigneeReport = (assignee: string | null) => {
        const dailyAppointments = appointments
            .filter(a => isSameDay(a.date, selectedDate))
            .sort((a, b) => a.time.localeCompare(b.time));
    
        const dailySessions = allSessions.filter(s => isSameDay(s.date, selectedDate));
    
        // Filter, group, and sort admin tasks to match the main page display
        const allUncompletedTasks = adminTasks.filter(t => !t.completed);
        const filteredForAssigneeTasks = assignee ? allUncompletedTasks.filter(t => t.assignee === assignee) : allUncompletedTasks;
    
        const groupedAndSortedTasks = filteredForAssigneeTasks.reduce((acc, task) => {
            const location = task.location || 'غير محدد';
            if (!acc[location]) {
                acc[location] = [];
            }
            acc[location].push(task);
            return acc;
        }, {} as Record<string, AdminTask[]>);
    
        const importanceOrder = { 'urgent': 3, 'important': 2, 'normal': 1 };
    
        for (const location in groupedAndSortedTasks) {
            groupedAndSortedTasks[location].sort((a, b) => {
                const dateA = new Date(a.dueDate).getTime();
                const dateB = new Date(b.dueDate).getTime();
                if (dateA !== dateB) return dateA - dateB;
    
                const importanceA = importanceOrder[a.importance];
                const importanceB = importanceOrder[b.importance];
                if (importanceA !== importanceB) return importanceB - importanceA;
    
                const assigneeA = a.assignee || '';
                const assigneeB = b.assignee || '';
                const assigneeComparison = assigneeA.localeCompare(assigneeB, 'ar');
                if (assigneeComparison !== 0) return assigneeComparison;
    
                return a.task.localeCompare(b.task, 'ar');
            });
        }
    
        const filteredAppointments = assignee ? dailyAppointments.filter(a => a.assignee === assignee) : dailyAppointments;
        const filteredSessions = assignee ? dailySessions.filter(s => s.assignee === assignee) : dailySessions;
    
        setPrintableReportData({
            assignee: assignee || 'جدول الأعمال العام',
            date: selectedDate,
            appointments: filteredAppointments,
            sessions: filteredSessions,
            adminTasks: groupedAndSortedTasks,
        });
    
        setIsPrintAssigneeModalOpen(false);
        setIsPrintModalOpen(true);
    };


    // Session Handlers
    const handlePostponeSession = (sessionId: string, newDate: Date, newReason: string) => {
        setClients(currentClients => {
            let sessionToPostpone: Session | undefined;
            let stageOfSession: Stage | undefined;

            for (const client of currentClients) {
                for (const caseItem of client.cases) {
                    for (const stage of caseItem.stages) {
                        const foundSession = stage.sessions.find(s => s.id === sessionId);
                        if (foundSession) {
                            sessionToPostpone = foundSession;
                            stageOfSession = stage;
                            break;
                        }
                    }
                    if (stageOfSession) break;
                }
                if (stageOfSession) break;
            }

            if (!sessionToPostpone || !stageOfSession) {
                console.error("Session or stage not found");
                return currentClients;
            }

            const newSession: Session = {
                ...sessionToPostpone,
                id: `session-${Date.now()}`,
                date: newDate,
                isPostponed: false,
                postponementReason: newReason,
                nextPostponementReason: undefined,
                nextSessionDate: undefined,
            };

            return currentClients.map(client => ({
                ...client,
                cases: client.cases.map(caseItem => ({
                    ...caseItem,
                    stages: caseItem.stages.map(stage => {
                        if (stage.id !== stageOfSession!.id) {
                            return stage;
                        }
                        
                        return {
                            ...stage,
                            sessions: [
                                ...stage.sessions.map(s =>
                                    s.id === sessionId
                                        ? { ...s, isPostponed: true, nextPostponementReason: newReason, nextSessionDate: newDate }
                                        : s
                                ),
                                newSession,
                            ],
                        };
                    }),
                })),
            }));
        });
    };
    
    const handleUpdateSession = (sessionId: string, updatedFields: Partial<Session>) => {
        setClients(currentClients => {
            return currentClients.map(client => ({
                ...client,
                cases: client.cases.map(caseItem => ({
                    ...caseItem,
                    stages: caseItem.stages.map(stage => {
                        const sessionIndex = stage.sessions.findIndex(s => s.id === sessionId);
                        if (sessionIndex === -1) {
                            return stage;
                        }

                        const updatedSessions = [...stage.sessions];
                        updatedSessions[sessionIndex] = {
                            ...updatedSessions[sessionIndex],
                            ...updatedFields,
                        };

                        return {
                            ...stage,
                            sessions: updatedSessions,
                        };
                    }),
                })),
            }));
        });
    };

    const handleOpenDecideModal = (session: Session) => {
        setDecideFormData({ decisionNumber: '', decisionSummary: '', decisionNotes: '' });
        setDecideModal({ isOpen: true, session });
    };

    const handleCloseDecideModal = () => {
        setDecideModal({ isOpen: false });
    };
    
    const handleDecideSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const session = decideModal.session;
        if (!session || !session.stageId) return;

        setClients(currentClients => currentClients.map(client => ({
            ...client,
            cases: client.cases.map(c => ({
                ...c,
                stages: c.stages.map(st => {
                    if (st.id === session.stageId) {
                        return {
                            ...st,
                            decisionDate: session.date,
                            decisionNumber: decideFormData.decisionNumber,
                            decisionSummary: decideFormData.decisionSummary,
                            decisionNotes: decideFormData.decisionNotes,
                        };
                    }
                    return st;
                })
            }))
        })));
        
        handleCloseDecideModal();
    };

    // Memos
    const dailyData = React.useMemo(() => {
        const dailySessions = allSessions.filter(s => isSameDay(s.date, selectedDate));
        const dailyAppointments = appointments.filter(a => isSameDay(a.date, selectedDate));
        return { dailySessions, dailyAppointments };
    }, [selectedDate, allSessions, appointments]);

    const unpostponedSessions = React.useMemo(() => {
        return allSessions.filter(s => !s.isPostponed && isBeforeToday(s.date));
    }, [allSessions]);
    
    const upcomingSessions = React.useMemo(() => {
        const tomorrow = new Date(selectedDate);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        return allSessions
            .filter(s => new Date(s.date) >= tomorrow)
            .sort((a, b) => a.date.getTime() - b.date.getTime());
    }, [allSessions, selectedDate]);

    const groupedTasks: Record<string, AdminTask[]> = React.useMemo(() => {
        const isCompleted = activeTaskTab === 'completed';
        const filtered = adminTasks
            .filter(task => {
                const searchLower = adminTaskSearch.toLowerCase();
                const matchesSearch = searchLower === '' ||
                    task.task.toLowerCase().includes(searchLower) ||
                    (task.assignee && task.assignee.toLowerCase().includes(searchLower)) ||
                    (task.location && task.location.toLowerCase().includes(searchLower));
                return task.completed === isCompleted && matchesSearch;
            });

        const grouped = filtered.reduce((acc, task) => {
            const location = task.location || 'غير محدد';
            if (!acc[location]) {
                acc[location] = [];
            }
            acc[location].push(task);
            return acc;
        }, {} as Record<string, AdminTask[]>);

        // Define the order of importance for sorting
        const importanceOrder = { 'urgent': 3, 'important': 2, 'normal': 1 };

        for (const location in grouped) {
            grouped[location].sort((a, b) => {
                 // 1. Sort by due date (ascending)
                const dateA = new Date(a.dueDate).getTime();
                const dateB = new Date(b.dueDate).getTime();
                if (dateA !== dateB) {
                    return dateA - dateB;
                }
                
                // 2. Sort by importance (descending: urgent -> important -> normal)
                const importanceA = importanceOrder[a.importance];
                const importanceB = importanceOrder[b.importance];
                if (importanceA !== importanceB) {
                    return importanceB - importanceA; // Descending
                }
                
                // 3. Sort by assignee (alphabetical)
                const assigneeA = a.assignee || '';
                const assigneeB = b.assignee || '';
                const assigneeComparison = assigneeA.localeCompare(assigneeB, 'ar');
                if (assigneeComparison !== 0) {
                    return assigneeComparison;
                }
                
                // 4. Sort by task name as a final tie-breaker
                return a.task.localeCompare(b.task, 'ar');
            });
        }

        return grouped;
    }, [adminTasks, activeTaskTab, adminTaskSearch]);

     React.useEffect(() => {
        const currentLocations = Object.keys(groupedTasks);
        setLocationOrder(prevOrder => {
            const preservedOrder = prevOrder.filter(loc => currentLocations.includes(loc));
            const newLocations = currentLocations.filter(loc => !prevOrder.includes(loc));
            return [...preservedOrder, ...newLocations];
        });
    }, [adminTasks, activeTaskTab, adminTaskSearch]);


    const handleDateSelect = (date: Date) => {
        setSelectedDate(date);
        setViewMode('daily');
    };

    const handleShowTodaysAgenda = () => {
        const today = new Date();
        setSelectedDate(today);
        setCalendarViewDate(today);
        setViewMode('daily');
    };

    const getTitle = () => {
        switch(viewMode) {
            case 'unpostponed': return "الجلسات غير المرحلة";
            case 'upcoming': return `الجلسات القادمة (بعد ${formatDate(selectedDate)})`;
            case 'daily':
            default:
                return `جدول أعمال يوم: ${formatDate(selectedDate)}`;
        }
    };

    return (
        <div className="space-y-6">
            <div className="no-print flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-3xl font-bold text-gray-800">الرئيسية</h1>
                <button onClick={() => setIsPrintAssigneeModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                    <PrintIcon className="w-5 h-5" />
                    <span>طباعة جدول الأعمال</span>
                </button>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 bg-white p-4 rounded-lg shadow space-y-4 no-print">
                    <Calendar 
                        onDateSelect={handleDateSelect} 
                        selectedDate={selectedDate} 
                        sessions={allSessions} 
                        appointments={appointments}
                        currentDate={calendarViewDate}
                        setCurrentDate={setCalendarViewDate}
                    />
                     <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="relative">
                            <button
                                onClick={() => setViewMode('unpostponed')}
                                className={`w-full flex items-center justify-center gap-2 px-4 py-2 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 text-sm font-semibold ${viewMode === 'unpostponed' ? 'bg-red-700' : 'bg-red-600 hover:bg-red-700'}`}
                            >
                                <ExclamationTriangleIcon className="w-5 h-5" />
                                <span>غير المرحلة</span>
                            </button>
                            {unpostponedSessions.length > 0 && (
                                 <span className="absolute -top-2 -start-2 flex h-5 w-5 items-center justify-center rounded-full bg-yellow-400 text-black text-xs font-bold ring-2 ring-white animate-pulse" title={`${unpostponedSessions.length} جلسات غير مرحلة`}>
                                    {unpostponedSessions.length}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={handleShowTodaysAgenda}
                            className={`w-full flex items-center justify-center gap-2 px-4 py-2 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 text-sm font-semibold ${viewMode === 'daily' ? 'bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                        >
                            <CalendarIcon className="w-5 h-5" />
                            <span>أجندة اليوم</span>
                        </button>
                        <button
                            onClick={() => setViewMode('upcoming')}
                            className={`w-full flex items-center justify-center gap-2 px-4 py-2 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 text-sm font-semibold ${viewMode === 'upcoming' ? 'bg-green-700' : 'bg-green-600 hover:bg-green-700'}`}
                        >
                            <ChevronLeftIcon className="w-5 h-5" />
                            <span>القادمة</span>
                        </button>
                    </div>
                </div>

                <div className="lg:col-span-2 space-y-6">
                     <div id="print-section">
                        <div className="mb-4">
                            <h2 className="text-2xl font-semibold">{getTitle()}</h2>
                        </div>
                        <div className="space-y-6">
                            {viewMode === 'daily' && (
                                <>
                                    <div className="bg-white rounded-lg shadow overflow-hidden">
                                        <h3 className="text-lg font-bold p-4 bg-gray-50 border-b">جدول الجلسات</h3>
                                        <SessionsTable sessions={dailyData.dailySessions} onPostpone={handlePostponeSession} onUpdate={handleUpdateSession} onDecide={handleOpenDecideModal} assistants={assistants} allowPostponingPastSessions={true} />
                                    </div>
                                    <AppointmentsTable appointments={dailyData.dailyAppointments} onAddAppointment={handleOpenAddAppointmentModal} onEdit={handleOpenEditAppointmentModal} onDelete={openDeleteAppointmentModal} />
                                </>
                            )}
                            {viewMode === 'unpostponed' && (
                                <div className="bg-white rounded-lg shadow overflow-hidden">
                                    <SessionsTable sessions={unpostponedSessions} onPostpone={handlePostponeSession} onUpdate={handleUpdateSession} onDecide={handleOpenDecideModal} assistants={assistants} allowPostponingPastSessions={true} />
                                </div>
                            )}
                            {viewMode === 'upcoming' && (
                                <div className="bg-white rounded-lg shadow overflow-hidden">
                                    <SessionsTable sessions={upcomingSessions} onPostpone={handlePostponeSession} onUpdate={handleUpdateSession} onDecide={handleOpenDecideModal} assistants={assistants} />
                                </div>
                            )}
                        </div>
                     </div>
                </div>
            </div>

            <div className="mt-8 bg-white p-6 rounded-lg shadow space-y-4 no-print">
                <div className="flex justify-between items-center flex-wrap gap-4 border-b pb-3">
                    <h2 className="text-2xl font-semibold">المهام الإدارية</h2>
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <input 
                                type="search" 
                                placeholder="ابحث عن مهمة..." 
                                value={adminTaskSearch}
                                onChange={(e) => setAdminTaskSearch(e.target.value)}
                                className="w-full sm:w-64 p-2 ps-10 text-sm border border-gray-300 rounded-lg bg-gray-50 focus:ring-blue-500 focus:border-blue-500" 
                            />
                            <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
                                <SearchIcon className="w-4 h-4 text-gray-500" />
                            </div>
                        </div>
                        <button onClick={() => handleOpenTaskModal()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                            <PlusIcon className="w-5 h-5" />
                            <span>مهمة جديدة</span>
                        </button>
                    </div>
                </div>
                 <div className="border-b border-gray-200">
                    <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                        <button
                            onClick={() => setActiveTaskTab('pending')}
                            className={`${activeTaskTab === 'pending' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                        >
                            المهام المعلقة
                        </button>
                        <button
                            onClick={() => setActiveTaskTab('completed')}
                            className={`${activeTaskTab === 'completed' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                        >
                            المهام المنجزة
                        </button>
                    </nav>
                </div>
                <div className="mt-4 space-y-6">
                    {locationOrder.length > 0 ? (
                        locationOrder.map(location => {
                            const tasks = groupedTasks[location];
                            if (!tasks || tasks.length === 0) return null;
                            
                            return (
                                <React.Fragment key={location}>
                                    {dropIndicator?.target === location && dropIndicator.position === 'before' && (
                                        <div className="h-2 bg-blue-500 rounded-full my-2 animate-pulse" />
                                    )}
                                    <div
                                        onDragOver={(e) => {
                                            e.preventDefault();
                                            if (!draggedGroupLocation || draggedGroupLocation === location || activeTaskTab !== 'pending') {
                                                setDropIndicator(null);
                                                return;
                                            }
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const midpoint = rect.top + rect.height / 2;
                                            if (e.clientY < midpoint) {
                                                setDropIndicator({ target: location, position: 'before' });
                                            } else {
                                                setDropIndicator({ target: location, position: 'after' });
                                            }
                                        }}
                                        onDragLeave={() => {
                                            setDropIndicator(null);
                                        }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            if (!draggedGroupLocation || !dropIndicator || activeTaskTab !== 'pending') return;

                                            setLocationOrder(prevOrder => {
                                                const newOrder = prevOrder.filter(item => item !== draggedGroupLocation);
                                                const targetIndex = newOrder.indexOf(dropIndicator.target);
                                                
                                                if (targetIndex === -1) return prevOrder;

                                                if (dropIndicator.position === 'before') {
                                                    newOrder.splice(targetIndex, 0, draggedGroupLocation);
                                                } else {
                                                    newOrder.splice(targetIndex + 1, 0, draggedGroupLocation);
                                                }
                                                return newOrder;
                                            });

                                            setDraggedGroupLocation(null);
                                            setDropIndicator(null);
                                        }}
                                        className={`transition-opacity ${draggedGroupLocation === location ? 'opacity-40' : ''}`}
                                    >
                                        <h3 
                                            draggable={activeTaskTab === 'pending'}
                                            onDragStart={(e) => {
                                                if (activeTaskTab !== 'pending') return;
                                                e.dataTransfer.setData('application/lawyer-app-group-location', location);
                                                e.dataTransfer.effectAllowed = 'move';
                                                setDraggedGroupLocation(location);
                                            }}
                                            onDragEnd={() => {
                                                setDraggedGroupLocation(null);
                                                setDropIndicator(null);
                                            }}
                                            className={`text-lg font-semibold text-gray-700 bg-gray-100 p-3 rounded-t-lg ${activeTaskTab === 'pending' ? 'cursor-grab' : ''}`}
                                        >
                                            {location} <span className="text-sm font-normal text-gray-500">({tasks.length} مهام)</span>
                                        </h3>
                                        <div className="overflow-x-auto border border-t-0 rounded-b-lg">
                                            <table className="w-full text-sm text-right text-gray-600">
                                                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                                    <tr>
                                                        <th className="px-4 py-3 w-12">إنجاز</th>
                                                        <th className="px-6 py-3">المهمة</th>
                                                        <th className="px-6 py-3">المسؤول</th>
                                                        <th className="px-6 py-3">تاريخ الاستحقاق</th>
                                                        <th className="px-6 py-3">الأهمية</th>
                                                        <th className="px-6 py-3">إجراءات</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {tasks.map(task => (
                                                        <tr 
                                                            key={task.id} 
                                                            className={`border-b ${task.completed ? 'bg-green-50' : 'bg-white hover:bg-gray-50'}`}
                                                        >
                                                            <td className="px-4 py-4 text-center">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={task.completed}
                                                                    onChange={() => handleToggleTaskComplete(task.id)}
                                                                    className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                                                />
                                                            </td>
                                                            <td className={`px-6 py-4 font-medium ${task.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.task}</td>
                                                            <td className="px-6 py-4 text-gray-500" onClick={() => activeTaskTab === 'pending' && setEditingAssigneeTaskId(task.id)}>
                                                                {editingAssigneeTaskId === task.id ? (
                                                                    <select
                                                                        value={task.assignee}
                                                                        onChange={(e) => handleAssigneeChange(task.id, e.target.value)}
                                                                        onBlur={() => setEditingAssigneeTaskId(null)}
                                                                        className="w-full p-1 border rounded bg-white text-sm focus:ring-blue-500 focus:border-blue-500"
                                                                        autoFocus
                                                                    >
                                                                        {assistants.map(name => (
                                                                            <option key={name} value={name}>
                                                                                {name}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                ) : (
                                                                    <span className={activeTaskTab === 'pending' ? 'cursor-pointer hover:text-blue-600' : ''}>
                                                                        {task.assignee || '-'}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-4">{formatDate(task.dueDate)}</td>
                                                            <td className="px-6 py-4">
                                                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${importanceMapAdminTasks[task.importance]?.className}`}>
                                                                    {importanceMapAdminTasks[task.importance]?.text}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 flex items-center gap-2">
                                                                <button onClick={() => handleOpenTaskModal(task)} className="p-2 text-gray-500 hover:text-blue-600"><PencilIcon className="w-4 h-4" /></button>
                                                                <button onClick={() => openDeleteTaskModal(task)} className="p-2 text-gray-500 hover:text-red-600"><TrashIcon className="w-4 h-4" /></button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    {dropIndicator?.target === location && dropIndicator.position === 'after' && (
                                        <div className="h-2 bg-blue-500 rounded-full my-2 animate-pulse" />
                                    )}
                                </React.Fragment>
                            )
                        })
                    ) : (
                        <p className="text-center text-gray-500 py-8">لا توجد مهام لعرضها.</p>
                    )}
                </div>
            </div>


            {isAppointmentModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={handleCloseAppointmentModal}>
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4">{editingAppointment ? 'تعديل موعد' : 'إضافة موعد جديد'}</h2>
                        <form onSubmit={handleSaveAppointment}>
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="title" className="block text-sm font-medium text-gray-700">الموعد</label>
                                    <input type="text" id="title" name="title" value={newAppointment.title} onChange={handleAppointmentFormChange} className="mt-1 w-full p-2 border rounded" required />
                                </div>
                                <div>
                                    <label htmlFor="date" className="block text-sm font-medium text-gray-700">التاريخ</label>
                                    <input type="date" id="date" name="date" value={newAppointment.date} onChange={handleAppointmentFormChange} className="mt-1 w-full p-2 border rounded" placeholder="DD/MM/YYYY" required />
                                </div>
                                <div>
                                    <label htmlFor="time" className="block text-sm font-medium text-gray-700">الوقت</label>
                                    <input type="time" id="time" name="time" value={newAppointment.time} onChange={handleAppointmentFormChange} className="mt-1 w-full p-2 border rounded" required />
                                </div>
                                <div>
                                    <label htmlFor="assignee" className="block text-sm font-medium text-gray-700">الشخص المسؤول</label>
                                    <select id="assignee" name="assignee" value={newAppointment.assignee} onChange={handleAppointmentFormChange} className="mt-1 w-full p-2 border rounded">
                                        {assistants.map(name => <option key={name} value={name}>{name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="importance" className="block text-sm font-medium text-gray-700">الأهمية</label>
                                    <select id="importance" name="importance" value={newAppointment.importance} onChange={handleAppointmentFormChange} className="mt-1 w-full p-2 border rounded" required>
                                        <option value="normal">عادي</option>
                                        <option value="important">مهم</option>
                                        <option value="urgent">عاجل</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="reminderTimeInMinutes" className="block text-sm font-medium text-gray-700">تذكير قبل</label>
                                    <select id="reminderTimeInMinutes" name="reminderTimeInMinutes" value={newAppointment.reminderTimeInMinutes} onChange={handleAppointmentFormChange} className="mt-1 w-full p-2 border rounded" required>
                                        <option value="5">5 دقائق</option>
                                        <option value="10">10 دقائق</option>
                                        <option value="15">15 دقيقة</option>
                                        <option value="30">30 دقيقة</option>
                                        <option value="60">ساعة واحدة</option>
                                    </select>
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end gap-4">
                                <button type="button" onClick={handleCloseAppointmentModal} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">إلغاء</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{editingAppointment ? 'حفظ التعديلات' : 'إضافة'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isTaskModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={handleCloseTaskModal}>
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4">{editingTask ? 'تعديل مهمة' : 'إضافة مهمة جديدة'}</h2>
                        <form onSubmit={handleTaskSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">المهمة</label>
                                <input type="text" name="task" value={taskFormData.task} onChange={handleTaskFormChange} className="w-full p-2 border rounded" required />
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700">المكان</label>
                                <input 
                                    type="text" 
                                    name="location" 
                                    list="locations"
                                    value={taskFormData.location || ''} 
                                    onChange={handleTaskFormChange} 
                                    className="w-full p-2 border rounded" 
                                    placeholder="مثال: القصر العدلي"
                                />
                                <datalist id="locations">
                                    <option value="القصر العدلي" />
                                    <option value="المكتب" />
                                    <option value="السجل العقاري" />
                                    <option value="السجل المدني" />
                                    <option value="المالية" />
                                </datalist>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">تاريخ الاستحقاق</label>
                                    <input type="date" name="dueDate" value={taskFormData.dueDate} onChange={handleTaskFormChange} className="w-full p-2 border rounded" placeholder="DD/MM/YYYY" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">الأهمية</label>
                                    <select name="importance" value={taskFormData.importance} onChange={handleTaskFormChange} className="w-full p-2 border rounded" required>
                                        <option value="normal">عادي</option>
                                        <option value="important">مهم</option>
                                        <option value="urgent">عاجل</option>
                                    </select>
                                </div>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700">تخصيص لـ</label>
                                <select name="assignee" value={taskFormData.assignee} onChange={handleTaskFormChange} className="w-full p-2 border rounded">
                                    {assistants.map(name => <option key={name} value={name}>{name}</option>)}
                                </select>
                            </div>
                            <div className="mt-6 flex justify-end gap-4">
                                <button type="button" onClick={handleCloseTaskModal} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">إلغاء</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">حفظ</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isDeleteAppointmentModalOpen && appointmentToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={closeDeleteAppointmentModal}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                                <ExclamationTriangleIcon className="h-8 w-8 text-red-600" aria-hidden="true" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900">
                                تأكيد حذف الموعد
                            </h3>
                            <p className="text-gray-600 my-4">
                                هل أنت متأكد من حذف موعد "{appointmentToDelete.title}"؟<br />
                                هذا الإجراء لا يمكن التراجع عنه.
                            </p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button
                                type="button"
                                className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                                onClick={closeDeleteAppointmentModal}
                            >
                                إلغاء
                            </button>
                            <button
                                type="button"
                                className="px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
                                onClick={handleConfirmDeleteAppointment}
                            >
                                نعم، قم بالحذف
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isDeleteTaskModalOpen && taskToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={closeDeleteTaskModal}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                                <ExclamationTriangleIcon className="h-8 w-8 text-red-600" aria-hidden="true" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900">
                                تأكيد حذف المهمة
                            </h3>
                            <p className="text-gray-600 my-4">
                                هل أنت متأكد من حذف مهمة "{taskToDelete.task}"؟<br />
                                هذا الإجراء لا يمكن التراجع عنه.
                            </p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button
                                type="button"
                                className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                                onClick={closeDeleteTaskModal}
                            >
                                إلغاء
                            </button>
                            <button
                                type="button"
                                className="px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
                                onClick={handleConfirmDeleteTask}
                            >
                                نعم، قم بالحذف
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {decideModal.isOpen && decideModal.session && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={handleCloseDecideModal}>
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4">تسجيل قرار الحسم</h2>
                        <form onSubmit={handleDecideSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">تاريخ الحسم</label>
                                <input type="date" value={toInputDateString(decideModal.session.date)} readOnly className="w-full p-2 border rounded bg-gray-100" />
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700">رقم القرار</label>
                                <input type="text" value={decideFormData.decisionNumber} onChange={e => setDecideFormData(p => ({...p, decisionNumber: e.target.value}))} className="w-full p-2 border rounded" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">ملخص القرار</label>
                                <textarea value={decideFormData.decisionSummary} onChange={e => setDecideFormData(p => ({...p, decisionSummary: e.target.value}))} className="w-full p-2 border rounded" rows={3}></textarea>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700">ملاحظات</label>
                                <textarea value={decideFormData.decisionNotes} onChange={e => setDecideFormData(p => ({...p, decisionNotes: e.target.value}))} className="w-full p-2 border rounded" rows={2}></textarea>
                            </div>
                            <div className="mt-6 flex justify-end gap-4">
                                <button type="button" onClick={handleCloseDecideModal} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">إلغاء</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">حفظ القرار</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isPrintAssigneeModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={() => setIsPrintAssigneeModalOpen(false)}>
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4 border-b pb-3">اختر الشخص لطباعة جدول أعماله</h2>
                        <div className="space-y-3 max-h-80 overflow-y-auto">
                            <button
                                onClick={() => handleGenerateAssigneeReport(null)}
                                className="w-full text-right px-4 py-3 bg-blue-50 text-blue-800 font-semibold rounded-lg hover:bg-blue-100 transition-colors"
                            >
                                طباعة جدول الأعمال العام (لكل المهام اليومية)
                            </button>
                            <h3 className="text-md font-semibold text-gray-600 pt-2">أو طباعة لشخص محدد:</h3>
                            {assistants.map(name => (
                                <button
                                    key={name}
                                    onClick={() => handleGenerateAssigneeReport(name)}
                                    className="w-full text-right block px-4 py-2 bg-gray-50 text-gray-800 rounded-md hover:bg-gray-100 transition-colors"
                                >
                                    {name}
                                </button>
                            ))}
                        </div>
                        <div className="mt-6 flex justify-end">
                            <button type="button" onClick={() => setIsPrintAssigneeModalOpen(false)} className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors">إغلاق</button>
                        </div>
                    </div>
                </div>
            )}

            {isPrintModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setIsPrintModalOpen(false)}>
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="overflow-y-auto" ref={printReportRef}>
                            <PrintableReport reportData={printableReportData} />
                        </div>
                        <div className="mt-6 flex justify-end gap-4 border-t pt-4 no-print">
                            <button
                                type="button"
                                className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                                onClick={() => setIsPrintModalOpen(false)}
                            >
                                إغلاق
                            </button>
                            <button
                                type="button"
                                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                                onClick={() => printElement(printReportRef.current)}
                            >
                                <PrintIcon className="w-5 h-5" />
                                <span>طباعة</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HomePage;