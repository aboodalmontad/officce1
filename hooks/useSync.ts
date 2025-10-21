import * as React from 'react';
import { User } from '@supabase/supabase-js';
import { AppData, checkSupabaseSchema, fetchDataFromSupabase, uploadDataToSupabase } from './useOnlineData';
import { getSupabaseClient } from '../supabaseClient';

export type SyncStatus = 'loading' | 'syncing' | 'synced' | 'error' | 'offline' | 'unconfigured' | 'uninitialized';

interface UseSyncProps {
    user: User | null;
    currentData: AppData;
    onDataFetched: (fetchedData: any) => void;
    onSyncStatusChange: (status: SyncStatus, error: string | null) => void;
    onSyncSuccess: () => void;
    isOnline: boolean;
    offlineMode: boolean;
}

/**
 * A dedicated hook to manage the data synchronization lifecycle.
 * It orchestrates schema checks, data fetching, and data uploading,
 * reporting its status back to the parent hook via callbacks.
 */
export const useSync = ({
    user,
    currentData,
    onDataFetched,
    onSyncStatusChange,
    onSyncSuccess,
    isOnline,
    offlineMode,
}: UseSyncProps) => {
    const isSavingRef = React.useRef(false);
    const userRef = React.useRef(user);
    userRef.current = user;

    const setStatus = (status: SyncStatus, error: string | null = null) => {
        onSyncStatusChange(status, error);
    };

    const performCheckAndFetch = React.useCallback(async () => {
        if (offlineMode || !isOnline) {
            setStatus(offlineMode ? 'offline' : 'offline');
            return;
        }

        const schemaCheck = await checkSupabaseSchema();
        if (!schemaCheck.success) {
            if (schemaCheck.error === 'unconfigured') {
                setStatus('unconfigured');
            } else if (schemaCheck.error === 'uninitialized') {
                setStatus('uninitialized', `قاعدة البيانات غير مهيأة بالكامل. ${schemaCheck.message} يرجى تشغيل شيفرة التهيئة.`);
            } else if (schemaCheck.error === 'network') {
                setStatus('error', `فشل الاتصال بالخادم. ${schemaCheck.message}`);
            } else {
                setStatus('error', `خطأ في التحقق من قاعدة البيانات: ${schemaCheck.message}`);
            }
            return;
        }
        
        const currentUser = userRef.current;
        if (!currentUser) {
            onDataFetched(null);
            setStatus('synced');
            return;
        }

        setStatus('syncing');
        try {
            const remoteData = await fetchDataFromSupabase();
            onDataFetched(remoteData);
            onSyncSuccess();
            setStatus('synced');
        } catch (err: any) {
            console.error("Error fetching data from Supabase:", err);
            const message = String(err?.message || '').toLowerCase();
            if (message.includes('failed to fetch')) {
                 setStatus('error', 'فشل الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت وإعدادات CORS في لوحة تحكم Supabase.');
            } else {
                const errorMessage = err?.message ? String(err.message) : 'حدث خطأ غير معروف أثناء جلب البيانات.';
                setStatus('error', `خطأ في المزامنة: ${errorMessage}`);
            }
        }
    }, [userRef, isOnline, offlineMode, onDataFetched, onSyncSuccess]);

    const uploadData = React.useCallback(async () => {
        const currentUser = userRef.current;
        const supabase = getSupabaseClient();
        if (offlineMode || !isOnline || !supabase || !currentUser) {
            return false;
        }

        if (isSavingRef.current) return false;

        isSavingRef.current = true;
        setStatus('syncing');

        try {
            await uploadDataToSupabase(currentData, currentUser);
            onSyncSuccess();
            setStatus('synced');
            return true;
        } catch (err: any) {
            console.error("Error saving to Supabase:", err);
            let errorMessage = 'حدث خطأ غير معروف أثناء حفظ البيانات.';
            if (err && err.message) {
                errorMessage = err.message;
                if ((err as any).table) errorMessage = `[جدول: ${(err as any).table}] ${errorMessage}`;
                if ((err as any).details) errorMessage += ` | التفاصيل: ${(err as any).details}`;
                if ((err as any).hint) errorMessage += ` | تلميح: ${(err as any).hint}`;
            }
            setStatus('error', `فشل رفع البيانات: ${errorMessage}`);
            return false;
        } finally {
            isSavingRef.current = false;
        }
    }, [currentData, userRef, isOnline, offlineMode, onSyncSuccess]);

    const manualSync = React.useCallback(async () => {
        const uploadSuccessful = await uploadData();
        if (uploadSuccessful) {
            await performCheckAndFetch();
        }
    }, [uploadData, performCheckAndFetch]);

    React.useEffect(() => {
        performCheckAndFetch();
    }, [performCheckAndFetch]);

    return {
        forceSync: performCheckAndFetch,
        manualSync,
    };
};