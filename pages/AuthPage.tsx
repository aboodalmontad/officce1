import * as React from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { ExclamationCircleIcon, EyeIcon, EyeSlashIcon, ClipboardDocumentIcon, ClipboardDocumentCheckIcon, ExclamationTriangleIcon } from '../components/icons';

/*
 * =============================================================================
 *  ! تنبيه هام بخصوص إعدادات المصادقة في Supabase !
 * =============================================================================
 * لحل أخطاء "Email logins are disabled" و "Email not confirmed"، 
 * يجب التأكد من ضبط الإعدادات التالية في لوحة تحكم Supabase لمشروعك:
 * 
 * 1. اذهب إلى: Authentication -> Providers
 * 2. ابحث عن مزود الخدمة "Email".
 * 3. تأكد من أن المفتاح الرئيسي لمزود "Email" في وضعية (ON / تشغيل).
 * 4. اضغط على "Email" لتوسيع إعداداته.
 * 5. تأكد من أن المفتاح الفرعي "Confirm email" في وضعية (OFF / إيقاف).
 * 6. اضغط "Save".
 * 
 * هذا الإعداد ضروري لأن التطبيق يعتمد على مزود البريد الإلكتروني لإنشاء
 * حسابات فريدة للمستخدمين من أرقام هواتفهم، ولكن لا يمكن للمستخدمين تأكيد
 * بريدهم الإلكتروني الوهمي الذي يتم إنشاؤه في الخلفية.
 * =============================================================================
 */

interface AuthPageProps {
    onForceSetup: () => void;
}

