import * as React from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { SiteFinancialEntry, Profile } from '../types';
import { formatDate } from '../utils/dateUtils';
import { PlusIcon, PencilIcon, TrashIcon, ExclamationTriangleIcon } from '../components/icons';

const toInputDateString = (date: Date | string | null | undefined): string => {
    if (!date) return new Date().toISOString().split('T')[0];
    return new Date(date).toISOString().split('T')[0];
};

const SiteFinancesPage: React.FC = () => {
    const [entries, setEntries] = React.useState<SiteFinancialEntry[]>([]);
    const [users, setUsers] = React.useState<Profile[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [modal, setModal] = React.useState<{ isOpen: boolean; data?: SiteFinancialEntry }>({ isOpen: false });
    const [entryToDelete, setEntryToDelete] = React.useState<SiteFinancialEntry | null>(null);

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
            .select('id, full_name')
            .order('full_name');

        if (entriesError || usersError) {
            const combinedError = [entriesError?.message, usersError?.message].filter(Boolean).join('; ');
            setError("Failed to fetch data: " + combinedError);
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

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!supabase) return;

        const formData = new FormData(e.currentTarget);
        const entryData = {
            user_id: formData.get('user_id') === 'none' ? null : formData.get('user_id'),
            type: formData.get('type'),
            payment_date: formData.get('payment_date'),
            amount: Number(formData.get('amount')),
            description: formData.get('description'),
            payment_method: formData.get('payment_method'),
        };

        const { error } = modal.data
            ? await supabase.from('site_finances').update(entryData).eq('id', modal.data.id)
            : await supabase.from('site_finances').insert([entryData]);

        if (error) {
            setError(error.message);
        } else {
            handleCloseModal();
            fetchData();
        }
    };

    const handleConfirmDelete = async () => {
        if (!supabase || !entryToDelete) return;

        const { error } = await supabase.from('site_finances').delete().eq('id', entryToDelete.id);
        if (error) {
            setError(error.message);
        } else {
            setEntryToDelete(null);
            fetchData();
        }
    };

    const financialSummary = React.useMemo(() => {
        const totalIncome = entries.filter(e => e.type === 'income').reduce((sum, e) => sum + e.amount, 0);
        const totalExpenses = entries.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);
        return { totalIncome, totalExpenses, balance: totalIncome - totalExpenses };
    }, [entries]);

    if (loading) return <div className="text-center p-8">جاري تحميل البيانات المالية...</div>;
    if (error) return <div className="p-4 text-red-700 bg-red-100 rounded-md">{error}</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-800">المحاسبة المالية للموقع</h1>
                <button onClick={() => handleOpenModal()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">
                    <PlusIcon className="w-5 h-5" />
                    <span>إضافة قيد مالي</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 bg-green-100 text-green-800 rounded-lg shadow"><h3 className="text-lg font-semibold">إجمالي الإيرادات</h3><p className="text-3xl font-bold">{financialSummary.totalIncome.toLocaleString()} ل.س</p></div>
                <div className="p-6 bg-red-100 text-red-800 rounded-lg shadow"><h3 className="text-lg font-semibold">إجمالي المصروفات</h3><p className="text-3xl font-bold">{financialSummary.totalExpenses.toLocaleString()} ل.س</p></div>
                <div className="p-6 bg-blue-100 text-blue-800 rounded-lg shadow"><h3 className="text-lg font-semibold">الربح الصافي</h3><p className="text-3xl font-bold">{financialSummary.balance.toLocaleString()} ل.س</p></div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow overflow-x-auto">
                <table className="w-full text-sm text-right text-gray-600">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                        <tr>
                            <th className="px-6 py-3">التاريخ</th><th className="px-6 py-3">المستخدم</th><th className="px-6 py-3">البيان</th><th className="px-6 py-3">الإيرادات</th><th className="px-6 py-3">المصروفات</th><th className="px-6 py-3">طريقة الدفع</th><th className="px-6 py-3">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map(entry => (
                            <tr key={entry.id} className="bg-white border-b hover:bg-gray-50">
                                <td className="px-6 py-4">{formatDate(new Date(entry.payment_date))}</td>
                                <td className="px-6 py-4">{entry.profile_full_name || 'عام'}</td>
                                <td className="px-6 py-4">{entry.description}</td>
                                <td className="px-6 py-4 font-semibold text-green-600">{entry.type === 'income' ? entry.amount.toLocaleString() : '-'}</td>
                                <td className="px-6 py-4 font-semibold text-red-600">{entry.type === 'expense' ? entry.amount.toLocaleString() : '-'}</td>
                                <td className="px-6 py-4">{entry.payment_method}</td>
                                <td className="px-6 py-4 flex items-center gap-2">
                                    <button onClick={() => handleOpenModal(entry)} className="p-2 text-gray-500 hover:text-blue-600"><PencilIcon className="w-4 h-4" /></button>
                                    <button onClick={() => setEntryToDelete(entry)} className="p-2 text-gray-500 hover:text-red-600"><TrashIcon className="w-4 h-4" /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {modal.isOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4" onClick={handleCloseModal}>
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4">{modal.data ? 'تعديل قيد' : 'إضافة قيد'}</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium">النوع</label><select name="type" defaultValue={modal.data?.type || 'income'} className="w-full p-2 border rounded"><option value="income">إيراد</option><option value="expense">مصروف</option></select></div>
                                <div><label className="block text-sm font-medium">المستخدم</label><select name="user_id" defaultValue={modal.data?.user_id || 'none'} className="w-full p-2 border rounded"><option value="none">-- قيد عام --</option>{users.map(user => <option key={user.id} value={user.id}>{user.full_name}</option>)}</select></div>
                            </div>
                            <div><label className="block text-sm font-medium">البيان</label><input name="description" defaultValue={modal.data?.description} className="w-full p-2 border rounded" required /></div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium">المبلغ</label><input type="number" step="any" name="amount" defaultValue={modal.data?.amount} className="w-full p-2 border rounded" required /></div>
                                <div><label className="block text-sm font-medium">تاريخ الدفع</label><input type="date" name="payment_date" defaultValue={toInputDateString(modal.data?.payment_date)} className="w-full p-2 border rounded" required /></div>
                            </div>
                            <div><label className="block text-sm font-medium">طريقة الدفع</label><input name="payment_method" defaultValue={modal.data?.payment_method} className="w-full p-2 border rounded" placeholder="نقدي، تحويل..." /></div>
                            <div className="mt-6 flex justify-end gap-4"><button type="button" onClick={handleCloseModal} className="px-4 py-2 bg-gray-200 rounded">إلغاء</button><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">حفظ</button></div>
                        </form>
                    </div>
                </div>
            )}
            
            {entryToDelete && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setEntryToDelete(null)}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4"><ExclamationTriangleIcon className="h-8 w-8 text-red-600" /></div>
                            <h3 className="text-2xl font-bold">تأكيد الحذف</h3>
                            <p className="my-4">هل أنت متأكد من حذف هذا القيد؟</p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button className="px-6 py-2 bg-gray-200 rounded" onClick={() => setEntryToDelete(null)}>إلغاء</button>
                            <button className="px-6 py-2 bg-red-600 text-white rounded" onClick={handleConfirmDelete}>نعم، قم بالحذف</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SiteFinancesPage;