import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.44.4';

// Hardcoded Supabase credentials provided by the user.
const supabaseUrl = "https://qzpsmriupcfpwbsbcdwq.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6cHNtcml1cGNmcHdic2JjZHdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3OTgwMDUsImV4cCI6MjA3NjM3NDAwNX0.LItA3_LP0QQYBEPTdS1A3VGAnPnqdujOfEfQD-Oq_WU";

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