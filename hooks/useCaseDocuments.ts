import * as React from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { CaseDocument } from '../types';
import { useOnlineStatus } from './useOnlineStatus';

const BUCKET_NAME = 'case-documents';

export const useCaseDocuments = (caseId: string) => {
  const [documents, setDocuments] = React.useState<CaseDocument[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const isOnline = useOnlineStatus();
  const supabase = getSupabaseClient();

  React.useEffect(() => {
    let isMounted = true;
    async function loadDocuments() {
      if (!caseId || !supabase) return;

      if (!isOnline) {
        setError("لا يمكن الوصول إلى الوثائق. يرجى التحقق من اتصالك بالإنترنت.");
        setLoading(false);
        setDocuments([]);
        return;
      }
      
      setLoading(true);
      setError(null);
      
      try {
        const { data: docMetadata, error: fetchError } = await supabase
          .from('case_documents')
          .select('*')
          .eq('case_id', caseId)
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;

        if (isMounted) {
            const docsWithUrls = await Promise.all(
                docMetadata.map(async (doc) => {
                    const { data, error: urlError } = await supabase.storage
                        .from(BUCKET_NAME)
                        .createSignedUrl(doc.file_path, 3600); // URL valid for 1 hour
                    if (urlError) {
                        console.error(`Failed to get signed URL for ${doc.file_name}:`, urlError);
                        return { ...doc, publicUrl: '' };
                    }
                    return { ...doc, publicUrl: data.signedUrl };
                })
            );
            setDocuments(docsWithUrls);
        }

      } catch (err: any) {
          console.error("Failed to load documents from Supabase:", err);
          if (isMounted) {
              setError("فشل تحميل الوثائق.");
          }
      } finally {
          if (isMounted) {
              setLoading(false);
          }
      }
    }
    loadDocuments();

    return () => { isMounted = false; }
  }, [caseId, supabase, isOnline]);

  const addDocuments = async (files: FileList) => {
    if (!files || files.length === 0 || !supabase || !isOnline) {
        if (!isOnline) setError("لا يمكن إضافة وثائق. يرجى التحقق من اتصالك بالإنترنت.");
        return;
    }
    
    setError(null);
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        setError("المستخدم غير مسجل. لا يمكن رفع الملفات.");
        setLoading(false);
        return;
    }

    const uploadPromises = Array.from(files).map(async (file) => {
      const filePath = `${user.id}/${caseId}/${Date.now()}-${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file);

      if (uploadError) {
        throw new Error(`فشل رفع الملف ${file.name}: ${uploadError.message}`);
      }

      const { error: insertError } = await supabase
        .from('case_documents')
        .insert({
          user_id: user.id,
          case_id: caseId,
          file_name: file.name,
          file_path: filePath,
          mime_type: file.type,
        });

      if (insertError) {
        // Attempt to clean up the orphaned file in storage.
        await supabase.storage.from(BUCKET_NAME).remove([filePath]);
        throw new Error(`فشل حفظ بيانات الملف ${file.name}: ${insertError.message}`);
      }
    });

    try {
        await Promise.all(uploadPromises);
        // Refetch to get the new list with signed URLs
        const { data: newDocs, error: refetchError } = await supabase
            .from('case_documents').select('*').eq('case_id', caseId).order('created_at', { ascending: false });
        if(refetchError) throw refetchError;
        
        const docsWithUrls = await Promise.all(
            newDocs.map(async (doc) => {
                const { data, error: urlError } = await supabase.storage.from(BUCKET_NAME).createSignedUrl(doc.file_path, 3600);
                return { ...doc, publicUrl: urlError ? '' : data.signedUrl };
            })
        );
        setDocuments(docsWithUrls);

    } catch (err: any) {
        console.error("Failed to add documents to Supabase:", err);
        setError(err.message || 'فشل إضافة وثيقة واحدة أو أكثر.');
    } finally {
        setLoading(false);
    }
  };

  const deleteDocument = async (doc: CaseDocument) => {
    if (!supabase || !isOnline) {
        if(!isOnline) setError("لا يمكن حذف الوثيقة. يرجى التحقق من اتصالك بالإنترنت.");
        return;
    }
    
    // Optimistically remove the document.
    setDocuments(prev => prev.filter(d => d.id !== doc.id));
    setError(null);

    try {
        const { error: storageError } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([doc.file_path]);

        if (storageError) throw new Error(`فشل حذف الملف من المخزن: ${storageError.message}`);
        
        const { error: dbError } = await supabase
            .from('case_documents')
            .delete()
            .eq('id', doc.id);

        if (dbError) throw new Error(`فشل حذف بيانات الملف: ${dbError.message}`);

    } catch (err: any) {
        console.error("Failed to delete document from Supabase:", err);
        // Revert on error by re-adding the document and re-sorting.
        setDocuments(prev => [...prev, doc].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
        setError('فشل حذف الوثيقة.');
    }
  };

  return { documents, loading, error, addDocuments, deleteDocument, isOnline };
};