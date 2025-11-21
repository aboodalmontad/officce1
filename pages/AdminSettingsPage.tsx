
import * as React from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { MusicalNoteIcon, PlayCircleIcon, TrashIcon, ArrowUpTrayIcon, ServerIcon, ClipboardDocumentIcon } from '../components/icons';
// Fix: The imported variable name contained hyphens, which is invalid syntax. Corrected to use the camelCase version.
import { defaultUserApprovalSoundBase64 } from '../components/RealtimeNotifier';
import { useData } from '../context/DataContext';

const USER_APPROVAL_SOUND_KEY = 'customUserApprovalSound';

interface AdminSettingsPageProps {
    onOpenConfig: () => void;
}

const AdminSettingsPage: React.FC<AdminSettingsPageProps> = ({ onOpenConfig }) => {
    const { systemSettings, updateSystemSetting } = useData();
    const [customSound, setCustomSound] = useLocalStorage<string | null>(USER_APPROVAL_SOUND_KEY, null);
    const [feedback, setFeedback] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [template, setTemplate] = React.useState('');

    // Load the current template from the system settings
    React.useEffect(() => {
        const savedTemplate = systemSettings.find(s => s.key === 'verification_message_template');
        if (savedTemplate) {
            setTemplate(savedTemplate.value);
        } else {
            // Default fallback if nothing is in DB yet
            setTemplate('مرحباً {{name}}،\nكود تفعيل حسابك في تطبيق مكتب المحامي هو: *{{code}}*\nيرجى إدخال هذا الكود في التطبيق لتأكيد رقم هاتفك.');
        }
    }, [systemSettings]);

    const showFeedback = (message: string, type: 'success' | 'error') => {
        setFeedback({ message, type });
        setTimeout(() => setFeedback(null), 3000);
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('audio/')) {
            showFeedback('الرجاء اختيار ملف صوتي صالح.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target?.result as string;
            setCustomSound(base64);
            showFeedback('تم حفظ صوت التنبيه الجديد بنجاح.', 'success');
        };
        reader.onerror = () => {
            showFeedback('فشل في قراءة الملف.', 'error');
        };
        reader.readAsDataURL(file);
    };

    const playSound = () => {
// Fix: Use the valid camelCase variable name 'defaultUserApprovalSoundBase64'.
        const soundSource = customSound || defaultUserApprovalSoundBase64;
        try {
            // Create a new Audio object on demand for robust preview playback.
            const audio = new Audio(soundSource);
            audio.play().catch(e => {
                console.error("Audio preview playback failed:", e);
                showFeedback('فشل تشغيل الصوت. قد يكون الملف تالفًا أو غير مدعوم.', 'error');
            });
        } catch (e) {
            console.error("Error creating Audio object for preview:", e);
            showFeedback('فشل تهيئة الصوت. قد يكون الملف تالفًا.', 'error');
        }
    };

    const resetSound = () => {
        setCustomSound(null);
        showFeedback('تمت استعادة الصوت الافتراضي.', 'success');
    };

    const saveTemplate = () => {
        if (!template.trim()) {
            showFeedback('لا يمكن ترك القالب فارغاً.', 'error');
            return;
        }
        updateSystemSetting('verification_message_template', template);
        showFeedback('تم حفظ قالب الرسالة بنجاح.', 'success');
    };

    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-bold text-gray-800">إعدادات المدير</h1>

            {feedback && (
                <div className={`p-4 rounded-lg flex items-center gap-3 ${feedback.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    <span>{feedback.message}</span>
                </div>
            )}
            
            <div className="bg-white p-6 rounded-lg shadow space-y-6">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3 flex items-center gap-3">
                    <ClipboardDocumentIcon className="w-6 h-6 text-blue-600" />
                    <span>قالب رسالة التفعيل</span>
                </h2>
                <div className="p-4 bg-gray-50 border rounded-lg">
                    <p className="text-sm text-gray-600 mb-2">
                        قم بتعديل الرسالة التي يتم إرسالها تلقائياً عبر واتساب للمستخدمين الجدد لتزويدهم بكود التفعيل.
                        <br/>
                        استخدم المتغيرات التالية داخل النص:
                    </p>
                    <ul className="list-disc list-inside text-sm text-gray-600 mb-4 px-2">
                        <li><code>{'{{name}}'}</code> : سيتم استبداله باسم المستخدم.</li>
                        <li><code>{'{{code}}'}</code> : سيتم استبداله بكود التفعيل.</li>
                    </ul>
                    
                    <textarea 
                        value={template}
                        onChange={(e) => setTemplate(e.target.value)}
                        className="w-full p-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent h-32 text-sm"
                        dir="auto"
                    />
                    
                    <div className="mt-4 flex justify-end">
                        <button 
                            onClick={saveTemplate}
                            className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            حفظ القالب
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow space-y-6">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3 flex items-center gap-3">
                    <ServerIcon className="w-6 h-6 text-blue-600" />
                    <span>تكوين النظام</span>
                </h2>
                <div className="p-4 bg-gray-50 border rounded-lg">
                    <h3 className="font-semibold text-lg text-gray-800">معالج إعداد قاعدة البيانات</h3>
                    <p className="text-sm text-gray-600 mt-1">
                        استخدم هذه الأداة لإعداد جداول قاعدة البيانات، وتكوين صلاحيات التخزين، وإصلاح مشاكل المزامنة. يجب استخدام هذه الأداة بحذر.
                    </p>
                    <div className="mt-4">
                        <button 
                            onClick={onOpenConfig}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <ServerIcon className="w-5 h-5" />
                            <span>فتح معالج الإعداد</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow space-y-6">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3 flex items-center gap-3">
                    <MusicalNoteIcon className="w-6 h-6 text-blue-600" />
                    <span>تخصيص صوت التنبيهات</span>
                </h2>

                <div className="p-4 bg-gray-50 border rounded-lg">
                    <h3 className="font-semibold text-lg text-gray-800">صوت تنبيه تسجيل مستخدم جديد</h3>
                    <p className="text-sm text-gray-600 mt-1">
                        اختر ملفًا صوتيًا (مثل MP3, WAV) ليتم تشغيله عند تسجيل مستخدم جديد في انتظار الموافقة.
                    </p>

                    <div className="mt-4 flex flex-col sm:flex-row items-center gap-4">
                        <input
                            type="file"
                            id="sound-upload"
                            accept="audio/*"
                            className="hidden"
                            onChange={handleFileChange}
                        />
                        <label
                            htmlFor="sound-upload"
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                        >
                            <ArrowUpTrayIcon className="w-5 h-5" />
                            <span>اختر ملفًا صوتيًا...</span>
                        </label>

                        
                        <button
                            onClick={playSound}
                            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 transition-colors"
                        >
                            <PlayCircleIcon className="w-5 h-5" />
                            <span>تشغيل الصوت الحالي</span>
                        </button>
                        {customSound && (
                            <button
                                onClick={resetSound}
                                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors"
                            >
                                <TrashIcon className="w-5 h-5" />
                                <span>استعادة الافتراضي</span>
                            </button>
                        )}
                    </div>
                     {customSound ? <p className="text-xs text-gray-500 mt-2">تم تعيين صوت مخصص.</p> : <p className="text-xs text-gray-500 mt-2">يتم استخدام الصوت الافتراضي حالياً.</p>}
                </div>
            </div>
        </div>
    );
};

export default AdminSettingsPage;
