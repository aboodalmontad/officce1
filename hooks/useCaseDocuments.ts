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

  const loadDocuments = React.useCallback(async (isInitialLoad = false) => {
      if (!caseId || !supabase) return;

      if (!isOnline) {
        setError("لا يمكن الوصول إلى الوثائق. يرجى التحقق من اتصالك بالإنترنت.");
        if (isInitialLoad) setLoading(false);
        setDocuments([]);
        return;
      }
      
      if (isInitialLoad) {
        setLoading(true);
      }
      setError(null);
      
      try {
        const { data: docMetadata, error: fetchError } = await supabase
          .from('case_documents')
          .select('*')
          .eq('case_id', caseId)
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;

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

      } catch (err: any) {
          console.error("Failed to load documents from Supabase:", err);
          setError("فشل تحميل الوثائق.");
      } finally {
          if (isInitialLoad) {
              setLoading(false);
          }
      }
  }, [caseId, supabase, isOnline]);

  // Initial data load
  React.useEffect(() => {
    loadDocuments(true);
  }, [loadDocuments]);

  // Real-time subscription for instant updates
  React.useEffect(() => {
    if (!caseId || !supabase || !isOnline) return;

    const channel = supabase
      .channel(`case-documents-${caseId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'case_documents',
          filter: `case_id=eq.${caseId}`
        },
        (payload) => {
          console.log('Real-time change received for documents, reloading.', payload);
          // Refetch documents to get updated list with new signed URLs
          loadDocuments(false); // Pass false to avoid showing the main loading spinner on updates
        }
      )
      .subscribe();

    // Cleanup subscription on component unmount or when caseId changes
    return () => {
      supabase.removeChannel(channel);
    };
  }, [caseId, supabase, isOnline, loadDocuments]);


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
        // Data will be updated automatically by the real-time subscription,
        // so no manual refetch is needed here.
    } catch (err: any) {
        console.error("Failed to add documents to Supabase:", err);
        setError(err.message || 'فشل إضافة وثيقة واحدة أو أكثر.');
        // On failure, manually trigger a reload to ensure UI consistency
        loadDocuments(false);
    } finally {
        // The loading state is managed by the subscription's refetch, but we'll stop it here for quicker feedback.
        setLoading(false);
    }
  };

  const deleteDocument = async (doc: CaseDocument) => {
    if (!supabase || !isOnline) {
        if(!isOnline) setError("لا يمكن حذف الوثيقة. يرجى التحقق من اتصالك بالإنترنت.");
        return;
    }
    
    // Optimistically remove the document for instant UI feedback.
    setDocuments(prev => prev.filter(d => d.id !== doc.id));
    setError(null);

    try {
        const { error: storageError } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([doc.file_path]);

        // If storage deletion fails, we should stop and revert.
        if (storageError) throw new Error(`فشل حذف الملف من المخزن: ${storageError.message}`);
        
        // Deleting from the database will trigger the real-time subscription,
        // which will then update the state for all clients.
        const { error: dbError } = await supabase
            .from('case_documents')
            .delete()
            .eq('id', doc.id);

        if (dbError) throw new Error(`فشل حذف بيانات الملف: ${dbError.message}`);

    } catch (err: any) {
        console.error("Failed to delete document from Supabase:", err);
        setError('فشل حذف الوثيقة.');
        // On failure, manually trigger a reload to revert the optimistic update and ensure UI consistency.
        loadDocuments(false);
    }
  };

  return { documents, loading, error, addDocuments, deleteDocument, isOnline };
};
