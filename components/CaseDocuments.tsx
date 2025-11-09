import * as React from 'react';
import { useData } from '../App';
import { CaseDocument } from '../types';
import { DocumentArrowUpIcon, TrashIcon, EyeIcon, DocumentTextIcon, PhotoIcon, XMarkIcon, ExclamationTriangleIcon, ArrowPathIcon, CameraIcon, CloudArrowUpIcon, CloudArrowDownIcon, CheckCircleIcon, ExclamationCircleIcon, ArrowDownTrayIcon } from './icons';
import { renderAsync } from 'docx-preview';
import { GoogleGenAI, Modality } from '@google/genai';

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
            return <CloudArrowDownIcon className="w-5 h-5 text-gray-400" title="جاهز للتنزيل" />;
        case 'downloading':
            return <CloudArrowDownIcon className="w-5 h-5 text-blue-500 animate-spin" title="جاري التنزيل..." />;
        case 'error':
            return <ExclamationCircleIcon className="w-5 h-5 text-red-500" title="فشل المزامنة" />;
        default:
            return null;
    }
};

const getFileIcon = (doc: CaseDocument) => {
    const type = doc.type;
    const name = doc.name.toLowerCase();
    if (type.startsWith('image/')) return <PhotoIcon className="w-12 h-12 text-gray-400" />;
    if (type === 'application/pdf' || name.endsWith('.pdf')) return <DocumentTextIcon className="w-12 h-12 text-red-500" />;
    if (type.includes('word') || name.endsWith('.docx') || name.endsWith('.doc')) return <DocumentTextIcon className="w-12 h-12 text-blue-500" />;
    return <DocumentTextIcon className="w-12 h-12 text-gray-400" />;
};


