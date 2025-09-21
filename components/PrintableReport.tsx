import * as React from 'react';
import { Session, Appointment, AdminTask } from '../types';
import { formatDate, isBeforeToday } from '../utils/dateUtils';

interface PrintableReportProps {
    date: Date;
    sessions: Session[];
    appointments: Appointment[];
    adminTasks: AdminTask[];
}

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

const PrintableReport: React.FC<PrintableReportProps> = ({ date, sessions, appointments, adminTasks }) => {
    return (
        <div className="p-4 printable-section">
            <header className="text-center border-b pb-4 mb-6">
                <h1 className="text-3xl font-bold text-gray-800">مكتب المحامي</h1>
                <h2 className="text-2xl font-semibold text-gray-700 mt-2">جدول الأعمال</h2>
            </header>

            <main className="space-y-8">
                {/* Sessions Section */}
                <section>
                    <h3 className="text-xl font-bold text-gray-800 border-b-2 border-blue-600 pb-2 mb-4">جدول الجلسات ليوم: {formatDate(date)}</h3>
                    {sessions.length > 0 ? (
                        <table className="w-full text-sm text-right text-gray-600">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                                <tr>
                                    <th className="px-4 py-3">المحكمة</th>
                                    <th className="px-4 py-3">رقم الأساس</th>
                                    <th className="px-4 py-3">الموكل</th>
                                    <th className="px-4 py-3">الخصم</th>
                                    <th className="px-4 py-3">المكلف بالحضور</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sessions.map(s => (
                                    <tr key={s.id} className="bg-white border-b">
                                        <td className="px-4 py-3">{s.court}</td>
                                        <td className="px-4 py-3">{s.caseNumber}</td>
                                        <td className="px-4 py-3">{s.clientName}</td>
                                        <td className="px-4 py-3">{s.opponentName}</td>
                                        <td className="px-4 py-3">{s.assignee || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="p-4 text-gray-500">لا توجد جلسات لهذا اليوم.</p>
                    )}
                </section>

                {/* Appointments Section */}
                <section>
                    <h3 className="text-xl font-bold text-gray-800 border-b-2 border-green-600 pb-2 mb-4">سجل المواعيد ليوم: {formatDate(date)}</h3>
                    {appointments.length > 0 ? (
                        <table className="w-full text-sm text-right text-gray-600">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                                <tr>
                                    <th className="px-4 py-3">الموعد</th>
                                    <th className="px-4 py-3">الوقت</th>
                                    <th className="px-4 py-3">الأهمية</th>
                                </tr>
                            </thead>
                            <tbody>
                                {appointments.map(a => (
                                    <tr key={a.id} className="bg-white border-b">
                                        <td className="px-4 py-3">{a.title}</td>
                                        <td className="px-4 py-3">{formatTime(a.time)}</td>
                                        <td className="px-4 py-3">{
                                            { normal: 'عادي', important: 'مهم', urgent: 'عاجل' }[a.importance]
                                        }</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="p-4 text-gray-500">لا توجد مواعيد لهذا اليوم.</p>
                    )}
                </section>

                {/* Admin Tasks Section */}
                <section>
                    <h3 className="text-xl font-bold text-gray-800 border-b-2 border-yellow-600 pb-2 mb-4">كافة المهام الإدارية غير المنجزة</h3>
                    {adminTasks.length > 0 ? (
                        <table className="w-full text-sm text-right text-gray-600">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                                <tr>
                                    <th className="px-4 py-3">تاريخ الاستحقاق</th>
                                    <th className="px-4 py-3">المهمة</th>
                                    <th className="px-4 py-3">المكان</th>
                                    <th className="px-4 py-3">المسؤول</th>
                                    <th className="px-4 py-3">الأهمية</th>
                                </tr>
                            </thead>
                            <tbody>
                                {adminTasks.map(task => (
                                    <tr key={task.id} className={`bg-white border-b ${isBeforeToday(task.dueDate) ? 'bg-red-50' : ''}`}>
                                        <td className="px-4 py-3">{formatDate(task.dueDate)}</td>
                                        <td className="px-4 py-3">{task.task}</td>
                                        <td className="px-4 py-3">{task.location || '-'}</td>
                                        <td className="px-4 py-3">{task.assignee || '-'}</td>
                                        <td className="px-4 py-3">{
                                            { normal: 'عادي', important: 'مهم', urgent: 'عاجل' }[task.importance]
                                        }</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="p-4 text-gray-500">لا توجد مهام إدارية غير المنجزة.</p>
                    )}
                </section>
            </main>
        </div>
    );
};

export default PrintableReport;