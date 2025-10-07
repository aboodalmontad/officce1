import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Hardcoded Supabase credentials provided by the user.
const supabaseUrl = "https://yygkmyuasneptvezkiha.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5Z2tteXVhc25lcHR2ZXpraWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1OTYzOTAsImV4cCI6MjA3NTE3MjM5MH0.2QgOMPXO2j2GGb6zoMVh_Jj-e3ML8L4ehEod-KJmVjA";

// Singleton instance of the Supabase client.
let supabase: SupabaseClient | null = null;

/**
 * Creates or retrieves a singleton Supabase client instance using hardcoded credentials.
 * @returns A Supabase client instance. Returns null if initialization fails.
 */
export function getSupabaseClient(): SupabaseClient | null {
    // If the client is already initialized, return it.
    if (supabase) {
        return supabase;
    }
    
    // If hardcoded credentials are not valid, return null.
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error("Supabase credentials are not defined in the code.");
        return null;
    }

    // Create a new client instance.
    try {
        supabase = createClient(supabaseUrl, supabaseAnonKey);
        return supabase;
    } catch (error) {
        console.error("Error creating Supabase client:", error);
        supabase = null; // Ensure supabase is null on failure
        return null;
    }
}
