import * as React from 'react';
import { User } from '@supabase/supabase-js';
import { AppData, checkSupabaseSchema, fetchDataFromSupabase, upsertDataToSupabase, FlatData, deleteDataFromSupabase, transformRemoteToLocal } from './useOnlineData';
import { getSupabaseClient } from '../supabaseClient';
import { Client, Case, Stage, Session } from '../types';
import { DeletedIds } from './useSupabaseData';

export type SyncStatus = 'loading' | 'syncing' | 'synced' | 'error' | 'unconfigured' | 'uninitialized';

interface UseSyncProps {
    user: User | null;
    localData: AppData;
    deletedIds: DeletedIds;
    onDataSynced: (mergedData: AppData) => void;
    onDeletionsSynced: (syncedDeletions: Partial<DeletedIds>) => void;
    onSyncStatusChange: (status: SyncStatus, error: string | null) => void;
    isOnline: boolean;
    isAuthLoading: boolean;
}

// Flattens the nested client data structure into separate arrays for each entity type.
const flattenData = (data: AppData): FlatData => {
    const cases = data.clients.flatMap(c => c.cases.map(cs => ({ ...cs, client_id: c.id })));
    const stages = cases.flatMap(cs => cs.stages.map(st => ({ ...st, case_id: cs.id })));
    const sessions = stages.flatMap(st => st.sessions.map(s => ({ ...s, stage_id: st.id })));
    const invoice_items = data.invoices.flatMap(inv => inv.items.map(item => ({ ...item, invoice_id: inv.id })));

    return {
        clients: data.clients.map(({ cases, ...client }) => client),
        cases: cases.map(({ stages, ...caseItem }) => caseItem),
        stages: stages.map(({ sessions, ...stage }) => stage),
        sessions,
        admin_tasks: data.adminTasks,
        appointments: data.appointments,
        accounting_entries: data.accountingEntries,
        assistants: data.assistants.map(name => ({ name })),
        invoices: data.invoices.map(({ items, ...inv }) => inv),
        invoice_items,
    };
};

// Reconstructs the nested client data structure from flat arrays.
const constructData = (flatData: Partial<FlatData>): AppData => {
    const sessionMap = new Map<string, Session[]>();
    (flatData.sessions || []).forEach(s => {
        const stageId = (s as any).stage_id;
        if (!sessionMap.has(stageId)) sessionMap.set(stageId, []);
        sessionMap.get(stageId)!.push(s as Session);
    });

    const stageMap = new Map<string, Stage[]>();
    (flatData.stages || []).forEach(st => {
        const stage = { ...st, sessions: sessionMap.get(st.id) || [] } as Stage;
        const caseId = (st as any).case_id;
        if (!stageMap.has(caseId)) stageMap.set(caseId, []);
        stageMap.get(caseId)!.push(stage);
    });

    const caseMap = new Map<string, Case[]>();
    (flatData.cases || []).forEach(cs => {
        const caseItem = { ...cs, stages: stageMap.get(cs.id) || [] } as Case;
        const clientId = (cs as any).client_id;
        if (!caseMap.has(clientId)) caseMap.set(clientId, []);
        caseMap.get(clientId)!.push(caseItem);
    });
    
    const invoiceItemMap = new Map<string, any[]>();
    (flatData.invoice_items || []).forEach(item => {
        const invoiceId = (item as any).invoice_id;
        if(!invoiceItemMap.has(invoiceId)) invoiceItemMap.set(invoiceId, []);
        invoiceItemMap.get(invoiceId)!.push(item);
    });

    return {
        clients: (flatData.clients || []).map(c => ({ ...c, cases: caseMap.get(c.id) || [] } as Client)),
        adminTasks: (flatData.admin_tasks || []) as any,
        appointments: (flatData.appointments || []) as any,
        accountingEntries: (flatData.accounting_entries || []) as any,
        assistants: (flatData.assistants || []).map(a => a.name),
        invoices: (flatData.invoices || []).map(inv => ({...inv, items: invoiceItemMap.get(inv.id) || []})) as any,
    };
};

/**
 * A merge strategy for one-way refresh operations (e.g., real-time updates).
 * This function treats the `remote` data as the source of truth for the existence of items.
 * An item existing locally but not remotely is considered deleted.
 * For items existing in both, the one with the later `updated_at` timestamp wins.
 */
