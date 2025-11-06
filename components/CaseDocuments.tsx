import * as React from 'react';
import { useData } from '../App';
import { CaseDocument } from '../types';
import { DocumentArrowUpIcon, TrashIcon, EyeIcon, DocumentTextIcon, PhotoIcon, XMarkIcon, ExclamationTriangleIcon, ArrowPathIcon, CameraIcon, CloudArrowUpIcon, CloudArrowDownIcon, CheckCircleIcon, ExclamationCircleIcon, ArrowDownTrayIcon } from './icons';
import { renderAsync } from 'docx-preview';

interface CaseDocumentsProps {
    caseId: string;
}

const SyncStatusIcon: React.FC<{ state: CaseDocument['localState'] }> = ({ state }) => {
    switch (state) {
        case 'synced':
            return <CheckCircleIcon className="w-5 h-5 text-green-500" title="تمت المزامنة" />;
        case 'pending_upload':
            return <CloudArrowUpIcon className="w-5 h-5 text-blue-500 animate-pulse" title="بانتظار الرفع" />;
        case 'pending_download':
            return <CloudArrowDownIcon className="w-5 h-5 text-gray-400" title="بانتظار التنزيل" />;
        case 'error':
            return <ExclamationCircleIcon className="w-5 h-5 text-red-500" title="فشل المزامنة" />;
        default:
            return null;
    }
};


const FilePreview: React.FC<{ doc: CaseDocument, onPreview: (doc: CaseDocument) => void, onDelete: (doc: CaseDocument) => void }> = ({ doc, onPreview, onDelete }) => {
    const [thumbnailUrl, setThumbnailUrl] = React.useState<string | null>(null);
    const { getDocumentFile } = useData();

    React.useEffect(() => {
        let objectUrl: string | null = null;
        if (doc.type.startsWith('image/') && doc.localState !== 'pending_download') {
            getDocumentFile(doc.id).then(file => {
                if(file) {
                    objectUrl = URL.createObjectURL(file);
                    setThumbnailUrl(objectUrl);
                }
            });
        }

        return () => {
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [doc.id, doc.type, doc.localState, getDocumentFile]);
    
    return (
        <div className="relative group border rounded-lg overflow-hidden bg-gray-50 flex flex-col aspect-w-1 aspect-h-1">
            <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); onDelete(doc); }} className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-md">
                    <TrashIcon className="w-4 h-4" />
                </button>
            </div>
             <div className="absolute top-2 left-2 z-10">
                <SyncStatusIcon state={doc.localState} />
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
                <p className="text-xs text-gray-500">{(doc.size / 1024).toFixed(1)} KB</p>
            </div>
        </div>
    );
};

const TextPreview: React.FC<{ file: File; name: string }> = ({ file, name }) => {
    const [content, setContent] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        const reader = new FileReader();
        reader.onload = (e) => setContent(e.target?.result as string);
        reader.onerror = () => setError('خطأ في قراءة الملف.');
        reader.readAsText(file);
    }, [file]);

    return (
        <div className="w-full h-full bg-gray-100 p-4 rounded-lg overflow-auto flex flex-col">
            <h3 className="text-lg font-semibold border-b border-gray-300 pb-2 mb-4 text-gray-800 flex-shrink-0">{name}</h3>
            <div className="flex-grow bg-white p-6 rounded shadow-inner overflow-auto">
                {content === null && !error && <div className="text-center p-8 text-gray-600">جاري تحميل المحتوى...</div>}
                {error && <div className="text-center p-8 text-red-600">{error}</div>}
                {content && <pre className="text-sm whitespace-pre-wrap text-gray-800">{content}</pre>}
            </div>
        </div>
    );
};

