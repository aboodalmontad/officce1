import * as React from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { ExclamationCircleIcon, EyeIcon, EyeSlashIcon, ClipboardDocumentIcon, ClipboardDocumentCheckIcon } from '../components/icons';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { User } from '@supabase/supabase-js';

/*
 * =============================================================================
 *  ! تنبيه هام بخصوص إعدادات المصادقة في Supabase !
 * =============================================================================
 * لتمكين تسجيل الدخول باستخدام البريد الإلكتروني الوهمي، يجب ضبط الإعدادات التالية في لوحة تحكم Supabase:
 * 
 * 1. اذهب إلى: Authentication -> Providers
 * 2. ابحث عن مزود الخدمة "Email".
 * 3. تأكد من أن المفتاح الرئيسي لمزود "Email" في وضعية (ON / تشغيل).
 * 4. اضغط على "Email" لتوسيع إعداداته.
 * 5. تأكد من أن المفتاح الفرعي "Confirm email" في وضعية (OFF / إيقاف).
 * 6. اضغط "Save".
 * 
 * هذا الإعداد ضروري لأن التطبيق يحول رقم الهاتف إلى بريد إلكتروني للمصادقة،
 * وتعطيل تأكيد البريد الإلكتروني يسمح بتفعيل الحسابات يدوياً من قبل المدير.
 * =============================================================================
 */

interface AuthPageProps {
    onForceSetup: () => void;
    onLoginSuccess: (user: User) => void;
}

const LAST_USER_CREDENTIALS_CACHE_KEY = 'lawyerAppLastUserCredentials';

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

const DatabaseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
);

const LoginPage: React.FC<AuthPageProps> = ({ onForceSetup, onLoginSuccess }) => {
    const [isLoginView, setIsLoginView] = React.useState(true);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<React.ReactNode | null>(null);
    const [message, setMessage] = React.useState<string | null>(null);
    const [info, setInfo] = React.useState<string | null>(null);
    const [authFailed, setAuthFailed] = React.useState(false); // For highlighting fields on auth failure
    const [showPassword, setShowPassword] = React.useState(false);
    const isOnline = useOnlineStatus();

    const [form, setForm] = React.useState({
        fullName: '',
        mobile: '',
        password: '',
    });
    
    // On component mount, try to load the last used credentials from localStorage.
    React.useEffect(() => {
        try {
            const cachedCredentialsRaw = localStorage.getItem(LAST_USER_CREDENTIALS_CACHE_KEY);
            if (cachedCredentialsRaw) {
                const cachedCredentials = JSON.parse(cachedCredentialsRaw);
                // If valid credentials are found, populate the form fields.
                if (cachedCredentials.mobile && cachedCredentials.password) {
                    setForm(prev => ({
                        ...prev,
                        mobile: cachedCredentials.mobile,
                        password: cachedCredentials.password
                    }));
                }
            }
        } catch (e) {
            console.error("Failed to load cached credentials:", e);
            // If the cached data is corrupted, remove it.
            localStorage.removeItem(LAST_USER_CREDENTIALS_CACHE_KEY);
        }
    }, []); // The empty dependency array ensures this runs only once when the component mounts.

    React.useEffect(() => {
        if (!isOnline) {
            setInfo("أنت غير متصل. تسجيل الدخول متاح فقط للمستخدم الأخير الذي سجل دخوله على هذا الجهاز.");
        } else {
            setInfo(null);
        }
    }, [isOnline]);

    const supabase = getSupabaseClient();

    const toggleView = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsLoginView(prev => !prev);
        setError(null);
        setMessage(null);
        setInfo(isOnline ? null : "أنت غير متصل. تسجيل الدخول متاح فقط للمستخدم الأخير الذي سجل دخوله على هذا الجهاز.");
        setAuthFailed(false);
    };

    const normalizeMobileToE164 = (mobile: string): string | null => {
        // Remove all non-digit characters to get a clean string of numbers
        let digits = mobile.replace(/\D/g, '');

        // Case 1: International format with double zero (e.g., 009639...)
        if (digits.startsWith('009639') && digits.length === 14) {
            return `+${digits.substring(2)}`; // Becomes +9639...
        }

        // Case 2: International format without plus/zeros (e.g., 9639...)
        if (digits.startsWith('9639') && digits.length === 12) {
            return `+${digits}`; // Becomes +9639...
        }

        // Case 3: Local format with leading zero (e.g., 09...)
        if (digits.startsWith('09') && digits.length === 10) {
            return `+963${digits.substring(1)}`; // Becomes +9639...
        }
        
        // Case 4: Local format without leading zero (e.g., 9...)
        if (digits.startsWith('9') && digits.length === 9) {
            return `+963${digits}`; // Becomes +9639...
        }

        // If none of the patterns match, the number is considered invalid for Syria.
        return null;
    };


    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
        // Clear error state when user starts typing to correct credentials
        if (error) setError(null);
        if (authFailed) setAuthFailed(false);
    };

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);
        setAuthFailed(false);
    
        const phone = normalizeMobileToE164(form.mobile);
        if (!phone) {
            setError('رقم الجوال غير صالح. يجب أن يكون رقماً سورياً صحيحاً (مثال: 0912345678).');
            setLoading(false);
            setAuthFailed(true);
            return;
        }
        const email = `sy${phone}@email.com`;
    
        if (!supabase) {
            setError("Supabase client is not available.");
            setLoading(false);
            return;
        }
    
        const performOfflineLogin = () => {
            try {
                const LAST_USER_CACHE_KEY = 'lawyerAppLastUser';
                const LOGGED_OUT_KEY = 'lawyerAppLoggedOut';
                
                const cachedCredentialsRaw = localStorage.getItem(LAST_USER_CREDENTIALS_CACHE_KEY);
                const lastUserRaw = localStorage.getItem(LAST_USER_CACHE_KEY);
        
                if (!isLoginView) {
                     throw new Error('لا يمكن إنشاء حساب جديد بدون اتصال بالإنترنت.');
                }
    
                if (!cachedCredentialsRaw || !lastUserRaw) {
                    throw new Error('فشل الاتصال بالخادم، ولا يوجد حساب مخزّن على هذا الجهاز. يرجى الاتصال بالإنترنت.');
                }
    
                const cachedCredentials = JSON.parse(cachedCredentialsRaw);
    
                const normalize = (numStr: string) => (numStr || '').replace(/\D/g, '').slice(-9);
                
                if (normalize(cachedCredentials.mobile) === normalize(form.mobile) && cachedCredentials.password === form.password) {
                    localStorage.removeItem(LOGGED_OUT_KEY);
                    const user = JSON.parse(lastUserRaw) as User;
                    onLoginSuccess(user);
                } else {
                    throw new Error('بيانات الدخول غير صحيحة للوصول بدون انترنت.');
                }
            } catch (offlineErr: any) {
                setError(offlineErr.message);
                setAuthFailed(true);
            } finally {
                setLoading(false);
            }
        };
    
        if (isLoginView) {
            if (!isOnline) {
                console.log("Offline mode detected, attempting offline login directly.");
                performOfflineLogin();
                return;
            }
    
            try {
                const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: form.password });
                if (signInError) throw signInError;
    
                localStorage.setItem(LAST_USER_CREDENTIALS_CACHE_KEY, JSON.stringify({
                    mobile: form.mobile,
                    password: form.password,
                }));
            } catch (err: any) {
                const lowerMsg = String(err.message).toLowerCase();
                console.error('Online Login error:', err);
                let displayError: React.ReactNode = 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.';
    
                if (lowerMsg.includes('invalid login credentials')) {
                    displayError = "بيانات الدخول غير صحيحة. يرجى التحقق من رقم الجوال وكلمة المرور.";
                    setAuthFailed(true);
                } else if (lowerMsg.includes('email not confirmed')) {
                    const sqlCommandAll = `UPDATE auth.users SET email_confirmed_at = NOW() WHERE email_confirmed_at IS NULL;`;
                    const sqlCommandSpecific = `UPDATE auth.users SET email_confirmed_at = NOW() WHERE email = '${email}';`;
                    displayError = (
                        <div className="text-right w-full text-xs">
                            <p className="font-bold mb-2 text-sm">خطأ: البريد الإلكتروني غير مؤكد</p>
                            <p>هذا يعني أن الحساب موجود ولكن المسؤول لم يقم بتفعيله بعد.</p>
                            <p className="mt-2 text-gray-500">للمسؤولين: يمكن حل هذه المشكلة بتشغيل أحد أوامر SQL التالية في محرر Supabase:</p>
                            <div className="mt-2 space-y-2">
                                <code className="block bg-gray-800 text-gray-200 p-2 rounded text-left">
                                    <div className="flex justify-between items-center">
                                        <span>{sqlCommandSpecific}</span>
                                        <CopyButton textToCopy={sqlCommandSpecific} />
                                    </div>
                                </code>
                                <p className="text-center text-gray-400">أو لتفعيل جميع الحسابات:</p>
                                <code className="block bg-gray-800 text-gray-200 p-2 rounded text-left">
                                    <div className="flex justify-between items-center">
                                        <span>{sqlCommandAll}</span>
                                        <CopyButton textToCopy={sqlCommandAll} />
                                    </div>
                                </code>
                            </div>
                        </div>
                    );
                } else if (lowerMsg.includes('database is not configured') || lowerMsg.includes('relation "profiles" does not exist')) {
                    displayError = (
                        <div className="text-right w-full">
                            <p className="font-bold mb-2">خطأ: قاعدة البيانات غير مهيأة</p>
                            <p>يبدو أن هذه هي المرة الأولى التي يتم فيها تشغيل التطبيق. يرجى الضغط على الزر أدناه للانتقال إلى صفحة الإعداد.</p>
                            <button onClick={onForceSetup} className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">
                                <DatabaseIcon />
                                <span>الانتقال إلى صفحة الإعداد</span>
                            </button>
                        </div>
                    );
                } else if (lowerMsg.includes('failed to fetch') || lowerMsg.includes('networkerror')) {
                    displayError = "فشل الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
                }
    
                setError(displayError);
                setLoading(false);
            }
        } else { // Sign up
            try {
                if (!isOnline) {
                    throw new Error('لا يمكن إنشاء حساب جديد بدون اتصال بالإنترنت.');
                }
    
                const { data, error: signUpError } = await supabase.auth.signUp({
                    email,
                    password: form.password,
                    options: { data: { full_name: form.fullName, mobile_number: form.mobile } }
                });
    
                if (signUpError) throw signUpError;
                
                if (data.user) {
                    setMessage("تم إنشاء حسابك بنجاح. يرجى انتظار موافقة المسؤول لتتمكن من تسجيل الدخول.");
                    setIsLoginView(true);
                    setForm({ fullName: '', mobile: '', password: ''});
                } else {
                    throw new Error("لم يتم إرجاع بيانات المستخدم بعد إنشاء الحساب.");
                }
            } catch (err: any) {
                const lowerMsg = String(err.message).toLowerCase();
                if (lowerMsg.includes('user already registered')) {
                    setError('هذا الحساب مسجل بالفعل. يرجى تسجيل الدخول أو استخدام رقم جوال آخر.');
                } else if (lowerMsg.includes('failed to fetch') || lowerMsg.includes('networkerror')) {
                    setError('فشل الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.');
                } else {
                    setError('فشل إنشاء الحساب: ' + err.message);
                }
            } finally {
                setLoading(false);
            }
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4" dir="rtl">
            <div className="w-full max-w-md">
                <div className="text-center mb-6">
                    <h1 className="text-3xl font-bold text-gray-800">مكتب المحامي</h1>
                    <p className="text-gray-500">إدارة أعمال المحاماة بكفاءة</p>
                </div>

                <div className="bg-white p-8 rounded-lg shadow-md">
                    <h2 className="text-2xl font-bold text-center text-gray-700 mb-6">
                        {isLoginView ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
                    </h2>

                    {error && (
                        <div className="mb-4 p-4 text-sm text-red-800 bg-red-100 rounded-lg flex items-start gap-3">
                            <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div>{error}</div>
                        </div>
                    )}
                    {message && <div className="mb-4 p-4 text-sm text-green-800 bg-green-100 rounded-lg">{message}</div>}
                    {info && <div className="mb-4 p-4 text-sm text-blue-800 bg-blue-100 rounded-lg">{info}</div>}

                    <form onSubmit={handleAuth} className="space-y-6">
                        {!isLoginView && (
                            <div>
                                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">الاسم الكامل</label>
                                <input id="fullName" name="fullName" type="text" value={form.fullName} onChange={handleInputChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                        )}

                        <div>
                            <label htmlFor="mobile" className="block text-sm font-medium text-gray-700">رقم الجوال</label>
                            <input id="mobile" name="mobile" type="tel" value={form.mobile} onChange={handleInputChange} required placeholder="09xxxxxxxx" className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${authFailed ? 'border-red-500' : 'border-gray-300'}`} />
                        </div>

                        <div>
                            <label htmlFor="password"
                                className="block text-sm font-medium text-gray-700">كلمة المرور</label>
                            <div className="relative mt-1">
                                <input id="password" name="password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={handleInputChange} required className={`block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${authFailed ? 'border-red-500' : 'border-gray-300'}`} />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 left-0 px-3 flex items-center text-gray-400">
                                    {showPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        <div>
                            <button type="submit" disabled={loading || (!isOnline && !isLoginView)} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300">
                                {loading ? 'جاري التحميل...' : (isLoginView ? 'تسجيل الدخول' : 'إنشاء الحساب')}
                            </button>
                        </div>
                    </form>

                    <p className="mt-6 text-center text-sm text-gray-600">
                        {isLoginView ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟'}
                        <a href="#" onClick={toggleView} className="font-medium text-blue-600 hover:text-blue-500 ms-1">
                            {isLoginView ? 'أنشئ حساباً جديداً' : 'سجل الدخول'}
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;