const mergeForRefresh = <T extends { id: any; updated_at?: Date | string }>(local: T[], remote: T[]): T[] => {
    const localMap = new Map<any, T>();
    local.forEach(item => localMap.set(item.id, item));
    
    // The result will only contain items that exist in the remote data source.
    return remote.map(remoteItem => {
        const localItem = localMap.get(remoteItem.id);
        
        // If the item exists locally, compare timestamps to resolve conflicts.
        if (localItem) {
            const remoteDate = new Date(remoteItem.updated_at || 0);
            const localDate = new Date(localItem.updated_at || 0);
            // Keep the local item only if it's strictly newer than the remote one.
            // Otherwise, the remote version takes precedence (it's the source of truth).
            return localDate > remoteDate ? localItem : remoteItem;
        }
        
        // If the item doesn't exist locally, it's a new item from the server.
        return remoteItem;
    });
};


export const useSync = ({ user, localData, deletedIds, onDataSynced, onDeletionsSynced, onSyncStatusChange, isOnline, isAuthLoading }: UseSyncProps) => {
    const userRef = React.useRef(user);
    userRef.current = user;

    const setStatus = (status: SyncStatus, error: string | null = null) => {
        onSyncStatusChange(status, error);
    };

    const manualSync = React.useCallback(async (isInitialPull: boolean = false) => {
        if (isAuthLoading) {
            console.log("Sync deferred: Authentication in progress.");
            return;
        }
        const currentUser = userRef.current;
        if (!isOnline || !currentUser) {
            setStatus('error', isOnline ? 'يجب تسجيل الدخول للمزامنة.' : 'يجب أن تكون متصلاً بالإنترنت للمزامنة.');
            return;
        }
    
        setStatus('syncing', 'التحقق من الخادم...');
        const schemaCheck = await checkSupabaseSchema();
        if (!schemaCheck.success) {
            if (schemaCheck.error === 'unconfigured') setStatus('unconfigured');
            else if (schemaCheck.error === 'uninitialized') setStatus('uninitialized', `قاعدة البيانات غير مهيأة: ${schemaCheck.message}`);
            else setStatus('error', `فشل الاتصال: ${schemaCheck.message}`);
            return;
        }
    
        try {
            setStatus('syncing', 'جاري جلب البيانات من السحابة...');
            const remoteDataRaw = await fetchDataFromSupabase();
            const remoteFlatData = transformRemoteToLocal(remoteDataRaw);

            const isLocalEffectivelyEmpty = (
                localData.clients.length === 0 && 
                localData.adminTasks.length === 0 && 
                localData.appointments.length === 0 && 
                localData.accountingEntries.length === 0 && 
                localData.invoices.length === 0
            );

            const hasPendingDeletions = Object.values(deletedIds).some(arr => arr.length > 0);
            const isRemoteEffectivelyEmpty = remoteDataRaw.clients.length === 0 && remoteDataRaw.admin_tasks.length === 0;

            if (isInitialPull || (isLocalEffectivelyEmpty && !isRemoteEffectivelyEmpty && !hasPendingDeletions)) {
                if (!isInitialPull) {
                    console.warn("Safety Check Triggered: Local data is empty with no pending deletions, but remote is not. Aborting destructive sync and performing a safe refresh from remote instead.");
                } else {
                    console.log("Performing initial pull. Server is source of truth.");
                }
                const freshData = constructData(remoteFlatData);
                onDataSynced(freshData);
                setStatus('synced');
                return;
            }

            const localFlatData = flattenData(localData);
            
            const flatUpserts: Partial<FlatData> = {};
            const mergedFlatData: Partial<FlatData> = {};

            const deletedIdsSets = {
                clients: new Set(deletedIds.clients),
                cases: new Set(deletedIds.cases),
                stages: new Set(deletedIds.stages),
                sessions: new Set(deletedIds.sessions),
                adminTasks: new Set(deletedIds.adminTasks),
                appointments: new Set(deletedIds.appointments),
                accountingEntries: new Set(deletedIds.accountingEntries),
                invoices: new Set(deletedIds.invoices),
                invoiceItems: new Set(deletedIds.invoiceItems),
                assistants: new Set(deletedIds.assistants),
            };

            for (const key of Object.keys(localFlatData) as (keyof FlatData)[]) {
                const localItems = (localFlatData as any)[key] as any[];
                const remoteItems = (remoteFlatData as any)[key] as any[] || [];
                
                const localMap = new Map(localItems.map(i => [i.id ?? i.name, i]));
                const remoteMap = new Map(remoteItems.map(i => [i.id ?? i.name, i]));

                const finalMergedItems = new Map<string, any>();
                const itemsToUpsert: any[] = [];

                // 1. Process local items to find updates and new local items
                for (const localItem of localItems) {
                    const id = localItem.id ?? localItem.name;
                    const remoteItem = remoteMap.get(id);

                    if (remoteItem) {
                        const localDate = new Date(localItem.updated_at || 0).getTime();
                        const remoteDate = new Date(remoteItem.updated_at || 0).getTime();

                        if (localDate > remoteDate) {
                            itemsToUpsert.push(localItem);
                            finalMergedItems.set(id, localItem);
                        } else {
                            finalMergedItems.set(id, remoteItem);
                        }
                    } else {
                        itemsToUpsert.push(localItem);
                        finalMergedItems.set(id, localItem);
                    }
                }

                // 2. Process remote items to find new items from server, ignoring deleted ones
                for (const remoteItem of remoteItems) {
                    const id = remoteItem.id ?? remoteItem.name;
                    if (!localMap.has(id)) {
                        let isDeleted = false;
                        const entityKey = key === 'admin_tasks' ? 'adminTasks' : key === 'accounting_entries' ? 'accountingEntries' : key === 'invoice_items' ? 'invoiceItems' : key;
                        const deletedSet = (deletedIdsSets as any)[entityKey];
                        if (deletedSet) {
                           isDeleted = deletedSet.has(id);
                        }

                        if (!isDeleted) {
                            finalMergedItems.set(id, remoteItem);
                        }
                    }
                }
                
                (flatUpserts as any)[key] = itemsToUpsert;
                (mergedFlatData as any)[key] = Array.from(finalMergedItems.values());
            }
            
            const flatDeletes: FlatData = {
                clients: deletedIds.clients.map(id => ({ id })),
                cases: deletedIds.cases.map(id => ({ id })),
                stages: deletedIds.stages.map(id => ({ id })),
                sessions: deletedIds.sessions.map(id => ({ id })),
                admin_tasks: deletedIds.adminTasks.map(id => ({ id })),
                appointments: deletedIds.appointments.map(id => ({ id })),
                accounting_entries: deletedIds.accountingEntries.map(id => ({ id })),
                assistants: deletedIds.assistants.map(name => ({ name })),
                invoices: deletedIds.invoices.map(id => ({ id })),
                invoice_items: deletedIds.invoiceItems.map(id => ({ id })),
            } as any;

            if (Object.values(flatDeletes).some(arr => arr && arr.length > 0)) {
                setStatus('syncing', 'جاري حذف البيانات من السحابة...');
                await deleteDataFromSupabase(flatDeletes, currentUser);
                onDeletionsSynced(deletedIds);
            }

            setStatus('syncing', 'جاري رفع البيانات إلى السحابة...');
            const upsertedDataRaw = await upsertDataToSupabase(flatUpserts as FlatData, currentUser);
    
            // Transform the server response (snake_case) to local format (camelCase)
            const upsertedFlatData = transformRemoteToLocal(upsertedDataRaw);
            const upsertedDataMap = new Map();
            Object.values(upsertedFlatData).forEach(arr => 
                (arr as any[])?.forEach(item => upsertedDataMap.set(item.id ?? item.name, item))
            );

            // Update the optimistic merge result with the authoritative data from the server
            for (const key of Object.keys(mergedFlatData) as (keyof FlatData)[]) {
                const mergedItems = (mergedFlatData as any)[key];
                if (Array.isArray(mergedItems)) {
                    (mergedFlatData as any)[key] = mergedItems.map((item: any) => {
                        const upsertedVersion = upsertedDataMap.get(item.id ?? item.name);
                        return upsertedVersion || item;
                    });
                }
            }

            const finalMergedData = constructData(mergedFlatData as FlatData);
            onDataSynced(finalMergedData);
    
            setStatus('synced');
        } catch (err: any) {
            console.error("Error during sync:", err);
            let errorMessage = err.message || 'حدث خطأ غير متوقع.';
            const lowerErrorMessage = errorMessage.toLowerCase();

            // Check for common schema errors that can be fixed by the user running a script.
            if (
                (lowerErrorMessage.includes('column') && lowerErrorMessage.includes('does not exist')) ||
                lowerErrorMessage.includes('schema cache') ||
                (lowerErrorMessage.includes('relation') && lowerErrorMessage.includes('does not exist'))
            ) {
                setStatus('uninitialized', `هناك عدم تطابق في مخطط قاعدة البيانات: ${errorMessage}`);
                return; // Stop further execution and show the configuration modal
            }

            if (String(errorMessage).toLowerCase().includes('failed to fetch')) {
                errorMessage = 'فشل الاتصال بالخادم. تحقق من اتصالك بالإنترنت وإعدادات CORS.';
            } else if (err.table) {
                errorMessage = `[جدول: ${err.table}] ${errorMessage}`;
            }
            setStatus('error', `فشل المزامنة: ${errorMessage}`);
        }
    }, [localData, userRef, isOnline, onDataSynced, deletedIds, onDeletionsSynced, isAuthLoading]);

    const fetchAndRefresh = React.useCallback(async () => {
        if (isAuthLoading) {
            console.log("Refresh deferred: Authentication in progress.");
            return;
        }
        const currentUser = userRef.current;
        if (!isOnline || !currentUser) {
            return;
        }

        setStatus('syncing', 'جاري تحديث البيانات...');
        
        try {
            const remoteDataRaw = await fetchDataFromSupabase();
            const remoteFlatData = transformRemoteToLocal(remoteDataRaw) as FlatData;
            
            const localFlatData = flattenData(localData);
            
            const localAssistantNames = localFlatData.assistants.map(a => a.name);
            const remoteAssistantNames = remoteFlatData.assistants.map(a => a.name);
            const allAssistantNames = new Set([...localAssistantNames, ...remoteAssistantNames]);
            const mergedAssistants = Array.from(allAssistantNames).map(name => ({ name }));

            const mergedFlatData: FlatData = {
                clients: mergeForRefresh(localFlatData.clients, remoteFlatData.clients),
                cases: mergeForRefresh(localFlatData.cases, remoteFlatData.cases),
                stages: mergeForRefresh(localFlatData.stages, remoteFlatData.stages),
                sessions: mergeForRefresh(localFlatData.sessions, remoteFlatData.sessions),
                admin_tasks: mergeForRefresh(localFlatData.admin_tasks, remoteFlatData.admin_tasks),
                appointments: mergeForRefresh(localFlatData.appointments, remoteFlatData.appointments),
                accounting_entries: mergeForRefresh(localFlatData.accounting_entries, remoteFlatData.accounting_entries),
                assistants: mergedAssistants,
                invoices: mergeForRefresh(localFlatData.invoices, remoteFlatData.invoices),
                invoice_items: mergeForRefresh(localFlatData.invoice_items, remoteFlatData.invoice_items),
            };

            const mergedData = constructData(mergedFlatData);
            onDataSynced(mergedData);
            
            setStatus('synced');
        } catch (err: any) {
            console.error("Error during realtime refresh:", err);
            let errorMessage = err.message || 'حدث خطأ غير متوقع.';
            const lowerErrorMessage = errorMessage.toLowerCase();

            // Check for schema-related errors
            if (
                (lowerErrorMessage.includes('column') && lowerErrorMessage.includes('does not exist')) ||
                lowerErrorMessage.includes('schema cache') ||
                (lowerErrorMessage.includes('relation') && lowerErrorMessage.includes('does not exist'))
            ) {
                setStatus('uninitialized', `هناك عدم تطابق في مخطط قاعدة البيانات: ${errorMessage}`);
                return; // Stop further execution
            }

            if (String(errorMessage).toLowerCase().includes('failed to fetch')) {
                errorMessage = 'فشل الاتصال بالخادم. تحقق من اتصالك بالإنترنت وإعدادات CORS.';
            }
            setStatus('error', `فشل تحديث البيانات: ${errorMessage}`);
        }
    }, [localData, userRef, isOnline, onDataSynced, isAuthLoading]);


    return { manualSync, fetchAndRefresh };
};
