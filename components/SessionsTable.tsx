import * as React from 'react';
import { Session } from '../types';
import { formatDate, isBeforeToday } from '../utils/dateUtils';
import { PencilIcon, TrashIcon } from './icons';

interface SessionsTableProps {
    sessions: Session[];
    onPostpone: (sessionId: string, newDate: Date, reason: string) => void;
    onEdit?: (session: Session) => void;
    onDelete?: (sessionId: string) => void;
    showSessionDate?: boolean;
}

const SessionsTable: React.FC<SessionsTableProps> = ({ sessions, onPostpone, onEdit, onDelete, showSessionDate = false }) => {
    const [postponeData, setPostponeData] = React.useState<Record<string, { date: string; reason: string }>>({});
    const [errors, setErrors] = React.useState<Record<string, string>>({});

    const handleInputChange = (sessionId: string, field: 'date' | 'reason', value: string) => {
        setPostponeData(prev => ({
            ...prev,
            [sessionId]: {
                ...(prev[sessionId] || { date: '', reason: '' }),
                [field]: value,
            },
        }));
        // Clear error when user edits fields
        if (errors[sessionId]) {
            setErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[sessionId];
                return newErrors;
            });
        }
    };
    
    const handlePostponeClick = (sessionId: string) => {
        const data = postponeData[sessionId];
        const session = sessions.find(s => s.id === sessionId);

        if (!session) {
            console.error("Could not find session to postpone");
            return;
        }

        if (data && data.date && data.reason) {
            const newDate = new Date(data.date);
            
            // Normalize dates to the beginning of the day for accurate comparison
            const newDateStart = new Date(newDate.getFullYear(), newDate.getMonth(), newDate.getDate());
            const sessionDateStart = new Date(session.date.getFullYear(), session.date.getMonth(), session.date.getDate());

            if (newDateStart <= sessionDateStart) {
                setErrors(prev => ({ ...prev, [sessionId]: "تاريخ الجلسة القادمة يجب أن يكون بعد تاريخ الجلسة الحالية." }));
                return;
            }

            // If we reach here, data is valid. Clear any existing error for this session.
            setErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[sessionId];
                return newErrors;
            });

            onPostpone(sessionId, newDate, data.reason);
            setPostponeData(prev => {
                const newState = {...prev};
                delete newState[sessionId];
                return newState;
            });
        } else {
            setErrors(prev => ({ ...prev, [sessionId]: "يرجى إدخال تاريخ وسبب التأجيل." }));
        }
    };

    if (sessions.length === 0) {
        return <p className="p-4 text-gray-500 text-center">لا توجد جلسات لعرضها.</p>;
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-right text-gray-600">
                <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                    <tr>
                        <th className="px-2 sm:px-6 py-3">المحكمة</th>
                        <th className="px-2 sm:px-6 py-3">رقم الأساس</th>
                        {showSessionDate && <th className="px-2 sm:px-6 py-3">تاريخ الجلسة</th>}
                        <th className="px-2 sm:px-6 py-3">الموكل</th>
                        <th className="px-2 sm:px-6 py-3">الخصم</th>
                        <th className="px-2 sm:px-6 py-3">المكلف بالحضور</th>
                        <th className="px-2 sm:px-6 py-3">سبب التأجيل</th>
                        <th className="px-2 sm:px-6 py-3 min-w-[170px]">تاريخ الجلسة القادمة</th>
                        <th className="px-2 sm:px-6 py-3 min-w-[200px]">سبب التأجيل القادم</th>
                        <th className="px-2 sm:px-6 py-3">إجراءات</th>
                    </tr>
                </thead>
                <tbody>
                    {sessions.map(s => {
                        const showPostponeFields = !s.isPostponed && !isBeforeToday(s.date);

                        return (
                        <tr key={s.id} className="bg-white border-b hover:bg-gray-50">
                            <td className="px-2 sm:px-6 py-4">{s.court}</td>
                            <td className="px-2 sm:px-6 py-4">{s.caseNumber}</td>
                            {showSessionDate && <td className="px-2 sm:px-6 py-4">{formatDate(s.date)}</td>}
                            <td className="px-2 sm:px-6 py-4">{s.clientName}</td>
                            <td className="px-2 sm:px-6 py-4">{s.opponentName}</td>
                            <td className="px-2 sm:px-6 py-4">{s.assignee || '-'}</td>
                            <td className="px-2 sm:px-6 py-4">{s.postponementReason || 'لا يوجد'}</td>
                            
                            {showPostponeFields ? (
                                <>
                                    <td className="px-2 sm:px-6 py-4">
                                        <input 
                                            type="date" 
                                            className={`p-2 border rounded-md w-full focus:outline-none focus:ring-2 ${errors[s.id] ? 'border-red-500 focus:ring-red-500' : 'focus:ring-blue-500'}`}
                                            value={postponeData[s.id]?.date || ''}
                                            onChange={(e) => handleInputChange(s.id, 'date', e.target.value)}
                                            aria-label="تاريخ الجلسة القادمة"
                                            placeholder="DD/MM/YYYY"
                                        />
                                    </td>
                                    <td className="px-2 sm:px-6 py-4">
                                        <input 
                                            type="text" 
                                            placeholder="سبب التأجيل..." 
                                            className={`p-2 border rounded-md w-full focus:outline-none focus:ring-2 ${errors[s.id] ? 'border-red-500 focus:ring-red-500' : 'focus:ring-blue-500'}`}
                                            value={postponeData[s.id]?.reason || ''}
                                            onChange={(e) => handleInputChange(s.id, 'reason', e.target.value)}
                                            aria-label="سبب التأجيل القادم"
                                        />
                                    </td>
                                    <td className="px-2 sm:px-6 py-4">
                                        <div className="flex flex-col items-start gap-1">
                                            <div className="flex items-center gap-1">
                                                <button 
                                                    onClick={() => handlePostponeClick(s.id)}
                                                    className="px-3 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300"
                                                    disabled={!postponeData[s.id]?.date || !postponeData[s.id]?.reason}
                                                >
                                                    ترحيل
                                                </button>
                                                {onEdit && <button onClick={() => onEdit(s)} className="p-2 text-gray-500 hover:text-blue-600" aria-label="تعديل"><PencilIcon className="w-4 h-4" /></button>}
                                                {onDelete && <button onClick={() => onDelete(s.id)} className="p-2 text-gray-500 hover:text-red-600" aria-label="حذف"><TrashIcon className="w-4 h-4" /></button>}
                                            </div>
                                            {errors[s.id] && <p className="text-red-600 text-xs mt-1">{errors[s.id]}</p>}
                                        </div>
                                    </td>
                                </>
                            ) : (
                                <>
                                    <td className="px-2 sm:px-6 py-4 text-center">{s.nextSessionDate ? formatDate(s.nextSessionDate) : '-'}</td>
                                    <td className="px-2 sm:px-6 py-4">{s.nextPostponementReason || '-'}</td>
                                    <td className="px-2 sm:px-6 py-4 text-center">
                                       {(onEdit || onDelete) ? (
                                            <div className="flex items-center justify-center gap-2">
                                                {onEdit && <button onClick={() => onEdit(s)} className="p-2 text-gray-500 hover:text-blue-600" aria-label="تعديل"><PencilIcon className="w-4 h-4" /></button>}
                                                {onDelete && <button onClick={() => onDelete(s.id)} className="p-2 text-gray-500 hover:text-red-600" aria-label="حذف"><TrashIcon className="w-4 h-4" /></button>}
                                            </div>
                                       ) : '-'}
                                    </td>
                                </>
                            )}
                        </tr>
                    )})}
                </tbody>
            </table>
        </div>
    );
};

export default SessionsTable;