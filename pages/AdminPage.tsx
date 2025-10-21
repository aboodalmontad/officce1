import * as React from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { Profile } from '../types';
import { formatDate, toInputDateString } from '../utils/dateUtils';
import { CheckCircleIcon, NoSymbolIcon, PencilIcon, TrashIcon, ExclamationTriangleIcon } from '../components/icons';

/**
 * A robust helper function to format the subscription date range for display.
 * It handles null, undefined, empty, and invalid date strings gracefully,
 * always returning a renderable string.
 * @param user The user profile object.
 * @returns A formatted string representing the date range or a fallback message.
 */
const formatSubscriptionDateRange = (user: Profile): string => {
    const { subscription_start_date, subscription_end_date } = user;

    // 1. Check for null, undefined, or empty strings
    if (!subscription_start_date || !subscription_end_date) {
        return 'لا يوجد';
    }

    const startDate = new Date(subscription_start_date);
    const endDate = new Date(subscription_end_date);

    // 2. Check for invalid dates after parsing
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.warn('Invalid subscription date found for user:', user.id);
        return 'تاريخ غير صالح';
    }
    
    // 3. Dates are valid, format and return the string
    try {
        return `${formatDate(startDate)} - ${formatDate(endDate)}`;
    } catch (e) {
        console.error("Error formatting date range for user:", user.id, e);
        return 'خطأ في التهيئة';
    }
};

/**
 * Formats a mobile number string for display, cleaning up potentially malformed data.
 * It expects a Syrian number and will format it to the local '09...' format.
 * @param mobile The mobile number string from the database.
 * @returns A cleaned '09...' formatted string or the original string as a fallback.
 */