const DocxPreview: React.FC<{ file: File; name: string; onClose: () => void; onDownload: () => void }> = ({ file, name, onClose, onDownload }) => {
    const previewerRef = React.useRef<HTMLDivElement>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const isOldDocFormat = name.toLowerCase().endsWith('.doc');

    React.useEffect(() => {
        if (isOldDocFormat || !previewerRef.current) {
            setIsLoading(false);
            return;
        }

        renderAsync(file, previewerRef.current)
            .then(() => {
                setIsLoading(false);
            })
            .catch(e => {
                console.error('Docx-preview error:', e);
                setError('حدث خطأ أثناء عرض المستند. قد يكون الملف تالفًا أو غير مدعوم. جرب تنزيل الملف بدلاً من ذلك.');
                setIsLoading(false);
            });
    }, [file, isOldDocFormat]);

    return (
        <div className="w-full h-full bg-gray-100 p-4 rounded-lg overflow-auto flex flex-col">
            <div className="flex justify-between items-center border-b border-gray-300 pb-2 mb-4 flex-shrink-0">
                <h3 className="text-lg font-semibold text-gray-800">{name}</h3>
                <div className="flex items-center gap-4">
                    <button onClick={onDownload} className="flex items-center gap-2 text-sm px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        <ArrowDownTrayIcon className="w-4 h-4" />
                        <span>تنزيل الملف</span>
                    </button>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:bg-gray-200 rounded-full">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>
            <div className="flex-grow bg-white p-2 rounded shadow-inner overflow-auto relative">
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                        <ArrowPathIcon className="w-8 h-8 text-blue-600 animate-spin" />
                    </div>
                )}
                {isOldDocFormat ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                        <ExclamationTriangleIcon className="w-12 h-12 text-yellow-500 mb-4" />
                        <h4 className="text-lg font-bold text-gray-800">تنسيق ملف غير مدعوم للمعاينة</h4>
                        <p className="text-gray-600 mt-2">
                            لا يمكن عرض ملفات Word القديمة (ذات امتداد .doc) مباشرة في المتصفح. يرجى استخدام زر التنزيل لفتح الملف باستخدام Microsoft Word.
                        </p>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                         <ExclamationCircleIcon className="w-12 h-12 text-red-500 mb-4" />
                         <h4 className="text-lg font-bold text-red-800">فشل عرض الملف</h4>
                         <p className="text-gray-600 mt-2">{error}</p>
                    </div>
                ) : (
                    <div ref={previewerRef} />
                )}
            </div>
        </div>
    );
};

