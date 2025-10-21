import * as React from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { Profile } from '../types';
import { formatDate } from '../utils/dateUtils';
import { CheckCircleIcon, NoSymbolIcon, PencilIcon, TrashIcon, ExclamationTriangleIcon } from '../components/icons';

const toInputDateString = (date: string | Date | null): string => {
    if (!date) return '';
    try {
        const d = new Date(date);
        return d.toISOString().split('T')[0];
    } catch {
        return '';
    }
};

const formatMobileForDisplay = (mobile: string | null): string => {
    if (!mobile) return 'لم يحدد';
    // This regex specifically targets and corrects the malformed '0sy+963...' pattern.
    const match = mobile.match(/^0sy\+963(\d{9})@email\.com$/);
    if (match && match[1]) {
        return `0${match[1]}`; // Returns the correct local format, e.g., '09...'
    }
    // If the string doesn't match the malformed pattern, return it as is.
    return mobile;
};

const AdminPage: React.FC = () => {
    const [users, setUsers] = React.useState<Profile[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [editingUser, setEditingUser] = React.useState<Profile | null>(null);
    const [userToDelete, setUserToDelete] = React.useState<Profile | null>(null);
    const [currentAdminId, setCurrentAdminId] = React.useState<string | null>(null);
    
    const supabase = getSupabaseClient();

    const fetchUsers = React.useCallback(async () => {
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
    }, [supabase]);

    React.useEffect(() => {
        const getAdminId = async () => {
            if (supabase) {
                const { data: { user } } = await supabase.auth.getUser();
                setCurrentAdminId(user?.id || null);
            }
        };
        getAdminId();
        fetchUsers();

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
    }, [fetchUsers, supabase]);

    const handleUpdateUser = async (user: Profile) => {
        if (!supabase) return;

        if (user.id === currentAdminId && (user.role !== 'admin' || !user.is_active || !user.is_approved)) {
            alert('لا يمكنك إزالة صلاحيات المدير أو إلغاء تفعيل حسابك.');
            setEditingUser(null); // Revert changes in UI
            return;
        }

        const { error } = await supabase
            .from('profiles')
            .update({
                full_name: user.full_name,
                mobile_number: user.mobile_number,
                is_approved: user.is_approved,
                is_active: user.is_active,
                subscription_start_date: user.subscription_start_date || null,
                subscription_end_date: user.subscription_end_date || null,
                role: user.role,
            })
            .eq('id', user.id);

        if (error) {
            alert(`فشل تحديث المستخدم: ${error.message}`);
        } else {
            setUsers(prevUsers => prevUsers.map(u => (u.id === user.id ? user : u)));
            setEditingUser(null);
        }
    };
    
    const handleFieldChange = (field: keyof Profile, value: any) => {
        if (editingUser) {
            setEditingUser({ ...editingUser, [field]: value });
        }
    };

    const openDeleteModal = (user: Profile) => {
        setUserToDelete(user);
    };

    const closeDeleteModal = () => {
        setUserToDelete(null);
    };

    const handleConfirmDelete = async () => {
        if (!userToDelete || !supabase) return;

        const { error: rpcError } = await supabase.rpc('delete_user', { user_id_to_delete: userToDelete.id });
        
        if (rpcError) {
            alert(`فشل حذف المستخدم: ${rpcError.message}`);
        } else {
            setUsers(prevUsers => prevUsers.filter(u => u.id !== userToDelete.id));
        }
        
        closeDeleteModal();
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
                            <th className="px-6 py-3">الصلاحية</th>
                            <th className="px-6 py-3">تاريخ بداية الاشتراك</th>
                            <th className="px-6 py-3">تاريخ نهاية الاشتراك</th>
                            <th className="px-6 py-3">الحالة</th>
                            <th className="px-6 py-3">الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => (
                            <tr key={user.id} className={`border-b hover:bg-gray-50 ${!user.is_approved ? 'bg-yellow-50 hover:bg-yellow-100' : 'bg-white'}`}>
                                <td className="px-6 py-4">
                                     {editingUser?.id === user.id ? (
                                        <input type="text" value={editingUser.full_name} onChange={(e) => handleFieldChange('full_name', e.target.value)} className="p-1 border rounded w-full" />
                                    ) : (
                                        user.full_name
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    {editingUser?.id === user.id ? (
                                        <input type="text" value={editingUser.mobile_number} onChange={(e) => handleFieldChange('mobile_number', e.target.value)} className="p-1 border rounded w-full" />
                                    ) : (
                                        formatMobileForDisplay(user.mobile_number)
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    {editingUser?.id === user.id ? (
                                        <select value={editingUser.role} onChange={e => handleFieldChange('role', e.target.value)} className="p-1 border rounded w-full" disabled={user.id === currentAdminId}>
                                            <option value="user">مستخدم</option>
                                            <option value="admin">مدير</option>
                                        </select>
                                    ) : (
                                        user.role === 'admin' ? 'مدير' : 'مستخدم'
                                    )}
                                </td>
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
                                            <label className="flex items-center gap-1"><input type="checkbox" checked={editingUser.is_approved} onChange={e => handleFieldChange('is_approved', e.target.checked)} disabled={user.id === currentAdminId} />مفعل</label>
                                            <label className="flex items-center gap-1"><input type="checkbox" checked={editingUser.is_active} onChange={e => handleFieldChange('is_active', e.target.checked)} disabled={user.id === currentAdminId} />نشط</label>
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
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => setEditingUser(user)} className="p-2 text-gray-500 hover:text-blue-600"><PencilIcon className="w-4 h-4" /></button>
                                            <button onClick={() => openDeleteModal(user)} disabled={user.id === currentAdminId} className="p-2 text-gray-500 hover:text-red-600 disabled:text-gray-300 disabled:cursor-not-allowed">
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            {userToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={closeDeleteModal}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4"><ExclamationTriangleIcon className="h-6 w-6 text-red-600" /></div>
                            <h3 className="text-lg font-bold">تأكيد حذف المستخدم</h3>
                            <p className="text-sm my-4">
                                هل أنت متأكد من حذف المستخدم "{userToDelete.full_name}"؟<br />
                                سيتم حذف جميع بياناته بشكل نهائي، بما في ذلك الموكلين والقضايا والجلسات. لا يمكن التراجع عن هذا الإجراء.
                            </p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button type="button" className="px-4 py-2 bg-gray-200 rounded" onClick={closeDeleteModal}>إلغاء</button>
                            <button type="button" className="px-4 py-2 bg-red-600 text-white rounded" onClick={handleConfirmDelete}>نعم، قم بالحذف</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPage;