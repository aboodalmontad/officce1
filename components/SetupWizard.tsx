import * as React from 'react';
import { SyncStatus } from '../hooks/useSupabaseData';
import { ClipboardDocumentIcon, ClipboardDocumentCheckIcon, CheckCircleIcon, ArrowPathIcon, ArrowTopRightOnSquareIcon } from './icons';
import { setSupabaseCredentials, testSupabaseConnection } from '../supabaseClient';


interface SetupWizardProps {
    currentStatus: SyncStatus;
    onRetry: () => void;
    onUseOffline: () => void;
    initialError: string | null;
}

const sqlScript = `-- Create Tables using snake_case identifiers, the Supabase convention.

-- Create Clients Table
CREATE TABLE IF NOT EXISTS public.clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact_info TEXT
);

-- Create Cases Table
CREATE TABLE IF NOT EXISTS public.cases (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    client_name TEXT NOT NULL,
    opponent_name TEXT,
    fee_agreement TEXT,
    status TEXT CHECK (status IN ('active', 'closed', 'on_hold')),
    client_id TEXT REFERENCES public.clients(id) ON DELETE CASCADE
);

-- Create Stages Table
CREATE TABLE IF NOT EXISTS public.stages (
    id TEXT PRIMARY KEY,
    court TEXT NOT NULL,
    case_number TEXT,
    first_session_date TIMESTAMPTZ,
    case_id TEXT REFERENCES public.cases(id) ON DELETE CASCADE
);

-- Create Sessions Table
CREATE TABLE IF NOT EXISTS public.sessions (
    id TEXT PRIMARY KEY,
    court TEXT,
    case_number TEXT,
    date TIMESTAMPTZ NOT NULL,
    client_name TEXT,
    opponent_name TEXT,
    postponement_reason TEXT,
    next_postponement_reason TEXT,
    is_postponed BOOLEAN DEFAULT FALSE,
    next_session_date TIMESTAMPTZ,
    assignee TEXT,
    stage_id TEXT REFERENCES public.stages(id) ON DELETE CASCADE
);

-- Create Admin Tasks Table
CREATE TABLE IF NOT EXISTS public.admin_tasks (
    id TEXT PRIMARY KEY,
    task TEXT NOT NULL,
    due_date TIMESTAMPTZ NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    importance TEXT CHECK (importance IN ('normal', 'important', 'urgent')),
    assignee TEXT,
    location TEXT
);

-- Create Appointments Table
CREATE TABLE IF NOT EXISTS public.appointments (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    time TEXT,
    date TIMESTAMPTZ NOT NULL,
    importance TEXT CHECK (importance IN ('normal', 'important', 'urgent')),
    notified BOOLEAN DEFAULT FALSE,
    reminder_time_in_minutes INT,
    assignee TEXT
);

-- Create Accounting Entries Table
CREATE TABLE IF NOT EXISTS public.accounting_entries (
    id TEXT PRIMARY KEY,
    type TEXT CHECK (type IN ('income', 'expense')),
    amount REAL NOT NULL,
    date TIMESTAMPTZ NOT NULL,
    description TEXT,
    client_id TEXT, -- Can be null for general expenses/income
    case_id TEXT, -- Can be null
    client_name TEXT
);

-- Create Assistants Table
CREATE TABLE IF NOT EXISTS public.assistants (
    name TEXT PRIMARY KEY
);

-- Seed initial assistants
INSERT INTO public.assistants (name) VALUES 
('أحمد'), 
('فاطمة'), 
('سارة'), 
('بدون تخصيص')
ON CONFLICT (name) DO NOTHING;


-- Enable Row Level Security (RLS) for all tables
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistants ENABLE ROW LEVEL SECURITY;

-- Create Policies
-- These policies allow full public access, which is appropriate for an app
-- that uses the anon key and does not have its own user authentication system.

DROP POLICY IF EXISTS "Allow full public access" ON public.clients;
CREATE POLICY "Allow full public access" ON public.clients FOR ALL
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full public access" ON public.cases;
CREATE POLICY "Allow full public access" ON public.cases FOR ALL
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full public access" ON public.stages;
CREATE POLICY "Allow full public access" ON public.stages FOR ALL
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full public access" ON public.sessions;
CREATE POLICY "Allow full public access" ON public.sessions FOR ALL
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full public access" ON public.admin_tasks;
CREATE POLICY "Allow full public access" ON public.admin_tasks FOR ALL
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full public access" ON public.appointments;
CREATE POLICY "Allow full public access" ON public.appointments FOR ALL
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full public access" ON public.accounting_entries;
CREATE POLICY "Allow full public access" ON public.accounting_entries FOR ALL
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full public access" ON public.assistants;
CREATE POLICY "Allow full public access" ON public.assistants FOR ALL
USING (true)
WITH CHECK (true);`;

const CorsFixGuide: React.FC = () => (
    <div className="mt-4 pt-3 border-t border-yellow-300">
        <h5 className="font-bold">خطوات حل مشكلة CORS:</h5>
        <ol className="list-decimal list-inside mt-2 text-sm space-y-2">
            <li>
                اذهب إلى لوحة تحكم مشروعك على Supabase.
            </li>
            <li>
                من القائمة اليسرى، اضغط على أيقونة الإعدادات (Project Settings).
            </li>
            <li>
                اختر قسم "API" من القائمة.
            </li>
             <li>
                 انزل إلى قسم "CORS Configuration".
            </li>
            <li>
                 في حقل الإدخال، اكتب <code className="bg-yellow-200 text-yellow-900 p-1 rounded-md text-xs">https://*.googleusercontent.com</code> واضغط Enter.
            </li>
             <li>
                 يمكنك أيضاً إضافة <code className="bg-yellow-200 text-yellow-900 p-1 rounded-md text-xs">*</code> للسماح بالاتصال من أي نطاق (أقل أماناً).
            </li>
            <li>
                اضغط على زر "Save" في الأسفل، ثم حاول الاتصال مجدداً من هنا.
            </li>
        </ol>
    </div>
);

const ErrorDisplay: React.FC<{ message: string }> = ({ message }) => (
    <div className="p-4 border-l-4 border-red-500 bg-red-50 text-red-800 rounded-r-lg space-y-3">
        <h5 className="font-bold">حدث خطأ في الاتصال</h5>
        <p className="text-sm">{message}</p>
        {message.includes('CORS') && <CorsFixGuide />}
        {message.includes('فشل المصادقة') && (
            <div className="mt-4 pt-3 border-t border-red-300 text-sm">
                <p className="font-semibold">خطوات التحقق:</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>تأكد من نسخ مفتاح "anon" و "public" وليس مفتاح "service_role" السري.</li>
                    <li>تأكد من عدم وجود مسافات إضافية في بداية أو نهاية المفتاح.</li>
                    <li>تأكد من أن المفتاح مطابق تماماً لما هو موجود في لوحة تحكم Supabase.</li>
                </ul>
            </div>
        )}
    </div>
);


