
import React, { useRef, useState } from 'react';
import { ArrowDownTrayIcon, ArrowUpTrayIcon, TrashIcon, ExclamationTriangleIcon, CloudArrowUpIcon, ArrowPathIcon } from '../components/icons';
import { Client, AdminTask, Appointment, AccountingEntry } from '../types';
import { SyncStatus } from '../hooks/useSync';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

const APP_DATA_KEY = 'lawyerBusinessManagementData';

type AppData = {
    clients: Client[];
    adminTasks: AdminTask[];
    appointments: Appointment[];
    accountingEntries: AccountingEntry[];
};

interface SettingsPageProps {
    setFullData: (data: AppData) => void;
    syncStatus: SyncStatus;
    lastSync: Date | null;
    triggerSync: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ setFullData, syncStatus, lastSync, triggerSync }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const isOnline = useOnlineStatus();

    const showFeedback = (message: string, type: 'success' | 'error') => {
        setFeedback({ message, type });
        setTimeout(() => setFeedback(null), 4000);
    };

    const handleBackup = () => {
        try {
            const data = localStorage.getItem(APP_DATA_KEY);
            if (!data) {
                showFeedback('لا توجد بيانات لحفظها.', 'error');
                return;
            }
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const date = new Date().toISOString().split('T')[0];
            a.href = url;
            a.download = `lawyer-app-backup-${date}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showFeedback('تم تنزيل نسخة احتياطية بنجاح!', 'success');
        } catch (error) {
            console.error('Failed to create backup:', error);
            showFeedback('حدث خطأ أثناء إنشاء النسخة الاحتياطية.', 'error');
        }
    };

    const handleRestoreClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (file.type !== 'application/json') {
            showFeedback('يرجى تحديد ملف JSON صالح.', 'error');
            return;
        }

        if (!window.confirm('هل أنت متأكد من استرجاع البيانات؟ سيتم استبدال جميع البيانات الحالية.')) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') throw new Error("File content is not a string");
                const parsedData = JSON.parse(text);

                // Basic validation
                if (parsedData.clients && parsedData.adminTasks && parsedData.appointments && parsedData.accountingEntries) {
                    setFullData(parsedData);
                    showFeedback('تم استرجاع البيانات بنجاح.', 'success');
                } else {
                    showFeedback('ملف النسخ الاحتياطي غير صالح أو تالف.', 'error');
                }
            } catch (error) {
                console.error('Failed to restore data:', error);
                showFeedback('حدث خطأ أثناء قراءة ملف النسخة الاحتياطية.', 'error');
            } finally {
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            }
        };
        reader.readAsText(file);
    };

    const handleConfirmClearData = () => {
        try {
            const emptyData: AppData = {
                clients: [],
                adminTasks: [],
                appointments: [],
                accountingEntries: []
            };
            setFullData(emptyData);
            showFeedback('تم مسح جميع البيانات بنجاح.', 'success');
        } catch (error) {
            console.error('Failed to clear data:', error);
            showFeedback('حدث خطأ أثناء مسح البيانات.', 'error');
        }
        setIsConfirmModalOpen(false);
    };

    const getSyncButtonText = () => {
        switch (syncStatus) {
            case 'syncing': return 'جاري المزامنة...';
            case 'success': return 'تمت المزامنة بنجاح';
            case 'error': return 'فشلت المزامنة';
            default: return 'مزامنة الآن';
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">الإعدادات</h1>
            
            {feedback && (
                <div className={`p-4 rounded-lg flex items-center gap-3 ${feedback.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    <span>{feedback.message}</span>
                </div>
            )}
            
            <div className="bg-white p-6 rounded-lg shadow space-y-6">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3">المزامنة</h2>
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="font-semibold text-lg">مزامنة البيانات</h3>
                        <p className="text-gray-600 text-sm mt-1">قم بمزامنة بياناتك مع الخادم السحابي للوصول إليها من أي جهاز.</p>
                        <p className="text-gray-500 text-xs mt-2">
                            آخر مزامنة ناجحة: {lastSync ? lastSync.toLocaleString('ar-SY') : 'لم تتم المزامنة بعد'}
                        </p>
                    </div>
                    <button 
                        onClick={triggerSync}
                        disabled={!isOnline || syncStatus === 'syncing'}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                        title={!isOnline ? 'المزامنة تتطلب اتصالاً بالإنترنت' : ''}
                    >
                        {syncStatus === 'syncing' ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <CloudArrowUpIcon className="w-5 h-5" />}
                        <span>{getSyncButtonText()}</span>
                    </button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow space-y-6">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3">إدارة البيانات</h2>

                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="font-semibold text-lg">حفظ نسخة احتياطية</h3>
                        <p className="text-gray-600 text-sm mt-1">قم بتنزيل جميع بياناتك (الموكلين، القضايا، الحسابات، إلخ) في ملف واحد. احتفظ بهذا الملف في مكان آمن.</p>
                    </div>
                    <button onClick={handleBackup} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                        <ArrowDownTrayIcon className="w-5 h-5" />
                        <span>تنزيل نسخة احتياطية</span>
                    </button>
                </div>
                
                <hr />

                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="font-semibold text-lg">استرجاع نسخة احتياطية</h3>
                        <p className="text-gray-600 text-sm mt-1">قم باستعادة بيانات التطبيق من ملف نسخة احتياطية. <span className="font-bold">تحذير: سيتم استبدال جميع البيانات الحالية.</span></p>
                    </div>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />
                    <button onClick={handleRestoreClick} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors">
                        <ArrowUpTrayIcon className="w-5 h-5" />
                        <span>استرجاع من ملف</span>
                    </button>
                </div>

                <hr />

                <div className="p-4 bg-red-50 border-s-4 border-red-500 rounded-md">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <ExclamationTriangleIcon className="h-5 w-5 text-red-400" aria-hidden="true" />
                        </div>
                        <div className="ms-3">
                            <h3 className="text-lg font-semibold text-red-800">مسح جميع البيانات</h3>
                            <div className="mt-2 text-sm text-red-700">
                                <p>هذا الإجراء سيقوم بحذف جميع البيانات المخزنة في التطبيق بشكل نهائي، بما في ذلك الموكلين، القضايا، الجلسات، والقيود المحاسبية. لا يمكن التراجع عن هذا الإجراء.</p>
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
        </div>
    );
};

export default SettingsPage;
