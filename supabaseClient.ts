import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Key names for localStorage
const SUPABASE_URL_KEY = 'supabaseUrl';
const SUPABASE_ANON_KEY = 'supabaseAnonKey';

// Singleton instance variables
let supabase: SupabaseClient | null = null;
let currentUrl: string | null = null;
let currentKey: string | null = null;

/**
 * Creates or retrieves a singleton Supabase client instance.
 * @returns A Supabase client instance if credentials are set, otherwise null.
 */
export function getSupabaseClient(): SupabaseClient | null {
    // Prioritize credentials from localStorage
    let supabaseUrl = localStorage.getItem(SUPABASE_URL_KEY);
    let supabaseAnonKey = localStorage.getItem(SUPABASE_ANON_KEY);

    // If no credentials are found in local storage, invalidate and return null.
    if (!supabaseUrl || !supabaseAnonKey) {
        supabase = null;
        currentUrl = null;
        currentKey = null;
        return null;
    }

    // If the client doesn't exist or if credentials have changed, create a new one.
    if (!supabase || currentUrl !== supabaseUrl || currentKey !== supabaseAnonKey) {
        try {
            supabase = createClient(supabaseUrl, supabaseAnonKey);
            currentUrl = supabaseUrl;
            currentKey = supabaseAnonKey;
        } catch (error) {
            console.error("Error creating Supabase client:", error);
            supabase = null;
            return null;
        }
    }
    
    return supabase;
}


/**
 * Saves the user-provided credentials to localStorage and invalidates the current client instance.
 * @param url The Supabase project URL.
 * @param key The public anon key.
 */
export function setSupabaseCredentials(url: string, key: string): void {
    localStorage.setItem(SUPABASE_URL_KEY, url);
    localStorage.setItem(SUPABASE_ANON_KEY, key);
    // Invalidate the current client so a new one is created on the next getSupabaseClient() call
    supabase = null;
    currentUrl = null;
    currentKey = null;
}

/**
 * Checks for a configuration error message.
 * @returns An error string if not configured, otherwise null.
 */
export function getConfigurationError(): string | null {
  const supabaseUrl = localStorage.getItem(SUPABASE_URL_KEY);
  const supabaseAnonKey = localStorage.getItem(SUPABASE_ANON_KEY);
  if (!supabaseUrl || !supabaseAnonKey) {
    return "Supabase URL and Anon Key are not configured. The application will work offline but will not sync to the cloud. Please follow the instructions in the configuration modal to set them up.";
  }
  return null;
}


/**
 * Tests the connection to Supabase with the provided credentials.
 * @param url The Supabase project URL.
 * @param key The public anon key.
 * @returns An object indicating success or failure with a message.
 */
export async function testSupabaseConnection(url: string, key: string): Promise<{ success: boolean; message: string }> {
    try {
        const tempClient = createClient(url, key);
        // Attempt a very lightweight query to check the connection and credentials.
        const { error } = await tempClient.from('clients').select('id', { count: 'exact', head: true });

        if (error) {
            // Handle specific, common errors
            if (error.message.includes('JWT') || error.message.includes('Unauthorized')) {
                return { success: false, message: 'فشل المصادقة: مفتاح API العام (Anon Key) غير صالح. يرجى التحقق منه والمحاولة مرة أخرى.' };
            }
             if (error.code === '42P01') { // table does not exist
                return { success: true, message: 'تم الاتصال بنجاح. قاعدة البيانات جاهزة للتهيئة.' };
            }
            return { success: false, message: `حدث خطأ في Supabase: ${error.message}` };
        }
        
        return { success: true, message: 'تم الاتصال بنجاح!' };
    } catch (error: any) {
        // This often catches network errors, including CORS issues
        if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
             return {
                success: false,
                message: `فشل الاتصال بالخادم. هذه المشكلة غالباً ما تكون بسبب إعدادات CORS في Supabase. يرجى التأكد من إضافة نطاق هذا التطبيق إلى قائمة النطاقات المسموح بها.`
            };
        }
        return { success: false, message: `حدث خطأ غير متوقع في الشبكة: ${error.message}` };
    }
}