import * as React from 'react';
import { useData } from '../App';
import { CaseDocument } from '../types';
import { DocumentArrowUpIcon, TrashIcon, EyeIcon, DocumentTextIcon, PhotoIcon, XMarkIcon, ExclamationTriangleIcon, ArrowPathIcon, CameraIcon, CloudArrowUpIcon, CloudArrowDownIcon, CheckCircleIcon, ExclamationCircleIcon } from './icons';
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

const DocxPreview: React.FC<{ file: File; name: string }> = ({ file, name }) => {
    const previewContainerRef = React.useRef<HTMLDivElement>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        const container = previewContainerRef.current;
        if (file && container) {
            setIsLoading(true); setError(null);
            while (container.firstChild) container.removeChild(container.firstChild);

            if (file.type === 'application/msword' || name.toLowerCase().endsWith('.doc')) {
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
    }, [file, name]);

    return (
        <div className="w-full h-full bg-gray-100 p-4 rounded-lg overflow-auto flex flex-col">
            <h3 className="text-lg font-semibold border-b border-gray-300 pb-2 mb-4 text-gray-800 flex-shrink-0">{name}</h3>
            <div className="flex-grow bg-white p-6 rounded shadow-inner overflow-auto">
                {isLoading && <div className="text-center p-8 text-gray-600">جاري تحميل المعاينة...</div>}
                {error && <div className="text-center p-8 text-red-600">{error}</div>}
                <div ref={previewContainerRef} className="docx-container" />
            </div>
        </div>
    );
};

interface CameraModalProps {
    onClose: () => void;
    onSave: (photoFile: File) => void;
}