const FilePreview: React.FC<{ doc: CaseDocument, onPreview: (doc: CaseDocument) => void, onDelete: (doc: CaseDocument) => void }> = ({ doc, onPreview, onDelete }) => {
    const [thumbnailUrl, setThumbnailUrl] = React.useState<string | null>(null);
    const [isLoadingThumbnail, setIsLoadingThumbnail] = React.useState(false);
    const { getDocumentFile } = useData();

    React.useEffect(() => {
        let objectUrl: string | null = null;
        let isMounted = true;
        const generateThumbnail = async () => {
            if (doc.localState === 'pending_download' || !doc.type.startsWith('image/')) {
                 setIsLoadingThumbnail(false);
                 return;
            }

            setIsLoadingThumbnail(true);
            const file = await getDocumentFile(doc);
            if (!file || !isMounted) {
                setIsLoadingThumbnail(false);
                return;
            }

            if (doc.type.startsWith('image/')) {
                objectUrl = URL.createObjectURL(file);
                setThumbnailUrl(objectUrl);
            }
            setIsLoadingThumbnail(false);
        };

        generateThumbnail();

        return () => {
            isMounted = false;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [doc, getDocumentFile]);
    
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
                {isLoadingThumbnail ? (
                     <div className="flex-grow flex items-center justify-center bg-gray-200 w-full h-full">
                        <ArrowPathIcon className="w-8 h-8 text-gray-400 animate-spin"/>
                    </div>
                ) : thumbnailUrl ? (
                    <img src={thumbnailUrl} alt={doc.name} className="object-cover w-full h-full" />
                ) : (
                    <div className="flex-grow flex items-center justify-center bg-gray-200 w-full h-full">
                        {getFileIcon(doc)}
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
        <div className="w-full h-full bg-gray-100 rounded-lg overflow-auto flex flex-col">
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
    const { getDocumentFile, documents } = useData();
    const [file, setFile] = React.useState<File | null>(null);
    const [objectUrl, setObjectUrl] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);

    const currentDoc = documents.find(d => d.id === doc.id) || doc;

    React.useEffect(() => {
        let url: string | null = null;
        const loadFile = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const retrievedFile = await getDocumentFile(doc);
                if (retrievedFile) {
                    setFile(retrievedFile);
                    url = URL.createObjectURL(retrievedFile);
                    setObjectUrl(url);
                } else {
                    const latestDocState = documents.find(d => d.id === doc.id)?.localState;
                    if (latestDocState === 'error') {
                        setError('فشل تنزيل الملف. يرجى التحقق من اتصالك بالإنترنت والتأكد من تطبيق صلاحيات التخزين (Storage Policies) بشكل صحيح في لوحة تحكم Supabase.');
                    } else if (latestDocState !== 'downloading') {
                        setError('الملف غير متوفر محلياً. حاول مرة أخرى عند توفر اتصال بالإنترنت لتنزيله.');
                    }
                }
            } catch (e: any) {
                setError('حدث خطأ غير متوقع: ' + e.message);
            } finally {
                setIsLoading(false);
            }
        };

        loadFile();
            
        return () => {
            if (url) {
                URL.revokeObjectURL(url);
            }
        };
    }, [doc.id, documents]);


    const handleDownload = () => {
        if (objectUrl) {
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = doc.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    };

    const renderPreview = () => {
        if (currentDoc.localState === 'downloading' || isLoading) {
            return (
                <div className="flex flex-col items-center justify-center h-full">
                    <CloudArrowDownIcon className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                    <p className="text-gray-700">جاري تنزيل الملف...</p>
                </div>
            );
        }

        if (error) {
             return <div className="flex flex-col items-center justify-center h-full p-4"><ExclamationTriangleIcon className="w-10 h-10 text-red-500 mb-4"/><p className="text-red-700 text-center">{error}</p></div>;
        }

        if (!file || !objectUrl) {
            return <div className="flex items-center justify-center h-full"><p className="text-gray-500">لا يمكن عرض الملف.</p></div>;
        }
        
        if (file.type.startsWith('image/')) return <img src={objectUrl} alt={doc.name} className="max-h-full max-w-full object-contain mx-auto" />;
        if (file.type === 'application/pdf') return <embed src={objectUrl} type="application/pdf" width="100%" height="100%" />;
        if (doc.name.toLowerCase().endsWith('.docx') || doc.name.toLowerCase().endsWith('.doc')) return <DocxPreview file={file} name={doc.name} />;
        if (file.type.startsWith('text/')) return <TextPreview file={file} name={doc.name} />;
        
        return (
            <div className="text-center p-8 flex flex-col items-center justify-center h-full">
                <DocumentTextIcon className="w-16 h-16 text-gray-400 mb-4" />
                <h3 className="font-bold text-lg">لا توجد معاينة متاحة</h3>
                <p className="text-gray-600">تنسيق الملف ({doc.type}) غير مدعوم للمعاينة المباشرة.</p>
                <button onClick={handleDownload} className="mt-6 flex items-center mx-auto gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    <ArrowDownTrayIcon className="w-5 h-5" />
                    <span>تنزيل الملف ({ (file.size / (1024 * 1024)).toFixed(2) } MB)</span>
                </button>
            </div>
        );
    };
    
    const isComplexPreview = file && (file.type === 'application/pdf' || doc.name.toLowerCase().endsWith('.docx') || doc.name.toLowerCase().endsWith('.doc'));

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full h-full max-w-6xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="flex justify-between items-center p-3 border-b bg-gray-50 flex-shrink-0">
                    <h3 className="text-lg font-semibold text-gray-800 truncate">{doc.name}</h3>
                    <div className="flex items-center gap-4">
                        <button onClick={handleDownload} className="flex items-center gap-2 text-sm px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                            <ArrowDownTrayIcon className="w-4 h-4" />
                            <span>تنزيل</span>
                        </button>
                        <button onClick={onClose} className="p-2 text-gray-500 hover:bg-gray-200 rounded-full">
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>
                </header>
                 <main className="flex-grow p-1 bg-gray-200 overflow-auto">
                    {renderPreview()}
                </main>
            </div>
        </div>
    );
};


const CameraModal: React.FC<{ onClose: () => void; onCapture: (file: File) => void }> = ({ onClose, onCapture }) => {
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let stream: MediaStream | null = null;
        
        const startCamera = async () => {
            try {
                const constraints = {
                    video: {
                        facingMode: 'environment',
                        width: { ideal: 4096 },
                        height: { ideal: 2160 }
                    }
                };
                stream = await navigator.mediaDevices.getUserMedia(constraints);
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            } catch (err) {
                console.error("Error accessing camera:", err);
                setError('لم يتمكن من الوصول إلى الكاميرا. يرجى التحقق من الأذونات.');
            }
        };
        startCamera();

        return () => {
            stream?.getTracks().forEach(track => track.stop());
        };
    }, []);

    const handleCapture = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            context?.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
            
            canvas.toBlob(blob => {
                if (blob) {
                    const fileName = `capture-${new Date().toISOString()}.jpeg`;
                    const file = new File([blob], fileName, { type: 'image/jpeg' });
                    onCapture(file);
                }
            }, 'image/jpeg', 0.95);
        }
    };

    return (
        <div className="fixed inset-0 bg-black flex flex-col z-50" onClick={onClose}>
            <div className="relative w-full h-full" onClick={e => e.stopPropagation()}>
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
                <canvas ref={canvasRef} className="hidden"></canvas>
                {error && <div className="absolute inset-0 flex items-center justify-center text-white bg-black/50 p-4">{error}</div>}
                
                <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full transition-opacity hover:opacity-100 opacity-80">
                    <XMarkIcon className="w-6 h-6" />
                </button>
                
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-6 flex justify-center items-center">
                    <button onClick={handleCapture} className="p-4 bg-white rounded-full shadow-lg" aria-label="التقاط صورة">
                        <div className="w-12 h-12 rounded-full bg-blue-600 ring-4 ring-white ring-offset-2 ring-offset-transparent"></div>
                    </button>
                </div>
            </div>
        </div>
    );
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result.split(',')[1]); // remove data:mime/type;base64,
            } else {
                reject(new Error('Failed to convert blob to base64 string.'));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};


