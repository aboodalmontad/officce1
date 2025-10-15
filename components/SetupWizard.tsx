import * as React from 'react';
import { ClipboardDocumentIcon, ClipboardDocumentCheckIcon, CheckCircleIcon, ArrowTopRightOnSquareIcon } from './icons';

interface SetupWizardProps {
    onRetry: () => void;
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
    case_id TEXT REFERENCES public.cases(id) ON DELETE CASCADE,
    decision_date TIMESTAMPTZ,
    decision_number TEXT,
    decision_summary TEXT,
    decision_notes TEXT
);

-- Safely add columns to the stages table if they don't exist. This handles migrations for users with older database schemas.
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS decision_date TIMESTAMPTZ;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS decision_number TEXT;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS decision_summary TEXT;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS decision_notes TEXT;


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

-- Create Credentials Table
CREATE TABLE IF NOT EXISTS public.credentials (
    id INT PRIMARY KEY,
    username TEXT NOT NULL,
    password TEXT NOT NULL
);

-- Seed initial credentials
INSERT INTO public.credentials (id, username, password) VALUES 
(1, 'admin', 'admin')
ON CONFLICT (id) DO NOTHING;


-- Enable Row Level Security (RLS) for all tables
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;

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
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full public access" ON public.credentials;
CREATE POLICY "Allow full public access" ON public.credentials FOR ALL
USING (true)
WITH CHECK (true);`;

const SetupWizard: React.FC<SetupWizardProps> = ({ onRetry }) => {
    const [isSqlCopied, setIsSqlCopied] = React.useState(false);
    const [isOriginCopied, setIsOriginCopied] = React.useState(false);
    const [origin, setOrigin] = React.useState('');

    React.useEffect(() => {
        if (typeof window !== 'undefined') {
            setOrigin(window.location.origin);
        }
    }, []);
    
    const [projectRef] = React.useState<string | null>(() => {
        const url = "https://yygkmyuasneptvezkiha.supabase.co";
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.split('.')[0];
        } catch (e) {
            console.error("Invalid Supabase URL hardcoded", e);
            return null;
        }
    });
    
    const handleCopyOrigin = () => {
        if (origin) {
            navigator.clipboard.writeText(origin);
            setIsOriginCopied(true);
            setTimeout(() => setIsOriginCopied(false), 2000);
        }
    };

    const handleCopySql = () => {
        navigator.clipboard.writeText(sqlScript);
        setIsSqlCopied(true);
        setTimeout(() => setIsSqlCopied(false), 2000);
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl">
                <div className="text-center p-6 border-b bg-gray-50 rounded-t-xl">
                    <h3 className="text-3xl font-bold text-gray-900">
                        إعداد التطبيق الأولي
                    </h3>
                    <p className="text-gray-600 mt-2 leading-relaxed">
                        لضمان عمل التطبيق بشكل صحيح، يرجى اتباع الخطوات التالية لتهيئة مشروع Supabase الخاص بك.
                    </p>
                </div>
                
                <div className="p-8 space-y-8">
                    {/* Step 1: CORS Configuration */}
                    <div className="p-6 border rounded-lg border-red-500 bg-red-50">
                        <h4 className="text-xl font-bold text-gray-800 flex items-center">
                            <span className="flex items-center justify-center w-6 h-6 font-bold text-white bg-red-600 rounded-full me-3">1</span>
                            (خطوة أساسية) تهيئة الوصول عبر النطاقات (CORS)
                        </h4>
                        <div className="mt-4 space-y-4 text-gray-700 animate-fade-in">
                            <p className="font-semibold text-red-800">
                                يبدو أن هناك مشكلة في الاتصال بخادم قاعدة البيانات. الخطأ الأكثر شيوعًا هو إعدادات CORS الخاطئة.
                            </p>
                            <p>
                                للسماح لهذا التطبيق بالتواصل مع قاعدة بيانات Supabase، يجب عليك إضافة "أصل" عنوان الويب الخاص به إلى قائمة النطاقات المسموح بها في إعدادات مشروعك. <strong className="font-semibold">هذه خطوة أمنية مطلوبة لحل أخطاء الاتصال.</strong>
                            </p>
                            <div className="mt-4 p-4 rounded-lg border bg-gray-100/50 shadow-inner space-y-2">
                                <h5 className="font-bold text-lg text-gray-800">1. انسخ أصل التطبيق</h5>
                                <p className="text-sm mt-1">أصل تطبيقك هو:</p>
                                <div className="relative flex items-center">
                                    <input readOnly value={origin} className="w-full p-2 border rounded-md bg-gray-200 text-gray-700 font-mono" />
                                     <button onClick={handleCopyOrigin} className="absolute right-2 flex items-center gap-2 px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                                        {isOriginCopied ? <><ClipboardDocumentCheckIcon className="w-4 h-4 text-green-400" /> <span>تم!</span></> : <><ClipboardDocumentIcon className="w-4 h-4" /> <span>نسخ</span></>}
                                    </button>
                                </div>
                            </div>

                             <div className="mt-4 p-4 rounded-lg border bg-gray-100/50 shadow-inner space-y-2">
                                <h5 className="font-bold text-lg text-gray-800">2. اذهب إلى إعدادات API في Supabase</h5>
                                <p className="text-sm mt-1">اضغط على الزر أدناه للذهاب مباشرةً إلى صفحة إعدادات API لمشروعك.</p>
                                 {projectRef ? (
                                    <a 
                                        href={`https://app.supabase.com/project/${projectRef}/settings/api`}
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors"
                                    >
                                        <ArrowTopRightOnSquareIcon className="w-5 h-5" />
                                        <span>فتح إعدادات API</span>
                                    </a>
                                ) : (
                                    <p className="mt-2 text-sm text-yellow-700">لم يتم العثور على رابط المشروع. يرجى الذهاب يدوياً إلى قسم API Settings في مشروعك.</p>
                                )}
                            </div>
                            <div className="mt-4 p-4 rounded-lg border bg-gray-100/50 shadow-inner space-y-2">
                                <h5 className="font-bold text-lg text-gray-800">3. أضف الأصل واحفظ</h5>
                                <p className="text-sm mt-1">في قسم `Configuration`، ابحث عن `CORS settings`. الصق الأصل الذي نسخته في حقل الإدخال واضغط على "Save".</p>
                            </div>
                        </div>
                    </div>
                    
                    {/* Step 2: SQL Setup */}
                    <div className="p-6 border rounded-lg border-blue-500 bg-blue-50">
                        <h4 className="text-xl font-bold text-gray-800 flex items-center">
                            <span className="flex items-center justify-center w-6 h-6 font-bold text-white bg-blue-600 rounded-full me-3">2</span>
                            تهيئة بنية قاعدة البيانات (SQL)
                        </h4>
                        <div className="mt-4 space-y-4 text-gray-700 animate-fade-in">
                            <p>بعد السماح بالاتصال، تحتاج إلى إنشاء الجداول اللازمة في قاعدة بياناتك. لقد جهزنا لك كل ما تحتاجه.</p>
                            
                            <div className="mt-4 p-4 rounded-lg border bg-gray-100/50 shadow-inner space-y-2">
                                <h5 className="font-bold text-lg text-gray-800">1. افتح محرر Supabase SQL</h5>
                                <p className="text-sm mt-1">إذا لم تكن قد فتحته بالفعل، اضغط على الزر أدناه لفتح محرر SQL.</p>
                                {projectRef && (
                                    <a 
                                        href={`https://app.supabase.com/project/${projectRef}/sql/new`}
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors"
                                    >
                                        <ArrowTopRightOnSquareIcon className="w-5 h-5" />
                                        <span>فتح محرر SQL</span>
                                    </a>
                                )}
                            </div>

                            <div className="mt-4 p-4 rounded-lg border bg-gray-100/50 shadow-inner space-y-2">
                                <h5 className="font-bold text-lg text-gray-800">2. انسخ وشغّل الشيفرة البرمجية</h5>
                                <p className="text-sm mt-1">انسخ الشيفرة أدناه، الصقها في محرر SQL الذي فتحته، ثم اضغط على زر "RUN".</p>
                                <div className="relative mt-2">
                                    <textarea readOnly value={sqlScript} className="w-full h-32 p-2 border rounded-md bg-gray-900 text-gray-200 text-xs font-mono"></textarea>
                                    <button onClick={handleCopySql} className="absolute top-2 right-2 flex items-center gap-2 px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                                        {isSqlCopied ? <><ClipboardDocumentCheckIcon className="w-4 h-4 text-green-400" /> <span>تم النسخ!</span></> : <><ClipboardDocumentIcon className="w-4 h-4" /> <span>نسخ الشيفرة</span></>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Step 3: Complete */}
                    <div className="mt-6 p-6 rounded-lg border bg-green-50 border-green-500 text-center">
                         <h5 className="font-bold text-xl text-gray-800">الخطوة 3: إكمال الإعداد والمحاولة مرة أخرى</h5>
                        <p className="text-sm mt-2 text-gray-700">بعد إكمال الخطوتين السابقتين بنجاح، اضغط على الزر أدناه لإعادة تحميل التطبيق والاتصال بقاعدة البيانات.</p>
                        <div className="mt-4">
                            <button onClick={onRetry} className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors">
                                <CheckCircleIcon className="w-5 h-5" />
                                <span>أكملت الإعداد، حاول مرة أخرى</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SetupWizard;