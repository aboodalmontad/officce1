import * as React from 'react';
import { Client, AccountingEntry, Case, Stage, Session } from '../types';
import { formatDate } from '../utils/dateUtils';
import { PrintIcon } from '../components/icons';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { printElement } from '../utils/printUtils';

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

    const [reportType, setReportType] = React.useState<'financial' | 'cases' | 'clients' | 'analytics' | ''>('');
    const [filters, setFilters] = React.useState({
        startDate: toInputDateString(thirtyDaysAgo),
        endDate: toInputDateString(today),
        clientId: 'all',
    });
    const [reportData, setReportData] = React.useState<any>(null);
    const printReportsRef = React.useRef<HTMLDivElement>(null);

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
        } else if (reportType === 'analytics') {
            generateAnalyticsReport();
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

        setReportData({
            type: 'financial',
            totals: { ...totals, balance: totals.income - totals.expense },
            entries: filteredEntries.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
            title: `ملخص مالي ${filters.clientId !== 'all' ? `للموكل: ${clients.find(c => c.id === filters.clientId)?.name}` : ''} من ${formatDate(startDate)} إلى ${formatDate(endDate)}`
        });
    };
    
    const generateCaseStatusReport = () => {
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
            totals: { ...totals, balance: totals.income - totals.expense },
            title: `تقرير نشاط الموكل: ${client.name}`
        });
    };

    const generateAnalyticsReport = () => {
        // 1. Top clients by case count
        const topClientsByCases = [...clients]
            .map(c => ({ name: c.name, value: c.cases.length }))
            .filter(c => c.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, 7);

        // 2. Top clients by income
        const incomeByClient = accountingEntries
            .filter(e => e.type === 'income' && e.clientId)
            .reduce((acc, entry) => {
                acc[entry.clientId] = (acc[entry.clientId] || 0) + entry.amount;
                return acc;
            }, {} as Record<string, number>);

        const topClientsByIncomeData = Object.entries(incomeByClient)
            .map(([clientId, income]): { name: string; value: number } => ({
                name: clients.find(c => c.id === clientId)?.name || 'غير معروف',
                value: income as number,
            }))
            .sort((a, b) => b.value - a.value);

        const topClientsByIncome = topClientsByIncomeData.slice(0, 5);
        if (topClientsByIncomeData.length > 5) {
            const othersIncome = topClientsByIncomeData.slice(5).reduce((acc, curr) => acc + curr.value, 0);
            topClientsByIncome.push({ name: 'آخرون', value: othersIncome });
        }

        // 3. Top cases by income
        const allCases = clients.flatMap(c => c.cases);
        const incomeByCase = accountingEntries
            .filter(e => e.type === 'income' && e.caseId)
            .reduce((acc, entry) => {
                acc[entry.caseId] = (acc[entry.caseId] || 0) + entry.amount;
                return acc;
            }, {} as Record<string, number>);

        const topCasesByIncome = Object.entries(incomeByCase)
            .map(([caseId, income]) => {
                const caseInfo = allCases.find(c => c.id === caseId);
                const name = caseInfo ? `${caseInfo.clientName} - ${caseInfo.subject}` : 'قضية محذوفة';
                return { name: name.length > 40 ? name.slice(0, 37) + '...' : name, value: income as number };
            })
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);

        // 4. Case durations
        const closedCasesWithDurations = allCases
            .filter(c => c.status === 'closed')
            .map((c): { name: string; value: number } | null => {
                const sessions = c.stages.flatMap((stage: Stage): Session[] => stage.sessions);
                if (sessions.length < 2) return null;
                
                const timestamps = sessions
                    .map((session: Session) => new Date(session.date).getTime())
                    .filter((t): t is number => !isNaN(t));

                if (timestamps.length < 2) return null;

                const minDate = Math.min(...timestamps);
                const maxDate = Math.max(...timestamps);
                
                const duration = Math.round((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1; // Add 1 to count first day
                return { name: c.subject, value: duration };
            })
            .filter((item): item is { name: string; value: number } => Boolean(item));
        const longestCases = [...closedCasesWithDurations].sort((a, b) => b.value - a.value).slice(0, 10);

        setReportData({
            type: 'analytics',
            data: {
                topClientsByCases,
                topClientsByIncome,
                topCasesByIncome,
                longestCases,
            },
            title: 'تحليلات شاملة لأداء المكتب'
        });
    };

    const PIE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF'];
    const BAR_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white p-2 border shadow-lg rounded-md">
                    <p className="font-bold">{label}</p>
                    <p className="text-sm">{`${payload[0].name}: ${payload[0].value.toLocaleString()}`}</p>
                </div>
            );
        }
        return null;
    };


    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">التقارير</h1>
            
            <div className="bg-white p-6 rounded-lg shadow space-y-4 no-print">
                <h2 className="text-xl font-semibold border-b pb-2">خيارات التقرير</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">نوع التقرير</label>
                        <select name="reportType" value={reportType} onChange={(e) => setReportType(e.target.value as any)} className="w-full p-2 border rounded-md">
                            <option value="">-- اختر نوع التقرير --</option>
                            <option value="financial">تقرير مالي</option>
                            <option value="cases">تقرير حالة القضايا</option>
                            <option value="clients">تقرير نشاط موكل</option>
                            <option value="analytics">تحليلات شاملة</option>
                        </select>
                    </div>
                    {(reportType === 'financial' || reportType === 'cases' || reportType === 'clients') &&
                        <div>
                            <label className="block text-sm font-medium text-gray-700">الموكل</label>
                            <select name="clientId" value={filters.clientId} onChange={handleFilterChange} className="w-full p-2 border rounded-md">
                                <option value="all">جميع الموكلين</option>
                                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                    }
                    {reportType === 'financial' &&
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">من تاريخ</label>
                                <input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} className="w-full p-2 border rounded-md" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">إلى تاريخ</label>
                                <input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} className="w-full p-2 border rounded-md" />
                            </div>
                        </>
                    }
                     <div className="lg:col-span-4 flex justify-end">
                        <button onClick={handleGenerateReport} className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">
                            عرض التقرير
                        </button>
                    </div>
                </div>
            </div>

            {reportData && (
                 <div className="bg-white p-6 rounded-lg shadow" ref={printReportsRef}>
                    <div className="flex justify-between items-center border-b pb-4 mb-6">
                        <h2 className="text-2xl font-bold">{reportData.title}</h2>
                        <button onClick={() => printElement(printReportsRef.current)} className="no-print flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">
                            <PrintIcon className="w-5 h-5" />
                            <span>طباعة</span>
                        </button>
                    </div>

                    {reportData.type === 'financial' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-4 bg-green-100 text-green-800 rounded-lg"><h4 className="font-semibold">إجمالي الإيرادات</h4><p className="text-2xl font-bold">{reportData.totals.income.toLocaleString()} ل.س</p></div>
                                <div className="p-4 bg-red-100 text-red-800 rounded-lg"><h4 className="font-semibold">إجمالي المصروفات</h4><p className="text-2xl font-bold">{reportData.totals.expense.toLocaleString()} ل.س</p></div>
                                <div className="p-4 bg-blue-100 text-blue-800 rounded-lg"><h4 className="font-semibold">الرصيد</h4><p className="text-2xl font-bold">{reportData.totals.balance.toLocaleString()} ل.س</p></div>
                            </div>
                             <table className="w-full text-sm text-right">
                                <thead className="bg-gray-100">
                                    <tr><th className="px-4 py-2">التاريخ</th><th className="px-4 py-2">البيان</th><th className="px-4 py-2">العميل/القضية</th><th className="px-4 py-2">الواردات</th><th className="px-4 py-2">المصروفات</th></tr>
                                </thead>
                                <tbody>
                                    {reportData.entries.map((e: AccountingEntry) => (
                                        <tr key={e.id} className="border-t"><td className="px-4 py-2">{formatDate(e.date)}</td><td className="px-4 py-2">{e.description}</td><td className="px-4 py-2">{e.clientName}</td><td className="px-4 py-2 text-green-600">{e.type === 'income' ? e.amount.toLocaleString() : '-'}</td><td className="px-4 py-2 text-red-600">{e.type === 'expense' ? e.amount.toLocaleString() : '-'}</td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    
                    {reportData.type === 'cases' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={reportData.pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120} fill="#8884d8" label>
                                            {reportData.pieData.map((_entry: any, index: number) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <table className="w-full text-sm text-right">
                                <thead className="bg-gray-100"><tr><th className="px-4 py-2">القضية</th><th className="px-4 py-2">الموكل</th><th className="px-4 py-2">الحالة</th></tr></thead>
                                <tbody>{reportData.cases.map((c: any) => <tr key={c.id} className="border-t"><td className="px-4 py-2">{c.subject}</td><td className="px-4 py-2">{c.clientName}</td><td className="px-4 py-2">{c.status}</td></tr>)}</tbody>
                            </table>
                        </div>
                    )}
                    
                    {reportData.type === 'clients' && (
                        <div className="space-y-4">
                            <div><h3 className="font-bold">القضايا:</h3>{reportData.cases.map((c: Case) => <p key={c.id}>- {c.subject} ({c.status})</p>)}</div>
                            <div><h3 className="font-bold">الملخص المالي:</h3><p>الإيرادات: {reportData.totals.income.toLocaleString()} | المصروفات: {reportData.totals.expense.toLocaleString()} | الرصيد: {reportData.totals.balance.toLocaleString()}</p></div>
                             <table className="w-full text-sm text-right">
                                <thead className="bg-gray-100"><tr><th className="px-4 py-2">التاريخ</th><th className="px-4 py-2">البيان</th><th className="px-4 py-2">الواردات</th><th className="px-4 py-2">المصروفات</th></tr></thead>
                                <tbody>{reportData.entries.map((e: AccountingEntry) => <tr key={e.id} className="border-t"><td className="px-4 py-2">{formatDate(e.date)}</td><td className="px-4 py-2">{e.description}</td><td className="px-4 py-2 text-green-600">{e.type === 'income' ? e.amount.toLocaleString() : '-'}</td><td className="px-4 py-2 text-red-600">{e.type === 'expense' ? e.amount.toLocaleString() : '-'}</td></tr>)}</tbody>
                            </table>
                        </div>
                    )}

                    {reportData.type === 'analytics' && (
                        <div className="space-y-12">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                <div>
                                    <h3 className="font-bold mb-4 text-center">أكثر الموكلين من حيث عدد القضايا</h3>
                                    <div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={reportData.data.topClientsByCases} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="name" width={60} /><Tooltip content={<CustomTooltip />} /><Bar dataKey="value" name="عدد القضايا">{reportData.data.topClientsByCases.map((_entry: any, index: number) => <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div>
                                </div>
                                 <div>
                                    <h3 className="font-bold mb-4 text-center">أكثر الموكلين تحقيقاً للدخل</h3>
                                    <div className="h-80"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={reportData.data.topClientsByIncome} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>{reportData.data.topClientsByIncome.map((_entry: any, index: number) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}</Pie><Tooltip content={<CustomTooltip />} /><Legend /></PieChart></ResponsiveContainer></div>
                                </div>
                            </div>
                             <div>
                                <h3 className="font-bold mb-4 text-center">أكثر القضايا تحقيقاً للدخل (أعلى 10)</h3>
                                <div className="h-96"><ResponsiveContainer width="100%" height="100%"><BarChart data={reportData.data.topCasesByIncome} margin={{ top: 5, right: 20, left: 20, bottom: 120 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={100} /><YAxis /><Tooltip content={<CustomTooltip />} /><Bar dataKey="value" name="الدخل">{reportData.data.topCasesByIncome.map((_entry: any, index: number) => <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div>
                            </div>
                            <div>
                                <h3 className="font-bold mb-4 text-center">أطول القضايا مدة (بالأيام، أعلى 10)</h3>
                                <div className="h-96"><ResponsiveContainer width="100%" height="100%"><BarChart data={reportData.data.longestCases} margin={{ top: 5, right: 20, left: 20, bottom: 120 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={100} /><YAxis /><Tooltip content={<CustomTooltip />} /><Bar dataKey="value" name="المدة (أيام)">{reportData.data.longestCases.map((_entry: any, index: number) => <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ReportsPage;