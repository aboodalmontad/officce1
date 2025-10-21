import * as React from 'https://esm.sh/react@18.2.0';
import { getSupabaseClient } from '../supabaseClient';
import { ExclamationCircleIcon, EyeIcon, EyeSlashIcon, ClipboardDocumentIcon, ClipboardDocumentCheckIcon } from '../components/icons';

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

    const toggleView = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsLoginView(prev => !prev);
        setError(null);
        setMessage(null);
        setInfo(null);
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

        const phone = normalizeMobileToE164(form.mobile);

        if (!phone) {
            setError('رقم الجوال غير صالح. يجب أن يكون رقماً سورياً صحيحاً (مثال: 0912345678).');
            setLoading(false);
            return;
        }
        
        const email = `sy${phone}@email.com`; // Construct the new fake email with 'sy' prefix

        if (form.password.length < 6) {
            setError('يجب أن تكون كلمة المرور 6 أحرف على الأقل.');
            setLoading(false);
            return;
        }
        
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
                            mobile_number: form.mobile.replace(/\D/g, ''), // Send clean local number
                        },
                    }
                });
                if (error) throw error;
                // After signup, the user is automatically logged in.
                // App.tsx's onAuthStateChange listener will handle redirection.
            }
        } catch (error: any) {
            console.error('Auth error:', error);

            let displayError: React.ReactNode = 'حدث خطأ غير متوقع. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.';

            if (error && error.message) {
                const lowerMsg = String(error.message).toLowerCase();

                 if (lowerMsg.includes('email sign-ups are disabled')) {
                    displayError = (
                        <div className="text-right w-full">
                            <p className="font-bold mb-2">خطأ: التسجيل بالبريد الإلكتروني معطل</p>
                            <p>هذا يعني أن مزود خدمة البريد الإلكتروني غير مفعل.</p>
                            <div className="mt-3 text-sm">
                                <p className="font-semibold">الحل:</p>
                                <ol className="list-decimal list-inside mt-1 space-y-1 text-gray-700">
                                    <li>اذهب إلى <strong className="text-gray-800">Authentication &rarr; Providers</strong> في لوحة تحكم Supabase.</li>
                                    <li>ابحث عن مزود <strong className="text-gray-800">Email</strong>.</li>
                                    <li>تأكد من أنه في وضعية <strong className="text-green-600">ON (تشغيل)</strong>.</li>
                                    <li>اضغط "Save" ثم حاول مرة أخرى.</li>
                                </ol>
                            </div>
                        </div>
                    );
                } else if (lowerMsg.includes('user already registered')) {
                    setIsLoginView(true);
                    setInfo('هذا الرقم مسجل بالفعل. تم تحويلك إلى شاشة تسجيل الدخول.');
                    setLoading(false);
                    return; // Exit early
                } else if (lowerMsg.includes('database error')) {
                    displayError = (
                        <div className="text-right w-full">
                            <p className="font-bold mb-2">خطأ في قاعدة البيانات عند إنشاء الحساب</p>
                            <p>هذا الخطأ يحدث عادة بسبب مشكلة في إعدادات صلاحيات قاعدة البيانات (RLS).</p>
                            <div className="mt-3 text-sm">
                                <p className="font-semibold">الحل المقترح:</p>
                                <ol className="list-decimal list-inside mt-1 space-y-1 text-gray-700">
                                    <li>اذهب إلى <strong className="text-gray-800">صفحة إدارة قاعدة البيانات</strong> بالضغط على الأيقونة الصفراء في زاوية الشاشة.</li>
                                    <li>انسخ <strong className="text-gray-800">السكربت الشامل والنهائي</strong> بالكامل.</li>
                                    <li>اذهب إلى <strong className="text-gray-800">SQL Editor</strong> في لوحة تحكم Supabase وشغّل السكربت.</li>
                                    <li>بعد نجاح التنفيذ، حاول إنشاء الحساب مرة أخرى.</li>
                                </ol>
                                <p className="mt-3 text-xs text-gray-500">ملاحظة: لقد تم تحديث سكربت الإعداد لحل هذه المشكلة. تأكد من أنك تستخدم النسخة الأحدث.</p>
                            </div>
                        </div>
                    );
                } else if (lowerMsg.includes('email not confirmed')) {
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
                    const phoneForError = normalizeMobileToE164(form.mobile);
                    const expectedEmail = phoneForError ? `sy${phoneForError}@email.com` : 'لم يمكن استنتاج البريد من الرقم المدخل.';
                    displayError = (
                        <div className="text-right w-full">
                            <p className="font-bold">بيانات دخول غير صحيحة.</p>
                            <p className="mt-2 text-sm text-gray-600">
                                أنت على حق، المشكلة قد تكون في طريقة تحويل رقم الهاتف. 
                                البريد الإلكتروني الذي حاول التطبيق استخدامه للمصادقة هو:
                                <code dir="ltr" className="block text-center text-xs bg-gray-100 p-2 rounded my-2 text-black font-mono">{expectedEmail}</code>
                                يرجى الذهاب إلى جدول <code dir="ltr">auth.users</code> في لوحة تحكم Supabase والتأكد من وجود حساب بهذا البريد الإلكتروني تماماً، وأن كلمة المرور التي تستخدمها صحيحة.
                            </p>
                             <p className="mt-2 text-xs text-gray-500">
                                إذا كنت المدير، فإن تشغيل "السكربت الشامل والنهائي" سيقوم بإنشاء أو إصلاح حسابك بهذه البيانات.
                            </p>
                        </div>
                    );
                    setAuthFailed(true);
                } else if (lowerMsg.includes('password should be at least 6 characters')) {
                    displayError = 'يجب أن تكون كلمة المرور 6 أحرف على الأقل.';
                } else if (lowerMsg.includes('failed to fetch')) {
                    displayError = 'فشل الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت ومن أن خدمة Supabase تعمل بشكل صحيح.';
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
                        <div className="p-3 text-sm text-blue-700 bg-blue-100 rounded-md animate-fade-in">
                            {info}
                        </div>
                    )}
                    
                    <div>
                        <button type="submit" disabled={loading} className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-300">
                            {loading ? 'جاري...' : (isLoginView ? 'تسجيل الدخول' : 'إنشاء حساب')}
                        </button>
                    </div>
                    
                    <div className="text-sm text-center">
                        <a href="#" onClick={toggleView} className="font-medium text-blue-600 hover:text-blue-500">
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