const CameraModal: React.FC<CameraModalProps> = ({ onClose, onSave }) => {
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const streamRef = React.useRef<MediaStream | null>(null);

    const [mode, setMode] = React.useState<'streaming' | 'preview'>('streaming');
    const [capturedImage, setCapturedImage] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let didCancel = false;
        async function startCamera() {
            try {
                const constraints = { video: { facingMode: 'environment' } };
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                if (!didCancel && videoRef.current) {
                    videoRef.current.srcObject = stream;
                    streamRef.current = stream;
                }
            } catch (err) {
                console.error("Camera access failed:", err);
                setError("لا يمكن الوصول إلى الكاميرا. يرجى التحقق من الأذونات.");
            }
        }
        if (mode === 'streaming') { setError(null); startCamera(); }
        return () => {
            didCancel = true;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
        };
    }, [mode]);

    const handleCapture = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            if(context){
                context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
                const dataUrl = canvas.toDataURL('image/jpeg');
                setCapturedImage(dataUrl);
                setMode('preview');
            }
        }
    };
    const handleRetake = () => { setCapturedImage(null); setMode('streaming'); };
    const handleSave = () => { if (capturedImage) { fetch(capturedImage).then(res => res.blob()).then(blob => { const photoFile = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' }); onSave(photoFile); }); } };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-gray-800 p-4 rounded-lg shadow-xl w-full max-w-2xl relative" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-2 right-2 text-white p-2 bg-black/50 rounded-full hover:bg-black/75 z-10"><XMarkIcon className="w-6 h-6"/></button>
                {error ? <div className="text-center p-8 text-red-400"><ExclamationTriangleIcon className="w-12 h-12 mx-auto mb-4"/><p>{error}</p></div>
                : <div className="space-y-4"><div className="relative w-full aspect-video bg-black rounded overflow-hidden">{mode === 'streaming' && <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain"></video>}{mode === 'preview' && capturedImage && <img src={capturedImage} alt="Preview" className="w-full h-full object-contain" />}</div><div className="flex justify-center items-center gap-4">{mode === 'streaming' && <button onClick={handleCapture} className="p-4 bg-white rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white" aria-label="التقاط صورة"><div className="w-8 h-8 bg-red-600 rounded-full border-4 border-white"></div></button>}{mode === 'preview' && <><button onClick={handleRetake} className="px-6 py-3 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-500">إعادة التقاط</button><button onClick={handleSave} className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">حفظ الصورة</button></>}</div></div>}
                <canvas ref={canvasRef} className="hidden"></canvas>
            </div>
        </div>
    );
};

const Previewer: React.FC<{ doc: CaseDocument; file: File; onClose: () => void }> = ({ doc, file, onClose }) => {
    const previewUrl = React.useMemo(() => URL.createObjectURL(file), [file]);
    React.useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

    const lowerCaseName = doc.name.toLowerCase();
    const isWordFile = ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(doc.type) || lowerCaseName.endsWith('.docx') || lowerCaseName.endsWith('.doc');
    const isTextFile = doc.type.startsWith('text/');
    const isImageFile = doc.type.startsWith('image/');
    const isPdfFile = doc.type === 'application/pdf';
    const isVideoFile = doc.type.startsWith('video/');
    const isAudioFile = doc.type.startsWith('audio/');

    let content;
    if (isImageFile) {
        content = <img src={previewUrl} alt={doc.name} className="max-h-full max-w-full object-contain rounded-lg" />;
    } else if (isPdfFile) {
        content = <iframe src={previewUrl} title={doc.name} className="w-full h-full bg-white border-none rounded-lg"></iframe>;
    } else if (isVideoFile) {
        content = <video src={previewUrl} controls autoPlay className="max-h-full max-w-full object-contain rounded-lg" />;
    } else if (isAudioFile) {
        content = <div className="bg-white p-8 rounded-lg shadow-xl"><h3 className="text-lg font-semibold text-gray-800 mb-4">{doc.name}</h3><audio src={previewUrl} controls autoPlay className="w-full" /></div>;
    } else if (isTextFile) {
        content = <TextPreview file={file} name={doc.name} />;
    } else if (isWordFile) {
        content = <DocxPreview file={file} name={doc.name} />;
    } else {
        content = <iframe src={previewUrl} title={doc.name} className="w-full h-full bg-white border-none rounded-lg"></iframe>;
    }

    const isFullVwVh = isPdfFile || isTextFile || isWordFile || !(isImageFile || isVideoFile || isAudioFile);
    const contentWrapperClasses = isFullVwVh ? "w-[80vw] h-[90vh] flex flex-col" : "max-h-full max-w-full flex items-center justify-center";

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <button className="absolute top-4 right-4 text-white p-2 bg-black/50 rounded-full hover:bg-black/75 z-10" onClick={onClose}>
                <XMarkIcon className="w-6 h-6" />
            </button>
            <div onClick={(e) => e.stopPropagation()} className={contentWrapperClasses}>
                {content}
            </div>
        </div>
    );
};


const CaseDocuments: React.FC<CaseDocumentsProps> = ({ caseId }) => {
    const { documents: allDocuments, addDocuments: addDocumentsContext, deleteDocument: deleteDocumentContext, getDocumentFile } = useData();
    const documents = React.useMemo(() => allDocuments.filter(doc => doc.caseId === caseId), [allDocuments, caseId]);

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [previewState, setPreviewState] = React.useState<{ doc: CaseDocument; file: File } | null>(null);
    const [docToDelete, setDocToDelete] = React.useState<CaseDocument | null>(null);
    const [isDragging, setIsDragging] = React.useState(false);
    const [isCameraOpen, setIsCameraOpen] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const addDocuments = async (files: FileList) => {
        setLoading(true); setError(null);
        try { await addDocumentsContext(caseId, files); } 
        catch (e: any) { setError(e.message || "Failed to add documents."); } 
        finally { setLoading(false); }
    };

    const deleteDocument = async (doc: CaseDocument) => {
        setLoading(true); setError(null);
        try { await deleteDocumentContext(doc); setDocToDelete(null); } 
        catch(e: any) { setError(e.message || 'Failed to delete document.'); } 
        finally { setLoading(false); }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) addDocuments(e.target.files); if (e.target) e.target.value = ''; };
    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); if (e.dataTransfer.files && e.dataTransfer.files.length > 0) { addDocuments(e.dataTransfer.files); e.dataTransfer.clearData(); } };
    const handleDragEvents = (e: React.DragEvent<HTMLDivElement>, enter: boolean) => { e.preventDefault(); e.stopPropagation(); setIsDragging(enter); };

    const handlePreview = async (doc: CaseDocument) => {
        if (doc.localState === 'pending_download') {
            setError("الملف قيد التنزيل، يرجى الانتظار والمحاولة مرة أخرى.");
            return;
        }
        const file = await getDocumentFile(doc.id);
        if (!file) { setError(`لا يمكن عرض الملف: ${doc.name}. قد يكون قيد التنزيل أو حدث خطأ.`); return; }
        setPreviewState({ doc, file });
    };
    
    const handleSavePhoto = (photoFile: File) => { const dataTransfer = new DataTransfer(); dataTransfer.items.add(photoFile); addDocuments(dataTransfer.files); setIsCameraOpen(false); };

    return (
        <div className={`p-4 space-y-4 transition-colors ${isDragging ? 'bg-blue-50' : ''}`} onDrop={handleDrop} onDragOver={(e) => handleDragEvents(e, true)} onDragEnter={(e) => handleDragEvents(e, true)} onDragLeave={(e) => handleDragEvents(e, false)}>
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} hidden multiple />
             <div className="flex flex-col sm:flex-row items-stretch justify-center w-full gap-4"><div className={`flex-grow flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isDragging ? 'border-blue-500 bg-blue-100' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`} onClick={() => fileInputRef.current?.click()}><div className="flex flex-col items-center justify-center pt-5 pb-6 text-center"><DocumentArrowUpIcon className="w-8 h-8 mb-2 text-gray-500"/><p className="mb-2 text-sm text-gray-500"><span className="font-semibold">اختر ملف</span> أو اسحبه هنا</p></div></div><button onClick={() => setIsCameraOpen(true)} className="flex flex-col items-center justify-center h-32 w-full sm:w-32 border-2 border-dashed border-gray-300 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors" type="button" aria-label="التقط صورة"><CameraIcon className="w-8 h-8 mb-2 text-gray-500"/><p className="text-sm text-gray-500 font-semibold">التقط صورة</p></button></div> 
            {error && <div className="p-4 text-sm text-red-800 bg-red-100 rounded-lg flex items-start gap-3"><ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" /><div>{error}</div></div>}
            {loading ? <div className="flex justify-center items-center p-8"><ArrowPathIcon className="w-6 h-6 text-gray-500 animate-spin" /><p className="ms-2 text-gray-600">جاري تحميل الوثائق...</p></div>
            : documents.length === 0 ? <p className="text-center text-gray-500 py-8">لا توجد وثائق لهذه القضية بعد.</p>
            : <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">{documents.map(doc => <FilePreview key={doc.id} doc={doc} onPreview={handlePreview} onDelete={setDocToDelete} />)}</div>}
            {isCameraOpen && <CameraModal onClose={() => setIsCameraOpen(false)} onSave={handleSavePhoto} />}
            {previewState && <Previewer doc={previewState.doc} file={previewState.file} onClose={() => setPreviewState(null)} />}
            {docToDelete && <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]" onClick={() => setDocToDelete(null)}><div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}><div className="text-center"><div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4"><ExclamationTriangleIcon className="h-8 w-8 text-red-600" /></div><h3 className="text-2xl font-bold text-gray-900">تأكيد حذف الوثيقة</h3><p className="text-gray-600 my-4">هل أنت متأكد من حذف الملف "{docToDelete.name}"؟ لا يمكن التراجع عن هذا الإجراء.</p></div><div className="mt-6 flex justify-center gap-4"><button type="button" className="px-6 py-2 bg-gray-200 rounded-lg" onClick={() => setDocToDelete(null)}>إلغاء</button><button type="button" className="px-6 py-2 bg-red-600 text-white rounded-lg" disabled={loading} onClick={() => deleteDocument(docToDelete)}>{loading ? 'جاري الحذف...' : 'نعم، قم بالحذف'}</button></div></div></div>}
        </div>
    );
};

export default CaseDocuments;