import * as React from 'react';
import { User } from '@supabase/supabase-js';
import { checkSupabaseSchema, fetchDataFromSupabase, upsertDataToSupabase, FlatData, deleteDataFromSupabase, transformRemoteToLocal } from './useOnlineData';
import { getSupabaseClient } from '../supabaseClient';
import { Client, Case, Stage, Session, CaseDocument } from '../types';
import { AppData, DeletedIds } from './useSupabaseData';

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
    syncStatus: SyncStatus;
}

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
        case_documents: data.documents,
    };
};

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
        documents: (flatData.case_documents || []) as any,
    };
};

const mergeForRefresh = <T extends { id: any; updated_at?: Date | string }>(local: T[], remote: T[]): T[] => {
    // This function is called by fetchAndRefresh. The `remote` array has already been
    // filtered to exclude any items that are pending local deletion.
    // Therefore, any item in `remote` that is not in `local` is a genuinely new item from another client.

    const finalItems = new Map<any, T>();

    // 1. Add all local items. This preserves any new, unsynced local items.
    for (const localItem of local) {
        finalItems.set(localItem.id ?? (localItem as any).name, localItem);
    }

    // 2. Iterate remote items. Update local items if the remote is newer, or add if it's new.
    for (const remoteItem of remote) {
        const id = remoteItem.id ?? (remoteItem as any).name;
        const existingItem = finalItems.get(id);

        if (existingItem) {
            // Item exists locally, compare timestamps and keep the newer one.
            const remoteDate = new Date(remoteItem.updated_at || 0);
            const localDate = new Date(existingItem.updated_at || 0);
            if (remoteDate > localDate) {
                finalItems.set(id, remoteItem);
            }
        } else {
            // Item does not exist locally, so it's a new item from the server. Add it.
            finalItems.set(id, remoteItem);
        }
    }

    return Array.from(finalItems.values());
};