const PreviewModal: React.FC<{ doc: CaseDocument; onClose: () => void }> = ({ doc, onClose }) => {
    const { getDocumentFile } = useData();
    const [file, setFile] = React.useState<File | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);

    React.useEffect(() => {
        if (doc.localState === 'pending_download') {
            setError('الملف لم يتم تنزيله من السحابة بعد. يرجى الانتظار والمحاولة مرة أخرى.');
            setIsLoading(false);
            return;
        }
        getDocumentFile(doc.id)
            .then(retrievedFile => {
                if (retrievedFile) {
                    setFile(retrievedFile);
                } else {
                    setError('لم يتم العثور على الملف في قاعدة البيانات المحلية.');
                }
            })
            .catch(() => setError('حدث خطأ أثناء استرداد الملف.'))
            .finally(() => setIsLoading(false));
    }, [doc.id, doc.localState, getDocumentFile]);

    const handleDownload = () => {
        if (file) {
            const url = URL.createObjectURL(file);
            const a = document.createElement('a');
            a.href = url;
            a.download = doc.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    };

    const renderPreview = () => {
        if (!file) return null;
        if (file.type.startsWith('image/')) return <img src={URL.createObjectURL(file)} alt={doc.name} className="max-h-full max-w-full object-contain mx-auto" />;
        if (file.type === 'application/pdf') return <iframe src={URL.createObjectURL(file)} className="w-full h-full" title={doc.name}></iframe>;
        if (file.type.startsWith('text/')) return <TextPreview file={file} name={doc.name} />;
        if (doc.name.toLowerCase().endsWith('.docx') || doc.name.toLowerCase().endsWith('.doc')) {
             return <DocxPreview file={file} name={doc.name} onClose={onClose} onDownload={handleDownload} />;
        }
        return (
            <div className="text-center p-8">
                <h3 className="font-bold text-lg">لا توجد معاينة متاحة</h3>
                <p>تنسيق الملف ({doc.type}) غير مدعوم للمعاينة المباشرة.</p>
                <button onClick={handleDownload} className="mt-4 flex items-center mx-auto gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    <ArrowDownTrayIcon className="w-5 h-5" />
                    <span>تنزيل الملف</span>
                </button>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full h-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                {isLoading && <div className="flex items-center justify-center h-full"><ArrowPathIcon className="w-8 h-8 animate-spin text-blue-500" /></div>}
                {error && <div className="flex flex-col items-center justify-center h-full p-4"><ExclamationTriangleIcon className="w-10 h-10 text-red-500 mb-4"/><p className="text-red-700">{error}</p></div>}
                {!isLoading && !error && renderPreview()}
            </div>
        </div>
    );
};


const CaseDocuments: React.FC<CaseDocumentsProps> = ({ caseId }) => {
    const { documents, addDocuments, deleteDocument } = useData();
    const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
    const [docToDelete, setDocToDelete] = React.useState<CaseDocument | null>(null);
    const [previewDoc, setPreviewDoc] = React.useState<CaseDocument | null>(null);
    const [isDragging, setIsDragging] = React.useState(false);

    const caseDocuments = React.useMemo(() => 
        documents.filter(doc => doc.caseId === caseId).sort((a,b) => b.addedAt.getTime() - a.addedAt.getTime()), 
        [documents, caseId]
    );

    const handleFileChange = (files: FileList | null) => {
        if (files && files.length > 0) {
            addDocuments(caseId, files);
        }
    };
    
    const handleDragEvents = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragging(true);
        } else if (e.type === 'dragleave') {
            setIsDragging(false);
        }
    };
    
    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileChange(e.dataTransfer.files);
        }
    };

    const openDeleteModal = (doc: CaseDocument) => {
        setDocToDelete(doc);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = () => {
        if (docToDelete) {
            deleteDocument(docToDelete);
        }
        setIsDeleteModalOpen(false);
        setDocToDelete(null);
    };

    return (
        <div className="space-y-4">
             <input type="file" id={`file-upload-${caseId}`} multiple className="hidden" onChange={(e) => handleFileChange(e.target.files)} />
             <label 
                htmlFor={`file-upload-${caseId}`} 
                onDragEnter={handleDragEvents}
                onDragLeave={handleDragEvents}
                onDragOver={handleDragEvents}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-100 transition-colors ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
             >
                <DocumentArrowUpIcon className="w-10 h-10 text-gray-400 mb-2" />
                <span className="font-semibold text-gray-700">اسحب وأفلت الملفات هنا، أو اضغط للاختيار</span>
                <p className="text-xs text-gray-500">يمكنك إضافة الصور، ملفات PDF، ومستندات Word</p>
            </label>
            
            {caseDocuments.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {caseDocuments.map(doc => (
                        <FilePreview key={doc.id} doc={doc} onPreview={setPreviewDoc} onDelete={openDeleteModal} />
                    ))}
                </div>
            ) : (
                <div className="text-center py-8 text-gray-500">
                    <p>لا توجد وثائق لهذه القضية بعد.</p>
                </div>
            )}

            {isDeleteModalOpen && docToDelete && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setIsDeleteModalOpen(false)}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4"><ExclamationTriangleIcon className="h-8 w-8 text-red-600" /></div>
                            <h3 className="text-2xl font-bold">تأكيد حذف الوثيقة</h3>
                            <p className="my-4">هل أنت متأكد من حذف وثيقة "{docToDelete.name}"؟</p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button className="px-6 py-2 bg-gray-200 rounded-lg" onClick={() => setIsDeleteModalOpen(false)}>إلغاء</button>
                            <button className="px-6 py-2 bg-red-600 text-white rounded-lg" onClick={confirmDelete}>نعم، قم بالحذف</button>
                        </div>
                    </div>
                </div>
            )}
            
            {previewDoc && <PreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
        </div>
    );
};

export default CaseDocuments;
