import React, { useState, useMemo } from 'react';
import { Client, AccountingEntry, Case } from '../types';
import { formatDate } from '../utils/dateUtils';
import { PrintIcon } from '../components/icons';
import {
    ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar,
    PieChart, Pie, Cell,
} from 'recharts';

interface ReportsPageProps {
    clients: Client[];
    accountingEntries: AccountingEntry[];
}

const toInputDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
};

const ReportsPage: React.FC<ReportsPageProps> = ({ clients, accountingEntries }) => {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const [reportType, setReportType] = useState<'financial' | 'cases' | 'clients' | ''>('');
    const [filters, setFilters] = useState({
        startDate: toInputDateString(thirtyDaysAgo),
        endDate: toInputDateString(today),
        clientId: 'all',
    });
    const [reportData, setReportData] = useState<any>(null);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFilters({ ...filters, [e.target.name]: e.target.value });
    };

    const handleGenerateReport = () => {
        if (!reportType) {
            alert('يرجى اختيار نوع التقرير.');
            return;
        }
        
        const startDate = new Date(filters.startDate);
        startDate.setHours(0,0,0,0);
        const endDate = new Date(filters.endDate);
        endDate.setHours(23,59,59,999);

        if (reportType === 'financial') {
            generateFinancialReport(startDate, endDate);
        } else if (reportType === 'cases') {
            generateCaseStatusReport();
        } else if (reportType === 'clients') {
             generateClientActivityReport();
        }
    };

    const generateFinancialReport = (startDate: Date, endDate: Date) => {
        const filteredEntries = accountingEntries.filter(entry => {
            const entryDate = new Date(entry.date);
            const inDateRange = entryDate >= startDate && entryDate <= endDate;
            const clientMatch = filters.clientId === 'all' || entry.clientId === filters.clientId;
            return inDateRange && clientMatch;
        });

        const totals = filteredEntries.reduce((acc, entry) => {
            if (entry.type === 'income') acc.income += entry.amount;
            else acc.expense += entry.amount;
            return acc;
        }, { income: 0, expense: 0 });

        const monthlyData = filteredEntries.reduce((acc: { [key: string]: { month: string, income: number, expense: number } }, entry) => {
            const month = new Date(entry.date).toLocaleString('ar-SY', { month: 'long', year: 'numeric' });
            if (!acc[month]) {
                acc[month] = { month, income: 0, expense: 0 };
            }
            if (entry.type === 'income') acc[month].income += entry.amount;
            else acc[month].expense += entry.amount;
            return acc;
        }, {});

        setReportData({
            type: 'financial',
            totals: { ...totals, balance: totals.income - totals.expense },
            entries: filteredEntries.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
            chartData: Object.values(monthlyData),
            title: `ملخص مالي ${filters.clientId !== 'all' ? `للموكل: ${clients.find(c => c.id === filters.clientId)?.name}` : ''} من ${formatDate(startDate)} إلى ${formatDate(endDate)}`
        });
    };
    
    const generateCaseStatusReport = () => {
        // FIX: Add clientId to each case object to allow filtering by client.
        const allCases = clients.flatMap(client => client.cases.map(c => ({...c, clientName: client.name, clientId: client.id})));
        const filteredCases = filters.clientId === 'all' 
            ? allCases 
            : allCases.filter(c => c.clientId === filters.clientId);
        
        const caseCounts = filteredCases.reduce((acc, caseItem) => {
            acc[caseItem.status] = (acc[caseItem.status] || 0) + 1;
            return acc;
        }, {} as Record<Case['status'], number>);
        
        const statusMap: Record<Case['status'], string> = { active: 'نشطة', closed: 'مغلقة', on_hold: 'معلقة'};

        setReportData({
            type: 'cases',
            cases: filteredCases,
            pieData: Object.entries(caseCounts).map(([status, value]) => ({ name: statusMap[status as Case['status']], value })),
            title: `تقرير حالة القضايا ${filters.clientId !== 'all' ? `للموكل: ${clients.find(c => c.id === filters.clientId)?.name}` : ''}`
        });
    };

     const generateClientActivityReport = () => {
        if (filters.clientId === 'all') {
            setReportData(null);
            alert('يرجى اختيار موكل لعرض تقرير النشاط.');
            return;
        }
        const client = clients.find(c => c.id === filters.clientId);
        if (!client) return;

        const clientEntries = accountingEntries.filter(e => e.clientId === client.id);
        const totals = clientEntries.reduce((acc, entry) => {
            if (entry.type === 'income') acc.income += entry.amount;
            else acc.expense += entry.amount;
            return acc;
        }, { income: 0, expense: 0 });

        setReportData({
            type: 'clients',
            client,
            cases: client.cases,
            entries: clientEntries.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
            totals,
            title: `تقرير نشاط الموكل: ${client.name}`
        });
    };

    const handlePrint = () => {
        window.print();
    };

    const renderReport = () => {
        if (!reportData) {
            return <div className="text-center p-8 bg-gray-50 rounded-lg"><p className="text-gray-500">الرجاء تحديد نوع التقرير وتطبيق الفلاتر لعرض النتائج.</p></div>;
        }

        switch (reportData.type) {
            case 'financial': return <FinancialReport data={reportData} />;
            case 'cases': return <CaseStatusReport data={reportData} />;
            case 'clients': return <ClientActivityReport data={reportData} />;
            default: return null;
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800 no-print">إنشاء التقارير</h1>
            
            <div className="p-6 bg-white rounded-lg shadow no-print">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                    <div>
                        <label htmlFor="reportType" className="block text-sm font-medium text-gray-700 mb-1">نوع التقرير</label>
                        <select id="reportType" name="reportType" value={reportType} onChange={e => setReportType(e.target.value as any)} className="w-full p-2 border border-gray-300 rounded-lg bg-gray-50">
                            <option value="">اختر نوع التقرير...</option>
                            <option value="financial">ملخص مالي</option>
                            <option value="cases">حالة القضايا</option>
                            <option value="clients">نشاط الموكلين</option>
                        </select>
                    </div>
                     <div>
                        <label htmlFor="clientId" className="block text-sm font-medium text-gray-700 mb-1">الموكل</label>
                        <select id="clientId" name="clientId" value={filters.clientId} onChange={handleFilterChange} className="w-full p-2 border border-gray-300 rounded-lg bg-gray-50">
                            <option value="all">كافة الموكلين</option>
                            {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
                        </select>
                    </div>
                    
                    {reportType === 'financial' && <>
                        <div>
                            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">من تاريخ</label>
                            <input type="date" id="startDate" name="startDate" value={filters.startDate} onChange={handleFilterChange} className="w-full p-2 border border-gray-300 rounded-lg"/>
                        </div>
                        <div>
                            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">إلى تاريخ</label>
                            <input type="date" id="endDate" name="endDate" value={filters.endDate} onChange={handleFilterChange} className="w-full p-2 border border-gray-300 rounded-lg"/>
                        </div>
                    </>}

                    <div className="lg:col-start-4">
                        <button onClick={handleGenerateReport} className="w-full px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                            إنشاء التقرير
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
                 {reportData && (
                    <div className="flex justify-between items-center mb-4 border-b pb-4">
                        <h2 className="text-2xl font-bold text-gray-800">{reportData.title}</h2>
                        <button onClick={handlePrint} className="no-print flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
                            <PrintIcon className="w-5 h-5" />
                            <span>طباعة التقرير</span>
                        </button>
                    </div>
                )}
                <div id="report-print-section">
                    {renderReport()}
                </div>
            </div>
        </div>
    );
};

const FinancialReport: React.FC<{ data: any }> = ({ data }) => (
    <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-green-100 text-green-800 rounded-lg shadow text-center">
                <h3 className="text-lg font-semibold">إجمالي الإيرادات</h3>
                <p className="text-3xl font-bold">{data.totals.income.toLocaleString()} ل.س</p>
            </div>
            <div className="p-6 bg-red-100 text-red-800 rounded-lg shadow text-center">
                <h3 className="text-lg font-semibold">إجمالي المصروفات</h3>
                <p className="text-3xl font-bold">{data.totals.expense.toLocaleString()} ل.س</p>
            </div>
            <div className="p-6 bg-blue-100 text-blue-800 rounded-lg shadow text-center">
                <h3 className="text-lg font-semibold">الربح الصافي</h3>
                <p className="text-3xl font-bold">{data.totals.balance.toLocaleString()} ل.س</p>
            </div>
        </div>
        {data.chartData.length > 0 && (
             <div className="mt-8">
                <h3 className="text-xl font-semibold mb-4 text-center">الإيرادات مقابل المصروفات الشهرية</h3>
                 <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis tickFormatter={(value) => new Intl.NumberFormat('ar-SY').format(value as number)} />
                        <Tooltip formatter={(value) => `${Number(value).toLocaleString()} ل.س`} />
                        <Legend />
                        <Bar dataKey="income" fill="#4ade80" name="الإيرادات" />
                        <Bar dataKey="expense" fill="#f87171" name="المصروفات" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        )}
        <div>
            <h3 className="text-xl font-semibold mb-2">تفاصيل الحركات المالية</h3>
            <div className="overflow-x-auto border rounded-lg">
                 <table className="w-full text-sm text-right text-gray-600">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                        <tr>
                            <th className="px-6 py-3">التاريخ</th>
                            <th className="px-6 py-3">البيان</th>
                            <th className="px-6 py-3">العميل/القضية</th>
                            <th className="px-6 py-3">الواردات</th>
                            <th className="px-6 py-3">المصروفات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.entries.map((entry: AccountingEntry) => (
                            <tr key={entry.id} className="bg-white border-b hover:bg-gray-50">
                                <td className="px-6 py-4">{formatDate(entry.date)}</td>
                                <td className="px-6 py-4">{entry.description}</td>
                                <td className="px-6 py-4">{entry.clientName}</td>
                                <td className="px-6 py-4 font-semibold text-green-600">
                                    {entry.type === 'income' ? entry.amount.toLocaleString() : '-'}
                                </td>
                                <td className="px-6 py-4 font-semibold text-red-600">
                                    {entry.type === 'expense' ? entry.amount.toLocaleString() : '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
);

const CaseStatusReport: React.FC<{ data: any }> = ({ data }) => {
    const COLORS = ['#3b82f6', '#6b7280', '#f97316'];
    const statusClassMap: Record<Case['status'], string> = {
        active: 'bg-blue-100 text-blue-800',
        closed: 'bg-gray-100 text-gray-800',
        on_hold: 'bg-yellow-100 text-yellow-800'
    };
    const statusMap: Record<Case['status'], string> = { active: 'نشطة', closed: 'مغلقة', on_hold: 'معلقة'};


    return (
        <div className="space-y-6">
            {data.pieData.length > 0 &&
                <div className="w-full h-80">
                    <ResponsiveContainer>
                        <PieChart>
                            <Pie data={data.pieData} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} outerRadius={120} fill="#8884d8" dataKey="value">
                                {data.pieData.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={(value) => `${value} قضية`} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            }
            <div>
                 <h3 className="text-xl font-semibold mb-2">قائمة القضايا</h3>
                <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm text-right text-gray-600">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                            <tr>
                                <th className="px-6 py-3">الموكل</th>
                                <th className="px-6 py-3">موضوع القضية</th>
                                <th className="px-6 py-3">الخصم</th>
                                <th className="px-6 py-3">الحالة</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.cases.map((caseItem: Case & { clientName: string }) => (
                                <tr key={caseItem.id} className="bg-white border-b hover:bg-gray-50">
                                    <td className="px-6 py-4">{caseItem.clientName}</td>
                                    <td className="px-6 py-4">{caseItem.subject}</td>
                                    <td className="px-6 py-4">{caseItem.opponentName}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusClassMap[caseItem.status]}`}>
                                            {statusMap[caseItem.status]}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

const ClientActivityReport: React.FC<{ data: any }> = ({ data }) => (
    <div className="space-y-6">
        <div>
            <h3 className="text-xl font-semibold mb-2 border-b pb-2">معلومات الموكل</h3>
            <p><strong>الاسم:</strong> {data.client.name}</p>
            <p><strong>معلومات الاتصال:</strong> {data.client.contactInfo}</p>
        </div>
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-indigo-100 text-indigo-800 rounded-lg shadow text-center">
                <h3 className="text-lg font-semibold">إجمالي القضايا</h3>
                <p className="text-3xl font-bold">{data.cases.length}</p>
            </div>
            <div className="p-6 bg-green-100 text-green-800 rounded-lg shadow text-center">
                <h3 className="text-lg font-semibold">إجمالي المدفوعات</h3>
                <p className="text-3xl font-bold">{data.totals.income.toLocaleString()} ل.س</p>
            </div>
             <div className="p-6 bg-red-100 text-red-800 rounded-lg shadow text-center">
                <h3 className="text-lg font-semibold">إجمالي المصروفات</h3>
                <p className="text-3xl font-bold">{data.totals.expense.toLocaleString()} ل.س</p>
            </div>
        </div>
        <div>
            <h3 className="text-xl font-semibold mb-2 border-b pb-2">القضايا</h3>
            <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm text-right text-gray-600">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                        <tr>
                            <th className="px-6 py-3">الموضوع</th>
                            <th className="px-6 py-3">الخصم</th>
                            <th className="px-6 py-3">اتفاقية الأتعاب</th>
                            <th className="px-6 py-3">الحالة</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.cases.map((caseItem: Case) => (
                             <tr key={caseItem.id} className="bg-white border-b hover:bg-gray-50">
                                <td className="px-6 py-4">{caseItem.subject}</td>
                                <td className="px-6 py-4">{caseItem.opponentName}</td>
                                <td className="px-6 py-4">{caseItem.feeAgreement}</td>
                                <td className="px-6 py-4">{caseItem.status === 'active' ? 'نشطة' : (caseItem.status === 'closed' ? 'مغلقة' : 'معلقة')}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
        <div>
            <h3 className="text-xl font-semibold mb-2 border-b pb-2">الحركات المالية</h3>
            <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm text-right text-gray-600">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                        <tr>
                            <th className="px-6 py-3">التاريخ</th>
                            <th className="px-6 py-3">البيان</th>
                            <th className="px-6 py-3">القضية</th>
                            <th className="px-6 py-3">الواردات</th>
                            <th className="px-6 py-3">المصروفات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.entries.map((entry: AccountingEntry) => {
                            const relatedCase = data.cases.find((c: Case) => c.id === entry.caseId);
                            return (
                                <tr key={entry.id} className="bg-white border-b hover:bg-gray-50">
                                    <td className="px-6 py-4">{formatDate(entry.date)}</td>
                                    <td className="px-6 py-4">{entry.description}</td>
                                    <td className="px-6 py-4">{relatedCase?.subject || '-'}</td>
                                    <td className="px-6 py-4 font-semibold text-green-600">{entry.type === 'income' ? entry.amount.toLocaleString() : '-'}</td>
                                    <td className="px-6 py-4 font-semibold text-red-600">{entry.type === 'expense' ? entry.amount.toLocaleString() : '-'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
);

export default ReportsPage;