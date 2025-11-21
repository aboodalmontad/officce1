
import * as React from 'react';
import { ClipboardDocumentCheckIcon, ClipboardDocumentIcon, ExclamationTriangleIcon } from './icons';

const unifiedScript = `
-- =================================================================
-- السكربت الشامل والآمن (الإصدار 58) - System Settings & Verification
-- =================================================================
-- هذا السكربت يقوم بإنشاء وتحديث قاعدة البيانات.
-- يضمن عدم ظهور المستخدمين الجدد كـ "مؤكدين" تلقائياً.
-- يضيف جدول إعدادات النظام لحفظ رسائل التفعيل.

-- 1. FUNCTIONS & TRIGGERS
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role FROM public.profiles WHERE id = auth.uid();
    RETURN COALESCE(user_role, 'user') = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_user(user_id_to_delete uuid)
RETURNS void AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins can delete users.';
    END IF;
    IF auth.uid() = user_id_to_delete THEN
        RAISE EXCEPTION 'Admins cannot delete their own account from the admin panel.';
    END IF;
    DELETE FROM auth.users WHERE id = user_id_to_delete;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;
GRANT EXECUTE ON FUNCTION public.delete_user(user_id_to_delete uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_if_mobile_exists(mobile_to_check text)
RETURNS boolean AS $$
DECLARE
    mobile_exists boolean;
BEGIN
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE mobile_number = mobile_to_check) INTO mobile_exists;
    RETURN mobile_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.check_if_mobile_exists(text) TO anon, authenticated;

-- Function to verify account using the code
CREATE OR REPLACE FUNCTION public.verify_account(code_input text)
RETURNS boolean AS $$
DECLARE
    target_code text;
BEGIN
    SELECT verification_code INTO target_code FROM public.profiles WHERE id = auth.uid();
    
    IF target_code IS NOT NULL AND target_code = code_input THEN
        -- Clear the code to mark as verified
        UPDATE public.profiles 
        SET verification_code = NULL 
        WHERE id = auth.uid();
        RETURN true;
    ELSE
        RETURN false;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;
GRANT EXECUTE ON FUNCTION public.verify_account(text) TO authenticated;


CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    raw_mobile TEXT;
    normalized_mobile TEXT;
    v_code TEXT;
BEGIN
    raw_mobile := new.raw_user_meta_data->>'mobile_number';
    v_code := new.raw_user_meta_data->>'verification_code';

    -- Normalize mobile
    IF raw_mobile IS NOT NULL AND raw_mobile != '' THEN
        IF raw_mobile LIKE '+%' THEN
             normalized_mobile := raw_mobile; 
        ELSE
             normalized_mobile := '0' || RIGHT(regexp_replace(raw_mobile, '\\D', '', 'g'), 9);
        END IF;
    ELSE
        normalized_mobile := '0' || regexp_replace(new.email, '^sy963|@email\\.com$', '', 'g');
    END IF;

    -- CRITICAL FIX: Force random code generation if none is provided OR if it's invalid
    -- This ensures no user is created with NULL verification_code (verified state) by accident
    IF v_code IS NULL OR v_code = '' OR v_code = 'null' THEN
        v_code := floor(random() * 899999 + 100000)::text;
    END IF;

    INSERT INTO public.profiles (id, full_name, mobile_number, verification_code, created_at)
    VALUES (
      new.id,
      new.raw_user_meta_data->>'full_name',
      normalized_mobile,
      v_code,
      new.created_at
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      mobile_number = EXCLUDED.mobile_number,
      verification_code = EXCLUDED.verification_code,
      created_at = EXCLUDED.created_at;

    UPDATE auth.users SET email_confirmed_at = NOW() WHERE id = new.id;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 2. TABLE & SCHEMA CREATION

CREATE TABLE IF NOT EXISTS public.profiles (id uuid NOT NULL PRIMARY KEY);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mobile_number text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_approved boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_code text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_start_date date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_end_date date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.assistants (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY);
ALTER TABLE public.assistants ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.assistants ADD COLUMN IF NOT EXISTS name text NOT NULL;

CREATE TABLE IF NOT EXISTS public.clients (id text NOT NULL PRIMARY KEY);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS contact_info text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.cases (id text NOT NULL PRIMARY KEY);
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS client_id text NOT NULL;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS subject text NOT NULL;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS opponent_name text;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS fee_agreement text;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.stages (id text NOT NULL PRIMARY KEY);
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS case_id text NOT NULL;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS court text NOT NULL;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS case_number text;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS first_session_date timestamptz;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS decision_date timestamptz;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS decision_number text;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS decision_summary text;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS decision_notes text;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.sessions (id text NOT NULL PRIMARY KEY);
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS stage_id text NOT NULL;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS court text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS case_number text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS date timestamptz NOT NULL;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS opponent_name text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS postponement_reason text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS next_postponement_reason text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS is_postponed boolean DEFAULT false;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS next_session_date timestamptz;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS assignee text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.admin_tasks (id text NOT NULL PRIMARY KEY);
ALTER TABLE public.admin_tasks ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.admin_tasks ADD COLUMN IF NOT EXISTS task text NOT NULL;
ALTER TABLE public.admin_tasks ADD COLUMN IF NOT EXISTS due_date timestamptz NOT NULL;
ALTER TABLE public.admin_tasks ADD COLUMN IF NOT EXISTS completed boolean DEFAULT false;
ALTER TABLE public.admin_tasks ADD COLUMN IF NOT EXISTS importance text DEFAULT 'normal';
ALTER TABLE public.admin_tasks ADD COLUMN IF NOT EXISTS assignee text;
ALTER TABLE public.admin_tasks ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.admin_tasks ADD COLUMN IF NOT EXISTS order_index integer;
ALTER TABLE public.admin_tasks ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.appointments (id text NOT NULL PRIMARY KEY);
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS title text NOT NULL;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS "time" text;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS date timestamptz NOT NULL;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS importance text;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS notified boolean;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS reminder_time_in_minutes integer;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS assignee text;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS completed boolean DEFAULT false;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.accounting_entries (id text NOT NULL PRIMARY KEY);
ALTER TABLE public.accounting_entries ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.accounting_entries ADD COLUMN IF NOT EXISTS type text NOT NULL;
ALTER TABLE public.accounting_entries ADD COLUMN IF NOT EXISTS amount real NOT NULL;
ALTER TABLE public.accounting_entries ADD COLUMN IF NOT EXISTS date timestamptz NOT NULL;
ALTER TABLE public.accounting_entries ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.accounting_entries ADD COLUMN IF NOT EXISTS client_id text;
ALTER TABLE public.accounting_entries ADD COLUMN IF NOT EXISTS case_id text;
ALTER TABLE public.accounting_entries ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.accounting_entries ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.invoices (id text NOT NULL PRIMARY KEY);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS client_id text NOT NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS case_id text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS case_subject text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS issue_date timestamptz NOT NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS due_date timestamptz NOT NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax_rate real DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS discount real DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.invoice_items (id text NOT NULL PRIMARY KEY);
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS invoice_id text NOT NULL;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS description text NOT NULL;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS amount real NOT NULL;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.site_finances (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY);
ALTER TABLE public.site_finances ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.site_finances ADD COLUMN IF NOT EXISTS type text DEFAULT 'income' NOT NULL;
ALTER TABLE public.site_finances ADD COLUMN IF NOT EXISTS payment_date date NOT NULL;
ALTER TABLE public.site_finances ADD COLUMN IF NOT EXISTS amount real NOT NULL;
ALTER TABLE public.site_finances ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.site_finances ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.site_finances ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.site_finances ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.case_documents (id text NOT NULL PRIMARY KEY);
ALTER TABLE public.case_documents ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.case_documents ADD COLUMN IF NOT EXISTS case_id text NOT NULL;
ALTER TABLE public.case_documents ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.case_documents ADD COLUMN IF NOT EXISTS type text NOT NULL;
ALTER TABLE public.case_documents ADD COLUMN IF NOT EXISTS size real NOT NULL;
ALTER TABLE public.case_documents ADD COLUMN IF NOT EXISTS added_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE public.case_documents ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE public.case_documents ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- NEW: System Settings Table
CREATE TABLE IF NOT EXISTS public.system_settings (key text NOT NULL PRIMARY KEY);
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS value text;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Insert default verification message if not exists
INSERT INTO public.system_settings (key, value)
VALUES ('verification_message_template', 'مرحباً {{name}}،\nكود تفعيل حسابك في تطبيق مكتب المحامي هو: *{{code}}*\nيرجى إدخال هذا الكود في التطبيق لتأكيد رقم هاتفك.')
ON CONFLICT (key) DO NOTHING;


-- 3. CONSTRAINTS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_id_fkey') THEN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_mobile_number_key') THEN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_mobile_number_key UNIQUE (mobile_number); END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assistants_user_id_fkey') THEN
        ALTER TABLE public.assistants ADD CONSTRAINT assistants_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assistants_user_id_name_key') THEN
        ALTER TABLE public.assistants ADD CONSTRAINT assistants_user_id_name_key UNIQUE (user_id, name); END IF;
        
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_user_id_fkey') THEN
        ALTER TABLE public.clients ADD CONSTRAINT clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cases_user_id_fkey') THEN
        ALTER TABLE public.cases ADD CONSTRAINT cases_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cases_client_id_fkey') THEN
        ALTER TABLE public.cases ADD CONSTRAINT cases_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stages_user_id_fkey') THEN
        ALTER TABLE public.stages ADD CONSTRAINT stages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stages_case_id_fkey') THEN
        ALTER TABLE public.stages ADD CONSTRAINT stages_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_fkey') THEN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_stage_id_fkey') THEN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE CASCADE; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_tasks_user_id_fkey') THEN
        ALTER TABLE public.admin_tasks ADD CONSTRAINT admin_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;
        
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_user_id_fkey') THEN
        ALTER TABLE public.appointments ADD CONSTRAINT appointments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;
        
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounting_entries_user_id_fkey') THEN
        ALTER TABLE public.accounting_entries ADD CONSTRAINT accounting_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_user_id_fkey') THEN
        ALTER TABLE public.invoices ADD CONSTRAINT invoices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_client_id_fkey') THEN
        ALTER TABLE public.invoices ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_case_id_fkey') THEN
        ALTER TABLE public.invoices ADD CONSTRAINT invoices_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE SET NULL; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_user_id_fkey') THEN
        ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_invoice_id_fkey') THEN
        ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE; END IF;
        
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_finances_user_id_fkey') THEN
        ALTER TABLE public.site_finances ADD CONSTRAINT site_finances_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL; END IF;
        
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_documents_user_id_fkey') THEN
        ALTER TABLE public.case_documents ADD CONSTRAINT case_documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_documents_case_id_fkey') THEN
        ALTER TABLE public.case_documents ADD CONSTRAINT case_documents_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE; END IF;
END $$;


-- 4. SECURITY: RLS POLICIES
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT 'DROP POLICY IF EXISTS "' || policyname || '" ON public.' || tablename || ';' as statement FROM pg_policies WHERE schemaname = 'public') LOOP
        EXECUTE r.statement;
    END LOOP;
END$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_finances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Profiles Table Policies
CREATE POLICY "Users can view their own profile." ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles." ON public.profiles FOR SELECT
  USING (public.is_admin());
  
CREATE POLICY "Users can manage their own profile." ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can manage all profiles." ON public.profiles FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- System Settings Policies (Admin Only for write, Admin for read - users don't need to read this directly usually)
CREATE POLICY "Admins can manage system settings" ON public.system_settings FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- RLS policies for all other user-specific tables.
DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'assistants', 'clients', 'cases', 'stages', 'sessions', 
        'admin_tasks', 'appointments', 'accounting_entries', 
        'invoices', 'invoice_items', 'case_documents', 'site_finances'
    ]
    LOOP
        EXECUTE format('
            CREATE POLICY "Users can view their own data" ON public.%I FOR SELECT
            USING (auth.uid() = user_id);
        ', table_name);

        EXECUTE format('
            CREATE POLICY "Users can insert their own data" ON public.%I FOR INSERT
            WITH CHECK (auth.uid() = user_id);
        ', table_name);

        EXECUTE format('
            CREATE POLICY "Users can update their own data" ON public.%I FOR UPDATE
            USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
        ', table_name);

        EXECUTE format('
            CREATE POLICY "Users can delete their own data" ON public.%I FOR DELETE
            USING (auth.uid() = user_id);
        ', table_name);

        EXECUTE format('
            CREATE POLICY "Admins can manage all data" ON public.%I FOR ALL
            USING (public.is_admin())
            WITH CHECK (public.is_admin());
        ', table_name);
    END LOOP;
END$$;


-- 5. REALTIME
DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'profiles', 'assistants', 'clients', 'cases', 'stages', 'sessions', 
        'admin_tasks', 'appointments', 'accounting_entries', 'invoices', 
        'invoice_items', 'site_finances', 'case_documents', 'system_settings'
    ]
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND tablename = table_name AND schemaname = 'public'
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', table_name);
        END IF;
    END LOOP;
END$$;

-- 6. PERMISSIONS
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- 7. ADMIN ACCOUNT
DO $$
DECLARE
    admin_phone_local TEXT := '0987654321';
    admin_phone_no_plus TEXT := '963' || RIGHT(admin_phone_local, 9);
    admin_email TEXT := 'sy' || admin_phone_no_plus || '@email.com';
    admin_password TEXT := 'changeme123';
    admin_full_name TEXT := 'المدير العام';
    admin_user_id uuid;
BEGIN
    SELECT id INTO admin_user_id FROM auth.users WHERE email = admin_email;

    IF admin_user_id IS NULL THEN
        INSERT INTO auth.users(id, email, encrypted_password, raw_user_meta_data, email_confirmed_at, aud, role)
        VALUES (
            gen_random_uuid(),
            admin_email,
            crypt(admin_password, gen_salt('bf')),
            jsonb_build_object('full_name', admin_full_name, 'mobile_number', admin_phone_local),
            now(),
            'authenticated',
            'authenticated'
        ) RETURNING id INTO admin_user_id;
    END IF;

    INSERT INTO public.profiles (id, full_name, mobile_number, role, is_approved, is_active, subscription_start_date, subscription_end_date)
    VALUES (
        admin_user_id,
        admin_full_name,
        admin_phone_local,
        'admin',
        true,
        true,
        '2024-01-01',
        '2999-12-31'
    )
    ON CONFLICT (id) DO UPDATE SET
        role = EXCLUDED.role,
        is_approved = EXCLUDED.is_approved,
        is_active = EXCLUDED.is_active,
        subscription_start_date = EXCLUDED.subscription_start_date,
        subscription_end_date = EXCLUDED.subscription_end_date,
        full_name = EXCLUDED.full_name,
        mobile_number = EXCLUDED.mobile_number;
END $$;

NOTIFY pgrst, 'reload schema';
`;