const SetupWizard: React.FC<SetupWizardProps> = ({ currentStatus, onRetry, onUseOffline, initialError }) => {
    const step = currentStatus === 'unconfigured' ? 1 : 2;
    const [isCopied, setIsCopied] = React.useState(false);
    const [projectRef, setProjectRef] = React.useState<string | null>(null);
    
    // State for Step 1 form
    const [supabaseUrl, setSupabaseUrl] = React.useState('');
    const [supabaseKey, setSupabaseKey] = React.useState('');
    const [isConnecting, setIsConnecting] = React.useState(false);
    const [error, setError] = React.useState(initialError || '');

    React.useEffect(() => {
        // Attempt to parse project ref for Step 2 link when component loads or step changes
        const url = localStorage.getItem('supabaseUrl');
        if (url) {
            try {
                const urlObj = new URL(url);
                const ref = urlObj.hostname.split('.')[0];
                setProjectRef(ref);
            } catch (e) {
                console.error("Invalid Supabase URL stored", e);
                setProjectRef(null);
            }
        }
    }, [step]);


    const handleCopy = () => {
        navigator.clipboard.writeText(sqlScript);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const handleSaveAndConnect = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!supabaseUrl.trim() || !supabaseKey.trim()) {
            setError('يرجى ملء كلا الحقلين.');
            return;
        }
        setIsConnecting(true);
        
        const result = await testSupabaseConnection(supabaseUrl, supabaseKey);

        if (result.success) {
            setSupabaseCredentials(supabaseUrl, supabaseKey);
            onRetry(); // This will trigger the app to re-evaluate its state
        } else {
            setError(result.message);
        }

        setIsConnecting(false);
    };

    const Step: React.FC<{ stepNumber: number; title: string; active: boolean; done: boolean; children: React.ReactNode }> = ({ stepNumber, title, active, done, children }) => (
        <div className={`p-6 border rounded-lg ${active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
            <h4 className="text-xl font-bold text-gray-800 flex items-center">
                {done ? <CheckCircleIcon className="w-6 h-6 text-green-500 me-3" /> : <span className="flex items-center justify-center w-6 h-6 font-bold text-white bg-blue-600 rounded-full me-3">{stepNumber}</span>}
                الخطوة {stepNumber}: {title}
                {done && <span className="text-sm font-normal text-green-600 ms-2">(اكتمل)</span>}
            </h4>
            {active && <div className="mt-4 space-y-4 text-gray-700 animate-fade-in">{children}</div>}
        </div>
    );
    

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl" onClick={e => e.stopPropagation()}>
                <div className="text-center p-6 border-b bg-gray-50 rounded-t-xl">
                    <h3 className="text-3xl font-bold text-gray-900">
                        إعداد التطبيق للمزامنة السحابية
                    </h3>
                    <p className="text-gray-600 mt-2 leading-relaxed">
                        لتمكين حفظ بياناتك ومزامنتها عبر الأجهزة، يرجى إكمال الخطوتين التاليتين.
                    </p>
                </div>
                
                <div className="p-8 space-y-6">
                    <Step stepNumber={1} title="ربط بيانات الاعتماد" active={step === 1} done={step > 1}>
                         <p>للسماح للتطبيق بالاتصال بقاعدة بياناتك، يرجى إدخال عنوان URL ومفتاح API العام (Public Anon Key) الخاص بمشروعك على Supabase.</p>
                        <p className="text-sm text-gray-500">يمكنك العثور عليها في لوحة تحكم مشروعك &larr; Settings &larr; API.</p>
                        
                        <form onSubmit={handleSaveAndConnect} className="mt-4 space-y-4">
                            <div>
                                <label htmlFor="supabaseUrl" className="block text-sm font-medium text-gray-700">URL المشروع</label>
                                <input 
                                    type="url" 
                                    id="supabaseUrl" 
                                    value={supabaseUrl}
                                    onChange={(e) => { setSupabaseUrl(e.target.value); setError(''); }}
                                    className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="https://xyz.supabase.co" 
                                    required 
                                />
                            </div>
                             <div>
                                <label htmlFor="supabaseKey" className="block text-sm font-medium text-gray-700">مفتاح API العام (Anon Key)</label>
                                <input 
                                    type="text" 
                                    id="supabaseKey" 
                                    value={supabaseKey}
                                    onChange={(e) => { setSupabaseKey(e.target.value); setError(''); }}
                                    className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." 
                                    required 
                                />
                                <p className="mt-2 font-bold text-red-600 text-sm">تحذير: استخدم مفتاح <code className="bg-red-100 text-red-700 p-1 rounded-md">public anon key</code> فقط. لا تستخدم أبداً مفتاح "service_role" السري.</p>
                            </div>
                            {error && <ErrorDisplay message={error} />}
                            <div className="text-center pt-2">
                                <button 
                                    type="submit" 
                                    disabled={isConnecting}
                                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400"
                                >
                                    {isConnecting ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <CheckCircleIcon className="w-5 h-5" />}
                                    <span>{isConnecting ? 'جاري الاتصال...' : 'حفظ والاتصال'}</span>
                                </button>
                            </div>
                        </form>
                        
                        <div className="relative flex pt-6 pb-4 items-center">
                            <div className="flex-grow border-t border-gray-300"></div>
                            <span className="flex-shrink mx-4 text-gray-500 font-medium">أو</span>
                            <div className="flex-grow border-t border-gray-300"></div>
                        </div>

                        <div className="text-center">
                            <p className="text-sm text-gray-600 mb-3">
                                إذا كنت تفضل استخدام التطبيق بدون مزامنة سحابية الآن. يمكنك إعداد المزامنة لاحقاً من صفحة الإعدادات.
                            </p>
                            <button 
                                onClick={onUseOffline}
                                className="w-full sm:w-auto px-6 py-3 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors"
                            >
                                المتابعة في الوضع المحلي فقط
                            </button>
                        </div>
                    </Step>

                    <Step stepNumber={2} title="تهيئة قاعدة البيانات" active={step === 2} done={false}>
                        <p>ممتاز! تم الاتصال بنجاح. الآن تحتاج إلى إنشاء الجداول اللازمة في قاعدة بياناتك. لقد جهزنا لك كل ما تحتاجه.</p>
                        
                        <div className="mt-4 p-4 rounded-lg border bg-gray-100/50 shadow-inner space-y-2">
                            <h5 className="font-bold text-lg text-gray-800">1. افتح محرر Supabase SQL</h5>
                            <p className="text-sm mt-1">اضغط على الزر أدناه لفتح محرر SQL في مشروعك على Supabase في نافذة جديدة.</p>
                            {projectRef ? (
                                <a 
                                    href={`https://app.supabase.com/project/${projectRef}/sql/new`}
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors"
                                >
                                    <ArrowTopRightOnSquareIcon className="w-5 h-5" />
                                    <span>فتح محرر SQL</span>
                                </a>
                            ) : (
                                <p className="mt-2 text-sm text-yellow-700">لم يتم العثور على رابط المشروع. يرجى الذهاب يدوياً إلى قسم SQL Editor في مشروعك.</p>
                            )}
                        </div>

                        <div className="mt-4 p-4 rounded-lg border bg-gray-100/50 shadow-inner space-y-2">
                            <h5 className="font-bold text-lg text-gray-800">2. انسخ وشغّل الشيفرة البرمجية</h5>
                            <p className="text-sm mt-1">انسخ الشيفرة أدناه، الصقها في محرر SQL الذي فتحته، ثم اضغط على زر "RUN".</p>
                            <div className="relative mt-2">
                                <textarea readOnly value={sqlScript} className="w-full h-32 p-2 border rounded-md bg-gray-900 text-gray-200 text-xs font-mono"></textarea>
                                <button onClick={handleCopy} className="absolute top-2 right-2 flex items-center gap-2 px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                                    {isCopied ? <><ClipboardDocumentCheckIcon className="w-4 h-4 text-green-400" /> <span>تم النسخ!</span></> : <><ClipboardDocumentIcon className="w-4 h-4" /> <span>نسخ الشيفرة</span></>}
                                </button>
                            </div>
                        </div>

                        <div className="mt-6 p-4 rounded-lg border bg-gray-100/50 shadow-inner space-y-2">
                             <h5 className="font-bold text-lg text-gray-800">3. أكمل الإعداد</h5>
                            <p className="text-sm mt-1">بعد تشغيل الشيفرة بنجاح في Supabase، عد إلى هنا واضغط على الزر أدناه للمتابعة.</p>
                            <div className="text-center mt-3">
                                <button onClick={onRetry} className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors">
                                    <CheckCircleIcon className="w-5 h-5" />
                                    <span>لقد قمت بتشغيل الشيفرة، أكمل الإعداد</span>
                                </button>
                            </div>
                        </div>
                    </Step>
                </div>
            </div>
        </div>
    );
};

export default SetupWizard;