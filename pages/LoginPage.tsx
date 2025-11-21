
import * as React from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { ExclamationCircleIcon, EyeIcon, EyeSlashIcon, ClipboardDocumentIcon, ClipboardDocumentCheckIcon, ArrowTopRightOnSquareIcon, CheckCircleIcon, DatabaseIcon } from '../components/icons';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
// Fix: Use `import type` for User as it is used as a type, not a value. This resolves module resolution errors in some environments.
import type { User } from '@supabase/supabase-js';

interface AuthPageProps {
    onForceSetup: () => void;
    onLoginSuccess: (user: User, isOfflineLogin?: boolean) => void;
    forceVerification?: boolean; // New prop to force verification mode
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

const LoginPage: React.FC<AuthPageProps> = ({ onForceSetup, onLoginSuccess, forceVerification = false }) => {
    const [isLoginView, setIsLoginView] = React.useState(true);
    const [verificationMode, setVerificationMode] = React.useState(forceVerification); // Initialize based on prop
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<React.ReactNode | null>(null);
    const [message, setMessage] = React.useState<string | null>(null);
    const [info, setInfo] = React.useState<string | null>(null);
    const [authFailed, setAuthFailed] = React.useState(false); // For highlighting fields on auth failure
    const [showPassword, setShowPassword] = React.useState(false);
    const [verificationCode, setVerificationCode] = React.useState('');
    const isOnline = useOnlineStatus();

    const [form, setForm] = React.useState({
        fullName: '',
        mobile: '',
        password: '',
    });
    
    // Update state if prop changes
    React.useEffect(() => {
        if (forceVerification) {
            setVerificationMode(true);
        }
    }, [forceVerification]);

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
        setVerificationMode(false);
        setError(null);
        setMessage(null);
        setInfo(isOnline ? null : "أنت غير متصل. تسجيل الدخول متاح فقط للمستخدم الأخير الذي سجل دخوله على هذا الجهاز.");
        setAuthFailed(false);
    };

    /**
     * Normalizes a phone number to E.164 format.
     * Handles:
     * - Whitespace trimming
     * - '00' prefix -> '+'
     * - Local Syrian format '09...' -> '+9639...'
     * - Short Syrian format '9...' -> '+9639...'
     * - Existing E.164 '+...'
     */
    const normalizeMobileToE164 = (mobileInput: string): string | null => {
        let mobile = mobileInput.trim();
        
        // Convert leading '00' to '+'
        if (mobile.startsWith('00')) {
            mobile = '+' + mobile.slice(2);
        }

        const digits = mobile.replace(/\D/g, '');

        // If already in E.164 format (starts with +)
        if (mobile.startsWith('+')) {
             // Simple check: needs enough digits. E.164 can be up to 15 chars.
             // +963 9xx xxx xxx is 12 digits total.
             if (digits.length >= 7 && digits.length <= 15) return `+${digits}`;
             return null;
        }

        // Fallback for legacy local Syrian numbers (starts with 09 or 9)
        // 09xxxxxxxx (10 digits total)
        if (digits.length === 10 && digits.startsWith('09')) {
             return `+963${digits.slice(1)}`;
        }
        
        // 9xxxxxxxx (9 digits total - user omitted the leading 0)
        if (digits.length === 9 && digits.startsWith('9')) {
             return `+963${digits}`;
        }

        return null;
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
        // Clear error state when user starts typing to correct credentials
        if (error) setError(null);
        if (authFailed) setAuthFailed(false);
    };

    const handleVerifyCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (!supabase) return;

