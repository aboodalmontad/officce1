import * as React from 'react';
import { useCaseDocuments, DocumentRecord } from '../hooks/useCaseDocuments';
import { DocumentArrowUpIcon, TrashIcon, EyeIcon, DocumentTextIcon, PhotoIcon, XMarkIcon, ExclamationTriangleIcon, ArrowPathIcon } from './icons';

interface CaseDocumentsProps {
    caseId: string;
}

const FilePreview: React.FC<{ doc: DocumentRecord, onPreview: (doc: DocumentRecord) => void, onDelete: (doc: DocumentRecord) => void }> = ({ doc, onPreview, onDelete }) => {
    const [thumbnailUrl, setThumbnailUrl] = React.useState<string | null>(null);

    React.useEffect(() => {
        let objectUrl: string | null = null;
        if (doc.type.startsWith('image/')) {
            objectUrl = URL.createObjectURL(doc.file);
            setThumbnailUrl(objectUrl);
        }

        return () => {
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [doc.file, doc.type]);

    const handleOpenFile = () => {
        const url = URL.createObjectURL(doc.file);
        window.open(url, '_blank');
        // Revoke after a delay to allow the new tab to open
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    return (
        <div className="relative group border rounded-lg overflow-hidden bg-gray-50 flex flex-col aspect-w-1 aspect-h-1">
            <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => onDelete(doc)} className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-md">
                    <TrashIcon className="w-4 h-4" />
                </button>
            </div>
            {thumbnailUrl ? (
                <img src={thumbnailUrl} alt={doc.name} className="object-cover w-full h-full cursor-pointer" onClick={() => onPreview(doc)} />
            ) : (
                <div className="flex-grow flex items-center justify-center bg-gray-200 cursor-pointer" onClick={handleOpenFile}>
                    <DocumentTextIcon className="w-12 h-12 text-gray-400" />
                </div>
            )}
            <div className="p-2 bg-white/80 backdrop-blur-sm border-t">
                <p className="text-xs font-medium text-gray-800 truncate" title={doc.name}>{doc.name}</p>
                <p className="text-xs text-gray-500">{(doc.file.size / 1024).toFixed(1)} KB</p>
            </div>
        </div>
    );
};

const CaseDocuments: React.FC<CaseDocumentsProps> = ({ caseId }) => {
    const { documents, loading, addDocuments, deleteDocument } = useCaseDocuments(caseId);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [previewDoc, setPreviewDoc] = React.useState<DocumentRecord | null>(null);
    const [docToDelete, setDocToDelete] = React.useState<DocumentRecord | null>(null);
    const [isDragging, setIsDragging] = React.useState(false);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            addDocuments(e.target.files);
        }
    };
    
    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            addDocuments(e.dataTransfer.files);
            e.dataTransfer.clearData();
        }
    };

    const handleDragEvents = (e: React.DragEvent<HTMLDivElement>, enter: boolean) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(enter);
    };

    const previewUrl = React.useMemo(() => {
        if (previewDoc && previewDoc.type.startsWith('image/')) {
            return URL.createObjectURL(previewDoc.file);
        }
        return null;
    }, [previewDoc]);

    React.useEffect(() => {
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);

    return (
        <div 
            className={`p-4 space-y-4 transition-colors ${isDragging ? 'bg-blue-50' : ''}`}
            onDrop={handleDrop}
            onDragOver={(e) => handleDragEvents(e, true)}
            onDragEnter={(e) => handleDragEvents(e, true)}
            onDragLeave={(e) => handleDragEvents(e, false)}
        >
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} hidden multiple />
            
             <div className="flex items-center justify-center w-full">
                <label 
                    htmlFor="dropzone-file" 
                    className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isDragging ? 'border-blue-500 bg-blue-100' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <DocumentArrowUpIcon className="w-8 h-8 mb-2 text-gray-500"/>
                        <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">اضغط للإضافة</span> أو اسحب وأفلت الملفات هنا</p>
                    </div>
                    <input id="dropzone-file" type="file" className="hidden" multiple onChange={handleFileSelect} />
                </label>
            </div> 

            {loading ? (
                <div className="flex justify-center items-center p-8">
                    <ArrowPathIcon className="w-6 h-6 text-gray-500 animate-spin" />
                    <p className="ms-2 text-gray-600">جاري تحميل الوثائق...</p>
                </div>
            ) : documents.length === 0 ? (
                <p className="text-center text-gray-500 py-8">لا توجد وثائق لهذه القضية بعد.</p>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {documents.map(doc => (
                        <FilePreview key={doc.id} doc={doc} onPreview={setPreviewDoc} onDelete={setDocToDelete} />
                    ))}
                </div>
            )}

            {previewDoc && previewUrl && (
                <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4" onClick={() => setPreviewDoc(null)}>
                    <button className="absolute top-4 right-4 text-white p-2 bg-black/50 rounded-full hover:bg-black/75 z-10">
                        <XMarkIcon className="w-6 h-6"/>
                    </button>
                    <img src={previewUrl} alt="Preview" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()}/>
                </div>
            )}
            
            {docToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]" onClick={() => setDocToDelete(null)}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4"><ExclamationTriangleIcon className="h-8 w-8 text-red-600" /></div>
                            <h3 className="text-2xl font-bold text-gray-900">تأكيد حذف الوثيقة</h3>
                            <p className="text-gray-600 my-4">هل أنت متأكد من حذف الملف "{docToDelete.name}"؟ لا يمكن التراجع عن هذا الإجراء.</p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button type="button" className="px-6 py-2 bg-gray-200 rounded-lg" onClick={() => setDocToDelete(null)}>إلغاء</button>
                            <button type="button" className="px-6 py-2 bg-red-600 text-white rounded-lg" onClick={() => { deleteDocument(docToDelete.id); setDocToDelete(null); }}>نعم، قم بالحذف</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CaseDocuments;