export const useSync = ({ user, localData, deletedIds, onDataSynced, onDeletionsSynced, onSyncStatusChange, isOnline, isAuthLoading, syncStatus }: UseSyncProps) => {
    const userRef = React.useRef(user);
    userRef.current = user;

    const setStatus = (status: SyncStatus, error: string | null = null) => {
        onSyncStatusChange(status, error);
    };

    const manualSync = React.useCallback(async (isInitialPull: boolean = false) => {
        if (syncStatus === 'syncing') return;
        if (isAuthLoading) return;
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

            const isLocalEffectivelyEmpty = (localData.clients.length === 0 && localData.adminTasks.length === 0 && localData.appointments.length === 0 && localData.accountingEntries.length === 0 && localData.invoices.length === 0);
            const hasPendingDeletions = Object.values(deletedIds).some(arr => arr.length > 0);
            const isRemoteEffectivelyEmpty = remoteDataRaw.clients.length === 0 && remoteDataRaw.admin_tasks.length === 0;

            if (isInitialPull || (isLocalEffectivelyEmpty && !isRemoteEffectivelyEmpty && !hasPendingDeletions)) {
                const freshData = constructData(remoteFlatData);
                onDataSynced(freshData);
                setStatus('synced');
                return;
            }

            const localFlatData = flattenData(localData);
            
            const flatUpserts: Partial<FlatData> = {};
            const mergedFlatData: Partial<FlatData> = {};

            const deletedIdsSets = {
                clients: new Set(deletedIds.clients), cases: new Set(deletedIds.cases), stages: new Set(deletedIds.stages),
                sessions: new Set(deletedIds.sessions), adminTasks: new Set(deletedIds.adminTasks), appointments: new Set(deletedIds.appointments),
                accountingEntries: new Set(deletedIds.accountingEntries), invoices: new Set(deletedIds.invoices),
                invoiceItems: new Set(deletedIds.invoiceItems), assistants: new Set(deletedIds.assistants),
                case_documents: new Set(deletedIds.documents),
            };

            for (const key of Object.keys(localFlatData) as (keyof FlatData)[]) {
                const localItems = (localFlatData as any)[key] as any[];
                const remoteItems = (remoteFlatData as any)[key] as any[] || [];
                
                const localMap = new Map(localItems.map(i => [i.id ?? i.name, i]));
                const remoteMap = new Map(remoteItems.map(i => [i.id ?? i.name, i]));

                const finalMergedItems = new Map<string, any>();
                const itemsToUpsert: any[] = [];

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

                for (const remoteItem of remoteItems) {
                    const id = remoteItem.id ?? remoteItem.name;
                    if (!localMap.has(id)) {
                        let isDeleted = false;
                        const entityKey = key === 'admin_tasks' ? 'adminTasks' : key === 'accounting_entries' ? 'accountingEntries' : key === 'invoice_items' ? 'invoiceItems' : key === 'case_documents' ? 'documents' : key;
                        const deletedSet = (deletedIdsSets as any)[entityKey];
                        if (deletedSet) isDeleted = deletedSet.has(id);
                        if (!isDeleted) finalMergedItems.set(id, remoteItem);
                    }
                }
                (flatUpserts as any)[key] = itemsToUpsert;
                (mergedFlatData as any)[key] = Array.from(finalMergedItems.values());
            }

            if (deletedIds.documentPaths && deletedIds.documentPaths.length > 0) {
                setStatus('syncing', 'جاري حذف الملفات من السحابة...');
                const supabase = getSupabaseClient();
                if (supabase) {
                    const { error: storageError } = await supabase.storage.from('documents').remove(deletedIds.documentPaths);
                    if (storageError) console.warn('Failed to delete some files from storage, proceeding anyway.', storageError);
                    onDeletionsSynced({ documentPaths: deletedIds.documentPaths } as any);
                }
            }
            
            // Fix: Cast each array of IDs to 'any' to resolve type mismatch errors.
            // The downstream function `deleteDataFromSupabase` only needs the 'id' property,
            // so this is a safe way to bypass strict type checking.
            const flatDeletes: Partial<FlatData> = {
                clients: deletedIds.clients.map(id => ({ id })) as any,
                cases: deletedIds.cases.map(id => ({ id })) as any,
                stages: deletedIds.stages.map(id => ({ id })) as any,
                sessions: deletedIds.sessions.map(id => ({ id })) as any,
                admin_tasks: deletedIds.adminTasks.map(id => ({ id })) as any,
                appointments: deletedIds.appointments.map(id => ({ id })) as any,
                accounting_entries: deletedIds.accountingEntries.map(id => ({ id })) as any,
                assistants: deletedIds.assistants.map(name => ({ name })),
                invoices: deletedIds.invoices.map(id => ({ id })) as any,
                invoice_items: deletedIds.invoiceItems.map(id => ({ id })) as any,
                case_documents: deletedIds.documents.map(id => ({ id })) as any,
            };

            if (Object.values(flatDeletes).some(arr => arr && arr.length > 0)) {
                setStatus('syncing', 'جاري حذف البيانات من السحابة...');
                await deleteDataFromSupabase(flatDeletes, currentUser);
                onDeletionsSynced(deletedIds);
            }

            setStatus('syncing', 'جاري رفع البيانات إلى السحابة...');
            const upsertedDataRaw = await upsertDataToSupabase(flatUpserts as FlatData, currentUser);
            const upsertedFlatData = transformRemoteToLocal(upsertedDataRaw);
            const upsertedDataMap = new Map();
            Object.values(upsertedFlatData).forEach(arr => (arr as any[])?.forEach(item => upsertedDataMap.set(item.id ?? item.name, item)));

            for (const key of Object.keys(mergedFlatData) as (keyof FlatData)[]) {
                const mergedItems = (mergedFlatData as any)[key];
                if (Array.isArray(mergedItems)) (mergedFlatData as any)[key] = mergedItems.map((item: any) => upsertedDataMap.get(item.id ?? item.name) || item);
            }

            const finalMergedData = constructData(mergedFlatData as FlatData);
            onDataSynced(finalMergedData);
            setStatus('synced');
        } catch (err: any) {
            console.error("Error during sync:", err);
            let errorMessage = err.message || 'حدث خطأ غير متوقع.';
            const lowerErrorMessage = errorMessage.toLowerCase();
            if ((lowerErrorMessage.includes('column') && lowerErrorMessage.includes('does not exist')) || lowerErrorMessage.includes('schema cache') || (lowerErrorMessage.includes('relation') && lowerErrorMessage.includes('does not exist'))) {
                setStatus('uninitialized', `هناك عدم تطابق في مخطط قاعدة البيانات: ${errorMessage}`); return;
            }
            if (String(errorMessage).toLowerCase().includes('failed to fetch')) errorMessage = 'فشل الاتصال بالخادم. تحقق من اتصالك بالإنترنت وإعدادات CORS.';
            else if (err.table) errorMessage = `[جدول: ${err.table}] ${errorMessage}`;
            setStatus('error', `فشل المزامنة: ${errorMessage}`);
        }
    }, [localData, userRef, isOnline, onDataSynced, deletedIds, onDeletionsSynced, isAuthLoading, syncStatus]);

    const fetchAndRefresh = React.useCallback(async () => {
        if (syncStatus === 'syncing' || isAuthLoading) return;
        const currentUser = userRef.current;
        if (!isOnline || !currentUser) return;
    
        setStatus('syncing', 'جاري تحديث البيانات...');
        
        try {
            const remoteDataRaw = await fetchDataFromSupabase();
            const remoteFlatDataUntyped = transformRemoteToLocal(remoteDataRaw);
    
            // Filter remote data against pending deletions to prevent re-adding deleted items
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
                documents: new Set(deletedIds.documents),
            };
    
            const remoteFlatData: Partial<FlatData> = {};
            for (const key of Object.keys(remoteFlatDataUntyped) as (keyof FlatData)[]) {
                const entityKey = 
                    key === 'admin_tasks' ? 'adminTasks' :
                    key === 'accounting_entries' ? 'accountingEntries' :
                    key === 'invoice_items' ? 'invoiceItems' :
                    key === 'case_documents' ? 'documents' : key;
                
                const deletedSet = (deletedIdsSets as any)[entityKey];
                
                if (deletedSet && deletedSet.size > 0) {
                    (remoteFlatData as any)[key] = ((remoteFlatDataUntyped as any)[key] || []).filter((item: any) => !deletedSet.has(item.id ?? item.name));
                } else {
                    (remoteFlatData as any)[key] = (remoteFlatDataUntyped as any)[key];
                }
            }
    
            const localFlatData = flattenData(localData);
            
            const localAssistantNames = localFlatData.assistants.map(a => a.name);
            const remoteAssistantNames = (remoteFlatData.assistants || []).map(a => a.name);
            const allAssistantNames = new Set([...localAssistantNames, ...remoteAssistantNames]);
            const mergedAssistants = Array.from(allAssistantNames).map(name => ({ name }));
    
            const mergedFlatData: FlatData = {
                clients: mergeForRefresh(localFlatData.clients, remoteFlatData.clients || []),
                cases: mergeForRefresh(localFlatData.cases, remoteFlatData.cases || []),
                stages: mergeForRefresh(localFlatData.stages, remoteFlatData.stages || []),
                sessions: mergeForRefresh(localFlatData.sessions, remoteFlatData.sessions || []),
                admin_tasks: mergeForRefresh(localFlatData.admin_tasks, remoteFlatData.admin_tasks || []),
                appointments: mergeForRefresh(localFlatData.appointments, remoteFlatData.appointments || []),
                accounting_entries: mergeForRefresh(localFlatData.accounting_entries, remoteFlatData.accounting_entries || []),
                assistants: mergedAssistants,
                invoices: mergeForRefresh(localFlatData.invoices, remoteFlatData.invoices || []),
                invoice_items: mergeForRefresh(localFlatData.invoice_items, remoteFlatData.invoice_items || []),
                case_documents: mergeForRefresh(localFlatData.case_documents, remoteFlatData.case_documents || []),
            };
    
            const mergedData = constructData(mergedFlatData);
            onDataSynced(mergedData);
            setStatus('synced');
        } catch (err: any) {
            console.error("Error during realtime refresh:", err);
            let errorMessage = err.message || 'حدث خطأ غير متوقع.';
            const lowerErrorMessage = errorMessage.toLowerCase();
            if ((lowerErrorMessage.includes('column') && lowerErrorMessage.includes('does not exist')) || lowerErrorMessage.includes('schema cache') || (lowerErrorMessage.includes('relation') && lowerErrorMessage.includes('does not exist'))) {
                setStatus('uninitialized', `هناك عدم تطابق في مخطط قاعدة البيانات: ${errorMessage}`); return;
            }
            if (String(errorMessage).toLowerCase().includes('failed to fetch')) errorMessage = 'فشل الاتصال بالخادم. تحقق من اتصالك بالإنترنت وإعدادات CORS.';
            setStatus('error', `فشل تحديث البيانات: ${errorMessage}`);
        }
    }, [localData, deletedIds, userRef, isOnline, onDataSynced, isAuthLoading, syncStatus]);

    return { manualSync, fetchAndRefresh };
};