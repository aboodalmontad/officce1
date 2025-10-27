import * as React from 'react';
import { useCaseDocuments, DocumentRecord } from '../hooks/useCaseDocuments';
import { DocumentArrowUpIcon, TrashIcon, EyeIcon, DocumentTextIcon, PhotoIcon, XMarkIcon, ExclamationTriangleIcon, ArrowPathIcon } from './icons';
import { renderAsync } from 'docx-preview';

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
    
    return (
        <div className="relative group border rounded-lg overflow-hidden bg-gray-50 flex flex-col aspect-w-1 aspect-h-1">
            <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); onDelete(doc); }} className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-md">
                    <TrashIcon className="w-4 h-4" />
                </button>
            </div>
            <div 
                className="flex-grow flex items-center justify-center cursor-pointer overflow-hidden"
                onClick={() => onPreview(doc)}
            >
                {thumbnailUrl ? (
                    <img src={thumbnailUrl} alt={doc.name} className="object-cover w-full h-full" />
                ) : (
                    <div className="flex-grow flex items-center justify-center bg-gray-200 w-full h-full">
                        <DocumentTextIcon className="w-12 h-12 text-gray-400" />
                    </div>
                )}
            </div>
            <div className="p-2 bg-white/80 backdrop-blur-sm border-t">
                <p className="text-xs font-medium text-gray-800 truncate" title={doc.name}>{doc.name}</p>
                <p className="text-xs text-gray-500">{(doc.file.size / 1024).toFixed(1)} KB</p>
            </div>
        </div>
    );
};

const TextPreview: React.FC<{ file: File; name: string }> = ({ file, name }) => {
    const [content, setContent] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        const reader = new FileReader();
        reader.onload = (e) => {
            setContent(e.target?.result as string);
        };
        reader.onerror = () => {
            setError('خطأ في قراءة الملف.');
        };
        reader.readAsText(file);
    }, [file]);

    return (
        <div className="w-[80vw] h-[90vh] bg-gray-100 p-4 rounded-lg overflow-auto flex flex-col" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold border-b border-gray-300 pb-2 mb-4 text-gray-800 flex-shrink-0">{name}</h3>
            <div className="flex-grow bg-white p-6 rounded shadow-inner overflow-auto">
                {content === null && !error && <div className="text-center p-8 text-gray-600">جاري تحميل المحتوى...</div>}
                {error && <div className="text-center p-8 text-red-600">{error}</div>}
                {content && <pre className="text-sm whitespace-pre-wrap text-gray-800">{content}</pre>}
            </div>
        </div>
    );
};

const DocxPreview: React.FC<{ file: File; name: string }> = ({ file, name }) => {
    const previewContainerRef = React.useRef<HTMLDivElement>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        const container = previewContainerRef.current;
        if (file && container) {
            setIsLoading(true);
            setError(null);

            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }

            if (file.type === 'application/msword') { // Handle legacy .doc files
                setError('معاينة ملفات .doc القديمة غير مدعومة حالياً. يرجى فتح الملف ببرنامج Microsoft Word.');
                setIsLoading(false);
                return;
            }
            
            renderAsync(file, container)
                .then(() => setIsLoading(false))
                .catch(err => {
                    console.error("Error rendering .docx file:", err);
                    setError('فشل عرض الملف. قد يكون الملف تالفاً أو بصيغة غير مدعومة.');
                    setIsLoading(false);
                });
        }
    }, [file]);

    return (
        <div className="w-[80vw] h-[90vh] bg-gray-100 p-4 rounded-lg overflow-auto flex flex-col" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold border-b border-gray-300 pb-2 mb-4 text-gray-800 flex-shrink-0">{name}</h3>
            <div className="flex-grow bg-white p-6 rounded shadow-inner overflow-auto">
                {isLoading && <div className="text-center p-8 text-gray-600">جاري تحميل المعاينة...</div>}
                {error && <div className="text-center p-8 text-red-600">{error}</div>}
                <div ref={previewContainerRef} className="docx-container">
                    {/* The docx-preview library renders content here */}
                </div>
            </div>
        </div>
    );
};