const realtimeScript = `
-- =================================================================
-- سكربت تفعيل المزامنة الفورية (Real-time)
-- =================================================================
-- هذا السكربت يقوم بتفعيل خاصية المزامنة الفورية لجميع جداول البيانات.
-- هذا السكربت آمن للتشغيل عدة مرات، سيقوم فقط بإضافة الجداول غير الموجودة في المزامنة.

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'profiles', 'assistants', 'clients', 'cases', 'stages', 'sessions', 
        'admin_tasks', 'appointments', 'accounting_entries', 'invoices', 
        'invoice_items', 'site_finances', 'case_documents', 'system_settings'
    ]
    LOOP
        -- Add the table to the publication only if it's not already there
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND tablename = table_name AND schemaname = 'public'
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', table_name);
        END IF;
    END LOOP;
END$$;
`;

const repairScript = `
-- =================================================================
-- سكربت إصلاح أخطاء (الإصدار 58) - Force Verification & RPC
-- =================================================================
-- هذا السكربت يضمن وجود جداول النظام، عمود الكود، ودالة التحقق RPC.

-- 1. Ensure verification_code column exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_code text;

-- 2. Update the trigger function to force verification code generation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    raw_mobile TEXT;
    normalized_mobile TEXT;
    v_code TEXT;
BEGIN
    raw_mobile := new.raw_user_meta_data->>'mobile_number';
    v_code := new.raw_user_meta_data->>'verification_code';

    -- Normalize mobile
    IF raw_mobile IS NOT NULL AND raw_mobile != '' THEN
        IF raw_mobile LIKE '+%' THEN
             normalized_mobile := raw_mobile; 
        ELSE
             normalized_mobile := '0' || RIGHT(regexp_replace(raw_mobile, '\\D', '', 'g'), 9);
        END IF;
    ELSE
        normalized_mobile := '0' || regexp_replace(new.email, '^sy963|@email\\.com$', '', 'g');
    END IF;

    -- FORCE CODE GENERATION if missing
    IF v_code IS NULL OR v_code = '' OR v_code = 'null' THEN
        v_code := floor(random() * 899999 + 100000)::text;
    END IF;

    INSERT INTO public.profiles (id, full_name, mobile_number, verification_code, created_at)
    VALUES (
      new.id,
      new.raw_user_meta_data->>'full_name',
      normalized_mobile,
      v_code,
      new.created_at
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      mobile_number = EXCLUDED.mobile_number,
      verification_code = EXCLUDED.verification_code,
      created_at = EXCLUDED.created_at;

    UPDATE auth.users SET email_confirmed_at = NOW() WHERE id = new.id;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- 3. Define verify_account RPC function (Critical for Code Verification)
CREATE OR REPLACE FUNCTION public.verify_account(code_input text)
RETURNS boolean AS $$
DECLARE
    target_code text;
BEGIN
    SELECT verification_code INTO target_code FROM public.profiles WHERE id = auth.uid();
    
    IF target_code IS NOT NULL AND target_code = code_input THEN
        -- Clear the code to mark as verified
        UPDATE public.profiles 
        SET verification_code = NULL 
        WHERE id = auth.uid();
        RETURN true;
    ELSE
        RETURN false;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;
GRANT EXECUTE ON FUNCTION public.verify_account(text) TO authenticated;

-- 4. Fix existing users who are stuck (Unapproved but have no code)
UPDATE public.profiles
SET verification_code = floor(random() * 899999 + 100000)::text
WHERE is_approved = false AND (verification_code IS NULL OR verification_code = '');

-- 5. Create System Settings table if not exists
CREATE TABLE IF NOT EXISTS public.system_settings (key text NOT NULL PRIMARY KEY);
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS value text;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 6. Insert Default Template SAFELY
INSERT INTO public.system_settings (key, value)
VALUES ('verification_message_template', 'مرحباً {{name}}،\nكود تفعيل حسابك في تطبيق مكتب المحامي هو: *{{code}}*\nيرجى إدخال هذا الكود في التطبيق لتأكيد رقم هاتفك.')
ON CONFLICT (key) DO NOTHING;

-- 7. RLS for System Settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage system settings" ON public.system_settings;
CREATE POLICY "Admins can manage system settings" ON public.system_settings FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 8. GRANT PERMISSIONS
GRANT ALL ON public.system_settings TO anon, authenticated;

-- Force reload
NOTIFY pgrst, 'reload schema';
`;

