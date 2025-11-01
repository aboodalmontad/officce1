import * as React from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { CaseDocument } from '../types';
import { useOnlineStatus } from './useOnlineStatus';
import { getDb } from './useSupabaseData';
import { IDBPDatabase } from 'idb';

const BUCKET_NAME = 'case-documents';
const DOCS_STORE_NAME = 'documents';

type StoredDocument = {
    metadata: CaseDocument;
    blob: Blob;
};

export const useCaseDocuments = (caseId: string) => {
    const [documents, setDocuments] = React.useState<CaseDocument[]>([]);
    const [loading, setLoading] = React.useState<boolean>(true);
    const [error, setError] = React.useState<string | null>(null);
    const isOnline = useOnlineStatus();
    const supabase = getSupabaseClient();
    const dbPromise = React.useMemo(() => getDb(), []);
    
    const blobUrlsRef = React.useRef<string[]>([]);
    React.useEffect(() => {
        const urls = blobUrlsRef.current;
        return () => {
            urls.forEach(url => URL.revokeObjectURL(url));
        };
    }, []);

    const createDocWithBlobUrl = React.useCallback((storedDoc: StoredDocument): CaseDocument => {
        const url = URL.createObjectURL(storedDoc.blob);
        blobUrlsRef.current.push(url);
        return { ...storedDoc.metadata, publicUrl: url };
    }, []);
    
    const loadDocuments = React.useCallback(async (isInitialLoad = false) => {
        if (!caseId || !supabase) return;

        if (isInitialLoad) setLoading(true);
        setError(null);
        
        try {
            const db = await dbPromise;
            const allDocs: StoredDocument[] = await db.getAll(DOCS_STORE_NAME);
            const caseDocsFromDb = allDocs.filter(doc => doc.metadata.case_id === caseId);
            
            blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
            blobUrlsRef.current = [];
            
            const uiDocs = caseDocsFromDb
                .sort((a,b) => new Date(b.metadata.created_at).getTime() - new Date(a.metadata.created_at).getTime())
                .map(createDocWithBlobUrl);
            setDocuments(uiDocs);

            if (isOnline) {
                const { data: remoteMetadata, error: fetchError } = await supabase
                    .from('case_documents')
                    .select('*')
                    .eq('case_id', caseId);
                if (fetchError) throw fetchError;
                
                const localIds = new Set(caseDocsFromDb.map(d => d.metadata.id));
                const remoteIds = new Set(remoteMetadata.map(d => d.id));

                const downloadPromises = remoteMetadata
                    .filter(doc => !localIds.has(doc.id))
                    .map(async (doc) => {
                        console.log(`Downloading new document: ${doc.file_name}`);
                        const { data: blob, error: downloadError } = await supabase.storage
                            .from(BUCKET_NAME)
                            .download(doc.file_path);
                        if (downloadError) throw downloadError;
                        if (blob) await db.put(DOCS_STORE_NAME, { metadata: doc, blob });
                    });

                const deletePromises = caseDocsFromDb
                    .filter(doc => !remoteIds.has(doc.metadata.id) && !doc.metadata.id.startsWith('local-'))
                    .map(async (doc) => {
                        console.log(`Deleting stale local document: ${doc.metadata.file_name}`);
                        await db.delete(DOCS_STORE_NAME, doc.metadata.id);
                    });
                
                const uploadPromises = caseDocsFromDb
                    .filter(doc => doc.metadata.id.startsWith('local-'))
                    .map(async (doc) => {
                        console.log(`Uploading offline document: ${doc.metadata.file_name}`);
                        const { error: uploadError } = await supabase.storage
                            .from(BUCKET_NAME)
                            .upload(doc.metadata.file_path, doc.blob);
                        if (uploadError) throw uploadError;

                        const { id, publicUrl, ...rest } = doc.metadata;
                        const metadataToInsert = {
                            case_id: rest.case_id,
                            user_id: rest.user_id,
                            file_name: rest.file_name,
                            file_path: rest.file_path,
                            mime_type: rest.mime_type,
                            created_at: rest.created_at,
                        };

                        const { data: insertedData, error: insertError } = await supabase
                            .from('case_documents')
                            .insert([metadataToInsert])
                            .select().single();
                        if (insertError) throw insertError;
                        
                        await db.delete(DOCS_STORE_NAME, doc.metadata.id);
                        await db.put(DOCS_STORE_NAME, { metadata: insertedData, blob: doc.blob });
                    });
                
                await Promise.all([...downloadPromises, ...deletePromises, ...uploadPromises]);

                if (downloadPromises.length > 0 || deletePromises.length > 0 || uploadPromises.length > 0) {
                    const finalAllDocs: StoredDocument[] = await db.getAll(DOCS_STORE_NAME);
                    const finalCaseDocs = finalAllDocs
                        .filter(doc => doc.metadata.case_id === caseId)
                        .sort((a,b) => new Date(b.metadata.created_at).getTime() - new Date(a.metadata.created_at).getTime())
                        .map(createDocWithBlobUrl);
                    setDocuments(finalCaseDocs);
                }
            }
        } catch (err: any) {
            console.error("Failed to load/sync documents:", err);
            const errorMessage = err.message || (typeof err === 'object' ? JSON.stringify(err) : 'حدث خطأ غير متوقع.');
            setError(`فشل تحميل أو مزامنة الوثائق: ${errorMessage}`);
        } finally {
            if (isInitialLoad) setLoading(false);
        }
    }, [caseId, supabase, isOnline, dbPromise, createDocWithBlobUrl]);

    React.useEffect(() => {
        loadDocuments(true);
    }, [loadDocuments]);

    React.useEffect(() => {
        if (!caseId || !supabase) return;
        const channel = supabase
            .channel(`case-documents-${caseId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'case_documents', filter: `case_id=eq.${caseId}` },
            (payload) => {
                console.log('Real-time document change received, reloading.', payload);
                loadDocuments(false);
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [caseId, supabase, loadDocuments]);

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
                id: docId,
                case_id: caseId,
                user_id: user.id,
                file_name: file.name,
                file_path: `${user.id}/${caseId}/${safeFileName}`,
                mime_type: file.type || 'application/octet-stream',
                created_at: new Date().toISOString(),
            };
            return { metadata, blob: file };
        });

        const db = await dbPromise;
        await Promise.all(newDocs.map(doc => db.put(DOCS_STORE_NAME, doc)));
        
        setDocuments(prev => {
            const newUiDocs = newDocs.map(createDocWithBlobUrl);
            return [...newUiDocs, ...prev].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        });

        if (!isOnline) {
            setError("أنت غير متصل. تم حفظ الوثائق محلياً وستتم مزامنتها عند عودة الاتصال.");
            return;
        }

        for (const doc of newDocs) {
            try {
                const { error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(doc.metadata.file_path, doc.blob);
                if (uploadError) throw uploadError;

                const { id: localId, publicUrl, ...rest } = doc.metadata;
                // Sanitize payload to ensure only valid columns are sent
                const metadataToInsert = {
                    case_id: rest.case_id,
                    user_id: rest.user_id,
                    file_name: rest.file_name,
                    file_path: rest.file_path,
                    mime_type: rest.mime_type,
                    created_at: rest.created_at,
                };
                const { data: insertedData, error: insertError } = await supabase.from('case_documents').insert([metadataToInsert]).select().single();
                if (insertError) throw insertError;
                
                await db.delete(DOCS_STORE_NAME, doc.metadata.id);
                await db.put(DOCS_STORE_NAME, { metadata: insertedData, blob: doc.blob });

                setDocuments(prev => prev.map(d => d.id === doc.metadata.id ? createDocWithBlobUrl({ metadata: insertedData, blob: doc.blob }) : d));

            } catch (err: any) {
                let displayError = 'حدث خطأ غير متوقع.';
                if (err && typeof err === 'object') {
                     if (err.message) {
                        displayError = err.message;
                    } else {
                        try { displayError = JSON.stringify(err); } catch { displayError = 'Failed to stringify error object.'; }
                    }
                } else if (err) {
                    displayError = String(err);
                }
                
                console.error(`Sync failed for ${doc.metadata.file_name}`, err);
                setError(`فشل مزامنة الملف "${doc.metadata.file_name}". سيبقى الملف محفوظاً محلياً. (السبب: ${displayError})`);
            }
        }
    };

    const deleteDocument = async (doc: CaseDocument) => {
        if (!supabase) {
            setError("لا يمكن الحذف، Supabase client غير متاح.");
            return;
        }
        
        // Optimistically remove from UI
        setDocuments(prev => prev.filter(d => d.id !== doc.id));
        setError(null);

        const db = await dbPromise;

        // If offline, just delete locally. Sync will handle it later.
        if (!isOnline) {
            await db.delete(DOCS_STORE_NAME, doc.id);
            setError("أنت غير متصل. تم حذف الوثيقة محلياً وستتم المزامنة عند عودة الاتصال.");
            return;
        }
        
        try {
            // Delete from Supabase DB first
            const { error: dbError } = await supabase.from('case_documents').delete().eq('id', doc.id);
            if (dbError) throw dbError;

            // Then delete from Supabase Storage
            const { error: storageError } = await supabase.storage.from(BUCKET_NAME).remove([doc.file_path]);
            // A 404 error here is okay, means the file wasn't there anyway.
            if (storageError && storageError.message !== 'The resource was not found') {
                console.warn("File deleted from DB but not from storage:", storageError);
            }
            
            // Finally, delete from local IndexedDB
            await db.delete(DOCS_STORE_NAME, doc.id);
        } catch (err: any) {
            console.error("Failed to delete document from Supabase:", err);
            let displayError = err.message || 'An unexpected error occurred.';
            setError(`فشل حذف الوثيقة من الخادم. سيتم استعادتها. (السبب: ${displayError})`);
            loadDocuments(); // Reload to restore the UI state
        }
    };

    return { documents, loading, error, addDocuments, deleteDocument, isOnline };
};
