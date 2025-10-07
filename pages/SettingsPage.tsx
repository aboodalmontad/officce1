import * as React from 'react';
import { TrashIcon, ExclamationTriangleIcon, CloudArrowUpIcon, ArrowPathIcon, PlusIcon, CheckCircleIcon, XCircleIcon, ArrowDownTrayIcon, ArrowUpTrayIcon } from '../components/icons';
import { Client, AdminTask, Appointment, AccountingEntry } from '../types';
import { AnalysisStatus } from '../hooks/useSync';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
// FIX: The APP_DATA_KEY constant was being imported from an empty file. It is now imported from useSupabaseData.ts where it is correctly defined and exported.
import { APP_DATA_KEY } from '../hooks/useSupabaseData';

type AppData = {
    clients: Client[];
    adminTasks: AdminTask[];
    appointments: Appointment[];
    accountingEntries: AccountingEntry[];
    assistants: string[];
};

interface SettingsPageProps {
    setFullData: (data: any) => void;
    analysisStatus: AnalysisStatus;
    lastAnalysis: Date | null;
    triggerAnalysis: () => void;
    assistants: string[];
    setAssistants: (updater: (prev: string[]) => string[]) => void;
    analysisReport: string | null;
    offlineMode: boolean;
    setOfflineMode: (value: boolean) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ setFullData, analysisStatus, lastAnalysis, triggerAnalysis, assistants, setAssistants, analysisReport, offlineMode, setOfflineMode }) => {
    const [feedback, setFeedback] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = React.useState(false);
    const [isDeleteAssistantModalOpen, setIsDeleteAssistantModalOpen] = React.useState(false);
    const [assistantToDelete, setAssistantToDelete] = React.useState<string | null>(null);
    const isOnline = useOnlineStatus();
    const [newAssistant, setNewAssistant] = React.useState('');

    const showFeedback = (message: string, type: 'success' | 'error') => {
        setFeedback({ message, type });
        setTimeout(() => setFeedback(null), 4000);
    };

    const handleConfirmClearData = () => {
        try {
            const emptyData = {
                clients: [],
                adminTasks: [],
                appointments: [],
                accountingEntries: [],
                assistants: ['بدون تخصيص']
            };
            setFullData(emptyData);
            showFeedback('تم مسح جميع البيانات بنجاح.', 'success');
        } catch (error) {
            console.error('Failed to clear data:', error);
            showFeedback('حدث خطأ أثناء مسح البيانات.', 'error');
        }
        setIsConfirmModalOpen(false);
    };

    const handleExportData = () => {
        try {
            const data = localStorage.getItem(APP_DATA_KEY);
            if (!data) {
                showFeedback('لا توجد بيانات لتصديرها.', 'error');
                return;
            }
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const date = new Date().toISOString().split('T')[0];
            a.download = `lawyer_app_backup_${date}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showFeedback('تم تصدير البيانات بنجاح.', 'success');
        } catch (error) {
            console.error("Failed to export data:", error);
            showFeedback('فشل تصدير البيانات.', 'error');
        }
    };

    const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') throw new Error("File could not be read.");
                const data = JSON.parse(text);
                setFullData(data);
                showFeedback('تم استيراد البيانات بنجاح. سيتم تحديث الصفحة.', 'success');
            } catch (error) {
                console.error("Failed to import data:", error);
                showFeedback('فشل استيراد البيانات. تأكد من أن الملف صحيح.', 'error');
            }
        };
        reader.readAsText(file);
    };


    const getAnalysisButtonContent = () => {
        switch (analysisStatus) {
            case 'analyzing':
                return <><ArrowPathIcon className="w-5 h-5 animate-spin" /> <span>جاري التحليل...</span></>;
            case 'success':
                return <><CheckCircleIcon className="w-5 h-5 text-green-400" /> <span>اكتمل التحليل</span></>;
            case 'error':
                return <><XCircleIcon className="w-5 h-5 text-red-400" /> <span>فشل التحليل</span></>;
            default:
                return <><CloudArrowUpIcon className="w-5 h-5" /> <span>تحليل الأداء الآن</span></>;
        }
    };

    const handleAddAssistant = (e: React.FormEvent) => {
        e.preventDefault();
        if (newAssistant && !assistants.includes(newAssistant) && newAssistant !== 'بدون تخصيص') {
            setAssistants(prev => [...prev, newAssistant.trim()]);
            setNewAssistant('');
        }
    };

    const handleDeleteAssistant = (name: string) => {
        if (name !== 'بدون تخصيص') {
            setAssistantToDelete(name);
            setIsDeleteAssistantModalOpen(true);
        }
    };

    const handleConfirmDeleteAssistant = () => {
        if (assistantToDelete) {
            setAssistants(prev => prev.filter(a => a !== assistantToDelete));
            showFeedback(`تم حذف المساعد "${assistantToDelete}" بنجاح.`, 'success');
        }
        setIsDeleteAssistantModalOpen(false);
        setAssistantToDelete(null);
    };
    
    const handleEnableSync = () => {
        setOfflineMode(false);
    };

    const handleDisableSync = () => {
        if (window.confirm('هل أنت متأكد من تعطيل المزامنة؟ سيعود التطبيق للعمل في الوضع المحلي فقط على هذا الجهاز.')) {
            localStorage.removeItem('supabaseUrl');
            localStorage.removeItem('supabaseAnonKey');
            setOfflineMode(true);
            // Reload to ensure all hooks and contexts re-evaluate the offline state from scratch
            window.location.reload();
        }
    };


    const AnalysisReportDisplay: React.FC<{ report: string; status: AnalysisStatus }> = ({ report, status }) => {
        const isError = status === 'error';
        const renderContent = (content: string) => content.split('\n').map((line, i) => {
            line = line.trim();
            if (line.startsWith('- ')) return <li key={i} className="ms-5 list-disc">{line.substring(2)}</li>;
            if (line) return <p key={i}>{line}</p>;
            return null;
        }).filter(Boolean);
        const sections = report.split('### ').slice(1);
        return (
            <div className={`mt-6 p-4 border ${isError ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'} rounded-lg space-y-4 animate-fade-in`}>
                {sections.map((section, index) => {
                    const [title, ...contentLines] = section.split('\n');
                    const content = contentLines.join('\n').trim();
                    return (
                        <div key={index}>
                            <h4 className={`text-lg font-bold ${isError ? 'text-red-800' : 'text-blue-800'}`}>{title.trim()}</h4>
                            <div className={`mt-2 text-sm ${isError ? 'text-red-700' : 'text-gray-700'} space-y-2`}>{renderContent(content)}</div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">الإعدادات</h1>
            
            {feedback && (
                <div className={`p-4 rounded-lg flex items-center gap-3 ${feedback.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    <span>{feedback.message}</span>
                </div>
            )}

            <div className="bg-white p-6 rounded-lg shadow space-y-4">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3">المزامنة السحابية</h2>
                {offlineMode ? (
                    <>
                        <div className="flex items-center gap-3">
                            <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500" />
                            <p className="text-gray-700">
                                <span className="font-semibold">الحالة:</span> معطلة. يتم حفظ بياناتك على هذا الجهاز فقط.
                            </p>
                        </div>
                        <p className="text-sm text-gray-600">
                            قم بتفعيل المزامنة السحابية لحفظ نسخة احتياطية من بياناتك والوصول إليها من أي جهاز.
                        </p>
                        <div className="pt-2">
                            <button 
                                onClick={handleEnableSync} 
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                <CloudArrowUpIcon className="w-5 h-5" />
                                <span>تفعيل وإعداد المزامنة السحابية</span>
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex items-center gap-3">
                            <CheckCircleIcon className="w-5 h-5 text-green-500" />
                            <p className="text-gray-700">
                                <span className="font-semibold">الحالة:</span> مفعلة. تتم مزامنة بياناتك مع السحابة.
                            </p>
                        </div>
                        <p className="text-sm text-gray-600">
                            يمكنك تعطيل المزامنة السحابية والعودة إلى حفظ البيانات على هذا الجهاز فقط. لن يؤثر هذا على بياناتك المحفوظة في السحابة أو على هذا الجهاز.
                        </p>
                        <div className="pt-2">
                            <button 
                                onClick={handleDisableSync} 
                                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
                            >
                                <XCircleIcon className="w-5 h-5" />
                                <span>تعطيل المزامنة السحابية</span>
                            </button>
                        </div>
                    </>
                )}
            </div>

            <div className="bg-white p-6 rounded-lg shadow space-y-4">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3">حفظ ونقل البيانات</h2>
                <p className="text-gray-600 text-sm">
                    يتم حفظ جميع بياناتك بشكل آمن وتلقائي على هذا الجهاز. للعمل على جهاز آخر، يمكنك استخدام أدوات التصدير والاستيراد لنقل نسخة من بياناتك.
                </p>
                <div className="flex flex-col md:flex-row gap-6 pt-4 border-t">
                    <div className="flex-1 space-y-2">
                        <h3 className="font-semibold text-lg">تصدير البيانات</h3>
                        <p className="text-gray-600 text-sm">
                            احفظ نسخة احتياطية من جميع بياناتك في ملف واحد. يمكنك استخدام هذا الملف لاستعادة بياناتك أو نقلها إلى جهاز آخر.
                        </p>
                        <button onClick={handleExportData} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors">
                           <ArrowDownTrayIcon className="w-5 h-5" />
                           <span>تصدير البيانات الآن</span>
                        </button>
                    </div>
                    <div className="flex-1 space-y-2">
                        <h3 className="font-semibold text-lg">استيراد البيانات</h3>
                        <p className="text-gray-600 text-sm">
                           استورد بيانات من ملف تصدير. <strong className="text-red-600">تحذير:</strong> سيؤدي هذا إلى استبدال جميع البيانات الحالية.
                        </p>
                        <input type="file" id="import-file" className="hidden" onChange={handleImportData} accept=".json"/>
                        <label htmlFor="import-file" className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors cursor-pointer">
                            <ArrowUpTrayIcon className="w-5 h-5" />
                            <span>اختر ملف للاستيراد</span>
                        </label>
                    </div>
                </div>
            </div>


            <div className="bg-white p-6 rounded-lg shadow space-y-6">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3">تحليل الأداء بالذكاء الاصطناعي</h2>
                <div className="flex flex-col lg:flex-row items-start justify-between gap-4">
                    <div className="flex-grow">
                        <h3 className="font-semibold text-lg">تحليل بيانات المكتب</h3>
                        <p className="text-gray-600 text-sm mt-1">
                           استخدم الذكاء الاصطناعي لتحليل بياناتك الحالية والحصول على ملخص أداء وتوصيات ذكية لتحسين إدارة مكتبك.
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                            آخر تحليل ناجح: {lastAnalysis ? lastAnalysis.toLocaleString('ar-SY') : 'لم يتم التحليل بعد'}
                        </p>
                    </div>
                    <button 
                        onClick={triggerAnalysis}
                        disabled={!isOnline || analysisStatus === 'analyzing'}
                        className="flex-shrink-0 w-full lg:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
                        title={!isOnline ? 'التحليل يتطلب اتصالاً بالإنترنت' : 'تحليل بيانات المكتب'}
                    >
                        {getAnalysisButtonContent()}
                    </button>
                </div>
                 {analysisReport && <AnalysisReportDisplay report={analysisReport} status={analysisStatus} />}
            </div>

            <div className="bg-white p-6 rounded-lg shadow space-y-6">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3">إدارة المساعدين</h2>
                <div className="space-y-4">
                    <div>
                        <form onSubmit={handleAddAssistant} className="mt-1 flex gap-2">
                             <input 
                                type="text" 
                                id="new-assistant"
                                value={newAssistant}
                                onChange={(e) => setNewAssistant(e.target.value)}
                                className="flex-grow p-2 border border-gray-300 rounded-lg"
                                placeholder="اسم المساعد الجديد"
                                aria-label="اسم المساعد الجديد"
                            />
                            <button type="submit" className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                                <PlusIcon className="w-5 h-5"/>
                                <span>إضافة</span>
                            </button>
                        </form>
                    </div>
                    <div>
                        <h3 className="text-lg font-medium text-gray-800">قائمة المساعدين</h3>
                        <ul className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                            {assistants.map(assistant => (
                                <li key={assistant} className="flex justify-between items-center p-3 bg-gray-50 rounded-md border">
                                    <span className="font-medium">{assistant}</span>
                                    {assistant !== 'بدون تخصيص' && (
                                        <button onClick={() => handleDeleteAssistant(assistant)} className="p-1 text-red-500 rounded-full hover:bg-red-100" aria-label={`حذف ${assistant}`}>
                                            <TrashIcon className="w-5 h-5" />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow space-y-6">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3">إدارة البيانات الخطرة</h2>
                <div className="p-4 bg-red-50 border-s-4 border-red-500 rounded-md">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <ExclamationTriangleIcon className="h-5 w-5 text-red-400" aria-hidden="true" />
                        </div>
                        <div className="ms-3">
                            <h3 className="text-lg font-semibold text-red-800">مسح جميع البيانات</h3>
                            <div className="mt-2 text-sm text-red-700">
                                <p>هذا الإجراء سيقوم بحذف جميع البيانات المخزنة في التطبيق بشكل نهائي على هذا الجهاز. لا يمكن التراجع عن هذا الإجراء.</p>
                            </div>
                             <div className="mt-4">
                                 <button onClick={() => setIsConfirmModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors">
                                    <TrashIcon className="w-5 h-5" />
                                    <span>أفهم المخاطر، قم بالمسح الآن</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {isConfirmModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setIsConfirmModalOpen(false)}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                                <ExclamationTriangleIcon className="h-8 w-8 text-red-600" aria-hidden="true" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900" id="modal-title">
                                تأكيد الحذف
                            </h3>
                            <p className="text-gray-600 my-4">
                                هل أنت متأكد من رغبتك في حذف جميع بيانات التطبيق؟ <br />
                                هذا الإجراء نهائي ولا يمكن التراجع عنه.
                            </p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button
                                type="button"
                                className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                                onClick={() => setIsConfirmModalOpen(false)}
                            >
                                إلغاء
                            </button>
                            <button
                                type="button"
                                className="px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
                                onClick={handleConfirmClearData}
                            >
                                نعم، قم بالحذف
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isDeleteAssistantModalOpen && assistantToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => { setIsDeleteAssistantModalOpen(false); setAssistantToDelete(null); }}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                                <ExclamationTriangleIcon className="h-8 w-8 text-red-600" aria-hidden="true" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900">
                                تأكيد حذف المساعد
                            </h3>
                            <p className="text-gray-600 my-4">
                                هل أنت متأكد من رغبتك في حذف المساعد "{assistantToDelete}"؟<br />
                                سيتم إزالة هذا المساعد من قائمة التخصيص.
                            </p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button
                                type="button"
                                className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                                onClick={() => { setIsDeleteAssistantModalOpen(false); setAssistantToDelete(null); }}
                            >
                                إلغاء
                            </button>
                            <button
                                type="button"
                                className="px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
                                onClick={handleConfirmDeleteAssistant}
                            >
                                نعم، قم بالحذف
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SettingsPage;