const CaseDocuments: React.FC<CaseDocumentsProps> = ({ caseId }) => {
    const { documents, addDocuments, deleteDocument } = useData();
    const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
    const [docToDelete, setDocToDelete] = React.useState<CaseDocument | null>(null);
    const [previewDoc, setPreviewDoc] = React.useState<CaseDocument | null>(null);
    const [isDragging, setIsDragging] = React.useState(false);
    const [isCameraOpen, setIsCameraOpen] = React.useState(false);
    const [isProcessing, setIsProcessing] = React.useState(false);

    const caseDocuments = React.useMemo(() => 
        documents.filter(doc => doc.caseId === caseId).sort((a,b) => b.addedAt.getTime() - a.addedAt.getTime()), 
        [documents, caseId]
    );

    const handleFileChange = (files: FileList | null) => {
        if (files && files.length > 0) {
            addDocuments(caseId, files);
        }
    };
    
    const handleDragEvents = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragging(true);
        } else if (e.type === 'dragleave') {
            setIsDragging(false);
        }
    };
    
    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
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

    const handlePhotoCapture = async (file: File) => {
        setIsCameraOpen(false);
        setIsProcessing(true);
    
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
            const base64Data = await blobToBase64(file);
    
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: {
                    parts: [
                        {
                            inlineData: {
                                data: base64Data,
                                mimeType: file.type,
                            },
                        },
                        {
                            text: 'This is an image of a document captured by a phone camera. Please perform the following enhancements: automatically detect and crop the document to its boundaries, correct any perspective distortion (straighten the document), and enhance the contrast and clarity to make the text sharp and readable as if it were scanned. If the document is primarily text, convert it to a high-contrast black and white image. Otherwise, enhance the existing colors for clarity. Return the enhanced document as a high-quality JPEG image.',
                        },
                    ],
                },
                config: {
                    responseModalities: [Modality.IMAGE],
                },
            });
    
            let processedImageFound = false;
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    const base64ImageBytes = part.inlineData.data;
                    const mimeType = part.inlineData.mimeType;
    
                    const byteCharacters = atob(base64ImageBytes);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: mimeType });
                    
                    const originalName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
                    const newExtension = mimeType.split('/')[1] || 'jpeg';
                    const enhancedFile = new File([blob], `${originalName}_enhanced.${newExtension}`, { type: mimeType });
    
                    const fileList = new DataTransfer();
                    fileList.items.add(enhancedFile);
                    await addDocuments(caseId, fileList.files);
                    processedImageFound = true;
                    break; 
                }
            }
            if (!processedImageFound) {
                throw new Error('AI processing did not return an image. Saving original.');
            }
    
        } catch (error) {
            console.error("AI enhancement failed, saving original image:", error);
            const fileList = new DataTransfer();
            fileList.items.add(file);
            await addDocuments(caseId, fileList.files);
        } finally {
            setIsProcessing(false);
        }
    };
    
    const handlePreview = (doc: CaseDocument) => {
        setPreviewDoc(doc);
    };

    return (
        <div className="space-y-4">
            {isProcessing && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex flex-col items-center justify-center z-[60]">
                    <ArrowPathIcon className="w-12 h-12 text-white animate-spin" />
                    <p className="mt-4 text-white font-semibold">جاري تحسين الصورة بواسطة الذكاء الاصطناعي...</p>
                </div>
            )}
            <div className="flex flex-col sm:flex-row gap-4">
                 <input type="file" id={`file-upload-${caseId}`} multiple className="hidden" onChange={(e) => handleFileChange(e.target.files)} />
                 <div 
                    onDragEnter={handleDragEvents}
                    onDragLeave={handleDragEvents}
                    onDragOver={handleDragEvents}
                    onDrop={handleDrop}
                    className="flex-grow"
                 >
                    <label 
                        htmlFor={`file-upload-${caseId}`} 
                        className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-100 transition-colors h-full ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
                    >
                        <DocumentArrowUpIcon className="w-10 h-10 text-gray-400 mb-2" />
                        <span className="font-semibold text-gray-700">اسحب وأفلت الملفات هنا، أو اضغط للاختيار</span>
                        <p className="text-xs text-gray-500">يمكنك إضافة الصور، ملفات PDF، ومستندات Word</p>
                    </label>
                </div>
                <button
                    onClick={() => setIsCameraOpen(true)}
                    className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                >
                    <CameraIcon className="w-10 h-10 text-gray-400 mb-2" />
                    <span className="font-semibold text-gray-700">التقاط صورة</span>
                    <p className="text-xs text-gray-500">استخدم كاميرا جهازك</p>
                </button>
            </div>
            
            {caseDocuments.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {caseDocuments.map(doc => (
                        <FilePreview key={doc.id} doc={doc} onPreview={handlePreview} onDelete={openDeleteModal} />
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
            {isCameraOpen && <CameraModal onClose={() => setIsCameraOpen(false)} onCapture={handlePhotoCapture} />}
        </div>
    );
};

export default CaseDocuments;