// Helper component for copying text
const CopyButton: React.FC<{ textToCopy: string }> = ({ textToCopy }) => {
    const [copied, setCopied] = React.useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(textToCopy).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return (
        <button type="button" onClick={handleCopy} className="flex items-center gap-1 text-xs text-gray-300 hover:text-white" title="نسخ الأمر">
            {copied ? <ClipboardDocumentCheckIcon className="w-4 h-4 text-green-400" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
            {copied ? 'تم النسخ' : 'نسخ'}
        </button>
    );
};


const AuthPage: React.FC<AuthPageProps> = ({ onForceSetup }) => {
    const [isLoginView, setIsLoginView] = React.useState(true);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<React.ReactNode | null>(null);
    const [message, setMessage] = React.useState<string | null>(null);
    const [info, setInfo] = React.useState<string | null>(null);
    const [authFailed, setAuthFailed] = React.useState(false); // For highlighting fields on auth failure
    const [showPassword, setShowPassword] = React.useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);


    const [form, setForm] = React.useState({
        fullName: '',
        mobile: '',
        password: '',
    });

    const supabase = getSupabaseClient();

    const normalizeMobile = (mobile: string): string => {
        // 1. Remove all non-digit characters.
        let digits = mobile.replace(/\D/g, '');
        // 2. Handle international Syrian format (e.g., 9639...).
        if (digits.startsWith('9639') && digits.length === 12) {
            return '0' + digits.substring(3);
        }
        // 3. Return the digits, assuming it's a local format (e.g., 09...).
        return digits;
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
        // Clear error state when user starts typing to correct credentials
        if (error) setError(null);
        if (authFailed) setAuthFailed(false);
        if (info) setInfo(null);
    };

    const validateForm = (): boolean => {
         const normalizedMobile = normalizeMobile(form.mobile);

        // Add validation for the normalized number
        if (!/^(09)\d{8}$/.test(normalizedMobile)) {
            setError('رقم الجوال غير صالح. يجب أن يكون رقماً سورياً صحيحاً (مثال: 0912345678).');
            return false;
        }
        
        // Add validation for password length
        if (form.password.length < 6) {
            setError('يجب أن تكون كلمة المرور 6 أحرف على الأقل.');
            return false;
        }
        return true;
    }

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase) {
            setError("Supabase client is not available.");
            return;
        }

        if (!validateForm()) {
            return;
        }

        setLoading(true);
        setError(null);
        setMessage(null);
        setInfo(null);
        setAuthFailed(false); // Reset on every new attempt

        const normalizedMobile = normalizeMobile(form.mobile);

        // This format `sy{mobile_number}@mail.com` uses a generic, known email provider domain ('mail.com')
        // and a simple prefix to maximize the chances of passing validation checks.
        const email = `sy${normalizedMobile}@mail.com`;

        try {
            if (isLoginView) {
                const { error } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: form.password,
                });
                if (error) throw error;
            } else {
                const { error } = await supabase.auth.signUp({
                    email: email,
                    password: form.password,
                    options: {
                        data: {
                            full_name: form.fullName,
                            mobile_number: normalizedMobile,
                        },
                    }
                });
                if (error) throw error;
                setMessage('تم إرسال طلب التسجيل بنجاح. يرجى انتظار موافقة المدير لتفعيل حسابك.');
            }
        } catch (error: any) {
            console.error('Auth error:', error);

            let displayError: React.ReactNode = 'حدث خطأ غير متوقع. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.';

            if (error && error.message) {
                const lowerMsg = String(error.message).toLowerCase();

                if (lowerMsg.includes('user already registered')) {
                    setError(
                        <>
                            <span>هذا الرقم مسجل بالفعل.</span>
                            <a
                                href="#"
                                onClick={(e) => {
                                    e.preventDefault();
                                    setIsLoginView(true);
                                    setError(null);
                                    setMessage(null);
                                    setInfo(null);
                                    setAuthFailed(false);
                                }}
                                className="font-semibold underline hover:text-red-800 ms-2"
                            >
                                اضغط هنا لتسجيل الدخول
                            </a>
                        </>
                    );
                    setLoading(false);
                    return; // Exit early
                }
                
                if (lowerMsg.includes('email not confirmed')) {
                    const sqlCommandAll = `UPDATE auth.users SET email_confirmed_at = NOW() WHERE email_confirmed_at IS NULL;`;
                    const sqlCommandSpecific = `UPDATE auth.users SET email_confirmed_at = NOW() WHERE email = '${email}';`;

                    displayError = (
                        <div className="text-right w-full">
                            <p className="font-bold mb-2">خطأ: البريد الإلكتروني غير مؤكد</p>
                            <p>هذا الخطأ يعني أن الحساب موجود ولكنه غير مفعل.</p>
                            <div className="mt-3 text-sm">
                                <p className="font-semibold">الحل (للمدير):</p>
                                <p className="mt-1">اذهب إلى <strong>SQL Editor</strong> في لوحة تحكم Supabase ونفّذ أحد الأوامر التالية:</p>
                                
                                <p className="mt-2 font-medium text-gray-600">لتفعيل جميع الحسابات المعلقة:</p>
                                <div className="bg-gray-800 text-white p-2 rounded-md my-1 text-xs text-left relative" dir="ltr">
                                    <code>{sqlCommandAll}</code>
                                    <div className="absolute top-1 right-1"><CopyButton textToCopy={sqlCommandAll} /></div>
                                </div>

                                <p className="mt-2 font-medium text-gray-600">لتفعيل هذا الحساب فقط:</p>
                                <div className="bg-gray-800 text-white p-2 rounded-md my-1 text-xs text-left relative" dir="ltr">
                                    <code>{sqlCommandSpecific}</code>
                                    <div className="absolute top-1 right-1"><CopyButton textToCopy={sqlCommandSpecific} /></div>
                                </div>
                                <p className="mt-3 text-xs text-gray-500">ملاحظة: لتجنب هذه المشكلة مستقبلاً، تأكد من تعطيل "Confirm email" في إعدادات Supabase.</p>
                            </div>
                        </div>
                    );
                } else if(lowerMsg.includes('invalid login credentials')) {
                    displayError = 'رقم الجوال أو كلمة المرور غير صحيحة.';
                    setAuthFailed(true); // Trigger visual feedback on input fields
                } else if (lowerMsg.includes('database error saving new user')) {
                    displayError = 'حدث خطأ في قاعدة البيانات أثناء إنشاء المستخدم. قد يكون هذا الرقم مرتبطًا بحساب قديم تم حذفه بشكل غير كامل. يرجى التواصل مع المسؤول إذا استمرت المشكلة.';
                } else if (lowerMsg.includes('password should be at least 6 characters')) {
                    displayError = 'يجب أن تكون كلمة المرور 6 أحرف على الأقل.';
                } else if (lowerMsg.includes('failed to fetch')) {
                    displayError = 'فشل الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت.';
                }
            }
            setError(displayError);
        } finally {
            setLoading(false);
        }
    };
    
    const handleDeleteAccount = async () => {
        if (!supabase) return;
        if (!validateForm()) {
            setIsDeleteConfirmOpen(false);
            return;
        }
    
        setLoading(true);
        setError(null);
        setMessage(null);
    
        const normalizedMobile = normalizeMobile(form.mobile);
        const email = `sy${normalizedMobile}@mail.com`;
    
        try {
            // 1. Sign in to get a session and prove ownership
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: email,
                password: form.password,
            });
            if (signInError) throw signInError;
            // The user is now signed in.

            // 2. Call the RPC to delete the account
            const { error: rpcError } = await supabase.rpc('delete_user_account');
            if (rpcError) {
                // Manually sign out if RPC fails to avoid being stuck logged in
                await supabase.auth.signOut();
                throw rpcError;
            }
            
            // The RPC will delete the user, which automatically signs them out.
            setMessage('تم حذف حسابك وجميع بياناتك بنجاح. يمكنك الآن التسجيل من جديد بنفس الرقم.');
            setIsDeleteConfirmOpen(false);
            setForm({ fullName: '', mobile: '', password: '' });

        } catch (error: any) {
            console.error('Delete account error:', error);
            if (String(error.message).toLowerCase().includes('invalid login credentials')) {
                 setError('فشلت المصادقة. لا يمكن حذف الحساب. يرجى التحقق من رقم الجوال وكلمة المرور.');
            } else {
                 setError(`حدث خطأ أثناء حذف الحساب: ${error.message}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const inputClasses = (isError: boolean) =>
        `w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-all ${
        isError ? 'border-red-500 ring-red-300 animate-shake' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-300'
        }`;

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg space-y-6 animate-fade-in">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-gray-800">
                        {isLoginView ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
                    </h1>
                    <p className="text-gray-600 mt-2">
                        {isLoginView ? 'مرحباً بعودتك!' : 'انضم إلينا لإدارة مكتبك بكفاءة.'}
                    </p>
                </div>

                {error && (
                    <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md flex items-start gap-3">
                        <ExclamationCircleIcon className="w-6 h-6 flex-shrink-0" />
                        <div className="flex-grow text-sm">{error}</div>
                    </div>
                )}
                {message && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded-md">{message}</div>}
                {info && <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 rounded-md">{info}</div>}

                <form onSubmit={handleAuth} className="space-y-4">
                    {!isLoginView && (
                        <div>
                            <label className="text-sm font-medium text-gray-700">الاسم الكامل</label>
                            <input
                                type="text"
                                name="fullName"
                                value={form.fullName}
                                onChange={handleInputChange}
                                className={inputClasses(false)}
                                placeholder="الاسم الكامل"
                                required
                            />
                        </div>
                    )}
                    <div>
                        <label className="text-sm font-medium text-gray-700">رقم الجوال</label>
                        <input
                            type="tel"
                            name="mobile"
                            value={form.mobile}
                            onChange={handleInputChange}
                            className={inputClasses(authFailed)}
                            placeholder="09..."
                            required
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-700">كلمة المرور</label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                name="password"
                                value={form.password}
                                onChange={handleInputChange}
                                className={inputClasses(authFailed)}
                                placeholder="••••••••"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 left-0 px-3 flex items-center text-gray-500"
                            >
                                {showPassword ? <EyeSlashIcon className="w-5 h-5"/> : <EyeIcon className="w-5 h-5"/>}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors disabled:bg-blue-400"
                    >
                        {loading ? 'جاري التحميل...' : (isLoginView ? 'تسجيل الدخول' : 'إنشاء حساب')}
                    </button>
                </form>

                <div className="text-center">
                    <button
                        onClick={() => {
                            setIsLoginView(!isLoginView);
                            setError(null);
                            setMessage(null);
                            setInfo(null);
                            setAuthFailed(false);
                        }}
                        className="text-sm text-blue-600 hover:underline"
                    >
                        {isLoginView ? 'لا تملك حساباً؟ أنشئ واحداً' : 'لديك حساب بالفعل؟ سجل الدخول'}
                    </button>
                </div>

                {isLoginView && (
                    <div className="text-center pt-4 border-t">
                         <button
                            onClick={() => setIsDeleteConfirmOpen(true)}
                            className="text-sm text-red-600 hover:underline"
                        >
                            حذف الحساب نهائياً
                        </button>
                    </div>
                )}
            </div>

            {isDeleteConfirmOpen && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={() => setIsDeleteConfirmOpen(false)}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                                <ExclamationTriangleIcon className="h-8 w-8 text-red-600" aria-hidden="true" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900">
                                تأكيد حذف الحساب
                            </h3>
                            <p className="text-gray-600 my-4">
                                هل أنت متأكد من حذف حسابك نهائياً؟ <br />
                                سيتم حذف جميع بياناتك السحابية (الموكلين، القضايا، إلخ). <br />
                                <strong className="font-semibold">هذا الإجراء لا يمكن التراجع عنه.</strong>
                                <br/><br/>
                                للمتابعة، يرجى إعادة إدخال بيانات الدخول الخاصة بالحساب المراد حذفه.
                            </p>
                        </div>
                        {error && (
                            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 my-4 rounded-md text-sm">
                                {error}
                            </div>
                        )}
                        <form onSubmit={(e) => { e.preventDefault(); handleDeleteAccount(); }} className="space-y-4">
                             <div>
                                <label className="text-sm font-medium text-gray-700">رقم الجوال</label>
                                <input type="tel" name="mobile" value={form.mobile} onChange={handleInputChange} className={inputClasses(false)} placeholder="09..." required/>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700">كلمة المرور</label>
                                <input type="password" name="password" value={form.password} onChange={handleInputChange} className={inputClasses(false)} placeholder="••••••••" required/>
                            </div>
                            <div className="mt-6 flex justify-center gap-4">
                                <button type="button" className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300" onClick={() => setIsDeleteConfirmOpen(false)} disabled={loading}>
                                    إلغاء
                                </button>
                                <button type="submit" className="px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700" disabled={loading}>
                                    {loading ? 'جاري الحذف...' : 'نعم، قم بالحذف'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AuthPage;
