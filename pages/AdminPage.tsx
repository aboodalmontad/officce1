import * as React from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { Profile } from '../types';
import { formatDate } from '../utils/dateUtils';
import { CheckCircleIcon, NoSymbolIcon, PencilIcon } from '../components/icons';

const toInputDateString = (date: string | Date | null): string => {
    if (!date) return '';
    try {
        const d = new Date(date);
        return d.toISOString().split('T')[0];
    } catch {
        return '';
    }
};

const AdminPage: React.FC = () => {
    const [users, setUsers] = React.useState<Profile[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [editingUser, setEditingUser] = React.useState<Profile | null>(null);

    const fetchUsers = React.useCallback(async () => {
        const supabase = getSupabaseClient();
        if (!supabase) return;
        
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('is_approved', { ascending: true })
            .order('full_name');
        
        if (error) {
            setError(error.message);
        } else {
            setUsers(data as Profile[]);
        }
        setLoading(false);
    }, []);

    React.useEffect(() => {
        fetchUsers();

        const supabase = getSupabaseClient();
        if (!supabase) return;

        const channel = supabase
            .channel('public:profiles:admin')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'profiles' },
                (payload) => {
                    console.log('Profile change detected, refreshing user list.', payload);
                    fetchUsers();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchUsers]);

    const handleUpdateUser = async (user: Profile) => {
        const supabase = getSupabaseClient();
        if (!supabase) return;
        const { error } = await supabase
            .from('profiles')
            .update({
                is_approved: user.is_approved,
                is_active: user.is_active,
                subscription_start_date: user.subscription_start_date || null,
                subscription_end_date: user.subscription_end_date || null,
            })
            .eq('id', user.id);

        if (error) {
            alert(`فشل تحديث المستخدم: ${error.message}`);
        } else {
            setEditingUser(null);
        }
    };
    
    const handleFieldChange = (field: keyof Profile, value: any) => {
        if (editingUser) {
            setEditingUser({ ...editingUser, [field]: value });
        }
    };

    if (loading) return <div>جاري تحميل المستخدمين...</div>;
    if (error) return <div>خطأ: {error}</div>;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">إدارة المستخدمين والاشتراكات</h1>
            
            <div className="bg-white p-6 rounded-lg shadow overflow-x-auto">
                <table className="w-full text-sm text-right text-gray-600">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                        <tr>
                            <th className="px-6 py-3">الاسم الكامل</th>
                            <th className="px-6 py-3">رقم الجوال</th>
                            <th className="px-6 py-3">تاريخ بداية الاشتراك</th>
                            <th className="px-6 py-3">تاريخ نهاية الاشتراك</th>
                            <th className="px-6 py-3">الحالة</th>
                            <th className="px-6 py-3">الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => (
                            <tr key={user.id} className={`border-b hover:bg-gray-50 ${!user.is_approved ? 'bg-yellow-50 hover:bg-yellow-100' : 'bg-white'}`}>
                                <td className="px-6 py-4">{user.full_name}</td>
                                <td className="px-6 py-4">{user.mobile_number}</td>
                                <td className="px-6 py-4">
                                    {editingUser?.id === user.id ? (
                                        <input type="date" value={toInputDateString(editingUser.subscription_start_date)} onChange={(e) => handleFieldChange('subscription_start_date', e.target.value)} className="p-1 border rounded" />
                                    ) : (
                                        user.subscription_start_date ? formatDate(new Date(user.subscription_start_date)) : 'لم يحدد'
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    {editingUser?.id === user.id ? (
                                        <input type="date" value={toInputDateString(editingUser.subscription_end_date)} onChange={(e) => handleFieldChange('subscription_end_date', e.target.value)} className="p-1 border rounded" />
                                    ) : (
                                        user.subscription_end_date ? formatDate(new Date(user.subscription_end_date)) : 'لم يحدد'
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                     {editingUser?.id === user.id ? (
                                        <div className="flex items-center gap-4">
                                            <label className="flex items-center gap-1"><input type="checkbox" checked={editingUser.is_approved} onChange={e => handleFieldChange('is_approved', e.target.checked)} />مفعل</label>
                                            <label className="flex items-center gap-1"><input type="checkbox" checked={editingUser.is_active} onChange={e => handleFieldChange('is_active', e.target.checked)} />نشط</label>
                                        </div>
                                     ) : (
                                        <div className="flex items-center gap-2">
                                            {user.is_approved ? <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full"><CheckCircleIcon className="w-4 h-4" />مفعل</span> : <span className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">بانتظار الموافقة</span>}
                                            {user.is_active ? '' : <span className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full"><NoSymbolIcon className="w-4 h-4"/>موقوف</span>}
                                        </div>
                                     )}
                                </td>
                                <td className="px-6 py-4">
                                    {editingUser?.id === user.id ? (
                                        <div className="flex gap-2">
                                            <button onClick={() => handleUpdateUser(editingUser)} className="px-3 py-1 bg-blue-600 text-white rounded">حفظ</button>
                                            <button onClick={() => setEditingUser(null)} className="px-3 py-1 bg-gray-200 rounded">إلغاء</button>
                                        </div>
                                    ) : (
                                        <button onClick={() => setEditingUser(user)} className="p-2 text-gray-500 hover:text-blue-600"><PencilIcon className="w-4 h-4" /></button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AdminPage;