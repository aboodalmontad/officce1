import * as React from 'react';
import { Session, Appointment, AdminTask } from '../types';
import { formatDate } from '../utils/dateUtils';

interface AgendaItem {
    type: string;
    location: string;
    sortKey: string;
    time: string;
    title: string;
    importance: string;
    original: Session | Appointment | AdminTask;
}

interface PrintableReportProps {
    reportData: {
        assignee: string;
        date: Date;
        groupedAgenda: Record<string, AgendaItem[]>;
    } | null;
}


const PrintableReport: React.FC<PrintableReportProps> = ({ reportData }) => {
    if (!reportData) {
        return <div className="p-4 text-center">لا توجد بيانات للطباعة.</div>;
    }

    const { assignee, date, groupedAgenda } = reportData;

    // Helper function to render detailed item content
    const renderItemDetails = (item: AgendaItem) => {
        switch (item.type) {
            case 'جلسة': {
                const session = item.original as Session;
                return (
                    <div>
                        <p className="font-semibold">{`قضية: ${session.clientName} ضد ${session.opponentName}`}</p>
                        <p className="text-xs text-gray-500 mt-1">
                            {`رقم الأساس: ${session.caseNumber}`}
                            {session.postponementReason && ` | سبب التأجيل السابق: ${session.postponementReason}`}
                        </p>
                        {session.assignee && session.assignee !== 'بدون تخصيص' && (
                            <p className="text-xs text-gray-600 font-medium mt-1">
                                المكلف بالحضور: {session.assignee}
                            </p>
                        )}
                    </div>
                );
            }
            case 'مهمة إدارية': {
                const task = item.original as AdminTask;
                return (
                    <div>
                        <p className="font-semibold">{task.task}</p>
                        {task.assignee && task.assignee !== 'بدون تخصيص' && (
                            <p className="text-xs text-gray-600 font-medium mt-1">
                                المسؤول: {task.assignee}
                            </p>
                        )}
                    </div>
                );
            }
            case 'موعد': {
                const appointment = item.original as Appointment;
                return (
                    <div>
                        <p className="font-semibold">{appointment.title}</p>
                        {appointment.assignee && appointment.assignee !== 'بدون تخصيص' && (
                            <p className="text-xs text-gray-600 font-medium mt-1">
                                مع: {appointment.assignee}
                            </p>
                        )}
                    </div>
                );
            }
            default:
                return item.title;
        }
    };

    return (
        <div className="p-4">
            <header className="text-center border-b pb-4 mb-6">
                <h1 className="text-3xl font-bold text-gray-800">مكتب المحامي</h1>
                <h2 className="text-2xl font-semibold text-gray-700 mt-2">جدول الأعمال اليومي لـِ: {assignee}</h2>
                <p className="text-lg text-gray-600">{formatDate(date)}</p>
            </header>

            <main className="space-y-8">
                {Object.keys(groupedAgenda).length > 0 ? (
                    Object.entries(groupedAgenda).sort(([locA], [locB]) => locA.localeCompare(locB, 'ar')).map(([location, items]) => (
                        <section key={location}>
                            <h3 className="text-xl font-bold text-gray-800 bg-gray-100 p-2 rounded-t-lg">{location}</h3>
                            <div className="overflow-x-auto border border-t-0 rounded-b-lg">
                                <table className="w-full text-sm text-right text-gray-600">
                                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-3 w-1/5">الوقت/الأولوية</th>
                                            <th className="px-4 py-3 w-1/5">النوع</th>
                                            <th className="px-4 py-3 w-3/5">البيان/التفاصيل</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* FIX: Assert the type of `items` to `AgendaItem[]` to resolve TypeScript's inference issue where it was being treated as `unknown`. */}
                                        {(items as AgendaItem[]).map((item, index) => (
                                            <tr key={index} className="bg-white border-b">
                                                <td className="px-4 py-3 font-medium">{item.time}</td>
                                                <td className="px-4 py-3">{item.type}</td>
                                                <td className="px-4 py-3">{renderItemDetails(item)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    ))
                ) : (
                    <p className="p-4 text-gray-500 text-center">لا توجد مهام مجدولة لهذا اليوم.</p>
                )}
            </main>
        </div>
    );
};

export default PrintableReport;
