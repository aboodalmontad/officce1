import * as React from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { SiteFinancialEntry, Profile } from '../types';
import { formatDate, toInputDateString } from '../utils/dateUtils';
import { PlusIcon, PencilIcon, TrashIcon, ExclamationTriangleIcon } from '../components/icons';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const StatCard: React.FC<{ title: string; value: string; className?: string }> = ({ title, value, className = '' }) => (
    <div className={`p-6 rounded-lg shadow ${className}`}>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-3xl font-bold">{value}</p>
    </div>
);

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white p-2 border shadow-lg rounded-md text-sm">
                <p className="font-bold mb-1">{label}</p>
                {payload.map((pld: any, index: number) => (
                    <p key={index} style={{ color: pld.color }}>
                        {`${pld.name}: ${pld.value.toLocaleString()} ل.س`}
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

const SiteFinancesPage: React.FC = () => {
    const [entries, setEntries] = React.useState<SiteFinancialEntry[]>([]);
    const [users, setUsers] = React.useState<Profile[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [modal, setModal] = React.useState<{ isOpen: boolean; data?: SiteFinancialEntry }>({ isOpen: false });
    const [entryToDelete, setEntryToDelete] = React.useState<SiteFinancialEntry | null>(null);
    const [activeTab, setActiveTab] = React.useState<'entries' | 'reports'>('entries');

    const supabase = getSupabaseClient();

    const fetchData = React.useCallback(async () => {
        if (!supabase) {
            setError("Supabase client not available.");
            setLoading(false);
            return;
        }

        setLoading(true);
        const { data: entriesData, error: entriesError } = await supabase
            .from('site_finances')
            .select('*, profile:profiles(full_name)')
            .order('payment_date', { ascending: false });

        const { data: usersData, error: usersError } = await supabase
            .from('profiles')
            .select('*')
            .order('full_name');

        if (entriesError || usersError) {
            let errorMessage;
            const entriesErrorMessage = entriesError?.message || '';

            if (entriesErrorMessage.includes('schema cache') && (entriesErrorMessage.includes("'category'") || entriesErrorMessage.includes("column site_finances.category does not exist"))) {
                errorMessage = "خطأ في الاتصال بقاعدة البيانات: لم يتم العثور على عمود 'category'. قد يكون هذا بسبب عدم تحديث ذاكرة التخزين المؤقت للمخطط (Schema Cache) في Supabase. يرجى الذهاب إلى قسم API Docs في لوحة تحكم Supabase والضغط على 'Reload schema' ثم تحديث الصفحة.";
            } else {
                const combinedError = [entriesErrorMessage, usersError?.message].filter(Boolean).join('; ');
                errorMessage = "فشل جلب البيانات: " + combinedError;
            }
            setError(errorMessage);
        } else {
            const mappedEntries = entriesData.map((entry: any) => ({
                ...entry,
                profile_full_name: entry.profile?.full_name,
            }));
            setEntries(mappedEntries as SiteFinancialEntry[]);
            setUsers(usersData as Profile[]);
        }
        setLoading(false);
    }, [supabase]);

    React.useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleOpenModal = (entry?: SiteFinancialEntry) => setModal({ isOpen: true, data: entry });
    const handleCloseModal = () => setModal({ isOpen: false });

    const handleSubmit = async (formData: any, isSubscriptionRenewal: boolean) => {
        if (!supabase) return;

        // 1. Update subscription if needed
        if (isSubscriptionRenewal && formData.user_id && formData.new_subscription_start && formData.new_subscription_end) {
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    subscription_start_date: formData.new_subscription_start,
                    subscription_end_date: formData.new_subscription_end
                })
                .eq('id', formData.user_id);

            if (profileError) {
                setError("Failed to update subscription: " + profileError.message);
                return; // Stop if subscription update fails
            }
        }
        
        // 2. Add financial entry
        const { new_subscription_start, new_subscription_end, ...financialData } = formData;
        const finalFinancialData = { ...financialData, user_id: financialData.user_id === 'none' ? null : financialData.user_id };

        const { error } = modal.data
            ? await supabase.from('site_finances').update(finalFinancialData).eq('id', modal.data.id)
            : await supabase.from('site_finances').insert([finalFinancialData]);

        if (error) {
            let errorMessage = error.message;
            if (errorMessage.includes('schema cache') && (errorMessage.includes("'category'") || errorMessage.includes("column site_finances.category does not exist"))) {
                errorMessage = "خطأ في الحفظ: لم يتم العثور على عمود 'category'. يرجى الذهاب إلى قسم API Docs في لوحة تحكم Supabase والضغط على 'Reload schema' ثم المحاولة مرة أخرى.";
            }
            setError(errorMessage);
        } else {
            handleCloseModal();
            fetchData();
        }
    };

    const handleConfirmDelete = async () => {
        if (!supabase || !entryToDelete) return;
        const { error } = await supabase.from('site_finances').delete().eq('id', entryToDelete.id);
        if (error) setError(error.message);
        else {
            setEntryToDelete(null);
            fetchData();
        }
    };

    const financialSummary = React.useMemo(() => {
        const totalIncome = entries.filter(e => e.type === 'income').reduce((sum, e) => sum + e.amount, 0);
        const totalExpenses = entries.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);
        const subscriptionIncome = entries.filter(e => e.type === 'income' && e.description?.includes('تجديد اشتراك')).reduce((sum, e) => sum + e.amount, 0);
        return { totalIncome, totalExpenses, balance: totalIncome - totalExpenses, subscriptionIncome };
    }, [entries]);

    // Report Data Processing
    const reportsData = React.useMemo(() => {
        const monthlyData = entries.reduce((acc, entry) => {
            const month = new Date(entry.payment_date).toLocaleString('ar-EG', { month: 'short', year: 'numeric' });
            if (!acc[month]) acc[month] = { month, income: 0, expense: 0 };
            if (entry.type === 'income') acc[month].income += entry.amount;
            else acc[month].expense += entry.amount;
            return acc;
        }, {} as Record<string, { month: string, income: number, expense: number }>);

        const incomeBreakdown = entries
            .filter(e => e.type === 'income')
            .reduce((acc, entry) => {
                const key = entry.description?.includes('تجديد اشتراك') ? 'الاشتراكات' : 'إيرادات أخرى';
                acc[key] = (acc[key] || 0) + entry.amount;
                return acc;
            }, {} as Record<string, number>);

        const expenseBreakdown = entries
            .filter(e => e.type === 'expense')
            .reduce((acc, entry) => {
                const key = entry.category || 'غير مصنف';
                acc[key] = (acc[key] || 0) + entry.amount;
                return acc;
            }, {} as Record<string, number>);

        return {
            monthly: Object.values(monthlyData).sort((a,b) => new Date(a.month).getTime() - new Date(b.month).getTime()),
            income: Object.entries(incomeBreakdown).map(([name, value]) => ({ name, value })),
            expense: Object.entries(expenseBreakdown).map(([name, value]) => ({ name, value })),
        };
    }, [entries]);

    if (loading) return <div className="text-center p-8">جاري تحميل البيانات المالية...</div>;
    if (error) return <div className="p-4 text-red-700 bg-red-100 rounded-md">{error}</div>;

    const PIE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF'];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-800">المحاسبة المالية للموقع</h1>
                <button onClick={() => handleOpenModal()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700"><PlusIcon className="w-5 h-5" /><span>إضافة قيد مالي</span></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="إجمالي الإيرادات" value={`${financialSummary.totalIncome.toLocaleString()} ل.س`} className="bg-green-100 text-green-800" />
                <StatCard title="إجمالي المصروفات" value={`${financialSummary.totalExpenses.toLocaleString()} ل.س`} className="bg-red-100 text-red-800" />
                <StatCard title="صافي الربح" value={`${financialSummary.balance.toLocaleString()} ل.س`} className="bg-blue-100 text-blue-800" />
                <StatCard title="إيرادات الاشتراكات" value={`${financialSummary.subscriptionIncome.toLocaleString()} ل.س`} className="bg-purple-100 text-purple-800" />
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
                 <div className="border-b border-gray-200"><nav className="-mb-px flex space-x-8"><button onClick={() => setActiveTab('entries')} className={`${activeTab === 'entries' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>السجلات المالية</button><button onClick={() => setActiveTab('reports')} className={`${activeTab === 'reports' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>التقارير</button></nav></div>
                {activeTab === 'entries' ? (
                    <div className="overflow-x-auto mt-4"><table className="w-full text-sm text-right text-gray-600"><thead className="text-xs text-gray-700 uppercase bg-gray-100"><tr><th className="px-6 py-3">التاريخ</th><th className="px-6 py-3">المستخدم</th><th className="px-6 py-3">البيان</th><th className="px-6 py-3">الفئة</th><th className="px-6 py-3">الإيرادات</th><th className="px-6 py-3">المصروفات</th><th className="px-6 py-3">طريقة الدفع</th><th className="px-6 py-3">إجراءات</th></tr></thead><tbody>{entries.map(entry => (<tr key={entry.id} className="bg-white border-b hover:bg-gray-50"><td className="px-6 py-4">{formatDate(new Date(entry.payment_date))}</td><td className="px-6 py-4">{entry.profile_full_name || 'عام'}</td><td className="px-6 py-4">{entry.description}</td><td className="px-6 py-4">{entry.category || '-'}</td><td className="px-6 py-4 font-semibold text-green-600">{entry.type === 'income' ? entry.amount.toLocaleString() : '-'}</td><td className="px-6 py-4 font-semibold text-red-600">{entry.type === 'expense' ? entry.amount.toLocaleString() : '-'}</td><td className="px-6 py-4">{entry.payment_method}</td><td className="px-6 py-4 flex items-center gap-2"><button onClick={() => handleOpenModal(entry)} className="p-2 text-gray-500 hover:text-blue-600"><PencilIcon className="w-4 h-4" /></button><button onClick={() => setEntryToDelete(entry)} className="p-2 text-gray-500 hover:text-red-600"><TrashIcon className="w-4 h-4" /></button></td></tr>))}</tbody></table></div>
                ) : (
                    <div className="space-y-12 mt-8">
                        <div className="space-y-8"><h3 className="font-bold text-center text-gray-700">الأداء الشهري</h3><ResponsiveContainer width="100%" height={300}><BarChart data={reportsData.monthly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip content={<CustomTooltip />} /><Legend /><Bar dataKey="income" name="الإيرادات" fill="#10B981" /><Bar dataKey="expense" name="المصروفات" fill="#EF4444" /></BarChart></ResponsiveContainer></div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8"><div><h3 className="font-bold mb-4 text-center text-gray-700">تحليل الإيرادات</h3><ResponsiveContainer width="100%" height={300}><PieChart><Pie data={reportsData.income} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>{reportsData.income.map((_entry, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}</Pie><Tooltip content={<CustomTooltip />} /><Legend /></PieChart></ResponsiveContainer></div><div><h3 className="font-bold mb-4 text-center text-gray-700">تحليل المصروفات</h3><ResponsiveContainer width="100%" height={300}><PieChart><Pie data={reportsData.expense} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>{reportsData.expense.map((_entry, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}</Pie><Tooltip content={<CustomTooltip />} /><Legend /></PieChart></ResponsiveContainer></div></div>
                    </div>
                )}
            </div>

            {modal.isOpen && <FinanceEntryModal isOpen={modal.isOpen} data={modal.data} users={users} onClose={handleCloseModal} onSubmit={handleSubmit} />}
            {entryToDelete && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setEntryToDelete(null)}><div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}><div className="text-center"><div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4"><ExclamationTriangleIcon className="h-8 w-8 text-red-600" /></div><h3 className="text-2xl font-bold">تأكيد الحذف</h3><p className="my-4">هل أنت متأكد من حذف هذا القيد؟</p></div><div className="mt-6 flex justify-center gap-4"><button className="px-6 py-2 bg-gray-200 rounded" onClick={() => setEntryToDelete(null)}>إلغاء</button><button className="px-6 py-2 bg-red-600 text-white rounded" onClick={handleConfirmDelete}>نعم، قم بالحذف</button></div></div></div>)}
        </div>
    );
};

// Sub-component for the modal to keep the main component cleaner
interface FinanceEntryModalProps {
    isOpen: boolean;
    data?: SiteFinancialEntry;
    users: Profile[];
    onClose: () => void;
    onSubmit: (formData: any, isSubscription: boolean) => void;
}

const FinanceEntryModal: React.FC<FinanceEntryModalProps> = ({ isOpen, data, users, onClose, onSubmit }) => {
    const [formData, setFormData] = React.useState<any>({});
    const [isSubscriptionRenewal, setIsSubscriptionRenewal] = React.useState(false);

    React.useEffect(() => {
        if (isOpen) {
            setFormData(data || { type: 'income', payment_date: toInputDateString(new Date()) });
            setIsSubscriptionRenewal(false);
        }
    }, [isOpen, data]);

    React.useEffect(() => {
        if (isSubscriptionRenewal && formData.user_id) {
            const user = users.find(u => u.id === formData.user_id);
            if (user) {
                const currentEndDate = user.subscription_end_date ? new Date(user.subscription_end_date) : new Date();
                const defaultStartDate = currentEndDate > new Date() ? currentEndDate : new Date();
                
                const defaultEndDate = new Date(defaultStartDate);
                defaultEndDate.setMonth(defaultEndDate.getMonth() + 1);

                setFormData(prev => ({
                    ...prev,
                    new_subscription_start: toInputDateString(defaultStartDate),
                    new_subscription_end: toInputDateString(defaultEndDate),
                    description: prev.description || `تجديد اشتراك لـ ${user.full_name}`,
                    amount: prev.amount || 50000,
                }));
            }
        } else if (!isSubscriptionRenewal) {
            setFormData(prev => {
                const { new_subscription_start, new_subscription_end, ...rest } = prev;
                return rest;
            });
        }
    }, [isSubscriptionRenewal, formData.user_id, users]);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        onSubmit(formData, isSubscriptionRenewal);
    };

    const selectedUser = users.find(u => u.id === formData.user_id);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4">{data ? 'تعديل قيد' : 'إضافة قيد'}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label className="block text-sm font-medium">النوع</label><select name="type" value={formData.type || 'income'} onChange={handleChange} className="w-full p-2 border rounded"><option value="income">إيراد</option><option value="expense">مصروف</option></select></div>
                        <div><label className="block text-sm font-medium">المستخدم</label><select name="user_id" value={formData.user_id || 'none'} onChange={handleChange} className="w-full p-2 border rounded"><option value="none">-- قيد عام / غير مرتبط --</option>{users.map(user => <option key={user.id} value={user.id}>{user.full_name}</option>)}</select></div>
                    </div>
                    {formData.type === 'income' && selectedUser && (
                        <div className="p-3 border rounded-md bg-blue-50 space-y-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={isSubscriptionRenewal} 
                                    onChange={e => setIsSubscriptionRenewal(e.target.checked)}
                                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <span className="font-semibold text-sm text-blue-800">هل هذا تجديد اشتراك لـِ: {selectedUser.full_name}؟</span>
                            </label>

                            {isSubscriptionRenewal && (
                                <div className="space-y-3 p-3 bg-blue-100 border border-blue-200 rounded-md animate-fade-in">
                                    <p className="text-sm font-semibold text-blue-800">
                                        تحديد فترة الاشتراك الجديدة
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">تاريخ بدء الاشتراك</label>
                                            <input 
                                                type="date" 
                                                name="new_subscription_start" 
                                                value={formData.new_subscription_start || ''} 
                                                onChange={handleChange} 
                                                className="w-full p-2 border rounded" 
                                                required={isSubscriptionRenewal}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">تاريخ انتهاء الاشتراك</label>
                                            <input 
                                                type="date" 
                                                name="new_subscription_end" 
                                                value={formData.new_subscription_end || ''} 
                                                onChange={handleChange} 
                                                className="w-full p-2 border rounded" 
                                                required={isSubscriptionRenewal}
                                            />
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        سيتم تحديث فترة اشتراك المستخدم في صفحة إدارة المستخدمين بناءً على هذه التواريخ.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                    <div><label className="block text-sm font-medium">البيان</label><input name="description" value={formData.description || ''} onChange={handleChange} className="w-full p-2 border rounded" required /></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label className="block text-sm font-medium">المبلغ</label><input type="number" step="any" name="amount" value={formData.amount || ''} onChange={handleChange} className="w-full p-2 border rounded" required /></div>
                        <div><label className="block text-sm font-medium">تاريخ الدفع</label><input type="date" name="payment_date" value={toInputDateString(formData.payment_date)} onChange={handleChange} className="w-full p-2 border rounded" required /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div><label className="block text-sm font-medium">طريقة الدفع</label><input name="payment_method" value={formData.payment_method || ''} onChange={handleChange} className="w-full p-2 border rounded" placeholder="نقدي، تحويل..." /></div>
                       {formData.type === 'expense' && <div><label className="block text-sm font-medium">الفئة</label><input name="category" list="expense_categories" value={formData.category || ''} onChange={handleChange} className="w-full p-2 border rounded" placeholder="رواتب، فواتير..." /><datalist id="expense_categories"><option value="رواتب"/><option value="فواتير"/><option value="تسويق"/><option value="استضافة و سيرفرات"/><option value="مصاريف مكتبية"/></datalist></div>}
                    </div>
                    <div className="mt-6 flex justify-end gap-4"><button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">إلغاء</button><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">حفظ</button></div>
                </form>
            </div>
        </div>
    );
};


export default SiteFinancesPage;