        try {
             const { data, error: rpcError } = await supabase.rpc('verify_account', {
                 code_input: verificationCode.trim()
             });

             if (rpcError) throw rpcError;

             if (data === true) {
                 setMessage("تم تأكيد رقم الجوال بنجاح! الحساب بانتظار موافقة المدير.");
                 
                 // Reload session to get updated profile status
                 const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
                 if(session) {
                     onLoginSuccess(session.user);
                 } else {
                     window.location.reload();
                 }
             } else {
                 setError("الكود غير صحيح. يرجى التأكد من الكود والمحاولة مرة أخرى.");
             }

        } catch (err: any) {
            let errorMsg: React.ReactNode = err.message;
            
            // Detect missing function error
            if (String(err.message).toLowerCase().includes('function') && String(err.message).toLowerCase().includes('does not exist')) {
                errorMsg = (
                    <div className="text-right w-full">
                        <p className="font-bold mb-2">خطأ: التكوين ناقص</p>
                        <p>دالة التحقق غير موجودة في قاعدة البيانات. يرجى تشغيل سكربت الإصلاح.</p>
                        <button onClick={onForceSetup} className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-yellow-500 text-white font-semibold rounded-lg hover:bg-yellow-600">
                            <DatabaseIcon className="w-5 h-5"/>
                            <span>إصلاح قاعدة البيانات</span>
                        </button>
                    </div>
                );
            }
            
            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    }

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);
        setAuthFailed(false);
    
        const trimmedMobile = form.mobile.trim();
        const phone = normalizeMobileToE164(trimmedMobile);

        if (!phone) {
            setError('رقم الجوال غير صالح.');
            setLoading(false);
            setAuthFailed(true);
            return;
        }

        // For SignUp, strict check for international format user intent
        // Allow '+' or '00' to start.
        if (!isLoginView) {
             if (!trimmedMobile.startsWith('+') && !trimmedMobile.startsWith('00')) {
                 setError('يجب إدخال رقم الجوال بالصيغة الدولية حصراً (مثال: +9639xxxxxxx أو 00963...).');
                 setLoading(false);
                 setAuthFailed(true);
                 return;
             }
        }

        // Remove the '+' from the E.164 phone number to create a safer email format.
        const email = `sy${phone.substring(1)}@email.com`;
    
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
    
                // Relaxed normalization for offline comparison - just compare last 9 digits
                const normalize = (numStr: string) => (numStr || '').replace(/\D/g, '').slice(-9);
                
                if (normalize(cachedCredentials.mobile) === normalize(form.mobile) && cachedCredentials.password === form.password) {
                    localStorage.removeItem(LOGGED_OUT_KEY);
                    const user = JSON.parse(lastUserRaw) as User;
                    onLoginSuccess(user, true);
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
                const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password: form.password });
                if (signInError) throw signInError;
    
                localStorage.setItem(LAST_USER_CREDENTIALS_CACHE_KEY, JSON.stringify({
                    mobile: form.mobile,
                    password: form.password,
                }));

                // Check if verification is needed
                if (data.user) {
                    const { data: profile } = await supabase.from('profiles').select('verification_code').eq('id', data.user.id).single();
                    
                    // If verification_code is NOT NULL, it means user hasn't verified phone yet.
                    if (profile && profile.verification_code) {
                        setVerificationMode(true); // Show verification code input
                        setLoading(false);
                        return; // Stop here, wait for verification
                    }
                    
                    // If code is null, phone is verified. Proceed to normal success flow.
                    onLoginSuccess(data.user);
                }

            } catch (err: any) {
                const lowerMsg = String(err.message).toLowerCase();
                
                // Suppress loud console errors for network issues as we handle them with fallback
                if (!lowerMsg.includes('failed to fetch') && !lowerMsg.includes('networkerror')) {
                    console.error('Online Login error:', err);
                } else {
                    console.warn('Online login failed due to network issue. Attempting offline fallback.');
                }

                // Fallback to offline login if online attempt fails due to network issues.
                if (lowerMsg.includes('failed to fetch') || lowerMsg.includes('networkerror')) {
                    setInfo("فشل الاتصال بالخادم. جاري محاولة تسجيل الدخول دون اتصال...");
                    performOfflineLogin();
                    return;
                }
                
                let displayError: React.ReactNode = 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.';
    
                if (lowerMsg.includes('invalid login credentials')) {
                    displayError = "بيانات الدخول غير صحيحة. يرجى التحقق من رقم الجوال وكلمة المرور.";
                    setAuthFailed(true);
                } else if (lowerMsg.includes('email not confirmed')) {
                     // This case is handled differently in the new flow via verification code,
                     // but keep it for legacy support or admin config errors.
                     displayError = "الحساب موجود ولكنه غير مفعل. يرجى انتظار التفعيل أو إدخال كود التحقق.";
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
                }
    
                setError(displayError);
                setLoading(false);
            }
        } else { // Sign up
            try {
                if (!isOnline) {
                    throw new Error('لا يمكن إنشاء حساب جديد بدون اتصال بالإنترنت.');
                }
                
                const { data: mobileExists, error: rpcError } = await supabase.rpc('check_if_mobile_exists', {
                    mobile_to_check: phone // Use normalized phone to check uniqueness
                });

                if (rpcError) {
                    console.warn("RPC error checking mobile number:", rpcError);
                }

                if (mobileExists === true) {
                    setError('هذا الرقم مسجل بالفعل. يرجى تسجيل الدخول أو استخدام رقم جوال آخر.');
                    setLoading(false);
                    setAuthFailed(true);
                    return;
                }
    
                // Generate Verification Code (6 digits)
                const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

                const { data, error: signUpError } = await supabase.auth.signUp({
                    email,
                    password: form.password,
                    options: { 
                        data: { 
                            full_name: form.fullName, 
                            mobile_number: phone, // Store normalized phone
                            verification_code: verificationCode // Send code to DB
                        } 
                    }
                });
    
                if (signUpError) throw signUpError;
                
                if (data.user) {
                    setMessage("تم إنشاء الحساب بنجاح. سيتم إرسال كود التفعيل إليك من قبل الإدارة (عبر واتساب أو رسالة نصية). يرجى تسجيل الدخول واستخدام الكود لتأكيد رقم الجوال.");
                    setIsLoginView(true);
                    setForm({ fullName: '', mobile: '', password: ''});
                } else {
                    throw new Error("لم يتم إرجاع بيانات المستخدم بعد إنشاء الحساب.");
                }
            } catch (err: any) {
                const lowerMsg = String(err.message).toLowerCase();
                if (lowerMsg.includes('user already registered') || lowerMsg.includes('unique constraint') || lowerMsg.includes('profiles_mobile_number_key')) {
                    setError('هذا الحساب أو رقم الجوال مسجل بالفعل. يرجى تسجيل الدخول أو استخدام رقم جوال آخر.');
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
                        {verificationMode ? 'تأكيد رقم الجوال' : (isLoginView ? 'تسجيل الدخول' : 'إنشاء حساب جديد')}
                    </h2>

                    {error && (
                        <div className="mb-4 p-4 text-sm text-red-800 bg-red-100 rounded-lg flex items-start gap-3">
                            <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div className="w-full">{error}</div>
                        </div>
                    )}
                    {message && <div className="mb-4 p-4 text-sm text-green-800 bg-green-100 rounded-lg">{message}</div>}
                    {info && <div className="mb-4 p-4 text-sm text-blue-800 bg-blue-100 rounded-lg">{info}</div>}

                    {verificationMode ? (
                         <form onSubmit={handleVerifyCode} className="space-y-6">
                            <div>
                                <p className="text-sm text-gray-600 mb-4 text-center">
                                    يرجى إدخال كود التفعيل الذي تم إرساله إليك لتأكيد رقم الجوال.
                                </p>
                                <label htmlFor="verificationCode" className="block text-sm font-medium text-gray-700">كود التفعيل</label>
                                <input id="verificationCode" name="verificationCode" type="text" value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} required placeholder="123456" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-center text-lg tracking-widest" />
                            </div>
                            <button type="submit" disabled={loading} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-green-300">
                                {loading ? 'جاري التحقق...' : 'تأكيد الرقم'}
                            </button>
                            <div className="text-center">
                                <button type="button" onClick={() => { 
                                    // If forced, we might want to logout, but for now let's allow switching back to login view logic
                                    if(forceVerification) onForceSetup(); // Abuse onForceSetup to trigger something, or simply reload? 
                                    // Actually, standard behavior:
                                    setVerificationMode(false);
                                }} className="text-sm text-blue-600 hover:underline">
                                    العودة لتسجيل الدخول
                                </button>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleAuth} className="space-y-6">
                            {!isLoginView && (
                                <div>
                                    <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">الاسم الكامل</label>
                                    <input id="fullName" name="fullName" type="text" value={form.fullName} onChange={handleInputChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                                </div>
                            )}

                            <div>
                                <label htmlFor="mobile" className="block text-sm font-medium text-gray-700">رقم الجوال</label>
                                <input 
                                    id="mobile" 
                                    name="mobile" 
                                    type="tel" 
                                    value={form.mobile} 
                                    onChange={handleInputChange} 
                                    required 
                                    placeholder={!isLoginView ? "+9639xxxxxxxx" : "09xxxxxxxx أو +963..."} 
                                    className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${authFailed ? 'border-red-500' : 'border-gray-300'}`} 
                                    dir="ltr"
                                />
                                {!isLoginView && <p className="text-xs text-gray-500 mt-1 text-right">يرجى استخدام الصيغة الدولية (+963...)</p>}
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
                    )}

                    {!verificationMode && (
                        <p className="mt-6 text-center text-sm text-gray-600">
                            {isLoginView ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟'}
                            <a href="#" onClick={toggleView} className="font-medium text-blue-600 hover:text-blue-500 ms-1">
                                {isLoginView ? 'أنشئ حساباً جديداً' : 'سجل الدخول'}
                            </a>
                        </p>
                    )}
                </div>

                <div className="mt-6 text-center">
                    <a 
                        href="https://joint-fish-ila1mb4.gamma.site/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 hover:underline"
                    >
                        <span>زيارة الصفحة الرئيسية للتطبيق</span>
                        <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                    </a>
                </div>
                <p className="mt-4 text-center text-xs text-gray-500">كافة الحقوق محفوظة للمحامي عبد الرحمن نحوي</p>
                <p className="mt-1 text-center text-xs text-gray-400">الإصدار: 20-11-2025-3</p>
            </div>
        </div>
    );
};

export default LoginPage;