const ScriptDisplay: React.FC<{ script: string }> = ({ script }) => {
    const [copied, setCopied] = React.useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(script.trim()).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="relative bg-gray-800 text-white p-4 rounded-md max-h-[40vh] overflow-y-auto">
            <pre className="text-sm whitespace-pre-wrap">
                <code>{script.trim()}</code>
            </pre>
            <button
                onClick={handleCopy}
                className="sticky bottom-2 right-2 flex items-center gap-2 px-3 py-1 bg-gray-600 text-white text-xs rounded-md hover:bg-gray-500"
            >
                {copied ? <ClipboardDocumentCheckIcon className="w-4 h-4 text-green-400"/> : <ClipboardDocumentIcon className="w-4 h-4"/>}
                {copied ? 'تم النسخ' : 'نسخ السكربت'}
            </button>
        </div>
    );
}

const ConfigurationModal: React.FC<{ onRetry: () => void }> = ({ onRetry }) => {
    const [view, setView] = React.useState<'setup' | 'storage' | 'realtime' | 'repair'>('setup');

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4" dir="rtl">
            <div className="w-full max-w-4xl p-8 space-y-6 bg-white rounded-lg shadow-md">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-gray-800">إعداد قاعدة البيانات</h1>
                     <p className="mt-2 text-gray-600">
                        {view === 'setup' && "يبدو أن قاعدة البيانات غير مهيأة. يرجى اتباع الخطوات التالية لإعداد التطبيق."}
                        {view === 'storage' && "لتمكين مزامنة الوثائق، يجب إعداد مساحة التخزين السحابية (Storage)."}
                        {view === 'realtime' && "استخدم هذا القسم لتفعيل المزامنة الفورية إذا توقفت عن العمل."}
                        {view === 'repair' && "إذا واجهت أخطاء، قد تحتاج لتشغيل سكربت الإصلاح."}
                    </p>
                </div>

                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
                        <button onClick={() => setView('setup')} className={`${view === 'setup' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>الإعداد الكامل</button>
                        <button onClick={() => setView('storage')} className={`${view === 'storage' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>إعداد التخزين</button>
                        <button onClick={() => setView('realtime')} className={`${view === 'realtime' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>المزامنة الفورية</button>
                        <button onClick={() => setView('repair')} className={`${view === 'repair' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>إصلاح الأخطاء</button>
                    </nav>
                </div>

                {view === 'setup' && (
                    <div className="space-y-4 animate-fade-in">
                        <p className="text-sm text-gray-600">السكربت التالي سيقوم بإعداد الجداول والصلاحيات وتفعيل المزامنة الفورية. <strong className="text-red-600">هام:</strong> يجب تعديل بيانات المدير داخل السكربت قبل تشغيله.</p>
                        <ScriptDisplay script={unifiedScript} />
                        <ol className="list-decimal list-inside space-y-2 text-gray-700">
                            <li>اذهب إلى <strong className="font-semibold">SQL Editor</strong> في لوحة تحكم Supabase.</li>
                            <li>الصق السكربت، عدّل بيانات المدير، ثم اضغط <strong className="font-semibold text-green-600">RUN</strong>.</li>
                            <li><strong className="text-red-600">بعد النجاح، انتقل إلى تبويب "إعداد التخزين" لإكمال الإعداد.</strong></li>
                        </ol>
                    </div>
                )}
                
                {view === 'storage' && (
                    <div className="space-y-4 animate-fade-in">
                        <h2 className="text-xl font-semibold">إعداد مساحة التخزين (Storage) لمزامنة الوثائق</h2>
                         <ol className="list-decimal list-inside space-y-3 text-gray-700">
                            <li>من لوحة تحكم Supabase، اذهب إلى <strong className="font-semibold">Storage</strong>.</li>
                            <li>اضغط على <strong className="font-semibold">Create a new bucket</strong>.</li>
                            <li>أدخل اسم الحاوية (Bucket name): <code className="bg-gray-200 p-1 rounded">documents</code></li>
                            <li><strong className="text-red-600">ألغِ</strong> تحديد خيار <strong className="font-semibold">Public bucket</strong>.</li>
                            <li>اضغط <strong className="font-semibold">Create bucket</strong>.</li>
                            <li>بعد إنشاء الحاوية، اذهب إلى <strong className="font-semibold">Policies</strong>.</li>
                            <li>اضغط <strong className="font-semibold">New Policy</strong> واختر <strong className="font-semibold">"Create a policy from scratch"</strong>.</li>
                            <li>أنشئ 4 سياسات منفصلة (واحدة لكل عملية) للسماح للمستخدمين بقراءة جميع الملفات وإدارة ملفاتهم فقط.</li>
                        </ol>
                        <div className="space-y-4">
                            <div className="p-4 bg-gray-50 border rounded-lg">
                                <p className="font-semibold">1. سياسة عرض الملفات (SELECT):</p>
                                <ul className="list-disc list-inside mt-2 text-sm space-y-1">
                                    <li><strong>Policy Name:</strong> <code className="bg-gray-200 p-1 rounded text-xs">Allow authenticated read access</code></li>
                                    <li><strong>Allowed operation:</strong> <code className="bg-gray-200 p-1 rounded text-xs">SELECT</code></li>
                                    <li><strong>Target roles:</strong> <code className="bg-gray-200 p-1 rounded text-xs">authenticated</code></li>
                                    <li><strong>USING expression (انسخ والصق):</strong></li>
                                </ul>
                                <ScriptDisplay script={`(bucket_id = 'documents')`} />
                            </div>
                             <div className="p-4 bg-gray-50 border rounded-lg">
                                <p className="font-semibold">2. سياسة إضافة وتعديل وحذف الملفات (INSERT, UPDATE, DELETE):</p>
                                <p className="text-sm text-gray-600">أنشئ 3 سياسات منفصلة لهذه العمليات الثلاث، واستخدم نفس الإعدادات التالية في كل منها (غيّر فقط اسم السياسة والعملية المسموحة).</p>
                                <ul className="list-disc list-inside mt-2 text-sm space-y-1">
                                     <li><strong>Policy Name:</strong> اسم وصفي (مثال: <code className="bg-gray-200 p-1 rounded text-xs">Allow user insert own files</code>)</li>
                                    <li><strong>Allowed operation:</strong> اختر العملية (<code className="bg-gray-200 p-1 rounded text-xs">INSERT</code> أو <code className="bg-gray-200 p-1 rounded text-xs">UPDATE</code> أو <code className="bg-gray-200 p-1 rounded text-xs">DELETE</code>)</li>
                                    <li><strong>Target roles:</strong> <code className="bg-gray-200 p-1 rounded text-xs">authenticated</code></li>
                                    <li><strong>USING expression / WITH CHECK expression (انسخ والصق):</strong></li>
                                </ul>
                                <ScriptDisplay script={`(bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1])`} />
                            </div>
                        </div>
                    </div>
                )}

                {view === 'repair' && ( 
                    <div className="space-y-4 animate-fade-in"> 
                        <h2 className="text-xl font-semibold">إصلاح أخطاء شائعة</h2> 
                        <div className="p-4 bg-yellow-50 border-l-4 border-yellow-500 text-yellow-800">
                            <strong>هام:</strong> إذا واجهت خطأ "Could not find the function verify_account" أو مشاكل في تأكيد الحساب، قم بتشغيل هذا السكربت.
                        </div>
                        <p className="text-sm text-gray-600"> 
                            انسخ وشغّل السكربت التالي في <strong className="font-semibold">SQL Editor</strong> الخاص بـ Supabase.
                        </p> 
                        <ScriptDisplay script={repairScript} /> 
                    </div> 
                )}
                
                {view === 'realtime' && ( <div className="space-y-4 animate-fade-in"> <h2 className="text-xl font-semibold">تفعيل المزامنة الفورية (Real-time)</h2> <p className="text-sm text-gray-600"> إذا لم تعمل ميزة التحديث الفوري بين المستخدمين، قد تحتاج إلى تشغيل هذا السكربت يدوياً. </p> <ScriptDisplay script={realtimeScript} /> </div> )}

                <div className="text-center border-t pt-6">
                    <p className="text-gray-600 mb-4">بعد التأكد من نجاح تنفيذ الخطوات، اضغط على الزر أدناه لإعادة محاولة الاتصال.</p>
                    <button onClick={onRetry} className="px-8 py-3 text-white bg-blue-600 rounded-lg hover:bg-blue-700 font-semibold">إعادة المحاولة</button>
                </div>
            </div>
        </div>
    );
};

export default ConfigurationModal;
