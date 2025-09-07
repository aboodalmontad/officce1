import React, { useState, useMemo } from 'react';
import { AdminTask } from '../types';
import { formatDate } from '../utils/dateUtils';
import { PlusIcon, PencilIcon, TrashIcon } from '../components/icons';

interface AdminTasksPageProps {
    adminTasks: AdminTask[];
    setAdminTasks: (updater: (prevTasks: AdminTask[]) => AdminTask[]) => void;
}

const importanceMap: { [key: string]: { text: string, className: string } } = {
    normal: { text: 'عادي', className: 'bg-gray-200 text-gray-800' },
    important: { text: 'مهم', className: 'bg-yellow-200 text-yellow-800' },
    urgent: { text: 'عاجل', className: 'bg-red-200 text-red-800' },
};

const assistants = ['أحمد', 'فاطمة', 'سارة', 'بدون تخصيص'];

const AdminTasksPage: React.FC<AdminTasksPageProps> = ({ adminTasks, setAdminTasks }) => {
    const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<AdminTask | null>(null);

    // FIX: Made the formData type stricter by removing Partial<> to ensure required fields are always present, resolving type errors on submit.
    const [formData, setFormData] = useState<Omit<AdminTask, 'id' | 'dueDate'> & { dueDate: string }>({
        task: '',
        dueDate: '',
        importance: 'normal',
        // FIX: Replaced non-existent 'project' property with 'location'.
        location: '',
        assignee: 'بدون تخصيص',
        completed: false
    });

    const toInputDateString = (date: Date) => {
        const y = date.getFullYear();
        const m = date.getMonth() + 1;
        const d = date.getDate();
        return `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    };

    const handleOpenModal = (task: AdminTask | null = null) => {
        setEditingTask(task);
        if (task) {
            setFormData({
                ...task,
                dueDate: toInputDateString(task.dueDate),
            });
        } else {
            setFormData({
                task: '',
                dueDate: toInputDateString(new Date()),
                importance: 'normal',
                // FIX: Replaced non-existent 'project' property with 'location'.
                location: '',
                assignee: 'بدون تخصيص',
                completed: false
            });
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingTask(null);
    };
    
    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.task || !formData.dueDate) return;

        const [year, month, day] = formData.dueDate.split('-').map(Number);
        const taskDate = new Date(year, month - 1, day);

        const taskData = {
            ...formData,
            dueDate: taskDate,
        };

        if (editingTask) {
            setAdminTasks(prev => prev.map(t => t.id === editingTask.id ? { ...t, ...taskData } : t));
        } else {
            setAdminTasks(prev => [...prev, { ...taskData, id: `task-${Date.now()}`, completed: false }]);
        }
        handleCloseModal();
    };
    
    const handleDelete = (id: string) => {
        if (window.confirm('هل أنت متأكد من حذف هذه المهمة؟')) {
            setAdminTasks(prev => prev.filter(t => t.id !== id));
        }
    };

    const handleToggleComplete = (id: string) => {
        setAdminTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
    };

    const filteredTasks = useMemo(() => {
        const isCompleted = activeTab === 'completed';
        return adminTasks
            .filter(task => task.completed === isCompleted)
            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    }, [adminTasks, activeTab]);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-800">المهام الإدارية</h1>
                <button onClick={() => handleOpenModal()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                    <PlusIcon className="w-5 h-5" />
                    <span>مهمة جديدة</span>
                </button>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
                 <div className="border-b border-gray-200">
                    <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                        <button
                            onClick={() => setActiveTab('pending')}
                            className={`${activeTab === 'pending' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                        >
                            المهام المعلقة
                        </button>
                        <button
                            onClick={() => setActiveTab('completed')}
                            className={`${activeTab === 'completed' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                        >
                            المهام المنجزة
                        </button>
                    </nav>
                </div>
                <div className="overflow-x-auto mt-4">
                    <table className="w-full text-sm text-right text-gray-600">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                            <tr>
                                <th className="px-4 py-3 w-12">إنجاز</th>
                                <th className="px-6 py-3">المهمة</th>
                                {/* FIX: Replaced 'المشروع' with 'المكان' for consistency. */}
                                <th className="px-6 py-3">المكان</th>
                                <th className="px-6 py-3">المسؤول</th>
                                <th className="px-6 py-3">تاريخ الاستحقاق</th>
                                <th className="px-6 py-3">الأهمية</th>
                                <th className="px-6 py-3">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTasks.map(task => (
                                <tr key={task.id} className={`border-b hover:bg-gray-50 ${task.completed ? 'bg-green-50' : 'bg-white'}`}>
                                    <td className="px-4 py-4 text-center">
                                        <input
                                            type="checkbox"
                                            checked={task.completed}
                                            onChange={() => handleToggleComplete(task.id)}
                                            className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                        />
                                    </td>
                                    <td className={`px-6 py-4 font-medium ${task.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.task}</td>
                                    {/* FIX: Replaced non-existent 'task.project' with 'task.location'. */}
                                    <td className="px-6 py-4 text-gray-500">{task.location || '-'}</td>
                                    <td className="px-6 py-4 text-gray-500">{task.assignee || '-'}</td>
                                    <td className="px-6 py-4">{formatDate(task.dueDate)}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${importanceMap[task.importance]?.className}`}>
                                            {importanceMap[task.importance]?.text}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 flex items-center gap-2">
                                        <button onClick={() => handleOpenModal(task)} className="p-2 text-gray-500 hover:text-blue-600"><PencilIcon className="w-4 h-4" /></button>
                                        <button onClick={() => handleDelete(task.id)} className="p-2 text-gray-500 hover:text-red-600"><TrashIcon className="w-4 h-4" /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                     {filteredTasks.length === 0 && (
                        <p className="text-center text-gray-500 py-8">لا توجد مهام لعرضها.</p>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={handleCloseModal}>
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4">{editingTask ? 'تعديل مهمة' : 'إضافة مهمة جديدة'}</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">المهمة</label>
                                <input type="text" name="task" value={formData.task} onChange={handleFormChange} className="w-full p-2 border rounded" required />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">تاريخ الاستحقاق</label>
                                    <input type="date" name="dueDate" value={formData.dueDate} onChange={handleFormChange} className="w-full p-2 border rounded" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">الأهمية</label>
                                    <select name="importance" value={formData.importance} onChange={handleFormChange} className="w-full p-2 border rounded" required>
                                        <option value="normal">عادي</option>
                                        <option value="important">مهم</option>
                                        <option value="urgent">عاجل</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    {/* FIX: Replaced 'project' with 'location' and updated label/placeholder. */}
                                    <label className="block text-sm font-medium text-gray-700">المكان (اختياري)</label>
                                    <input type="text" name="location" placeholder="مثال: القصر العدلي" value={formData.location || ''} onChange={handleFormChange} className="w-full p-2 border rounded" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">تخصيص لـ</label>
                                    <select name="assignee" value={formData.assignee} onChange={handleFormChange} className="w-full p-2 border rounded">
                                        {assistants.map(name => <option key={name} value={name}>{name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end gap-4">
                                <button type="button" onClick={handleCloseModal} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">إلغاء</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">حفظ</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminTasksPage;
