
import * as React from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { Profile } from '../types';
import { formatDate, toInputDateString } from '../utils/dateUtils';
import { CheckCircleIcon, NoSymbolIcon, PencilIcon, TrashIcon, ExclamationTriangleIcon, ShareIcon, PhoneIcon, ArrowPathIcon } from '../components/icons';
import { useData } from '../context/DataContext';
import UserDetailsModal from '../components/UserDetailsModal';

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
    const digits = mobile.replace(/\D/g, '');
    if (digits.length >= 9) {
        const lastNine = digits.slice(-9);
        if (lastNine.startsWith('9')) {
            return '0' + lastNine;
        }
    }
    return mobile;
};


const AdminPage: React.FC = () => {
    const { profiles: users, setProfiles: setUsers, isDataLoading: loading, userId, systemSettings } = useData();
    const [error, setError] = React.useState<string | null>(null);
    const [editingUser, setEditingUser] = React.useState<Profile | null>(null);
    const [userToDelete, setUserToDelete] = React.useState<Profile | null>(null);
    const [viewingUser, setViewingUser] = React.useState<Profile | null>(null);
    const currentAdminId = userId;
    
    const supabase = getSupabaseClient();

    const handleUpdateUser = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingUser) return;
        
        setUsers(prevUsers => prevUsers.map(u => 
            u.id === editingUser.id ? { ...editingUser, updated_at: new Date() } : u
        ));

        setEditingUser(null);
    };

    const handleConfirmDelete = async () => {
        if (!supabase || !userToDelete) return;
        const userToDeleteId = userToDelete.id;
    
        try {
            const { error: rpcError } = await supabase.rpc('delete_user', {
                user_id_to_delete: userToDeleteId
            });
    
            if (rpcError) throw rpcError;
    
            // On success, update the local state immediately
            setUsers(prevUsers => prevUsers.filter(u => u.id !== userToDeleteId));
            
        } catch (err: any) {
            let errorMessage = "فشل حذف المستخدم.";
            if (String(err.message).toLowerCase().includes('failed to fetch')) {
                errorMessage += " يرجى التحقق من اتصالك بالإنترنت.";
            } else {
                errorMessage += ` السبب: ${err.message}`;
            }
            setError(errorMessage);
        } finally {
            setUserToDelete(null); // Close modal regardless of outcome
        }
    };
    
    const handleSendVerificationCode = (user: Profile) => {
        if (!user.verification_code || !user.mobile_number) return;
        
        // Default template fallback
        let template = 'مرحباً {{name}}،\nكود تفعيل حسابك في تطبيق مكتب المحامي هو: *{{code}}*\nيرجى إدخال هذا الكود في التطبيق لتأكيد رقم هاتفك.';
        
        // Try to get the template from system settings
        const savedTemplate = systemSettings.find(s => s.key === 'verification_message_template');
        if (savedTemplate && savedTemplate.value) {
            template = savedTemplate.value;
        }

        // Use regex with 'g' flag to replace all occurrences
        const message = template
            .replace(/{{name}}/g, user.full_name)
            .replace(/{{code}}/g, user.verification_code);

        // Normalize phone for WhatsApp: remove non-digits
        let phone = user.mobile_number.replace(/\D/g, '');
        
        // Handle '00' prefix -> remove it
        if (phone.startsWith('00')) {
            phone = phone.substring(2);
        }
        
        // Handle local Syrian numbers starting with '09' (length 10) -> add '963' and remove '0'
        if (phone.startsWith('09') && phone.length === 10) {
            phone = '963' + phone.substring(1);
        }
        
        // Use api.whatsapp.com for better reliability with text parameter
        const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
    };

    // Function to manually regenerate verification code if a user is stuck or erroneously confirmed
    const handleGenerateNewCode = async (user: Profile) => {
        if (!supabase) return;
        
        if (!window.confirm(`هل أنت متأكد من توليد كود تفعيل جديد للمستخدم ${user.full_name}؟\nسيؤدي هذا إلى إلغاء حالة تأكيد الرقم الحالية (إن وجدت) وإجبار المستخدم على إدخال الكود الجديد.`)) {
            return;
        }

        const newCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        try {
            const { error } = await supabase.from('profiles').update({ verification_code: newCode, updated_at: new Date() }).eq('id', user.id);
            if (error) throw error;
            
            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, verification_code: newCode, updated_at: new Date() } : u));
            alert(`تم توليد كود جديد: ${newCode}`);
        } catch (err: any) {
            alert(`فشل توليد الكود: ${err.message}`);
        }
    };

    // Quick toggle functions
    const toggleUserApproval = (user: Profile) => {
         if (!supabase || user.role === 'admin') return;
         const updatedUser = { ...user, is_approved: !user.is_approved, updated_at: new Date() };
         setUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));
    }
    
    const toggleUserActiveStatus = (user: Profile) => {
         if (!supabase || user.role === 'admin') return;
         const updatedUser = { ...user, is_active: !user.is_active, updated_at: new Date() };
         setUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));
    }
    
    const sortedUsers = React.useMemo(() => {
        return [...users].sort((a, b) => {
            if (a.is_approved !== b.is_approved) return a.is_approved ? 1 : -1;
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA;
        });
    }, [users]);


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
                            <th className="px-6 py-3">رقم الجوال وتأكيده</th>
                            <th className="px-6 py-3">تاريخ التسجيل</th>
                            <th className="px-6 py-3">الاشتراك</th>
                            <th className="px-6 py-3">تفعيل الحساب</th>
                            <th className="px-6 py-3">نشاط الحساب</th>
                            <th className="px-6 py-3">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedUsers.map(user => (
                            <tr key={user.id} className={`border-b ${!user.is_approved ? 'bg-yellow-50' : 'bg-white'}`}>
                                <td className="px-6 py-4 font-medium text-gray-900">
                                    <button onClick={() => setViewingUser(user)} className="text-blue-600 hover:underline">
                                        {user.full_name}
                                    </button>
                                    {user.role === 'admin' && <span className="text-xs font-semibold text-blue-600 ms-2">(مدير)</span>}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col items-start">
                                        <span className="font-mono text-gray-700" dir="ltr">{getDisplayPhoneNumber(user.mobile_number)}</span>
                                        {user.verification_code ? (
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded border border-yellow-200 font-mono">
                                                    كود: {user.verification_code}
                                                </span>
                                                <button 
                                                    onClick={() => handleSendVerificationCode(user)} 
                                                    className="p-1 text-green-600 hover:bg-green-100 rounded-full transition-colors"
                                                    title="إرسال الكود عبر واتساب"
                                                >
                                                    <ShareIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                                                    <CheckCircleIcon className="w-3 h-3" />
                                                    تم تأكيد الرقم
                                                </span>
                                                {/* Show Reset Button if not approved yet, to handle cases where 'Confirmed' is an error */}
                                                {!user.is_approved && user.role !== 'admin' && (
                                                    <button 
                                                        onClick={() => handleGenerateNewCode(user)} 
                                                        className="p-1 bg-red-50 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full transition-colors border border-red-200 shadow-sm"
                                                        title="إلغاء التأكيد وتوليد كود جديد (إصلاح الخطأ)"
                                                    >
                                                        <ArrowPathIcon className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4">{user.created_at ? formatDate(new Date(user.created_at)) : '-'}</td>
                                <td className="px-6 py-4">
                                    {formatSubscriptionDateRange(user)}
                                </td>
                                <td className="px-6 py-4">
                                    <button 
                                        onClick={() => toggleUserApproval(user)} 
                                        disabled={user.role === 'admin'} 
                                        className="disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center w-full"
                                        title={user.is_approved ? "إلغاء التفعيل" : "تفعيل الحساب"}
                                    >
                                        {user.is_approved ? <CheckCircleIcon className="w-6 h-6 text-green-500" /> : <NoSymbolIcon className="w-6 h-6 text-gray-400" />}
                                    </button>
                                </td>
                                <td className="px-6 py-4">
                                     <button onClick={() => toggleUserActiveStatus(user)} disabled={user.role === 'admin'} className="disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center w-full">
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
                                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={editingUser.is_approved} onChange={e => setEditingUser({ ...editingUser, is_approved: e.target.checked })} className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" /> تفعيل الحساب (Approve)</label>
                                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={editingUser.is_active} onChange={e => setEditingUser({ ...editingUser, is_active: e.target.checked })} className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" /> الحساب نشط</label>
                            </div>
                            {editingUser.verification_code && (
                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
                                    <p className="text-yellow-800 font-bold">رقم الهاتف لم يتم تأكيده بعد.</p>
                                    <p className="text-gray-600">كود التفعيل: <span className="font-mono select-all">{editingUser.verification_code}</span></p>
                                </div>
                            )}
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

            {viewingUser && (
                <UserDetailsModal 
                    user={viewingUser} 
                    onClose={() => setViewingUser(null)}
                    onEdit={() => setEditingUser(viewingUser)}
                />
            )}
        </div>
    );
};

export default AdminPage;
