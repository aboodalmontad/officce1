import * as React from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { ExclamationCircleIcon, EyeIcon, EyeSlashIcon, ClipboardDocumentIcon, ClipboardDocumentCheckIcon } from '../components/icons';

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

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase) {
            setError("Supabase client is not available.");
            return;
        }

        setLoading(true);
        setError(null);
        setMessage(null);
        setInfo(null);
        setAuthFailed(false); // Reset on every new attempt

        const normalizedMobile = normalizeMobile(form.mobile);

        // Add validation for the normalized number
        if (!/^(09)\d{8}$/.test(normalizedMobile)) {
            setError('رقم الجوال غير صالح. يجب أن يكون رقماً سورياً صحيحاً (مثال: 0912345678).');
            setLoading(false);
            return;
        }
        
        // Add validation for password length
        if (form.password.length < 6) {
            setError('يجب أن تكون كلمة المرور 6 أحرف على الأقل.');
            setLoading(false);
            return;
        }

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

                // Special handling for "User already registered" to provide a better UX flow.
                if (lowerMsg.includes('user already registered')) {
                    setIsLoginView(true);
                    setInfo('هذا الرقم مسجل بالفعل. تم تحويلك إلى شاشة تسجيل الدخول.');
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

    const DatabaseIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
        </svg>
    );

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className={`w-full max-w-sm p-8 space-y-6 bg-white rounded-lg shadow-md ${authFailed ? 'animate-shake' : ''}`}>
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-gray-800">مكتب المحامي</h1>
                    <p className="mt-2 text-gray-600">
                        {isLoginView ? 'سجل الدخول للمتابعة' : 'إنشاء حساب جديد'}
                    </p>
                </div>
                
                <form className="space-y-6" onSubmit={handleAuth}>
                    {!isLoginView && (
                         <div>
                            <label className="block text-sm font-medium text-gray-700">الاسم الكامل</label>
                            <input name="fullName" type="text" value={form.fullName} onChange={handleInputChange} required className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md" />
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">رقم الجوال</label>
                        <input name="mobile" type="tel" value={form.mobile} onChange={handleInputChange} required className={`w-full px-3 py-2 mt-1 border rounded-md transition-colors ${authFailed ? 'border-red-500' : 'border-gray-300'}`} placeholder="09xxxxxxxx"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">كلمة المرور</label>
                        <div className="relative mt-1">
                            <input
                                name="password"
                                type={showPassword ? 'text' : 'password'}
                                value={form.password}
                                onChange={handleInputChange}
                                required
                                className={`w-full ps-3 pe-10 py-2 border rounded-md transition-colors ${authFailed ? 'border-red-500' : 'border-gray-300'}`}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 end-0 flex items-center pe-3 text-gray-500"
                                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                            >
                                {showPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                    
                    {error && (
                        <div className="flex items-start gap-3 p-3 text-sm text-red-700 bg-red-100 rounded-md">
                            <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5"/>
                            <div className="flex-1">
                                {typeof error === 'string' ? <span className="whitespace-pre-wrap">{error}</span> : error}
                            </div>
                        </div>
                    )}
                     {message && (
                        <div className="p-3 text-sm text-green-700 bg-green-100 rounded-md">
                            {message}
                        </div>
                    )}
                    {info && (
                        <div className="p-3 text-sm text-blue-700 bg-blue-100 rounded-md">
                            {info}
                        </div>
                    )}
                    
                    <div>
                        <button type="submit" disabled={loading} className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-300">
                            {loading ? 'جاري...' : (isLoginView ? 'تسجيل الدخول' : 'إنشاء حساب')}
                        </button>
                    </div>
                    
                    <div className="text-sm text-center">
                        <a href="#" onClick={(e) => { e.preventDefault(); setIsLoginView(!isLoginView); setError(null); setMessage(null); setInfo(null); setAuthFailed(false); }} className="font-medium text-blue-600 hover:text-blue-500">
                            {isLoginView ? 'ليس لديك حساب؟ قم بإنشاء واحد' : 'لديك حساب بالفعل؟ سجل الدخول'}
                        </a>
                    </div>
                </form>
            </div>
            <button
                onClick={onForceSetup}
                title="إظهار معالج تهيئة قاعدة البيانات"
                className="fixed bottom-4 left-4 bg-yellow-500 text-white p-3 rounded-full shadow-lg hover:bg-yellow-600 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 z-50"
            >
                <DatabaseIcon />
            </button>
        </div>
    );
};

export default AuthPage;