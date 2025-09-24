import * as React from 'react';
import { Client, AccountingEntry, Case } from '../types';
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
            totals,
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

        // FIX: Added an explicit return type to the map function to ensure correct type inference for `topClientsByIncomeData`.
        // This resolves errors in the subsequent `.sort()` and `.reduce()` calls.
        const topClientsByIncomeData = Object.entries(incomeByClient)
            .map(([clientId, income]): { name: string; value: number } => ({
                name: clients.find(c => c.id === clientId)?.name || 'غير معروف',
                value: income,
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
        // FIX: Added an explicit return type to the map function and used a type predicate in the filter function.
        // This ensures `closedCasesWithDurations` is correctly typed as `{ name: string; value: number }[]`,
        // resolving arithmetic errors in the `.sort()` calls for `longestCases` and `fastestCases`.
        const closedCasesWithDurations = allCases
            .filter(c => c.status === 'closed')
            .map((c): { name: string; value: number } | null => {
                const sessions = c.stages.flatMap(s => s.sessions);
                if (sessions.length < 2) return null;
                const dates = sessions.map(s => new Date(s.date).getTime());
                const minDate = Math.min(...dates);
                const maxDate = Math.max(...dates);
                const duration = Math.round((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1; // Add 1 to count first day
                return { name: c.subject, value: duration };
            })
            .filter((item): item is { name: string; value: number } => Boolean(item));

        const longestCases = [...closedCasesWithDurations].sort((a, b) => b.value - a.value).slice(0, 5);
        const fastestCases = [...closedCasesWithDurations].sort((a, b) => a.value - b.value).slice(0, 5);

        setReportData({
            type: 'analytics',
            title: 'تحليل بيانات المكتب',
            topClientsByCases,
            topClientsByIncome,
            topCasesByIncome,
            longestCases,
            fastestCases,
        });
    };

    const renderReport = () => {
        if (!reportData) {
            return <div className="text-center p-8 bg-gray-50 rounded-lg"><p className="text-gray-500">الرجاء تحديد نوع التقرير وتطبيق الفلاتر لعرض النتائج.</p></div>;
        }

        switch (reportData.type) {
            case 'financial': return <FinancialReport data={reportData} />;
            case 'cases': return <CaseStatusReport data={reportData} />;
            case 'clients': return <ClientActivityReport data={reportData} />;
            case 'analytics': return <AnalyticsReport data={reportData} />;
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
                            <option value="analytics">تحليل البيانات</option>
                        </select>
                    </div>
                    {reportType !== 'analytics' && (
                        <>
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
                                    <input type="date" id="startDate" name="startDate" value={filters.startDate} onChange={handleFilterChange} className="w-full p-2 border border-gray-300 rounded-lg" placeholder="DD/MM/YYYY"/>
                                </div>
                                <div>
                                    <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">إلى تاريخ</label>
                                    <input type="date" id="endDate" name="endDate" value={filters.endDate} onChange={handleFilterChange} className="w-full p-2 border border-gray-300 rounded-lg" placeholder="DD/MM/YYYY"/>
                                </div>
                            </>}
                        </>
                    )}

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
                        <button onClick={() => printElement(printReportsRef.current)} className="no-print flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
                            <PrintIcon className="w-5 h-5" />
                            <span>طباعة التقرير</span>
                        </button>
                    </div>
                )}
                <div ref={printReportsRef}>
                    {renderReport()}
                </div>
            </div>
        </div>
    );
};

// --- Report Components ---

const FinancialReport: React.FC<{ data: any }> = ({ data }) => {
    const monthlyData = React.useMemo(() => {
        // FIX: Explicitly typed the accumulator `acc` in the reduce function. This ensures that `grouped` has the correct type,
        // which in turn allows the subsequent `.sort()` method to correctly infer the types of `a` and `b` and access `a.month`.
        const grouped = data.entries.reduce((acc: { [key: string]: { month: string, income: number, expense: number } }, entry: AccountingEntry) => {
            const month = new Date(entry.date).toISOString().slice(0, 7); // YYYY-MM
            if (!acc[month]) {
                acc[month] = { month, income: 0, expense: 0 };
            }
            if (entry.type === 'income') {
                acc[month].income += entry.amount;
            } else {
                acc[month].expense += entry.amount;
            }
            return acc;
        }, {} as { [key: string]: { month: string, income: number, expense: number } });
        return Object.values(grouped).sort((a, b) => a.month.localeCompare(b.month));
    }, [data.entries]);
    
    return (
        <div className="space-y-8">
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

            <div className="h-96">
                <h3 className="text-xl font-semibold mb-4 text-center">التوزيع الشهري للإيرادات والمصروفات</h3>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
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
}

const CaseStatusReport: React.FC<{ data: any }> = ({ data }) => {
    const statusMap: Record<Case['status'], { text: string; className: string }> = {
        active: { text: 'نشطة', className: 'bg-blue-100 text-blue-800' },
        closed: { text: 'مغلقة', className: 'bg-gray-100 text-gray-800' },
        on_hold: { text: 'معلقة', className: 'bg-yellow-100 text-yellow-800' },
    };

    const COLORS = ['#3b82f6', '#6b7280', '#f59e0b']; // blue, gray, yellow

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data.pieData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {data.pieData.map((entry: any, index: number) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value) => `${value} قضايا`} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                     {data.pieData.map((entry: { name: string, value: number }, index: number) => (
                        <div key={entry.name} className="p-4 bg-gray-50 border-s-4 rounded-lg shadow-sm" style={{borderColor: COLORS[index % COLORS.length]}}>
                            <div className="flex justify-between items-center">
                                <h4 className="text-lg font-semibold text-gray-700">{entry.name}</h4>
                                <p className="text-2xl font-bold" style={{ color: COLORS[index % COLORS.length] }}>{entry.value}</p>
                            </div>
                        </div>
                    ))}
                    {data.pieData.length === 0 && <p className="text-center text-gray-500">لا توجد بيانات لعرضها.</p>}
                </div>
            </div>
            
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
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusMap[caseItem.status].className}`}>
                                            {statusMap[caseItem.status].text}
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

const ClientActivityReport: React.FC<{ data: any }> = ({ data }) => {
    const caseFinancials = React.useMemo(() => {
        const grouped = data.entries.reduce((acc: { [key: string]: { name: string, income: number, expense: number } }, entry: AccountingEntry) => {
            const caseId = entry.caseId || 'general';
            if (!acc[caseId]) {
                const caseSubject = data.cases.find((c: Case) => c.id === caseId)?.subject || 'عام';
                acc[caseId] = { name: caseSubject, income: 0, expense: 0 };
            }
            if (entry.type === 'income') {
                acc[caseId].income += entry.amount;
            } else {
                acc[caseId].expense += entry.amount;
            }
            return acc;
        }, {});
        return Object.values(grouped);
    }, [data.entries, data.cases]);

    return (
        <div className="space-y-8">
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

            <div className="h-96">
                <h3 className="text-xl font-semibold mb-4 text-center">التوزيع المالي على القضايا</h3>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={caseFinancials} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tickFormatter={(value) => new Intl.NumberFormat('ar-SY').format(value as number)} />
                        <YAxis type="category" dataKey="name" width={150} interval={0}/>
                        <Tooltip formatter={(value) => `${Number(value).toLocaleString()} ل.س`} />
                        <Legend />
                        <Bar dataKey="income" fill="#4ade80" name="الإيرادات" />
                        <Bar dataKey="expense" fill="#f87171" name="المصروفات" />
                    </BarChart>
                </ResponsiveContainer>
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
                                    <tr key={entry.id} className="bg-white border-b">
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
};

const AnalyticsReport: React.FC<{ data: any }> = ({ data }) => {
    const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6b7280'];
    
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="p-2 bg-white border rounded shadow-lg">
                    <p className="font-bold">{label}</p>
                    <p style={{ color: payload[0].fill }}>{`${payload[0].name}: ${payload[0].value.toLocaleString()}`}</p>
                </div>
            );
        }
        return null;
    };
    
    const renderChartOrMessage = (chartData: any[], chartComponent: React.ReactNode, message: string) => {
        return chartData && chartData.length > 0 ? chartComponent : <div className="flex items-center justify-center h-full text-gray-500">{message}</div>;
    };

    return (
        <div className="space-y-12 animate-fade-in">
            <section>
                <h3 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b text-center">أبرز الموكلين</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                    <div className="h-96">
                        <h4 className="text-lg font-semibold text-center mb-2">حسب عدد القضايا</h4>
                        {renderChartOrMessage(data.topClientsByCases,
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.topClientsByCases} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" allowDecimals={false} />
                                    <YAxis type="category" dataKey="name" width={120} />
                                    <Tooltip cursor={{fill: 'rgba(239, 246, 255, 0.5)'}} formatter={(value: number) => [`${value} قضايا`, 'العدد']} />
                                    <Bar dataKey="value" name="عدد القضايا" fill="#3b82f6" />
                                </BarChart>
                            </ResponsiveContainer>,
                            "لا يوجد بيانات لعرضها."
                        )}
                    </div>
                    <div className="h-96">
                        <h4 className="text-lg font-semibold text-center mb-2">حسب المساهمة في الدخل</h4>
                        {renderChartOrMessage(data.topClientsByIncome,
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={data.topClientsByIncome} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120} label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}>
                                        {data.topClientsByIncome.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value: number) => `${value.toLocaleString()} ل.س`} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>,
                            "لا توجد بيانات دخل لعرضها."
                        )}
                    </div>
                </div>
            </section>

            <section>
                <h3 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b text-center">القضايا الأعلى دخلاً</h3>
                <div className="h-96">
                     {renderChartOrMessage(data.topCasesByIncome,
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.topCasesByIncome} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" angle={-25} textAnchor="end" interval={0} />
                                <YAxis tickFormatter={(value) => new Intl.NumberFormat('ar-SY', { notation: "compact", compactDisplay: "short" }).format(value as number)}/>
                                <Tooltip formatter={(value: number) => [`${value.toLocaleString()} ل.س`, 'الدخل']} />
                                <Bar dataKey="value" name="الدخل" fill="#10b981" />
                            </BarChart>
                        </ResponsiveContainer>,
                        "لا توجد بيانات دخل مرتبطة بقضايا."
                     )}
                </div>
            </section>

            <section>
                <h3 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b text-center">مدة إنجاز القضايا (المغلقة)</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="h-96">
                        <h4 className="text-lg font-semibold text-center mb-2">أطول القضايا مدةً</h4>
                        {renderChartOrMessage(data.longestCases,
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.longestCases} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" />
                                    <YAxis type="category" dataKey="name" width={120} />
                                    <Tooltip formatter={(value: number) => [`${value} يوم`, 'المدة']} />
                                    <Bar dataKey="value" name="المدة بالأيام" fill="#f59e0b" />
                                </BarChart>
                            </ResponsiveContainer>,
                            "لا توجد قضايا مغلقة لتحليلها."
                        )}
                    </div>
                    <div className="h-96">
                        <h4 className="text-lg font-semibold text-center mb-2">أسرع القضايا إنجازاً</h4>
                         {renderChartOrMessage(data.fastestCases,
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.fastestCases} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" />
                                    <YAxis type="category" dataKey="name" width={120} />
                                    <Tooltip formatter={(value: number) => [`${value} يوم`, 'المدة']} />
                                    <Bar dataKey="value" name="المدة بالأيام" fill="#8b5cf6" />
                                </BarChart>
                            </ResponsiveContainer>,
                            "لا توجد قضايا مغلقة لتحليلها."
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
};

export default ReportsPage;
