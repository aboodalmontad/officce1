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
                return { name: name.length > 40 ? name.slice(0, 37) + '...' : name, value: income };
            })
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);

        // 4. Case durations
        const closedCasesWithDurations = allCases
            .filter(c => c.status === 'closed')
            .map((c): { name: string; value: number } | null => {
                const sessions = c.stages.flatMap((stage: Stage): Session[] => stage.sessions);
                if (sessions.length < 2) return null;
                const dates = sessions.map((session: Session): number => new Date(session.date).getTime());
                const minDate = Math.min(...dates);
                const maxDate = Math.max(...dates);
                // FIX: Removed the redundant Number() casting which was causing a TypeScript error.
                // The values from Math.max and Math.min are already numbers.
                const duration = Math.round((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1; // Add 1 to count first day
                return { name: c.subject, value: duration };
            })
            .filter((item): item is { name: string; value: number } => Boolean(item));

        const longestCases = [...closedCasesWithDurations].sort((a, b) => b.value - a.value).slice(0, 5);
        const fastestCases = [...closedCasesWithDurations].sort((a, b) => a.value - b.value).slice(0, 5);

        setReportData({
            type: 'analytics',
            topClientsByCases,
            topClientsByIncome,
            topCasesByIncome,
            longestCases,
            fastestCases,
            title: 'تحليلات شاملة لأداء المكتب'
        });
    };

    const renderReportContent = () => {
        if (!reportData) return (
            <div className="text-center py-10 text-gray-500">
                <p>اختر خيارات التقرير ثم اضغط على "إنشاء التقرير" لعرض البيانات.</p>
            </div>
        );

        const statusMap: Record<Case['status'], { text: string, className: string }> = {
            active: { text: 'نشطة', className: 'bg-blue-100 text-blue-800' },
            closed: { text: 'مغلقة', className: 'bg-gray-100 text-gray-800' },
            on_hold: { text: 'معلقة', className: 'bg-yellow-100 text-yellow-800' }
        };

        switch (reportData.type) {
            case 'financial':
                return (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-4 bg-green-100 text-green-800 rounded-lg text-center"><h4 className="font-semibold">إجمالي الإيرادات</h4><p className="text-2xl font-bold">{reportData.totals.income.toLocaleString()} ل.س</p></div>
                            <div className="p-4 bg-red-100 text-red-800 rounded-lg text-center"><h4 className="font-semibold">إجمالي المصروفات</h4><p className="text-2xl font-bold">{reportData.totals.expense.toLocaleString()} ل.س</p></div>
                            <div className="p-4 bg-blue-100 text-blue-800 rounded-lg text-center"><h4 className="font-semibold">الرصيد</h4><p className="text-2xl font-bold">{reportData.totals.balance.toLocaleString()} ل.س</p></div>
                        </div>
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
                                {reportData.entries.map((entry: AccountingEntry) => (
                                    <tr key={entry.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-6 py-4">{formatDate(entry.date)}</td>
                                        <td className="px-6 py-4">{entry.description}</td>
                                        <td className="px-6 py-4">{entry.clientName}</td>
                                        <td className="px-6 py-4 font-semibold text-green-600">{entry.type === 'income' ? entry.amount.toLocaleString() : '-'}</td>
                                        <td className="px-6 py-4 font-semibold text-red-600">{entry.type === 'expense' ? entry.amount.toLocaleString() : '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            case 'cases':
                const COLORS = ['#0088FE', '#808080', '#FFBB28'];
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h3 className="text-lg font-semibold mb-4">قائمة القضايا ({reportData.cases.length})</h3>
                            <ul className="max-h-96 overflow-y-auto border rounded-md divide-y">
                                {reportData.cases.map((c: Case & { clientName: string }) => (
                                    <li key={c.id} className="p-3">
                                        <p className="font-semibold">{c.subject}</p>
                                        <div className="flex justify-between items-center text-sm text-gray-600">
                                            <span>الموكل: {c.clientName}</span>
                                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusMap[c.status].className}`}>{statusMap[c.status].text}</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold mb-4 text-center">توزيع حالات القضايا</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie data={reportData.pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} fill="#8884d8" label>
                                        {reportData.pieData.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip formatter={(value) => `${value} قضايا`} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                );
             case 'clients':
                return (
                    <div className="space-y-6">
                        <div className="p-4 border rounded-lg bg-gray-50">
                            <h3 className="text-xl font-semibold">{reportData.client.name}</h3>
                            <p className="text-sm text-gray-600">{reportData.client.contactInfo}</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-4 bg-green-100 text-green-800 rounded-lg text-center"><h4 className="font-semibold">إجمالي المقبوضات</h4><p className="text-2xl font-bold">{reportData.totals.income.toLocaleString()} ل.س</p></div>
                            <div className="p-4 bg-red-100 text-red-800 rounded-lg text-center"><h4 className="font-semibold">إجمالي المصروفات</h4><p className="text-2xl font-bold">{reportData.totals.expense.toLocaleString()} ل.س</p></div>
                            <div className="p-4 bg-blue-100 text-blue-800 rounded-lg text-center"><h4 className="font-semibold">الرصيد</h4><p className="text-2xl font-bold">{reportData.totals.balance.toLocaleString()} ل.س</p></div>
                        </div>
                        <h3 className="text-lg font-semibold">القضايا ({reportData.cases.length})</h3>
                        <ul className="border rounded-md divide-y">
                            {reportData.cases.map((c: Case) => <li key={c.id} className="p-3">{c.subject}</li>)}
                        </ul>
                    </div>
                );
            case 'analytics':
                 const ChartWrapper: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
                    <div className="p-4 border rounded-lg shadow-sm">
                        <h3 className="text-lg font-semibold mb-4 text-center">{title}</h3>
                        <div style={{ width: '100%', height: 300 }}>
                            <ResponsiveContainer>{children}</ResponsiveContainer>
                        </div>
                    </div>
                );
                return (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <ChartWrapper title="أكثر الموكلين من حيث عدد القضايا">
                            <BarChart data={reportData.topClientsByCases} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" />
                                <YAxis type="category" dataKey="name" width={60} />
                                <Tooltip formatter={(value) => `${value} قضايا`}/>
                                <Bar dataKey="value" fill="#8884d8" name="عدد القضايا" />
                            </BarChart>
                        </ChartWrapper>
                        <ChartWrapper title="أكثر القضايا تحقيقًا للدخل">
                            <BarChart data={reportData.topCasesByIncome} layout="vertical" margin={{ top: 5, right: 20, left: 100, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" />
                                <YAxis type="category" dataKey="name" width={100} />
                                <Tooltip formatter={(value) => `${Number(value).toLocaleString()} ل.س`}/>
                                <Bar dataKey="value" fill="#82ca9d" name="الدخل" />
                            </BarChart>
                        </ChartWrapper>
                         <ChartWrapper title="أكثر الموكلين تحقيقًا للدخل">
                             <PieChart>
                                <Pie data={reportData.topClientsByIncome} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} fill="#ffc658" label>
                                    {reportData.topClientsByIncome.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={['#ffc658', '#8dd1e1', '#83a6ed', '#8884d8', '#a4de6c', '#d0ed57'][index % 6]} />)}
                                </Pie>
                                <Tooltip formatter={(value) => `${Number(value).toLocaleString()} ل.س`}/>
                                <Legend />
                            </PieChart>
                        </ChartWrapper>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:col-span-2">
                             <ChartWrapper title="أطول القضايا مدة (بالأيام)">
                                <BarChart data={reportData.longestCases}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip formatter={(value) => `${value} يوم`}/>
                                    <Bar dataKey="value" fill="#ff7300" name="المدة" />
                                </BarChart>
                             </ChartWrapper>
                             <ChartWrapper title="أسرع القضايا إنجازًا (بالأيام)">
                                <BarChart data={reportData.fastestCases}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip formatter={(value) => `${value} يوم`}/>
                                    <Bar dataKey="value" fill="#387908" name="المدة" />
                                </BarChart>
                             </ChartWrapper>
                         </div>
                    </div>
                );
            default:
                return <p>نوع تقرير غير معروف.</p>;
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">التقارير والتحليلات</h1>

            <div className="bg-white p-6 rounded-lg shadow space-y-4 no-print">
                <h2 className="text-xl font-semibold">خيارات التقرير</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                    <div>
                        <label htmlFor="reportType" className="block text-sm font-medium text-gray-700">نوع التقرير</label>
                        <select id="reportType" name="reportType" value={reportType} onChange={(e) => setReportType(e.target.value as any)} className="mt-1 w-full p-2 border rounded-md bg-gray-50">
                            <option value="">-- اختر نوع التقرير --</option>
                            <option value="financial">تقرير مالي</option>
                            <option value="cases">تقرير حالة القضايا</option>
                            <option value="clients">تقرير نشاط موكل</option>
                            <option value="analytics">تحليلات شاملة</option>
                        </select>
                    </div>
                    {(reportType === 'financial' || reportType === 'cases') &&
                    <div>
                        <label htmlFor="clientId" className="block text-sm font-medium text-gray-700">الموكل</label>
                        <select id="clientId" name="clientId" value={filters.clientId} onChange={handleFilterChange} className="mt-1 w-full p-2 border rounded-md bg-gray-50">
                            <option value="all">جميع الموكلين</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    }
                    {reportType === 'clients' &&
                    <div>
                        <label htmlFor="clientId" className="block text-sm font-medium text-gray-700">اختر الموكل</label>
                        <select id="clientId" name="clientId" value={filters.clientId} onChange={handleFilterChange} className="mt-1 w-full p-2 border rounded-md bg-gray-50" required>
                            <option value="all">-- اختر موكل --</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    }
                    {reportType === 'financial' &&
                    <>
                        <div>
                            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">من تاريخ</label>
                            <input type="date" id="startDate" name="startDate" value={filters.startDate} onChange={handleFilterChange} className="mt-1 w-full p-2 border rounded-md bg-gray-50" />
                        </div>
                        <div>
                            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">إلى تاريخ</label>
                            <input type="date" id="endDate" name="endDate" value={filters.endDate} onChange={handleFilterChange} className="mt-1 w-full p-2 border rounded-md bg-gray-50" />
                        </div>
                    </>
                    }
                    <div className={ reportType === 'financial' ? '' : 'lg:col-start-4'}>
                        <button onClick={handleGenerateReport} className="w-full px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                            إنشاء التقرير
                        </button>
                    </div>
                </div>
            </div>

            {reportData && (
                <div className="bg-white p-6 rounded-lg shadow animate-fade-in">
                    <div className="flex justify-between items-center border-b pb-3 mb-4">
                        <h2 className="text-2xl font-semibold">{reportData.title}</h2>
                        <button onClick={() => printElement(printReportsRef.current)} className="no-print flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
                            <PrintIcon className="w-5 h-5" />
                            <span>طباعة</span>
                        </button>
                    </div>
                    <div ref={printReportsRef}>
                        {renderReportContent()}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReportsPage;