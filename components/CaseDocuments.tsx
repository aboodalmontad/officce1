import * as React from 'react';
import { useCaseDocuments } from '../hooks/useCaseDocuments';
import { CaseDocument } from '../types';
import { DocumentArrowUpIcon, TrashIcon, DocumentTextIcon, XMarkIcon, ExclamationTriangleIcon, ArrowPathIcon, CameraIcon, NoSymbolIcon, ArrowDownTrayIcon } from './icons';
import * as docxPreview from 'docx-preview';

interface CaseDocumentsProps {
    caseId: string;
}

const FilePreview: React.FC<{ doc: CaseDocument, onPreview: (doc: CaseDocument) => void, onDelete: (doc: CaseDocument) => void }> = ({ doc, onPreview, onDelete }) => {
    const isImage = doc.mime_type.startsWith('image/');
    const isPdf = doc.mime_type === 'application/pdf' || doc.file_name.toLowerCase().endsWith('.pdf');
    
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
                {isImage && doc.publicUrl ? (
                    <img src={doc.publicUrl} alt={doc.file_name} className="object-cover w-full h-full" />
                ) : (
                    <div className="flex-grow flex items-center justify-center bg-gray-200 w-full h-full relative">
                        {isPdf ? (
                            <>
                                <DocumentTextIcon className="w-12 h-12 text-red-500" />
                                <span className="absolute bottom-1 text-xs font-bold text-red-800 bg-white/50 px-1 rounded">PDF</span>
                            </>
                        ) : (
                             <DocumentTextIcon className="w-12 h-12 text-gray-400" />
                        )}
                    </div>
                )}
            </div>
            <div className="p-2 bg-white/80 backdrop-blur-sm border-t">
                <p className="text-xs font-medium text-gray-800 truncate" title={doc.file_name}>{doc.file_name}</p>
            </div>
        </div>
    );
};

const TextPreview: React.FC<{ fileUrl: string; fileName: string }> = ({ fileUrl, fileName }) => {
    const [content, setContent] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        async function loadText() {
            try {
                const response = await fetch(fileUrl);
                if (!response.ok) throw new Error('Network response was not ok');
                const text = await response.text();
                setContent(text);
            } catch (err) {
                console.error("Error fetching text file for preview:", err);
                setError('خطأ في تحميل الملف.');
            }
        }
        loadText();
    }, [fileUrl]);

    return (
        <div className="w-[80vw] h-[90vh] bg-gray-100 p-4 rounded-lg overflow-auto flex flex-col" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold border-b border-gray-300 pb-2 mb-4 text-gray-800 flex-shrink-0">{fileName}</h3>
            <div className="flex-grow bg-white p-6 rounded shadow-inner overflow-auto">
                {content === null && !error && <div className="text-center p-8 text-gray-600">جاري تحميل المحتوى...</div>}
                {error && <div className="text-center p-8 text-red-600">{error}</div>}
                {content && <pre className="text-sm whitespace-pre-wrap text-gray-800">{content}</pre>}
            </div>
        </div>
    );
};

const DocxPreview: React.FC<{ fileUrl: string; fileName: string }> = ({ fileUrl, fileName }) => {
    const previewContainerRef = React.useRef<HTMLDivElement>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        const container = previewContainerRef.current;
        if (fileUrl && container) {
            setIsLoading(true);
            setError(null);

            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }

            fetch(fileUrl)
                .then(res => {
                    if (!res.ok) throw new Error('Failed to fetch file for preview');
                    return res.blob();
                })
                .then(blob => {
                    docxPreview.renderAsync(blob, container)
                        .then(() => setIsLoading(false))
                        .catch(err => {
                            console.error("Error rendering .docx file:", err);
                            setError('فشل عرض الملف. قد يكون الملف تالفاً أو بصيغة غير مدعومة.');
                            setIsLoading(false);
                        });
                })
                .catch(err => {
                     console.error("Error fetching .docx file:", err);
                     setError('فشل تحميل الملف للمعاينة.');
                     setIsLoading(false);
                });
        }
    }, [fileUrl, fileName]);

    return (
        <div className="w-[80vw] h-[90vh] bg-gray-100 p-4 rounded-lg overflow-auto flex flex-col" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold border-b border-gray-300 pb-2 mb-4 text-gray-800 flex-shrink-0">{fileName}</h3>
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
        let isMounted = true;
        async function startCamera() {
            try {
                if ('permissions' in navigator) {
                    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
                    if (status.state === 'denied') {
                        setError("تم رفض الوصول إلى الكاميرا. يرجى تمكينها يدوياً من إعدادات المتصفح للمتابعة.");
                        return;
                    }
                }
                
                const constraints = { video: { facingMode: 'environment' } };
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                if (isMounted && videoRef.current) {
                    videoRef.current.srcObject = stream;
                    streamRef.current = stream;
                }
            } catch (err: any) {
                console.error("Camera access failed:", err);
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    setError("تم رفض الوصول إلى الكاميرا. يرجى تمكينها يدوياً من إعدادات المتصفح للمتابعة.");
                } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                    setError("لم يتم العثور على كاميرا. يرجى التأكد من توصيل كاميرا وأنها تعمل بشكل صحيح.");
                } else {
                    setError("لا يمكن الوصول إلى الكاميرا بسبب خطأ غير متوقع. حاول تحديث الصفحة.");
                }
            }
        }

        if (mode === 'streaming') {
            setError(null);
            startCamera();
        }

        return () => {
            isMounted = false;
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

    const handleRetake = () => {
        setCapturedImage(null);
        setMode('streaming');
    };

    const handleSave = () => {
        if (capturedImage) {
            fetch(capturedImage)
                .then(res => res.blob())
                .then(blob => {
                    const photoFile = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
                    onSave(photoFile);
                });
        }
    };

    return (
        <div className="fixed inset-0 bg-black z-50 flex items-center justify-center md:p-4" onClick={onClose}>
            <div 
                className="bg-gray-900 w-full h-full md:max-w-3xl md:h-auto md:rounded-lg shadow-xl relative flex flex-col" 
                onClick={e => e.stopPropagation()}
            >
                <button onClick={onClose} className="absolute top-4 right-4 text-white p-2 bg-black/50 rounded-full hover:bg-black/75 z-20">
                    <XMarkIcon className="w-6 h-6"/>
                </button>
                
                {error ? (
                    <div className="flex-grow flex items-center justify-center text-center p-8 text-red-400">
                        <div>
                            <ExclamationTriangleIcon className="w-12 h-12 mx-auto mb-4"/>
                            <p>{error}</p>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="relative w-full flex-grow bg-black md:rounded-t-lg overflow-hidden">
                            {mode === 'streaming' && (
                                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
                            )}
                            {mode === 'preview' && capturedImage && (
                                <img src={capturedImage} alt="Preview" className="w-full h-full object-cover" />
                            )}
                        </div>
                        
                        <div className="flex-shrink-0 flex justify-center items-center gap-8 p-4 bg-black/50 md:rounded-b-lg">
                            {mode === 'streaming' && (
                                <button onClick={handleCapture} className="p-4 bg-white rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white" aria-label="التقاط صورة">
                                    <div className="w-10 h-10 bg-red-600 rounded-full border-4 border-white"></div>
                                </button>
                            )}
                            {mode === 'preview' && (
                                <>
                                    <button onClick={handleRetake} className="px-6 py-3 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-500">إعادة التقاط</button>
                                    <button onClick={handleSave} className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">حفظ الصورة</button>
                                </>
                            )}
                        </div>
                    </>
                )}
                <canvas ref={canvasRef} className="hidden"></canvas>
            </div>
        </div>
    );
};

const UnsupportedPreview: React.FC<{ doc: CaseDocument }> = ({ doc }) => {
    return (
        <div className="w-[80vw] max-w-lg h-auto bg-gray-100 p-8 rounded-lg flex flex-col items-center justify-center text-center" onClick={e => e.stopPropagation()}>
            <DocumentTextIcon className="w-16 h-16 text-gray-400 mb-4" />
            <h3 className="text-xl font-semibold mb-2 text-gray-800">{doc.file_name}</h3>
            <p className="text-gray-600 mb-6">المعاينة غير مدعومة لهذا النوع من الملفات ({doc.file_name.split('.').pop()}). يمكنك تنزيل الملف لفتحه باستخدام برنامج متوافق.</p>
            <a 
                href={doc.publicUrl} 
                download={doc.file_name}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
                <ArrowDownTrayIcon className="w-5 h-5" />
                <span>تنزيل الملف</span>
            </a>
        </div>
    );
};


const CaseDocuments: React.FC<CaseDocumentsProps> = ({ caseId }) => {
    const { documents, loading, isSyncing, error, addDocuments, deleteDocument } = useCaseDocuments(caseId);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [previewDoc, setPreviewDoc] = React.useState<CaseDocument | null>(null);
    const [docToDelete, setDocToDelete] = React.useState<CaseDocument | null>(null);
    const [isDragging, setIsDragging] = React.useState(false);
    const [isCameraOpen, setIsCameraOpen] = React.useState(false);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            await addDocuments(e.target.files);
        }
        if (e.target) {
            e.target.value = '';
        }
    };
    
    const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await addDocuments(e.dataTransfer.files);
            e.dataTransfer.clearData();
        }
    };

    const handleDragEvents = (e: React.DragEvent<HTMLDivElement>, enter: boolean) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(enter);
    };

    const handlePreview = (doc: CaseDocument) => {
        setPreviewDoc(doc);
    };
    
    const handleSavePhoto = async (photoFile: File) => {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(photoFile);
        await addDocuments(dataTransfer.files);
        setIsCameraOpen(false);
    };

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
            
             <div className="flex flex-col sm:flex-row items-stretch justify-center w-full gap-4">
                <div 
                    className={`flex-grow flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isDragging ? 'border-blue-500 bg-blue-100' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                        <DocumentArrowUpIcon className="w-8 h-8 mb-2 text-gray-500"/>
                        <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">اختر ملف</span> أو اسحبه هنا</p>
                    </div>
                </div>
                <button 
                    onClick={() => setIsCameraOpen(true)}
                    className="flex flex-col items-center justify-center h-32 w-full sm:w-32 border-2 border-dashed border-gray-300 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                    type="button"
                    aria-label="التقط صورة"
                >
                    <CameraIcon className="w-8 h-8 mb-2 text-gray-500"/>
                    <p className="text-sm text-gray-500 font-semibold">التقط صورة</p>
                </button>
            </div> 

             {isSyncing && !loading && (
                <div className="flex justify-center items-center p-2 text-sm text-blue-600 animate-fade-in">
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    <p className="ms-2">جاري المزامنة مع السحابة...</p>
                </div>
            )}

            {error && (
                 <div className={`p-4 text-sm rounded-lg flex items-start gap-3 ${error.includes('أنت غير متصل') ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                    <ExclamationTriangleIcon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${error.includes('أنت غير متصل') ? 'text-yellow-500' : 'text-red-500'}`} />
                    <div>{error}</div>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center items-center p-8">
                    <ArrowPathIcon className="w-6 h-6 text-gray-500 animate-spin" />
                    <p className="ms-2 text-gray-600">جاري تحميل الوثائق المحلية...</p>
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

            {isCameraOpen && <CameraModal onClose={() => setIsCameraOpen(false)} onSave={handleSavePhoto} />}

            {previewDoc && (
                <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4" onClick={() => setPreviewDoc(null)}>
                    <button className="absolute top-4 right-4 text-white p-2 bg-black/50 rounded-full hover:bg-black/75 z-10" onClick={() => setPreviewDoc(null)}>
                        <XMarkIcon className="w-6 h-6"/>
                    </button>
                    
                    <div onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full flex items-center justify-center">
                        {(() => {
                            if (!previewDoc.publicUrl) {
                                return <UnsupportedPreview doc={previewDoc} />;
                            }

                            const mimeType = previewDoc.mime_type.toLowerCase();
                            const fileName = previewDoc.file_name.toLowerCase();

                            if (mimeType.startsWith('image/')) {
                                return <img src={previewDoc.publicUrl} alt={previewDoc.file_name} className="max-h-full max-w-full object-contain rounded-lg" />;
                            }
                            if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
                                return <iframe src={previewDoc.publicUrl} title={previewDoc.file_name} className="w-[80vw] h-[90vh] bg-white border-none rounded-lg"></iframe>;
                            }
                            if (mimeType.startsWith('video/')) {
                                return <video src={previewDoc.publicUrl} controls autoPlay className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg" />;
                            }
                            if (mimeType.startsWith('audio/')) {
                                return (
                                    <div className="bg-white p-8 rounded-lg shadow-xl">
                                        <h3 className="text-lg font-semibold text-gray-800 mb-4">{previewDoc.file_name}</h3>
                                        <audio src={previewDoc.publicUrl} controls autoPlay className="w-full" />
                                    </div>
                                );
                            }
                            if (mimeType.startsWith('text/')) {
                                return <TextPreview fileUrl={previewDoc.publicUrl} fileName={previewDoc.file_name} />;
                            }
                            if (mimeType.includes('word') || fileName.endsWith('.doc') || fileName.endsWith('.docx')) {
                                return <DocxPreview fileUrl={previewDoc.publicUrl} fileName={previewDoc.file_name} />;
                            }

                            // Fallback for any other type
                            return <UnsupportedPreview doc={previewDoc} />;
                        })()}
                    </div>
                </div>
            )}
            
            {docToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]" onClick={() => setDocToDelete(null)}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4"><ExclamationTriangleIcon className="h-8 w-8 text-red-600" /></div>
                            <h3 className="text-2xl font-bold text-gray-900">تأكيد حذف الوثيقة</h3>
                            <p className="text-gray-600 my-4">هل أنت متأكد من حذف الملف "{docToDelete.file_name}"؟ لا يمكن التراجع عن هذا الإجراء.</p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button type="button" className="px-6 py-2 bg-gray-200 rounded-lg" onClick={() => setDocToDelete(null)}>إلغاء</button>
                            <button type="button" className="px-6 py-2 bg-red-600 text-white rounded-lg" onClick={() => { deleteDocument(docToDelete); setDocToDelete(null); }}>نعم، قم بالحذف</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CaseDocuments;