const CaseDocuments: React.FC<CaseDocumentsProps> = ({ caseId }) => {
    const { documents, loading, error, addDocuments, deleteDocument } = useCaseDocuments(caseId);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [previewDoc, setPreviewDoc] = React.useState<DocumentRecord | null>(null);
    const [docToDelete, setDocToDelete] = React.useState<DocumentRecord | null>(null);
    const [isDragging, setIsDragging] = React.useState(false);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            addDocuments(e.target.files);
        }
        if (e.target) {
            e.target.value = '';
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

    const handlePreview = (doc: DocumentRecord) => {
        const wordMimeTypes = [
            'application/msword', // .doc
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // .docx
        ];

        const isModalPreviewable = 
            doc.type.startsWith('image/') ||
            doc.type === 'application/pdf' ||
            doc.type.startsWith('video/') ||
            doc.type.startsWith('audio/') ||
            doc.type.startsWith('text/') ||
            wordMimeTypes.includes(doc.type);

        if (isModalPreviewable) {
            setPreviewDoc(doc);
        } else {
            // For all other types, open in a new tab
            const url = URL.createObjectURL(doc.file);
            window.open(url, '_blank');
            // Revoke after a delay to allow the new tab to open
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
    };

    const previewUrl = React.useMemo(() => {
        if (previewDoc && !previewDoc.type.startsWith('text/') && !previewDoc.type.includes('word')) {
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
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                hidden 
                multiple 
            />
            
             <div className="flex items-center justify-center w-full">
                <div 
                    className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isDragging ? 'border-blue-500 bg-blue-100' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <DocumentArrowUpIcon className="w-8 h-8 mb-2 text-gray-500"/>
                        <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">اضغط للإضافة</span> أو اسحب وأفلت الملفات هنا</p>
                    </div>
                </div>
            </div> 

            {error && (
                <div className="p-4 text-sm text-red-800 bg-red-100 rounded-lg flex items-start gap-3">
                    <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>{error}</div>
                </div>
            )}

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
                        <FilePreview key={doc.id} doc={doc} onPreview={handlePreview} onDelete={setDocToDelete} />
                    ))}
                </div>
            )}

            {previewDoc && (
                <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4" onClick={() => setPreviewDoc(null)}>
                    <button className="absolute top-4 right-4 text-white p-2 bg-black/50 rounded-full hover:bg-black/75 z-10" onClick={() => setPreviewDoc(null)}>
                        <XMarkIcon className="w-6 h-6"/>
                    </button>
                    
                    <div onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full flex items-center justify-center">
                        {previewDoc.type.startsWith('image/') && previewUrl && (
                            <img src={previewUrl} alt={previewDoc.name} className="max-h-full max-w-full object-contain rounded-lg" />
                        )}
                        
                        {previewDoc.type === 'application/pdf' && previewUrl && (
                             <iframe src={previewUrl} title={previewDoc.name} className="w-[80vw] h-[90vh] bg-white border-none rounded-lg"></iframe>
                        )}

                        {previewDoc.type.startsWith('video/') && previewUrl && (
                             <video src={previewUrl} controls autoPlay className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg" />
                        )}

                        {previewDoc.type.startsWith('audio/') && previewUrl && (
                            <div className="bg-white p-8 rounded-lg shadow-xl">
                                <h3 className="text-lg font-semibold text-gray-800 mb-4">{previewDoc.name}</h3>
                                <audio src={previewUrl} controls autoPlay className="w-full" />
                            </div>
                        )}

                        {previewDoc.type.startsWith('text/') && (
                            <TextPreview file={previewDoc.file} name={previewDoc.name} />
                        )}
                        
                        {(previewDoc.type === 'application/msword' || previewDoc.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') && (
                            <DocxPreview file={previewDoc.file} name={previewDoc.name} />
                        )}
                    </div>
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