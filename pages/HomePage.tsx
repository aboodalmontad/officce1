import * as React from 'react';
import Calendar from '../components/Calendar';
import { Session, AdminTask, Appointment, Stage, Client } from '../types';
import { formatDate, isSameDay, isBeforeToday, toInputDateString } from '../utils/dateUtils';
import { PrintIcon, PlusIcon, PencilIcon, TrashIcon, SearchIcon, ExclamationTriangleIcon, CalendarIcon, ChevronLeftIcon, ScaleIcon, BuildingLibraryIcon, ShareIcon, UserIcon, ClipboardDocumentIcon, ClipboardDocumentCheckIcon, HomeIcon } from '../components/icons';
import SessionsTable from '../components/SessionsTable';
import PrintableReport from '../components/PrintableReport';
import { printElement } from '../utils/printUtils';
import { MenuItem } from '../components/ContextMenu';
import { useDebounce } from '../hooks/useDebounce';
import { useData } from '../App';

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

const AppointmentsTable: React.FC<{ appointments: Appointment[], onAddAppointment: () => void, onEdit: (appointment: Appointment) => void, onDelete: (appointment: Appointment) => void, onContextMenu: (event: React.MouseEvent, appointment: Appointment) => void, onToggleComplete: (id: string) => void }> = React.memo(({ appointments, onAddAppointment, onEdit, onDelete, onContextMenu, onToggleComplete }) => {
    const longPressTimer = React.useRef<number | null>(null);

    const handleTouchStart = (e: React.TouchEvent, appointment: Appointment) => {
        longPressTimer.current = window.setTimeout(() => {
            const touch = e.touches[0];
            const mockEvent = { preventDefault: () => e.preventDefault(), clientX: touch.clientX, clientY: touch.clientY };
            onContextMenu(mockEvent as any, appointment);
        }, 500);
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current !== null) {
            window.clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    return (
        <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="flex justify-between items-center p-4 bg-gray-50 border-b">
                <h3 className="text-lg font-bold">سجل المواعيد</h3>
                <button onClick={onAddAppointment} className="no-print flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors text-sm">
                    <PlusIcon className="w-5 h-5" />
                    <span>موعد جديد</span>
                </button>
            </div>
            {appointments.length > 0 ? (
                 <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right text-gray-600">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                            <tr>
                                <th className="px-6 py-3">تم</th>
                                <th className="px-6 py-3">الموعد</th>
                                <th className="px-6 py-3">الوقت</th>
                                <th className="px-6 py-3">الشخص المسؤول</th>
                                <th className="px-6 py-3">الأهمية</th>
                                <th className="px-6 py-3">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {appointments.map(a => (
                                <tr 
                                    key={a.id} 
                                    onContextMenu={(e) => onContextMenu(e, a)}
                                    onTouchStart={(e) => handleTouchStart(e, a)}
                                    onTouchEnd={handleTouchEnd}
                                    onTouchMove={handleTouchEnd}
                                    className={`border-b transition-colors ${a.completed ? 'bg-green-50 text-gray-500 hover:bg-green-100' : 'bg-white hover:bg-gray-50'}`}>
                                    <td className="px-6 py-4">
                                        <input
                                            type="checkbox"
                                            checked={a.completed}
                                            onChange={() => onToggleComplete(a.id)}
                                            className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                            aria-label={`Mark appointment ${a.title} as ${a.completed ? 'incomplete' : 'complete'}`}
                                        />
                                    </td>
                                    <td className={`px-6 py-4 ${a.completed ? 'line-through' : ''}`}>{a.title}</td>
                                    <td className={`px-6 py-4 ${a.completed ? 'line-through' : ''}`}>{formatTime(a.time)}</td>
                                    <td className={`px-6 py-4 ${a.completed ? 'line-through' : ''}`}>{a.assignee}</td>
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
});

interface HomePageProps {
    onOpenAdminTaskModal: (initialData?: any) => void;
    showContextMenu: (event: React.MouseEvent, menuItems: MenuItem[]) => void;
}

const HomePage: React.FC<HomePageProps> = ({ onOpenAdminTaskModal, showContextMenu }) => {
    const { 
        appointments, 
        allSessions, 
        setAppointments, 
        adminTasks, 
        setAdminTasks, 
        assistants, 
        deleteAdminTask, 
        deleteAppointment,
        unpostponedSessions,
        postponeSession,
        setClients,
        clients,
    } = useData();

    const [selectedDate, setSelectedDate] = React.useState(new Date());
    const [calendarViewDate, setCalendarViewDate] = React.useState(new Date());
    type ViewMode = 'daily' | 'unpostponed' | 'upcoming';
    const [viewMode, setViewMode] = React.useState<ViewMode>('daily');
    const [isAppointmentModalOpen, setIsAppointmentModalOpen] = React.useState(false);
    const [editingAppointment, setEditingAppointment] = React.useState<Appointment | null>(null);
    const [newAppointment, setNewAppointment] = React.useState<{ title: string; date: string; time: string; importance: 'normal' | 'important' | 'urgent'; reminderTimeInMinutes: number; assignee: string; }>({ title: '', date: '', time: '', importance: 'normal', reminderTimeInMinutes: 15, assignee: 'بدون تخصيص' });
    const [dateWarning, setDateWarning] = React.useState<string | null>(null);

    const [activeTaskTab, setActiveTaskTab] = React.useState<'pending' | 'completed'>('pending');
    const [adminTaskSearch, setAdminTaskSearch] = React.useState('');
    const debouncedAdminTaskSearch = useDebounce(adminTaskSearch, 300);
    const [isDeleteAppointmentModalOpen, setIsDeleteAppointmentModalOpen] = React.useState(false);
    const [appointmentToDelete, setAppointmentToDelete] = React.useState<Appointment | null>(null);
    const [isDeleteTaskModalOpen, setIsDeleteTaskModalOpen] = React.useState(false);
    const [taskToDelete, setTaskToDelete] = React.useState<AdminTask | null>(null);
    const [isPrintModalOpen, setIsPrintModalOpen] = React.useState(false);
    const [isPrintAssigneeModalOpen, setIsPrintAssigneeModalOpen] = React.useState(false);
    const [isShareAssigneeModalOpen, setIsShareAssigneeModalOpen] = React.useState(false);
    const [printableReportData, setPrintableReportData] = React.useState<any | null>(null);
    const printReportRef = React.useRef<HTMLDivElement>(null);
    
    // State for drag-and-drop of tasks
    const [draggedTaskId, setDraggedTaskId] = React.useState<string | null>(null);
    
    // State for drag-and-drop of groups
    const [locationOrder, setLocationOrder] = React.useState<string[]>([]);
    const [draggedGroupLocation, setDraggedGroupLocation] = React.useState<string | null>(null);
    const [activeLocationTab, setActiveLocationTab] = React.useState<string>('');

    // State for inline assignee editing
    const [editingAssigneeTaskId, setEditingAssigneeTaskId] = React.useState<string | null>(null);
    
    // State for Decide Session Modal
    const [decideModal, setDecideModal] = React.useState<{ isOpen: boolean; session?: Session, stage?: Stage }>({ isOpen: false });
    const [decideFormData, setDecideFormData] = React.useState({ decisionNumber: '', decisionSummary: '', decisionNotes: '' });


    // Appointment Handlers
    const handleOpenAddAppointmentModal = () => {
        setEditingAppointment(null);
        setNewAppointment({ title: '', date: toInputDateString(selectedDate), time: '', importance: 'normal', reminderTimeInMinutes: 15, assignee: 'بدون تخصيص' });
        setIsAppointmentModalOpen(true);
        setDateWarning(null);
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
        setDateWarning(null);
    }
    
    const handleToggleAppointmentComplete = (id: string) => {
        setAppointments(prev => 
            prev.map(apt => 
                apt.id === id ? { ...apt, completed: !apt.completed, updated_at: new Date() } : apt
            )
        );
    };

    const handleAppointmentFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        
        if (name === 'date' && !editingAppointment) {
            const selectedInputDate = new Date(`${value}T00:00:00`);
            if (isBeforeToday(selectedInputDate)) {
                setDateWarning('تنبيه: التاريخ المحدد في الماضي.');
            } else {
                setDateWarning(null);
            }
        }
        
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
                updated_at: new Date(),
            } : apt));
        } else {
            const newAppointmentObject: Appointment = {
                id: `apt-${Date.now()}`,
                title: newAppointment.title,
                time: newAppointment.time,
                date: appointmentDate,
                importance: newAppointment.importance,
                completed: false,
                reminderTimeInMinutes: newAppointment.reminderTimeInMinutes,
                assignee: newAppointment.assignee,
                notified: false,
                updated_at: new Date(),
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
            deleteAppointment(appointmentToDelete.id);
            closeDeleteAppointmentModal();
        }
    };

    // Admin Task Handlers
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
            deleteAdminTask(taskToDelete.id);
            closeDeleteTaskModal();
        }
    };

    const handleToggleTaskComplete = (id: string) => {
        setAdminTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed, updated_at: new Date() } : t));
    };

    const handleAssigneeChange = (taskId: string, newAssignee: string) => {
        setAdminTasks(prevTasks =>
            prevTasks.map(t =>
                t.id === taskId ? { ...t, assignee: newAssignee, updated_at: new Date() } : t
            )
        );
        setEditingAssigneeTaskId(null); // Exit edit mode
    };

    const handleShareTask = (task: AdminTask) => {
        const message = [
            `*مهمة إدارية:*`,
            `*المهمة:* ${task.task}`,
            `*المكان:* ${task.location || 'غير محدد'}`,
            `*تاريخ الاستحقاق:* ${formatDate(task.dueDate)}`,
            `*الأهمية:* ${importanceMapAdminTasks[task.importance]?.text}`,
            `*المسؤول:* ${task.assignee || 'غير محدد'}`
        ].join('\n');

        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
    };

    // --- Drag and Drop Handlers ---

    const handleDragStart = (e: React.DragEvent, type: 'task' | 'group', id: string) => {
        e.stopPropagation();
        document.body.classList.add('grabbing');
        if (type === 'task') {
            e.dataTransfer.setData('application/lawyer-app-task-id', id);
            e.dataTransfer.effectAllowed = 'move';
            setDraggedTaskId(id);
        } else {
            e.dataTransfer.setData('application/lawyer-app-group-location', id);
            e.dataTransfer.effectAllowed = 'move';
            setDraggedGroupLocation(id);
        }
    };

    const handleDragEnd = () => {
        document.body.classList.remove('grabbing');
        setDraggedTaskId(null);
        setDraggedGroupLocation(null);
    };

    const handleTaskDrop = (targetTaskId: string | null, targetLocation: string, position: 'before' | 'after') => {
        if (!draggedTaskId) return;

        setAdminTasks(currentTasks => {
            const taskToMoveIndex = currentTasks.findIndex(t => t.id === draggedTaskId);
            if (taskToMoveIndex === -1) return currentTasks;
            
            const taskToMove = { ...currentTasks[taskToMoveIndex], location: targetLocation, updated_at: new Date() };

            const remainingTasks = currentTasks.filter(t => t.id !== draggedTaskId);

            let targetIndex: number;

            if (targetTaskId) {
                const initialTargetIndex = remainingTasks.findIndex(t => t.id === targetTaskId);
                targetIndex = position === 'before' ? initialTargetIndex : initialTargetIndex + 1;
            } else {
                const tasksInTargetLocation = remainingTasks.filter(t => t.location === targetLocation);
                targetIndex = tasksInTargetLocation.length > 0
                    ? remainingTasks.indexOf(tasksInTargetLocation[tasksInTargetLocation.length - 1]) + 1
                    : remainingTasks.length;
            }
            
            remainingTasks.splice(targetIndex, 0, taskToMove);

            return remainingTasks;
        });
    };
    
    const handleGroupDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };
    
    const handleGroupDrop = (e: React.DragEvent, targetLocation: string) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData('application/lawyer-app-task-id');
        const sourceGroupLocation = e.dataTransfer.getData('application/lawyer-app-group-location');

        if (taskId) {
            handleTaskDrop(null, targetLocation, 'after');
        } else if (sourceGroupLocation && sourceGroupLocation !== targetLocation) {
             setLocationOrder(currentOrder => {
                const sourceIndex = currentOrder.indexOf(sourceGroupLocation);
                const targetIndex = currentOrder.indexOf(targetLocation);
                
                if (sourceIndex === -1 || targetIndex === -1) return currentOrder;
        
                const newOrder = Array.from(currentOrder);
                const [movedGroup] = newOrder.splice(sourceIndex, 1);
                newOrder.splice(targetIndex, 0, movedGroup);
        
                return newOrder;
            });
        }
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
                const importanceA = importanceOrder[a.importance];
                const importanceB = importanceOrder[b.importance];
                if (importanceA !== importanceB) return importanceB - importanceA;
    
                const dateA = new Date(a.dueDate).getTime();
                const dateB = new Date(b.dueDate).getTime();
                if (dateA !== dateB) return dateA - dateB;
    
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

    // WhatsApp Sharing Logic
    const handleShareAssigneeReport = (assignee: string | null) => {
        const dailyAppointments = appointments
            .filter(a => isSameDay(a.date, selectedDate))
            .sort((a, b) => a.time.localeCompare(b.time));

        const dailySessions = allSessions.filter(s => isSameDay(s.date, selectedDate));

        const allUncompletedTasks = adminTasks.filter(t => !t.completed);
        const filteredForAssigneeTasks = assignee ? allUncompletedTasks.filter(t => t.assignee === assignee) : allUncompletedTasks;

        const groupedAndSortedTasks = filteredForAssigneeTasks.reduce((acc, task) => {
            const location = task.location || 'غير محدد';
            if (!acc[location]) acc[location] = [];
            acc[location].push(task);
            return acc;
        }, {} as Record<string, AdminTask[]>);
        
        const importanceOrder = { 'urgent': 3, 'important': 2, 'normal': 1 };
        for (const location in groupedAndSortedTasks) {
            groupedAndSortedTasks[location].sort((a, b) => {
                const importanceA = importanceOrder[a.importance];
                const importanceB = importanceOrder[b.importance];
                if (importanceA !== importanceB) return importanceB - importanceA;
                const dateA = new Date(a.dueDate).getTime();
                const dateB = new Date(b.dueDate).getTime();
                if (dateA !== dateB) return dateA - dateB;
                return a.task.localeCompare(b.task, 'ar');
            });
        }

        const filteredAppointments = assignee ? dailyAppointments.filter(a => a.assignee === assignee) : dailyAppointments;
        const filteredSessions = assignee ? dailySessions.filter(s => s.assignee === assignee) : dailySessions;

        // --- Start Formatting the message ---
        let message = `*جدول أعمال مكتب المحامي*\n`;
        message += `*التاريخ:* ${formatDate(selectedDate)}\n`;
        message += `*لـِ:* ${assignee || 'الجميع'}\n\n`;

        if (filteredSessions.length > 0) {
            message += `*القسم الأول: الجلسات (${filteredSessions.length})*\n`;
            filteredSessions.forEach(s => {
                message += `- (${s.court}) قضية ${s.clientName} ضد ${s.opponentName} (أساس: ${s.caseNumber}).\n`;
                if (s.postponementReason) {
                    message += `  سبب التأجيل السابق: ${s.postponementReason}\n`;
                }
            });
            message += `\n`;
        }

        if (filteredAppointments.length > 0) {
            message += `*القسم الثاني: المواعيد (${filteredAppointments.length})*\n`;
            filteredAppointments.forEach(a => {
                message += `- (${formatTime(a.time)}) ${a.title}`;
                if (a.importance !== 'normal') {
                    message += ` (${importanceMap[a.importance]?.text})`;
                }
                message += `\n`;
            });
            message += `\n`;
        }
        
        const taskLocations = Object.keys(groupedAndSortedTasks);
        if (taskLocations.length > 0) {
            message += `*القسم الثالث: المهام الإدارية (غير منجزة)*\n`;
            taskLocations.forEach(location => {
                const tasks = groupedAndSortedTasks[location];
                if (tasks.length > 0) {
                    message += `*المكان: ${location}*\n`;
                    tasks.forEach(t => {
                        let importanceText = '';
                        if (t.importance === 'urgent') importanceText = '[عاجل] ';
                        if (t.importance === 'important') importanceText = '[مهم] ';
                        message += `- ${importanceText}${t.task} - تاريخ الاستحقاق: ${formatDate(t.dueDate)}\n`;
                    });
                }
            });
        }

        if (filteredSessions.length === 0 && filteredAppointments.length === 0 && taskLocations.length === 0) {
            message += "لا توجد بنود في جدول الأعمال لهذا اليوم.";
        }
        // --- End Formatting ---
        
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');

        setIsShareAssigneeModalOpen(false);
    };

    // Session Handlers
    const handlePostponeSession = (sessionId: string, newDate: Date, newReason: string) => {
        postponeSession(sessionId, newDate, newReason);
    };
    
    const handleUpdateSession = (sessionId: string, updatedFields: Partial<Session>) => {
        setClients(currentClients => {
            return currentClients.map(client => ({
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
                        updatedSessions[sessionIndex] = {
                            ...updatedSessions[sessionIndex],
                            ...updatedFields,
                            updated_at: new Date(),
                        };

                        return {
                            ...stage,
                            sessions: updatedSessions,
                            updated_at: new Date(),
                        };
                    }),
                })),
            }));
        });
    };

    const handleOpenDecideModal = (session: Session) => {
        if (!session.stageId) {
            console.error("Cannot decide session: stageId is missing.", session);
            return;
        }

        let foundStage: Stage | null = null;
        for (const client of clients) {
            for (const caseItem of client.cases) {
                const stage = caseItem.stages.find(st => st.id === session.stageId);
                if (stage) {
                    foundStage = stage;
                    break;
                }
            }
            if (foundStage) break;
        }

        if (!foundStage) {
            console.error("Cannot decide session: Corresponding stage not found for stageId:", session.stageId);
            return;
        }

        setDecideFormData({ decisionNumber: '', decisionSummary: '', decisionNotes: '' });
        setDecideModal({ isOpen: true, session, stage: foundStage });
    };


    const handleCloseDecideModal = () => {
        setDecideModal({ isOpen: false });
    };
    
    const handleDecideSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const { session, stage } = decideModal;
        if (!session || !stage) return;

        setClients(currentClients => currentClients.map(client => ({
            ...client,
            updated_at: new Date(),
            cases: client.cases.map(c => ({
                ...c,
                updated_at: new Date(),
                stages: c.stages.map(st => {
                    if (st.id === stage.id) {
                        return {
                            ...st,
                            decisionDate: session.date,
                            decisionNumber: decideFormData.decisionNumber,
                            decisionSummary: decideFormData.decisionSummary,
                            decisionNotes: decideFormData.decisionNotes,
                            updated_at: new Date(),
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
        const filtered = adminTasks.filter(task => {
            const searchLower = debouncedAdminTaskSearch.toLowerCase();
            const matchesSearch = searchLower === '' ||
                task.task.toLowerCase().includes(searchLower) ||
                (task.assignee && task.assignee.toLowerCase().includes(searchLower)) ||
                (task.location && task.location.toLowerCase().includes(searchLower));
            return task.completed === isCompleted && matchesSearch;
        });
    
        const importanceOrder = { 'urgent': 3, 'important': 2, 'normal': 1 };
        
        if (activeTaskTab === 'pending') {
            filtered.sort((a, b) => {
                const importanceA = importanceOrder[a.importance];
                const importanceB = importanceOrder[b.importance];
                if (importanceA !== importanceB) return importanceB - importanceA;
                
                const dateA = new Date(a.dueDate).getTime();
                const dateB = new Date(b.dueDate).getTime();
                if (dateA !== dateB) return dateA - dateB;
                
                return a.task.localeCompare(b.task, 'ar');
            });
        }
        
        return filtered.reduce((acc, task) => {
            const location = task.location || 'غير محدد';
            if (!acc[location]) {
                acc[location] = [];
            }
            acc[location].push(task);
            return acc;
        }, {} as Record<string, AdminTask[]>);
    
    }, [adminTasks, activeTaskTab, debouncedAdminTaskSearch]);
    
    React.useEffect(() => {
        const newLocations = Object.keys(groupedTasks);
        setLocationOrder(currentOrder => {
            const currentOrderSet = new Set(currentOrder);
            const newLocationsSet = new Set(newLocations);
            
            const updatedOrder = currentOrder.filter(loc => newLocationsSet.has(loc));
            const newlyAddedLocations = newLocations.filter(loc => !currentOrderSet.has(loc));
            
            return [...updatedOrder, ...newlyAddedLocations];
        });
    }, [groupedTasks]);

    React.useEffect(() => {
        if (activeLocationTab && locationOrder.includes(activeLocationTab)) {
            return;
        }
        if (locationOrder.length > 0) {
            setActiveLocationTab(locationOrder[0]);
        } else {
            setActiveLocationTab('');
        }
    }, [locationOrder, activeLocationTab]);

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
    
    // --- Context Menu Handlers ---
    const handleAppointmentContextMenu = (event: React.MouseEvent, appointment: Appointment) => {
        const menuItems: MenuItem[] = [
            {
                label: 'إرسال إلى المهام الإدارية',
                icon: <BuildingLibraryIcon className="w-4 h-4" />,
                onClick: () => {
                    const description = `متابعة موعد "${appointment.title}" يوم ${formatDate(appointment.date)} الساعة ${formatTime(appointment.time)}.\nالمكلف: ${appointment.assignee || 'غير محدد'}.\nالأهمية: ${importanceMap[appointment.importance]?.text}.`;
                    onOpenAdminTaskModal({
                        task: description,
                        assignee: appointment.assignee,
                        importance: appointment.importance,
                    });
                }
            },
            {
                label: 'مشاركة عبر واتساب',
                icon: <ShareIcon className="w-4 h-4" />,
                onClick: () => {
                    const message = [
                        `*موعد:* ${appointment.title}`,
                        `*التاريخ:* ${formatDate(appointment.date)}`,
                        `*الوقت:* ${formatTime(appointment.time)}`,
                        `*المسؤول:* ${appointment.assignee || 'غير محدد'}`,
                        `*الأهمية:* ${importanceMap[appointment.importance]?.text}`
                    ].join('\n');
                    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
                    window.open(whatsappUrl, '_blank');
                }
            }
        ];
        showContextMenu(event, menuItems);
    }

    const handleSessionContextMenu = (event: React.MouseEvent, session: Session) => {
         const menuItems: MenuItem[] = [
            {
                label: 'إرسال إلى المهام الإدارية',
                icon: <BuildingLibraryIcon className="w-4 h-4" />,
                onClick: () => {
                    const description = `متابعة جلسة قضية (${session.clientName} ضد ${session.opponentName}) يوم ${formatDate(session.date)} في محكمة ${session.court} (أساس: ${session.caseNumber}).\nسبب التأجيل السابق: ${session.postponementReason || 'لا يوجد'}.\nالمكلف بالحضور: ${session.assignee}.`;
                    onOpenAdminTaskModal({
                        task: description,
                        assignee: session.assignee,
                    });
                }
            },
            {
                label: 'مشاركة عبر واتساب',
                icon: <ShareIcon className="w-4 h-4" />,
                onClick: () => {
                    const message = [
                        `*جلسة قضائية:*`,
                        `*القضية:* ${session.clientName} ضد ${session.opponentName}`,
                        `*المحكمة:* ${session.court} (أساس: ${session.caseNumber})`,
                        `*التاريخ:* ${formatDate(session.date)}`,
                        `*المسؤول:* ${session.assignee || 'غير محدد'}`,
                        `*سبب التأجيل السابق:* ${session.postponementReason || 'لا يوجد'}`
                    ].join('\n');
                    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
                    window.open(whatsappUrl, '_blank');
                }
            }
        ];
        showContextMenu(event, menuItems);
    }

    const handleAdminTaskContextMenu = (event: React.MouseEvent, task: AdminTask) => {
        const menuItems: MenuItem[] = [
            {
                label: 'مشاركة عبر واتساب',
                icon: <ShareIcon className="w-4 h-4" />,
                onClick: () => handleShareTask(task),
            },
        ];
        showContextMenu(event, menuItems);
    };

    // --- Long Press Handlers for Admin Tasks ---
    const adminTaskLongPressTimer = React.useRef<number | null>(null);

    const handleAdminTaskTouchStart = (e: React.TouchEvent, task: AdminTask) => {
        adminTaskLongPressTimer.current = window.setTimeout(() => {
            const touch = e.touches[0];
            const mockEvent = { preventDefault: () => e.preventDefault(), clientX: touch.clientX, clientY: touch.clientY };
            handleAdminTaskContextMenu(mockEvent as any, task);
        }, 500);
    };

    const handleAdminTaskTouchEnd = () => {
        if (adminTaskLongPressTimer.current !== null) {
            window.clearTimeout(adminTaskLongPressTimer.current);
            adminTaskLongPressTimer.current = null;
        }
    };

    const renderTaskItem = (task: AdminTask, location: string) => (
         <div 
            key={task.id}
            draggable={activeTaskTab === 'pending'}
            onDragStart={e => handleDragStart(e, 'task', task.id)}
            onDragEnd={handleDragEnd}
            onDragOver={e => {
                if (activeTaskTab !== 'pending' || !draggedTaskId || draggedTaskId === task.id) return;
                e.preventDefault();
            }}
            onDrop={e => {
                if (activeTaskTab !== 'pending') return;
                e.preventDefault();
                e.stopPropagation(); // Prevent group drop from firing
                const rect = e.currentTarget.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                const position = e.clientY < midpoint ? 'before' : 'after';
                handleTaskDrop(task.id, location, position);
            }}
            onContextMenu={(e) => handleAdminTaskContextMenu(e, task)}
            onTouchStart={(e) => handleAdminTaskTouchStart(e, task)}
            onTouchEnd={handleAdminTaskTouchEnd}
            onTouchMove={handleAdminTaskTouchEnd}
            className={`p-3 border rounded-lg transition-all duration-150 ${draggedTaskId === task.id ? 'opacity-40 scale-95' : 'opacity-100 scale-100'} ${task.completed ? 'bg-green-50/70 border-green-200' : 'bg-white border-gray-200 hover:bg-gray-50 hover:shadow-sm'} ${activeTaskTab === 'pending' ? 'cursor-move' : ''}`}
        >
            <div className="flex items-start gap-3">
                {/* Checkbox */}
                <div className="flex-shrink-0 pt-1">
                    <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => handleToggleTaskComplete(task.id)}
                        className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                    />
                </div>

                {/* Task Details */}
                <div className="flex-grow">
                    <p className={`font-medium text-base ${task.completed ? 'line-through text-gray-500' : 'text-gray-900'}`}>{task.task}</p>
                    
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600">
                        {/* Assignee */}
                        <div className="flex items-center gap-1.5" onClick={() => activeTaskTab === 'pending' && setEditingAssigneeTaskId(task.id)}>
                            <UserIcon className="w-4 h-4 text-gray-400" />
                            {editingAssigneeTaskId === task.id ? (
                                <select
                                    value={task.assignee}
                                    onChange={(e) => handleAssigneeChange(task.id, e.target.value)}
                                    onBlur={() => setEditingAssigneeTaskId(null)}
                                    className="p-1 border rounded bg-white text-sm focus:ring-blue-500 focus:border-blue-500"
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
                        </div>

                        {/* Due Date */}
                        <div className="flex items-center gap-1.5">
                            <CalendarIcon className="w-4 h-4 text-gray-400" />
                            <span>{formatDate(task.dueDate)}</span>
                        </div>

                        {/* Importance */}
                        <div className="flex items-center gap-1.5">
                             <span className={`px-2 py-1 text-xs font-semibold rounded-full ${importanceMapAdminTasks[task.importance]?.className}`}>
                                {importanceMapAdminTasks[task.importance]?.text}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row items-center gap-0 sm:gap-1 flex-shrink-0">
                    <button onClick={() => handleShareTask(task)} className="p-2 text-gray-500 hover:bg-gray-100 hover:text-green-600 rounded-full" title="مشاركة عبر واتساب"><ShareIcon className="w-4 h-4" /></button>
                    <button onClick={() => onOpenAdminTaskModal(task)} className="p-2 text-gray-500 hover:bg-gray-100 hover:text-blue-600 rounded-full"><PencilIcon className="w-4 h-4" /></button>
                    <button onClick={() => openDeleteTaskModal(task)} className="p-2 text-gray-500 hover:bg-gray-100 hover:text-red-600 rounded-full"><TrashIcon className="w-4 h-4" /></button>
                </div>
            </div>
        </div>
    );


    return (
        <div className="space-y-6">
            <div className="no-print flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                    <HomeIcon className="w-8 h-8"/>
                    <span>الرئيسية</span>
                </h1>
                 <div className="flex items-center gap-2">
                    <button onClick={() => setIsPrintAssigneeModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                        <PrintIcon className="w-5 h-5" />
                        <span>طباعة جدول الأعمال</span>
                    </button>
                    <button onClick={() => setIsShareAssigneeModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                        <ShareIcon className="w-5 h-5" />
                        <span>إرسال عبر واتساب</span>
                    </button>
                </div>
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
                                        <SessionsTable sessions={dailyData.dailySessions} onPostpone={handlePostponeSession} onUpdate={handleUpdateSession} onDecide={handleOpenDecideModal} assistants={assistants} allowPostponingPastSessions={true} onContextMenu={handleSessionContextMenu} />
                                    </div>
                                    <div className="bg-white p-4 sm:p-6 rounded-lg shadow space-y-4 no-print">
                                        <div className="flex justify-between items-center flex-wrap gap-4 border-b pb-3">
                                            <div className="flex items-center gap-4">
                                                <h2 className="text-2xl font-semibold">المهام الإدارية</h2>
                                                <button onClick={() => onOpenAdminTaskModal()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors text-sm">
                                                    <PlusIcon className="w-5 h-5" />
                                                    <span>مهمة جديدة</span>
                                                </button>
                                            </div>
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
                                        </div>
                                        <div className="border-b border-gray-200">
                                            <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                                                <button
                                                    onClick={() => setActiveTaskTab('pending')}
                                                    className={`whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm ${activeTaskTab === 'pending' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                                                >
                                                    المهام المعلقة
                                                </button>
                                                <button
                                                    onClick={() => setActiveTaskTab('completed')}
                                                    className={`whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm ${activeTaskTab === 'completed' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                                                >
                                                    المهام المنجزة
                                                </button>
                                            </nav>
                                        </div>

                                        {locationOrder.length > 0 && (
                                            <nav className="-mb-px flex space-x-2 overflow-x-auto border-b border-gray-200" aria-label="Location Tabs">
                                                {locationOrder.map(location => (
                                                    <button
                                                        key={location}
                                                        onClick={() => setActiveLocationTab(location)}
                                                        draggable
                                                        onDragStart={e => handleDragStart(e, 'group', location)}
                                                        onDragEnd={handleDragEnd}
                                                        onDragOver={e => e.preventDefault()}
                                                        onDrop={e => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            if (!draggedGroupLocation || draggedGroupLocation === location) {
                                                                return;
                                                            }
                                                            setLocationOrder(currentOrder => {
                                                                const sourceIndex = currentOrder.indexOf(draggedGroupLocation);
                                                                const targetIndex = currentOrder.indexOf(location);
                                                                if (sourceIndex === -1 || targetIndex === -1) return currentOrder;
                                                                const newOrder = [...currentOrder];
                                                                const [movedItem] = newOrder.splice(sourceIndex, 1);
                                                                newOrder.splice(targetIndex, 0, movedItem);
                                                                return newOrder;
                                                            });
                                                        }}
                                                        className={`whitespace-nowrap py-3 px-4 border rounded-t-lg font-medium text-sm cursor-grab transition-colors duration-150 focus:outline-none ${
                                                            activeLocationTab === location
                                                                ? 'bg-gray-50 border-gray-200 border-b-gray-50 text-blue-600 font-semibold -mb-px' // Active tab
                                                                : 'bg-white border-gray-200 border-b-0 text-gray-500 hover:bg-gray-100' // Inactive tab
                                                        } ${
                                                            draggedGroupLocation === location ? 'opacity-30 scale-95' : 'opacity-100'
                                                        }`}
                                                    >
                                                        {location}
                                                    </button>
                                                ))}
                                            </nav>
                                        )}
                                        
                                        <div className="mt-4 space-y-6">
                                            {locationOrder.length > 0 && activeLocationTab ? (
                                                <div 
                                                    onDragOver={handleGroupDragOver}
                                                    onDrop={e => handleGroupDrop(e, activeLocationTab)}
                                                    className="bg-gray-50 p-2 sm:p-4 space-y-3 border border-gray-200 border-t-0 rounded-b-lg min-h-[100px]"
                                                >
                                                    {(groupedTasks[activeLocationTab] || []).length > 0 ? (
                                                        (groupedTasks[activeLocationTab] || []).map(task => renderTaskItem(task, activeLocationTab))
                                                    ) : (
                                                         <p className="text-center text-gray-500 py-8">لا توجد مهام في هذا المكان.</p>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-center text-gray-500 py-8">لا توجد مهام لعرضها.</p>
                                            )}
                                        </div>
                                    </div>
                                    <AppointmentsTable appointments={dailyData.dailyAppointments} onAddAppointment={handleOpenAddAppointmentModal} onEdit={handleOpenEditAppointmentModal} onDelete={openDeleteAppointmentModal} onContextMenu={handleAppointmentContextMenu} onToggleComplete={handleToggleAppointmentComplete} />
                                </>
                            )}
                            {viewMode === 'unpostponed' && (
                                <div className="bg-white rounded-lg shadow overflow-hidden">
                                    <SessionsTable sessions={unpostponedSessions} onPostpone={handlePostponeSession} onUpdate={handleUpdateSession} onDecide={handleOpenDecideModal} assistants={assistants} allowPostponingPastSessions={true} showSessionDate={true} onContextMenu={handleSessionContextMenu} />
                                </div>
                            )}
                            {viewMode === 'upcoming' && (
                                <div className="bg-white rounded-lg shadow overflow-hidden">
                                    <SessionsTable sessions={upcomingSessions} onPostpone={handlePostponeSession} onUpdate={handleUpdateSession} onDecide={handleOpenDecideModal} assistants={assistants} showSessionDate={true} onContextMenu={handleSessionContextMenu} />
                                </div>
                            )}
                        </div>
                     </div>
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
                                    {dateWarning && (
                                        <p className="mt-1 text-xs text-yellow-600 flex items-center gap-1">
                                            <ExclamationTriangleIcon className="w-4 h-4" />
                                            {dateWarning}
                                        </p>
                                    )}
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
            
            {isShareAssigneeModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={() => setIsShareAssigneeModalOpen(false)}>
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4 border-b pb-3">اختر الشخص لإرسال جدول أعماله عبر واتساب</h2>
                        <div className="space-y-3 max-h-80 overflow-y-auto">
                            <button
                                onClick={() => handleShareAssigneeReport(null)}
                                className="w-full text-right px-4 py-3 bg-green-50 text-green-800 font-semibold rounded-lg hover:bg-green-100 transition-colors"
                            >
                                إرسال جدول الأعمال العام (لكل المهام اليومية)
                            </button>
                            <h3 className="text-md font-semibold text-gray-600 pt-2">أو إرسال لشخص محدد:</h3>
                            {assistants.map(name => (
                                <button
                                    key={name}
                                    onClick={() => handleShareAssigneeReport(name)}
                                    className="w-full text-right block px-4 py-2 bg-gray-50 text-gray-800 rounded-md hover:bg-gray-100 transition-colors"
                                >
                                    {name}
                                </button>
                            ))}
                        </div>
                        <div className="mt-6 flex justify-end">
                            <button type="button" onClick={() => setIsShareAssigneeModalOpen(false)} className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors">إغلاق</button>
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