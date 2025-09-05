
import { useState, useCallback } from 'react';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export const useSync = () => {
    const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
    const [lastSync, setLastSync] = useState<Date | null>(() => {
        try {
            const saved = localStorage.getItem('lastSync');
            return saved ? new Date(saved) : null;
        } catch (error) {
            console.error("Failed to load last sync date from localStorage", error);
            return null;
        }
    });

    const triggerSync = useCallback(() => {
        setSyncStatus('syncing');
        // Simulate API call
        setTimeout(() => {
            // Simulate success/error randomly
            if (Math.random() > 0.2) { // 80% success rate
                const now = new Date();
                setLastSync(now);
                try {
                    localStorage.setItem('lastSync', now.toISOString());
                } catch (error) {
                    console.error("Failed to save last sync date to localStorage", error);
                }
                setSyncStatus('success');
            } else {
                setSyncStatus('error');
            }
            
            // Reset status after a few seconds
            setTimeout(() => setSyncStatus('idle'), 3000);
        }, 2000);
    }, []);

    return { syncStatus, lastSync, triggerSync };
};
