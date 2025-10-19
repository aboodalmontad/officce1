import * as React from 'react';
import { GoogleGenAI } from '@google/genai';
import { ArrowPathIcon, CloudIcon, XCircleIcon, DocumentDuplicateIcon, ClipboardDocumentCheckIcon, ArrowDownTrayIcon } from '../components/icons';

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = error => reject(error);
    });
};

const ImageProcessorPage: React.FC = () => {
    const [imageFile, setImageFile] = React.useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
    const [extractedText, setExtractedText] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);
    const [isEditing, setIsEditing] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [isCopied, setIsCopied] = React.useState(false);
    const textAreaRef = React.useRef<HTMLTextAreaElement>(null);

    const resetState = () => {
        setImageFile(null);
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
        }
        setPreviewUrl(null);
        setExtractedText('');
        setIsLoading(false);
        setIsEditing(false);
        setError(null);
    };

    const handleFileSelect = (file: File | null) => {
        if (file && file.type.startsWith('image/')) {
            resetState();
            setImageFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        } else {
            setError('الرجاء تحديد ملف صورة صالح (JPEG, PNG, etc.).');
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        handleFileSelect(e.target.files?.[0] || null);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        handleFileSelect(e.dataTransfer.files?.[0] || null);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleConvert = async () => {
        if (!imageFile) return;

        setIsLoading(true);
        setError(null);
        setExtractedText('');

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const base64Data = await fileToBase64(imageFile);

            const imagePart = {
                inlineData: {
                    mimeType: imageFile.type,
                    data: base64Data,
                },
            };
            
            const textPart = {
                text: 'استخرج النص بدقة من هذه الصورة. حافظ على التنسيق والفقرات الأصلية قدر الإمكان.'
            };

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [imagePart, textPart] },
            });
            
            setExtractedText(response.text.trim());

        } catch (err) {
            console.error(err);
            setError('فشل استخراج النص من الصورة. يرجى المحاولة مرة أخرى.');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleEditToggle = () => {
        setIsEditing(!isEditing);
        // Focus the textarea when entering edit mode
        if (!isEditing) {
            setTimeout(() => textAreaRef.current?.focus(), 0);
        }
    };
    
    const handleCopy = () => {
        if (extractedText) {
            navigator.clipboard.writeText(extractedText).then(() => {
                setIsCopied(true);
                setTimeout(() => setIsCopied(false), 2000);
            });
        }
    };
    
    const handleSaveToFile = () => {
        if (!extractedText) return;
        const blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const fileName = imageFile?.name.split('.').slice(0, -1).join('.') || 'extracted-text';
        link.download = `${fileName}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };


    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">معالج الصور</h1>
            <p className="text-gray-600">
                حوّل الصور التي تحتوي على نصوص إلى ملفات نصية قابلة للتعديل والنسخ بسهولة.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left side: Upload and Preview */}
                <div className="bg-white p-6 rounded-lg shadow space-y-4">
                    <h2 className="text-xl font-semibold">1. رفع الصورة</h2>
                    {!previewUrl ? (
                         <div
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            className="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center cursor-pointer hover:border-blue-500 hover:bg-gray-50 transition-colors"
                            onClick={() => document.getElementById('file-upload')?.click()}
                        >
                            <input id="file-upload" type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                            <CloudIcon className="w-12 h-12 mx-auto text-gray-400" />
                            <p className="mt-2 text-gray-600">اسحب وأفلت صورة هنا، أو انقر للاختيار.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="relative border rounded-lg overflow-hidden">
                                <img src={previewUrl} alt="Preview" className="w-full h-auto object-contain max-h-80" />
                                <button
                                    onClick={resetState}
                                    className="absolute top-2 right-2 bg-black bg-opacity-50 text-white p-1.5 rounded-full hover:bg-opacity-75"
                                    title="إزالة الصورة"
                                >
                                    <XCircleIcon className="w-6 h-6" />
                                </button>
                            </div>
                            <button
                                onClick={handleConvert}
                                disabled={isLoading}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
                            >
                                {isLoading ? (
                                    <>
                                        <ArrowPathIcon className="w-5 h-5 animate-spin" />
                                        <span>جاري التحليل...</span>
                                    </>
                                ) : (
                                    <span>تحويل إلى نص</span>
                                )}
                            </button>
                        </div>
                    )}
                </div>
                
                {/* Right side: Text output */}
                <div className="bg-white p-6 rounded-lg shadow space-y-4">
                    <h2 className="text-xl font-semibold">2. النص المستخرج</h2>
                    {error && <p className="text-red-600 bg-red-100 p-3 rounded-md">{error}</p>}
                    
                    <div className="relative">
                        <textarea
                            ref={textAreaRef}
                            value={extractedText}
                            readOnly={!isEditing}
                            onChange={(e) => setExtractedText(e.target.value)}
                            placeholder={isLoading ? '...' : 'سيظهر النص المستخرج من الصورة هنا.'}
                            className={`w-full h-80 p-3 border rounded-md resize-none transition-colors ${isEditing ? 'bg-white border-blue-500' : 'bg-gray-50 border-gray-300'}`}
                        />
                         {extractedText && !isLoading && (
                            <div className="absolute top-2 left-2 flex flex-col gap-2">
                                <button onClick={handleCopy} className="p-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors" title="نسخ النص">
                                    {isCopied ? <ClipboardDocumentCheckIcon className="w-5 h-5" /> : <DocumentDuplicateIcon className="w-5 h-5" />}
                                </button>
                                <button onClick={handleSaveToFile} className="p-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors" title="حفظ كملف نصي">
                                    <ArrowDownTrayIcon className="w-5 h-5" />
                                </button>
                            </div>
                         )}
                    </div>
                    {extractedText && !isLoading && (
                         <div className="flex justify-end">
                            <button
                                onClick={handleEditToggle}
                                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${isEditing ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
                            >
                                {isEditing ? 'حفظ التعديلات' : 'تعديل النص'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImageProcessorPage;
