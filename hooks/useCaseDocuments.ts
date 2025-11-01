import * as React from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { CaseDocument } from '../types';
import { useOnlineStatus } from './useOnlineStatus';
import { getDb } from './useSupabaseData';
import { RealtimeChannel } from '@supabase/supabase-js';

const BUCKET_NAME = 'case-documents';
const DOCS_STORE_NAME = 'documents';

type StoredDocument = {
    metadata: CaseDocument;
    blob: Blob;
};

export const useCaseDocuments = (caseId: string) => {
    const [documents, setDocuments] = React.useState<CaseDocument[]>([]);
    const [loading, setLoading] = React.useState<boolean>(true);
    const [isSyncing, setIsSyncing] = React.useState<boolean>(false);
    const [error, setError] = React.useState<string | null>(null);
    const isOnline = useOnlineStatus();
    const supabase = getSupabaseClient();
    const dbPromise = React.useMemo(() => getDb(), []);
    
    // This ref manages blob URLs to prevent memory leaks.
    const blobUrlsRef = React.useRef<Map<string, string>>(new Map());
    React.useEffect(() => {
        const urls = blobUrlsRef.current;
        return () => {
            urls.forEach(url => URL.revokeObjectURL(url));
            urls.clear();
        };
    }, []);

    // Helper to create or get a blob URL for a document.
    const createDocWithBlobUrl = React.useCallback((storedDoc: StoredDocument): CaseDocument => {
        if (blobUrlsRef.current.has(storedDoc.metadata.id)) {
            return { ...storedDoc.metadata, publicUrl: blobUrlsRef.current.get(storedDoc.metadata.id) };
        }
        const url = URL.createObjectURL(storedDoc.blob);
        blobUrlsRef.current.set(storedDoc.metadata.id, url);
        return { ...storedDoc.metadata, publicUrl: url };
    }, []);
    
    // The core function to load and synchronize documents.
    const loadDocuments = React.useCallback(async (isInitialLoad = false) => {
        if (!caseId || !supabase) return;

        if (isInitialLoad) setLoading(true);
        setError(null);
        
        try {
            const db = await dbPromise;
            
            // 1. Load local documents first for instant UI response.
            const allDocs: StoredDocument[] = await db.getAll(DOCS_STORE_NAME);
            const caseDocsFromDb = allDocs.filter(doc => doc.metadata.case_id === caseId);
            
            const uiDocs = caseDocsFromDb
                .sort((a,b) => new Date(b.metadata.created_at).getTime() - new Date(a.metadata.created_at).getTime())
                .map(createDocWithBlobUrl);
            setDocuments(uiDocs);

            if (isInitialLoad) setLoading(false);

            // 2. If offline, we're done.
            if (!isOnline) {
                return;
            }

            // 3. If online, fetch remote metadata and reconcile.
            setIsSyncing(true);
            const { data: remoteMetadata, error: fetchError } = await supabase
                .from('case_documents').select('*').eq('case_id', caseId);
            if (fetchError) throw fetchError;
            
            const localIds = new Set(caseDocsFromDb.map(d => d.metadata.id));
            const remoteIds = new Set(remoteMetadata.map(d => d.id));

            // --- Reconciliation Logic ---
            let hasChanges = false;

            // a) Download new documents from remote.
            const downloadPromises = remoteMetadata
                .filter(doc => !localIds.has(doc.id))
                .map(async (doc) => {
                    console.log(`Downloading new document: ${doc.file_name}`);
                    const { data: blob, error: downloadError } = await supabase.storage.from(BUCKET_NAME).download(doc.file_path);
                    if (downloadError) throw downloadError;
                    if (blob) {
                        await db.put(DOCS_STORE_NAME, { metadata: doc, blob });
                        hasChanges = true;
                    }
                });

            // b) Delete local documents that no longer exist on remote.
            const deletePromises = caseDocsFromDb
                .filter(doc => !remoteIds.has(doc.metadata.id) && !doc.metadata.id.startsWith('local-'))
                .map(async (doc) => {
                    console.log(`Deleting stale local document: ${doc.metadata.file_name}`);
                    await db.delete(DOCS_STORE_NAME, doc.metadata.id);
                    hasChanges = true;
                });
            
            // c) Upload documents created while offline.
            const uploadPromises = caseDocsFromDb
                .filter(doc => doc.metadata.id.startsWith('local-'))
                .map(async (doc) => {
                    console.log(`Uploading offline document: ${doc.metadata.file_name}`);
                    const { error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(doc.metadata.file_path, doc.blob);
                    if (uploadError) throw uploadError;

                    const { id, publicUrl, ...rest } = doc.metadata;
                    const { data: insertedData, error: insertError } = await supabase
                        .from('case_documents').insert([rest]).select().single();
                    if (insertError) throw insertError;
                    
                    await db.delete(DOCS_STORE_NAME, doc.metadata.id);
                    await db.put(DOCS_STORE_NAME, { metadata: insertedData, blob: doc.blob });
                    hasChanges = true;
                });
            
            await Promise.all([...downloadPromises, ...deletePromises, ...uploadPromises]);

            // 4. If any changes occurred during sync, reload from DB to update UI.
            if (hasChanges) {
                const finalAllDocs: StoredDocument[] = await db.getAll(DOCS_STORE_NAME);
                const finalCaseDocs = finalAllDocs
                    .filter(doc => doc.metadata.case_id === caseId)
                    .sort((a,b) => new Date(b.metadata.created_at).getTime() - new Date(a.metadata.created_at).getTime())
                    .map(createDocWithBlobUrl);
                setDocuments(finalCaseDocs);
            }
        } catch (err: any) {
            console.error("Failed to load/sync documents:", err);
            setError(`فشل تحميل أو مزامنة الوثائق: ${err.message}`);
        } finally {
            if (isInitialLoad) setLoading(false);
            setIsSyncing(false);
        }
    }, [caseId, supabase, isOnline, dbPromise, createDocWithBlobUrl]);

    const loadDocumentsRef = React.useRef(loadDocuments);
    loadDocumentsRef.current = loadDocuments;

    React.useEffect(() => {
        loadDocumentsRef.current(true);
    }, [caseId]); 

    React.useEffect(() => {
        if (!caseId || !supabase) return;

        const channel = supabase
            .channel(`case-documents-channel-${caseId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'case_documents', filter: `case_id=eq.${caseId}` },
            (payload) => {
                console.log(`Real-time document change for case ${caseId}, reloading.`, payload);
                loadDocumentsRef.current(false);
            })
            .subscribe((status, err) => {
                 if (err) {
                    console.error(`Real-time subscription error for case ${caseId}:`, err);
                    setError('فشل الاتصال بمزامنة وثائق القضية.');
                }
            });
        
        return () => { 
            console.log(`Unsubscribing from document channel for case ${caseId}`);
            supabase.removeChannel(channel).catch(err => console.error('Failed to remove document channel', err)); 
        };
    }, [caseId, supabase]);

    const addDocuments = async (files: FileList) => {
        if (!files || files.length === 0 || !supabase) return;
        setError(null);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            setError("المستخدم غير مسجل. لا يمكن رفع الملفات.");
            return;
        }

        const newDocs: StoredDocument[] = Array.from(files).map(file => {
            const docId = `local-${crypto.randomUUID()}`;
            const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'bin';
            const safeFileName = `${crypto.randomUUID()}.${fileExtension}`;
            const metadata: CaseDocument = {
                id: docId, case_id: caseId, user_id: user.id, file_name: file.name,
                file_path: `${user.id}/${caseId}/${safeFileName}`, mime_type: file.type || 'application/octet-stream',
                created_at: new Date().toISOString(),
            };
            return { metadata, blob: file };
        });

        const db = await dbPromise;
        await Promise.all(newDocs.map(doc => db.put(DOCS_STORE_NAME, doc)));
        
        // Optimistically update UI
        setDocuments(prev => {
            const newUiDocs = newDocs.map(createDocWithBlobUrl);
            return [...newUiDocs, ...prev].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        });

        if (!isOnline) {
            setError("أنت غير متصل. تم حفظ الوثائق محلياً وستتم مزامنتها عند عودة الاتصال.");
            return;
        }

        // Trigger a non-initial load to handle the sync
        await loadDocuments(false);
    };

    const deleteDocument = async (doc: CaseDocument) => {
        if (!supabase) return;
        
        const originalDocuments = documents;
        setDocuments(prev => prev.filter(d => d.id !== doc.id));
        setError(null);

        const db = await dbPromise;
        await db.delete(DOCS_STORE_NAME, doc.id);

        if (!isOnline) {
             setError("أنت غير متصل. تم حذف الوثيقة محلياً وستتم المزامنة عند عودة الاتصال.");
             return;
        }

        try {
            if (!doc.id.startsWith('local-')) {
                const { error: dbError } = await supabase.from('case_documents').delete().eq('id', doc.id);
                if (dbError) throw dbError;
                const { error: storageError } = await supabase.storage.from(BUCKET_NAME).remove([doc.file_path]);
                if (storageError && storageError.message !== 'The resource was not found') throw storageError;
            }
        } catch (err: any) {
            console.error("Failed to delete document:", err);
            setError(`فشل حذف الوثيقة من الخادم: ${err.message}`);
            setDocuments(originalDocuments);
            await db.put(DOCS_STORE_NAME, { metadata: doc, blob: await (await fetch(doc.publicUrl!)).blob() });
        }
    };

    return { documents, loading, isSyncing, error, addDocuments, deleteDocument, isOnline };
};