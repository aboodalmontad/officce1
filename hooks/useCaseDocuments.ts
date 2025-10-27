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

  const loadDocuments = React.useCallback(async () => {
    setLoading(true);
    try {
      const db = await getDb();
      const caseDocs = await db.getAllFromIndex(STORE_NAME, 'caseId', caseId);
      // Sort by newest first
      caseDocs.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
      setDocuments(caseDocs);
    } catch (error) {
        console.error("Failed to load documents from IndexedDB:", error);
    } finally {
        setLoading(false);
    }
  }, [caseId]);

  React.useEffect(() => {
    if (caseId) {
      loadDocuments();
    }
  }, [caseId, loadDocuments]);

  const addDocuments = async (files: FileList) => {
    if (!files || files.length === 0) return;
    try {
        setLoading(true);
        const db = await getDb();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const addPromises: Promise<any>[] = [];

        for (const file of Array.from(files)) {
            const newDoc: DocumentRecord = {
                id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                caseId,
                file,
                name: file.name,
                type: file.type,
                addedAt: new Date(),
            };
            addPromises.push(store.add(newDoc));
        }
        await Promise.all(addPromises);
        await tx.done;
        loadDocuments(); // Reload to show new documents
    } catch (error) {
        console.error("Failed to add documents to IndexedDB:", error);
        setLoading(false);
    }
  };

  const deleteDocument = async (id: string) => {
    try {
        setLoading(true);
        const db = await getDb();
        await db.delete(STORE_NAME, id);
        loadDocuments(); // Reload to reflect deletion
    } catch (error) {
        console.error("Failed to delete document from IndexedDB:", error);
        setLoading(false);
    }
  };

  return { documents, loading, addDocuments, deleteDocument };
};