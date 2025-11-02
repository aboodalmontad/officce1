import * as React from 'react';
import { openDB, IDBPDatabase } from 'idb';

export interface DocumentRecord {
  id: string;
  caseId: string;
  file: File;
  name: string;
  type: string;
  addedAt: Date;
}

const DB_NAME = 'LawyerAppLocalDB';
const DB_VERSION = 1;
const STORE_NAME = 'caseDocuments';

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('caseId', 'caseId');
      }
    },
  });
}

export const useCaseDocuments = (caseId: string) => {
  const [documents, setDocuments] = React.useState<DocumentRecord[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let isMounted = true;
    async function loadDocuments() {
      if (!caseId) return;
      setLoading(true);
      setError(null);
      try {
        const db = await getDb();
        const caseDocs = await db.getAllFromIndex(STORE_NAME, 'caseId', caseId);
        // Sort by newest first
        caseDocs.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
        if (isMounted) {
            setDocuments(caseDocs);
        }
      } catch (error) {
          console.error("Failed to load documents from IndexedDB:", error);
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
  }, [caseId]);

  const addDocuments = async (files: FileList) => {
    if (!files || files.length === 0) return;

    const newDocs: DocumentRecord[] = Array.from(files).map(file => ({
        id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        caseId,
        file,
        name: file.name,
        type: file.type,
        addedAt: new Date(),
    }));
    
    const newDocIds = new Set(newDocs.map(d => d.id));

    // Optimistic UI update
    setDocuments(prev => [...newDocs.slice().reverse(), ...prev]);
    setError(null);

    try {
        const db = await getDb();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const addPromises = newDocs.map(doc => tx.store.add(doc));
        await Promise.all(addPromises);
        await tx.done;
    } catch (err: any) {
        console.error("Failed to add documents to IndexedDB:", err);
        // Revert on error using a functional update to avoid stale state.
        setDocuments(prev => prev.filter(doc => !newDocIds.has(doc.id))); 
        let userMessage = 'فشل إضافة الوثائق.';
        if (err.name === 'QuotaExceededError') {
            userMessage = 'فشل إضافة الوثائق. قد تكون مساحة التخزين المتاحة للتطبيق قد امتلأت.';
        }
        setError(userMessage);
    }
  };

  const deleteDocument = async (id: string) => {
    // Find the document to delete for potential revert.
    const docToDelete = documents.find(d => d.id === id);
    if (!docToDelete) return;

    // Optimistically remove the document.
    setDocuments(prev => prev.filter(doc => doc.id !== id));
    setError(null);

    try {
        const db = await getDb();
        await db.delete(STORE_NAME, id);
    } catch (err: any) {
        console.error("Failed to delete document from IndexedDB:", err);
        // Revert on error by re-adding the document and re-sorting.
        setDocuments(prev => [...prev, docToDelete].sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()));
        setError('فشل حذف الوثيقة.');
    }
  };

  return { documents, loading, error, addDocuments, deleteDocument };
};