const getDisplayPhoneNumber = (mobile: string | null | undefined): string => {
    if (!mobile) return '-';
    // Strip all non-digit characters from the string.
    const digits = mobile.replace(/\D/g, '');
    // Check if we have at least 9 digits (standard for Syrian mobile numbers without country code).
    if (digits.length >= 9) {
        const lastNine = digits.slice(-9);
        // Ensure the number starts with '9' as expected for local Syrian numbers.
        if (lastNine.startsWith('9')) {
            return '0' + lastNine;
        }
    }
    // If the format is unexpected, return the original string to avoid breaking display.
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
        if (!supabase) {
            setError("Supabase client not available.");
            setLoading(false);
            return;
        }

        setLoading(true);
        
        const { data: { user: adminUser }, error: adminUserError } = await supabase.auth.getUser();
        if (adminUserError) {
             console.error("Error fetching current admin user:", adminUserError);
        }
        setCurrentAdminId(adminUser?.id || null);
        
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('is_approved', { ascending: true })
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Error fetching users:", error);
            setError("Failed to fetch users. " + error.message);
        } else {
            setUsers(data as Profile[]);
        }
        setLoading(false);
    }, [supabase]);

    React.useEffect(() => {
        fetchUsers();
        // Set up a subscription to listen for changes in the profiles table
        const channel = supabase?.channel('public:profiles')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, 
            (payload) => {
                console.log('Profile change received, refetching users.', payload);
                fetchUsers();
            })
            .subscribe();

        // Cleanup subscription on component unmount
        return () => {
            if (supabase && channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [fetchUsers, supabase]);

    const handleUpdateUser = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!supabase || !editingUser) return;

        const { error } = await supabase
            .from('profiles')
            .update({
                full_name: editingUser.full_name,
                is_approved: editingUser.is_approved,
                is_active: editingUser.is_active,
                subscription_start_date: editingUser.subscription_start_date,
                subscription_end_date: editingUser.subscription_end_date,
            })
            .eq('id', editingUser.id);
        
        if (error) {
            setError("Failed to update user: " + error.message);
        } else {
            setEditingUser(null);
        }
    };

    const handleConfirmDelete = async () => {
        if (!supabase || !userToDelete) return;

        const { error } = await supabase.rpc('delete_user', {
            user_id_to_delete: userToDelete.id
        });

        if (error) {
            setError("Failed to delete user: " + error.message);
        }
        setUserToDelete(null);
    };
    
    // Quick toggle functions
    const toggleUserApproval = async (user: Profile) => {
         if (!supabase || user.role === 'admin') return;
         const { error } = await supabase
            .from('profiles')
            .update({ is_approved: !user.is_approved })
            .eq('id', user.id);
        if (error) setError("Failed to update approval: " + error.message);
    }
    
    const toggleUserActiveStatus = async (user: Profile) => {
         if (!supabase || user.role === 'admin') return;
         const { error } = await supabase
            .from('profiles')
            .update({ is_active: !user.is_active })
            .eq('id', user.id);
        if (error) setError("Failed to update status: " + error.message);
    }

    if (loading) {
        return <div className="text-center p-8">جاري تحميل المستخدمين...</div>;
    }

    if (error) {
        return <div className="p-4 text-red-700 bg-red-100 rounded-md">{error}</div>;
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">إدارة المستخدمين</h1>
            
            <div className="bg-white p-6 rounded-lg shadow overflow-x-auto">
                <table className="w-full text-sm text-right text-gray-600">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                        <tr>
                            <th className="px-6 py-3">الاسم الكامل</th>
                            <th className="px-6 py-3">رقم الجوال</th>
                            <th className="px-6 py-3">تاريخ التسجيل</th>
                            <th className="px-6 py-3">الاشتراك</th>
                            <th className="px-6 py-3">موافق عليه</th>
                            <th className="px-6 py-3">الحساب نشط</th>
                            <th className="px-6 py-3">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => (
                            <tr key={user.id} className={`border-b ${!user.is_approved ? 'bg-yellow-50' : 'bg-white'}`}>
                                <td className="px-6 py-4 font-medium text-gray-900">{user.full_name} {user.role === 'admin' && <span className="text-xs font-semibold text-blue-600">(مدير)</span>}</td>
                                <td className="px-6 py-4">{getDisplayPhoneNumber(user.mobile_number)}</td>
                                <td className="px-6 py-4">{user.created_at ? formatDate(new Date(user.created_at)) : '-'}</td>
                                <td className="px-6 py-4">
                                    {formatSubscriptionDateRange(user)}
                                </td>
                                <td className="px-6 py-4">
                                    <button onClick={() => toggleUserApproval(user)} disabled={user.role === 'admin'} className="disabled:opacity-50 disabled:cursor-not-allowed">
                                        {user.is_approved ? <CheckCircleIcon className="w-6 h-6 text-green-500" /> : <NoSymbolIcon className="w-6 h-6 text-gray-400" />}
                                    </button>
                                </td>
                                <td className="px-6 py-4">
                                     <button onClick={() => toggleUserActiveStatus(user)} disabled={user.role === 'admin'} className="disabled:opacity-50 disabled:cursor-not-allowed">
                                        {user.is_active ? <CheckCircleIcon className="w-6 h-6 text-green-500" /> : <NoSymbolIcon className="w-6 h-6 text-red-500" />}
                                    </button>
                                </td>
                                <td className="px-6 py-4">
                                    {user.role !== 'admin' && user.id !== currentAdminId ? (
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => setEditingUser(user)} className="p-2 text-gray-500 hover:text-blue-600" title="تعديل"><PencilIcon className="w-4 h-4" /></button>
                                            <button onClick={() => setUserToDelete(user)} className="p-2 text-gray-500 hover:text-red-600" title="حذف"><TrashIcon className="w-4 h-4" /></button>
                                        </div>
                                    ) : (
                                        <span className="text-xs text-gray-400">لا يمكن تعديل المدير</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {editingUser && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={() => setEditingUser(null)}>
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4">تعديل المستخدم: {editingUser.full_name}</h2>
                        <form onSubmit={handleUpdateUser} className="space-y-4">
                            <div><label className="block text-sm font-medium text-gray-700">الاسم الكامل</label><input type="text" value={editingUser.full_name} onChange={e => setEditingUser({ ...editingUser, full_name: e.target.value })} className="w-full p-2 border rounded" /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-gray-700">تاريخ بدء الاشتراك</label><input type="date" value={toInputDateString(editingUser.subscription_start_date)} onChange={e => setEditingUser({ ...editingUser, subscription_start_date: e.target.value })} className="w-full p-2 border rounded" /></div>
                                <div><label className="block text-sm font-medium text-gray-700">تاريخ انتهاء الاشتراك</label><input type="date" value={toInputDateString(editingUser.subscription_end_date)} onChange={e => setEditingUser({ ...editingUser, subscription_end_date: e.target.value })} className="w-full p-2 border rounded" /></div>
                            </div>
                            <div className="flex items-center gap-6 pt-2">
                                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={editingUser.is_approved} onChange={e => setEditingUser({ ...editingUser, is_approved: e.target.checked })} className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" /> موافق عليه</label>
                                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={editingUser.is_active} onChange={e => setEditingUser({ ...editingUser, is_active: e.target.checked })} className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" /> الحساب نشط</label>
                            </div>
                            <div className="flex justify-end gap-4 pt-4"><button type="button" onClick={() => setEditingUser(null)} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">إلغاء</button><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">حفظ التغييرات</button></div>
                        </form>
                    </div>
                </div>
            )}
            
             {userToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setUserToDelete(null)}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                         <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4"><ExclamationTriangleIcon className="h-8 w-8 text-red-600" /></div>
                            <h3 className="text-2xl font-bold text-gray-900">تأكيد حذف المستخدم</h3>
                            <p className="text-gray-600 my-4">هل أنت متأكد من حذف المستخدم "{userToDelete.full_name}"؟ سيتم حذف جميع بياناته بشكل نهائي ولا يمكن التراجع عن هذا الإجراء.</p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button type="button" className="px-6 py-2 bg-gray-200 rounded-lg" onClick={() => setUserToDelete(null)}>إلغاء</button>
                            <button type="button" className="px-6 py-2 bg-red-600 text-white rounded-lg" onClick={handleConfirmDelete}>نعم، قم بالحذف</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPage;
