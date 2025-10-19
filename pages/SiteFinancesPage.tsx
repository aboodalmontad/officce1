import * as React from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { Profile, SiteFinancialEntry } from '../types';
import { formatDate } from '../utils/dateUtils';
import { PlusIcon, PencilIcon, TrashIcon, ExclamationTriangleIcon } from '../components/icons';

const toInputDateString = (date: string | Date | null): string => {
    if (!date) return '';
    try {
        const d = new Date(date);
        return d.toISOString().split('T')[0];
    } catch {
        return '';
    }
};

const SiteFinancesPage: React.FC = () => {
    const [entries, setEntries] = React.useState<SiteFinancialEntry[]>([]);
    const [profiles, setProfiles] = React.useState<Profile[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    
    const [modal, setModal] = React.useState<{ isOpen: boolean; data?: SiteFinancialEntry }>({ isOpen: false });
    const [formData, setFormData] = React.useState<Partial<SiteFinancialEntry>>({});
    const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
    const [entryToDelete, setEntryToDelete] = React.useState<SiteFinancialEntry | null>(null);

    const supabase = getSupabaseClient();

    const fetchData = React.useCallback(async () => {
        if (!supabase) return;
        setLoading(true);

        const { data: entriesData, error: entriesError } = await supabase
            .from('site_finances')
            .select(`*, profile:profiles(full_name)`)
            .order('payment_date', { ascending: false });

        if (entriesError) {
            setError(entriesError.message);
        } else {
            const transformedData = entriesData.map((e: any) => ({
                ...e,
                profile_full_name: e.profile?.full_name || 'مستخدم محذوف'
            }));
            setEntries(transformedData);
        }

        const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, full_name')
            .order('full_name');
        
        if (profilesError) {
            setError(profilesError.message);
        } else {
            setProfiles(profilesData as Profile[]);
        }

        setLoading(false);
    }, [supabase]);

    React.useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleOpenModal = (entry?: SiteFinancialEntry) => {
        setFormData(entry ? { ...entry, payment_date: toInputDateString(entry.payment_date) } : { payment_date: toInputDateString(new Date()) });
        setModal({ isOpen: true, data: entry });
    };

    const handleCloseModal = () => setModal({ isOpen: false });

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: name === 'amount' ? parseFloat(value) : value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase || !formData.amount || !formData.payment_date) return;

        const dataToUpsert = {
            user_id: formData.user_id || null,
            payment_date: formData.payment_date,
            amount: formData.amount,
            description: formData.description,
            payment_method: formData.payment_method,
        };

        const { error } = modal.data
            ? await supabase.from('site_finances').update(dataToUpsert).eq('id', modal.data.id)
            : await supabase.from('site_finances').insert([dataToUpsert]);

        if (error) {
            alert(`فشل الحفظ: ${error.message}`);
        } else {
            fetchData();
            handleCloseModal();
        }
    };
    
    const openDeleteModal = (entry: SiteFinancialEntry) => {
        setEntryToDelete(entry);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (entryToDelete && supabase) {
            const { error } = await supabase.from('site_finances').delete().eq('id', entryToDelete.id);
            if (error) {
                alert(`فشل الحذف: ${error.message}`);
            } else {
                fetchData();
            }
        }
        setIsDeleteModalOpen(false);
        setEntryToDelete(null);
    };

    const totalIncome = React.useMemo(() => entries.reduce((sum, e) => sum + e.amount, 0), [entries]);

    if (loading) return <div>جاري تحميل البيانات المالية...</div>;
    if (error) return <div className="text-red-600">خطأ: {error}</div>;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">مالية الموقع</h1>
            
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 bg-green-100 text-green-800 rounded-lg shadow col-span-1">
                    <h3 className="text-lg font-semibold">إجمالي الإيرادات</h3>
                    <p className="text-3xl font-bold">{totalIncome.toLocaleString()} ل.س</p>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
                 <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">سجل الإيرادات</h2>
                    <button onClick={() => handleOpenModal()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        <PlusIcon className="w-5 h-5"/>
                        <span>إضافة قيد</span>
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right text-gray-600">
                        <thead className="text-xs uppercase bg-gray-100">
                            <tr>
                                <th className="px-6 py-3">تاريخ الدفع</th>
                                <th className="px-6 py-3">المستخدم</th>
                                <th className="px-6 py-3">البيان</th>
                                <th className="px-6 py-3">المبلغ</th>
                                <th className="px-6 py-3">طريقة الدفع</th>
                                <th className="px-6 py-3">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map(entry => (
                                <tr key={entry.id} className="border-b hover:bg-gray-50">
                                    <td className="px-6 py-4">{formatDate(new Date(entry.payment_date))}</td>
                                    <td className="px-6 py-4">{entry.profile_full_name || 'غير محدد'}</td>
                                    <td className="px-6 py-4">{entry.description}</td>
                                    <td className="px-6 py-4 font-semibold text-green-700">{entry.amount.toLocaleString()} ل.س</td>
                                    <td className="px-6 py-4">{entry.payment_method}</td>
                                    <td className="px-6 py-4 flex gap-2">
                                        <button onClick={() => handleOpenModal(entry)} className="p-2 text-gray-500 hover:text-blue-600"><PencilIcon className="w-4 h-4"/></button>
                                        <button onClick={() => openDeleteModal(entry)} className="p-2 text-gray-500 hover:text-red-600"><TrashIcon className="w-4 h-4"/></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {modal.isOpen && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={handleCloseModal}>
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4">{modal.data ? 'تعديل قيد مالي' : 'إضافة قيد مالي'}</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium">المستخدم (اختياري)</label>
                                    <select name="user_id" value={formData.user_id || ''} onChange={handleFormChange} className="w-full p-2 border rounded">
                                        <option value="">-- غير مرتبط بمستخدم --</option>
                                        {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">تاريخ الدفع</label>
                                    <input type="date" name="payment_date" value={formData.payment_date as any} onChange={handleFormChange} className="w-full p-2 border rounded" required />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium">البيان</label>
                                <input type="text" name="description" value={formData.description || ''} onChange={handleFormChange} className="w-full p-2 border rounded" placeholder="مثال: تجديد اشتراك سنوي" required/>
                            </div>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium">المبلغ</label>
                                    <input type="number" name="amount" value={formData.amount || ''} onChange={handleFormChange} className="w-full p-2 border rounded" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">طريقة الدفع</label>
                                    <input type="text" name="payment_method" value={formData.payment_method || ''} onChange={handleFormChange} className="w-full p-2 border rounded" placeholder="مثال: نقدي" />
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end gap-4">
                                <button type="button" onClick={handleCloseModal} className="px-4 py-2 bg-gray-200 rounded">إلغاء</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">حفظ</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
             {isDeleteModalOpen && entryToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setIsDeleteModalOpen(false)}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                         <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4"><ExclamationTriangleIcon className="h-6 w-6 text-red-600" /></div>
                            <h3 className="text-lg font-bold">تأكيد الحذف</h3>
                            <p className="text-sm my-4">هل أنت متأكد من حذف هذا القيد المالي؟ لا يمكن التراجع عن هذا الإجراء.</p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button type="button" className="px-4 py-2 bg-gray-200 rounded" onClick={() => setIsDeleteModalOpen(false)}>إلغاء</button>
                            <button type="button" className="px-4 py-2 bg-red-600 text-white rounded" onClick={handleConfirmDelete}>نعم، قم بالحذف</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SiteFinancesPage;