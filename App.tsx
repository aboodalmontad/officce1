
import * as React from 'react';
// Fix: Use `import type` for Session and User as they are used as types, not values. This resolves module resolution errors in some environments.
import type { Session as AuthSession, User } from '@supabase/supabase-js';

// Statically import ALL page components to fix critical lazy loading/module errors.
// Fix: Added '.tsx' extension to page imports to resolve "no default export" error, likely caused by a strict module resolver configuration in the build setup.
import ClientsPage from './pages/ClientsPage.tsx';
import HomePage from './pages/HomePage.tsx';
import AccountingPage from './pages/AccountingPage.tsx';
import SettingsPage from './pages/SettingsPage.tsx';
import LoginPage from './pages/LoginPage.tsx';
import AdminDashboard from './pages/AdminDashboard.tsx';
import PendingApprovalPage from './pages/PendingApprovalPage.tsx';
import SubscriptionExpiredPage from './pages/SubscriptionExpiredPage.tsx';


import ConfigurationModal from './components/ConfigurationModal';
import { useSupabaseData, SyncStatus } from './hooks/useSupabaseData';
import { UserIcon, CalculatorIcon, Cog6ToothIcon, ArrowPathIcon, NoSymbolIcon, CheckCircleIcon, ExclamationCircleIcon, PowerIcon, PrintIcon, ShareIcon, CalendarDaysIcon, ClipboardDocumentCheckIcon } from './components/icons';
import ContextMenu, { MenuItem } from './components/ContextMenu';
import AdminTaskModal from './components/AdminTaskModal';
import { AdminTask, Profile, Client, Appointment, AccountingEntry, Invoice, CaseDocument, AppData, SiteFinancialEntry } from './types';
import { getSupabaseClient } from './supabaseClient';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import UnpostponedSessionsModal from './components/UnpostponedSessionsModal';
import NotificationCenter, { RealtimeAlert } from './components/RealtimeNotifier';
import { IDataContext, DataProvider } from './context/DataContext';
import PrintableReport from './components/PrintableReport';
import { printElement } from './utils/printUtils';
import { formatDate, isSameDay } from './utils/dateUtils';


type Page = 'home' | 'admin-tasks' | 'clients' | 'accounting' | 'settings';

interface AppProps {
    onRefresh: () => void;
}

const SyncStatusIndicator: React.FC<{ status: SyncStatus, lastError: string | null, isDirty: boolean, isOnline: boolean, onManualSync: () => void, isAutoSyncEnabled: boolean }> = ({ status, lastError, isDirty, isOnline, onManualSync, isAutoSyncEnabled }) => {
    
    let displayStatus;
    if (!isOnline) {
        displayStatus = {
            icon: <NoSymbolIcon className="w-5 h-5 text-gray-500" />,
            text: 'غير متصل',
            className: 'text-gray-500',
            title: 'أنت غير متصل بالإنترنت. التغييرات محفوظة محلياً.'
        };
    } else if (!isAutoSyncEnabled && isDirty) {
        displayStatus = {
            icon: <ArrowPathIcon className="w-5 h-5 text-yellow-600 animate-pulse" />,
            text: 'مزامنة يدوية مطلوبة',
            className: 'text-yellow-600',
            title: 'المزامنة التلقائية متوقفة. اضغط للمزامنة الآن.'
        };
    } else if (status === 'unconfigured' || status === 'uninitialized') {
         displayStatus = {
            icon: <ExclamationCircleIcon className="w-5 h-5 text-red-500" />,
            text: 'الإعداد مطلوب',
            className: 'text-red-500',
            title: 'قاعدة البيانات غير مهيأة.'
        };
    } else if (status === 'loading') {
         displayStatus = {
            icon: <ArrowPathIcon className="w-5 h-5 text-gray-500 animate-spin" />,
            text: 'جاري التحميل...',
            className: 'text-gray-500',
            title: 'جاري تحميل البيانات...'
        };
    } else if (status === 'syncing') {
         displayStatus = {
            icon: <ArrowPathIcon className="w-5 h-5 text-blue-500 animate-pulse" />,
            text: 'جاري المزامنة...',
            className: 'text-blue-500',
            title: 'جاري مزامنة بياناتك مع السحابة.'
        };
    } else if (status === 'error') {
         displayStatus = {
            icon: <ExclamationCircleIcon className="w-5 h-5 text-red-500" />,
            text: 'فشل المزامنة',
            className: 'text-red-500',
            title: `فشل المزامنة: ${lastError}`
        };
    } else if (isDirty) {
         displayStatus = {
            icon: <ArrowPathIcon className="w-5 h-5 text-yellow-600" />,
            text: 'تغييرات غير محفوظة',
            className: 'text-yellow-600',
            title: 'لديك تغييرات لم تتم مزامنتها بعد.'
        };
    } else {
        displayStatus = {
            icon: <CheckCircleIcon className="w-5 h-5 text-green-500" />,
            text: 'متزامن',
            className: 'text-green-500',
            title: 'جميع بياناتك محدثة.'
        };
    }

    const canSyncManually = isOnline && status !== 'syncing' && status !== 'loading' && status !== 'unconfigured' && status !== 'uninitialized';

    return (
        <button
            onClick={canSyncManually ? onManualSync : undefined}
            disabled={!canSyncManually}
            className={`flex items-center gap-2 text-sm font-semibold p-2 rounded-lg ${canSyncManually ? 'cursor-pointer hover:bg-gray-100' : 'cursor-default'}`}
            title={displayStatus.title}
        >
            {displayStatus.icon}
            <span className={`${displayStatus.className} hidden sm:inline`}>{displayStatus.text}</span>
        </button>
    );
};

const Navbar: React.FC<{
    currentPage: Page;
    onNavigate: (page: Page) => void;
    onLogout: () => void;
    syncStatus: SyncStatus;
    lastSyncError: string | null;
    isDirty: boolean;
    isOnline: boolean;
    onManualSync: () => void;
    profile: Profile | null;
    isAutoSyncEnabled: boolean;
    homePageActions?: React.ReactNode;
}> = ({ currentPage, onNavigate, onLogout, syncStatus, lastSyncError, isDirty, isOnline, onManualSync, profile, isAutoSyncEnabled, homePageActions }) => {
    
    const navItems = [
        { id: 'home', label: 'المفكرة', icon: CalendarDaysIcon },
        { id: 'admin-tasks', label: 'المهام الإدارية', icon: ClipboardDocumentCheckIcon },
        { id: 'clients', label: 'الموكلين', icon: UserIcon },
        { id: 'accounting', label: 'المحاسبة', icon: CalculatorIcon },
    ];
    
    return (
        <header className="bg-white shadow-md p-2 sm:p-4 flex justify-between items-center no-print sticky top-0 z-30">
            <nav className="flex items-center gap-1 sm:gap-4 flex-wrap">
                <button onClick={() => onNavigate('home')} className="flex items-center" aria-label="العودة إلى الصفحة الرئيسية">
                    <div className="flex items-baseline gap-2">
                        <h1 className="text-xl font-bold text-gray-800">مكتب المحامي</h1>
                        <span className="text-xs text-gray-500">الإصدار: 13-11-2025-1</span>
                    </div>
                </button>
                 <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                    {navItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => onNavigate(item.id as Page)}
                            title={item.label}
                            className={`flex items-center gap-0 sm:gap-2 p-2 sm:px-3 rounded-md text-sm font-medium transition-colors ${currentPage === item.id ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            <item.icon className="w-5 h-5" />
                            <span className="hidden sm:inline">{item.label}</span>
                        </button>
                    ))}
                    {currentPage === 'home' && homePageActions}
                </div>
            </nav>
            <div className="flex items-center gap-2 sm:gap-4">
                 {profile && (
                    <div className="text-right">
                        <p className="font-semibold text-sm text-gray-800">{profile.full_name}</p>
                        <p className="text-xs text-gray-500 hidden sm:block">{profile.role === 'admin' ? 'مدير' : 'مستخدم'}</p>
                    </div>
                )}
                <SyncStatusIndicator 
                    status={syncStatus} 
                    lastError={lastSyncError} 
                    isDirty={isDirty} 
                    isOnline={isOnline}
                    onManualSync={onManualSync}
                    isAutoSyncEnabled={isAutoSyncEnabled}
                />
                <button 
                    onClick={() => onNavigate('settings')} 
                    className={`p-2 rounded-full transition-colors ${currentPage === 'settings' ? 'bg-gray-200 text-gray-800' : 'text-gray-500 hover:bg-gray-100'}`} 
                    title="الإعدادات"
                >
                    <Cog6ToothIcon className="w-5 h-5" />
                </button>
                <button onClick={onLogout} className="p-2 text-gray-500 hover:bg-red-100 hover:text-red-600 rounded-full transition-colors" title="تسجيل الخروج">
                    <PowerIcon className="w-5 h-5" />
                </button>
            </div>
        </header>
    );
};

const OfflineBanner: React.FC = () => {
    const isOnline = useOnlineStatus();
    const [isVisible, setIsVisible] = React.useState(!isOnline);
    const [isRendered, setIsRendered] = React.useState(!isOnline);

    React.useEffect(() => {
        if (!isOnline) {
            setIsRendered(true);
            requestAnimationFrame(() => {
                setIsVisible(true);
            });
        } else {
            setIsVisible(false);
            const timer = setTimeout(() => {
                setIsRendered(false);
            }, 300); // Match transition duration
            return () => clearTimeout(timer);
        }
    }, [isOnline]);
    
    if (!isRendered) {
        return null;
    }

    return (
        <div 
            className={`no-print w-full bg-yellow-100 text-yellow-800 p-3 text-center text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-300 ease-in-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full'}`}
            role="status"
            aria-live="polite"
        >
            <NoSymbolIcon className="w-5 h-5" />
            <span>أنت غير متصل بالإنترنت. التغييرات محفوظة محلياً وستتم مزامنتها تلقائياً عند عودة الاتصال.</span>
        </div>
    );
};


const LAST_USER_CACHE_KEY = 'lawyerAppLastUser';
const LAST_USER_CREDENTIALS_CACHE_KEY = 'lawyerAppLastUserCredentials';
const UNPOSTPONED_MODAL_SHOWN_KEY = 'lawyerAppUnpostponedModalShown';

const FullScreenLoader: React.FC<{ text?: string }> = ({ text = 'جاري التحميل...' }) => (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-[100]">
      <ArrowPathIcon className="w-8 h-8 text-blue-600 animate-spin" />
      <p className="mt-4 text-gray-600">{text}</p>
    </div>
);

const App: React.FC<AppProps> = ({ onRefresh }) => {
    const [session, setSession] = React.useState<AuthSession | null>(null);
    const [profile, setProfile] = React.useState<Profile | null>(null);
    const [isAuthLoading, setIsAuthLoading] = React.useState(true);
    const [authError, setAuthError] = React.useState<string | null>(null);
    const [showConfigModal, setShowConfigModal] = React.useState(false);
    const [loginMessage, setLoginMessage] = React.useState<string | null>(null);

    const [currentPage, setCurrentPage] = React.useState<Page>('home');
    const [isAdminTaskModalOpen, setIsAdminTaskModalOpen] = React.useState(false);
    const [initialAdminTaskData, setInitialAdminTaskData] = React.useState<any>(null);
    const [contextMenu, setContextMenu] = React.useState<{ isOpen: boolean; position: { x: number; y: number }; menuItems: MenuItem[] }>({ isOpen: false, position: { x: 0, y: 0 }, menuItems: [] });
    const [initialInvoiceData, setInitialInvoiceData] = React.useState<{ clientId: string; caseId?: string } | undefined>();
    
    // State lifted from HomePage for printing
    const [isPrintModalOpen, setIsPrintModalOpen] = React.useState(false);
    const [isPrintAssigneeModalOpen, setIsPrintAssigneeModalOpen] = React.useState(false);
    const [isShareAssigneeModalOpen, setIsShareAssigneeModalOpen] = React.useState(false);
    const [printableReportData, setPrintableReportData] = React.useState<any | null>(null);
    const [isActionsMenuOpen, setIsActionsMenuOpen] = React.useState(false);
    const [selectedDate, setSelectedDate] = React.useState(new Date());

    const printReportRef = React.useRef<HTMLDivElement>(null);
    const actionsMenuRef = React.useRef<HTMLDivElement>(null);

    const supabase = getSupabaseClient();
    const isOnline = useOnlineStatus();

    // This effect handles authentication state changes.
    React.useEffect(() => {
        const { data: { subscription } } = supabase!.auth.onAuthStateChange((event, session) => {
            setSession(session);
            
            // If user logs out, clear all user-specific cache to prevent auto-login next time.
            if (event === 'SIGNED_OUT') {
                localStorage.removeItem(LAST_USER_CACHE_KEY);
                localStorage.removeItem(LAST_USER_CREDENTIALS_CACHE_KEY);
                localStorage.setItem('lawyerAppLoggedOut', 'true');
            } else if (event === 'SIGNED_IN') {
                localStorage.removeItem('lawyerAppLoggedOut');
            }

            // Ensure auth loading is turned off on any state change to prevent hanging
            setIsAuthLoading(false);
        });
        
        // Check for initial session
        supabase!.auth.getSession().then(({ data: { session }, error }) => {
            if (error) {
                console.warn("Initial session check failed:", error.message);
                const errorMessage = error.message.toLowerCase();
                
                // Handle "Invalid Refresh Token" specifically by aggressively clearing local state
                // and forcing a full app refresh to prevent infinite loops.
                if (errorMessage.includes("refresh token") || errorMessage.includes("not found")) {
                    console.error("Critical Auth Error: Invalid Refresh Token. Cleaning up...");
                    
                    // 1. Clear App-specific cache
                    localStorage.removeItem(LAST_USER_CACHE_KEY);
                    localStorage.removeItem(LAST_USER_CREDENTIALS_CACHE_KEY);
                    
                    // 2. Clear Supabase specific token keys to ensure a clean slate
                    // Supabase keys typically start with 'sb-'
                    Object.keys(localStorage).forEach(key => {
                        if (key.startsWith('sb-')) {
                            localStorage.removeItem(key);
                        }
                    });
                    
                    // 3. Attempt to sign out cleanly (catch error if network fails)
                    supabase!.auth.signOut().catch(() => {}); 
                    
                    setSession(null);
                    
                    // 4. Trigger a full app remount/refresh to reset all in-memory state
                    onRefresh(); 
                }
                // NEW: Handle Network Errors (Failed to fetch) by attempting offline restoration
                else if (errorMessage.includes("failed to fetch") || errorMessage.includes("network")) {
                    console.warn("Network error detected during session check. Attempting to restore last known user for offline mode.");
                     const lastUserRaw = localStorage.getItem(LAST_USER_CACHE_KEY);
                     if (lastUserRaw) {
                         try {
                             const user = JSON.parse(lastUserRaw) as User;
                             // Create a synthetic session object for offline access
                             const offlineSession = {
                                 access_token: "offline_access_token",
                                 refresh_token: "offline_refresh_token",
                                 expires_in: 3600 * 24 * 7, // Fake long expiry
                                 token_type: "bearer",
                                 user: user
                             } as AuthSession;
                             setSession(offlineSession);
                         } catch (parseError) {
                             console.error("Failed to restore offline user:", parseError);
                             setSession(null);
                         }
                     } else {
                         setSession(null);
                     }
                } else {
                    setSession(null);
                }
            } else if (session) {
                setSession(session);
            }
            setIsAuthLoading(false);
        });

        return () => subscription.unsubscribe();
    }, [supabase, onRefresh]);
    
    // Fetch user profile when session is available
    const data = useSupabaseData(session?.user ?? null, isAuthLoading);

    React.useEffect(() => {
        if (session && data.profiles) {
            const userProfile = data.profiles.find(p => p.id === session.user.id);
            setProfile(userProfile || null);
        } else {
            setProfile(null);
        }
        
        // Show unpostponed sessions modal once per session
        const modalShown = sessionStorage.getItem(UNPOSTPONED_MODAL_SHOWN_KEY);
        if (session && data.unpostponedSessions.length > 0 && !modalShown) {
            data.setShowUnpostponedSessionsModal(true);
            sessionStorage.setItem(UNPOSTPONED_MODAL_SHOWN_KEY, 'true');
        }

    }, [session, data.profiles, data.unpostponedSessions, data.setShowUnpostponedSessionsModal]);

    // Close actions menu on outside click
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
                setIsActionsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    const handleLogout = async () => {
        await supabase!.auth.signOut();
        onRefresh(); // Trigger a full app remount to clear all state
    };
    
    const handleNavigation = (page: Page) => {
        setCurrentPage(page);
    };

    const handleOpenAdminTaskModal = (initialData: any = null) => {
        setInitialAdminTaskData(initialData);
        setIsAdminTaskModalOpen(true);
    };

    const handleSaveAdminTask = (taskData: Omit<AdminTask, 'completed'> & { id?: string }) => {
        if (taskData.id) { // Editing
            data.setAdminTasks(prev => prev.map(t => t.id === taskData.id ? { ...t, ...taskData, updated_at: new Date() } : t));
        } else { // Adding
            // A new task is being added.
            // We must ensure that a unique ID is assigned and not overwritten.
            // The incoming `taskData` should not have an `id`, but to be safe, we'll destructure it out.
            const { id, ...restOfTaskData } = taskData;

            const newLocation = restOfTaskData.location || 'غير محدد';
            const maxOrderIndex = data.adminTasks
                .filter(t => (t.location || 'غير محدد') === newLocation)
                .reduce((max, t) => Math.max(max, t.orderIndex || 0), -1);

            const newTask: AdminTask = {
                id: `task-${Date.now()}`, // Assign a new, guaranteed-unique ID.
                ...restOfTaskData,       // Spread the rest of the data.
                completed: false,
                // When creating a new task, assign it the next available order index within its location group.
                // This ensures it appears at the end of the list by default.
                orderIndex: maxOrderIndex + 1,
                updated_at: new Date(),
            };
            data.setAdminTasks(prev => [...prev, newTask]);
        }
        setIsAdminTaskModalOpen(false);
    };

    const showContextMenu = (event: React.MouseEvent, menuItems: MenuItem[]) => {
        event.preventDefault();
        setContextMenu({
            isOpen: true,
            position: { x: event.clientX, y: event.clientY },
            menuItems,
        });
    };

    const closeContextMenu = () => {
        setContextMenu({ ...contextMenu, isOpen: false });
    };
    
    const handleCreateInvoice = (clientId: string, caseId?: string) => {
        setInitialInvoiceData({ clientId, caseId });
        setCurrentPage('accounting');
    };

    // --- Print/Share Logic (Lifted from HomePage) ---
    const handleGenerateAssigneeReport = (assignee: string | null) => {
        const dailyAppointments = data.appointments
            .filter(a => isSameDay(a.date, selectedDate))
            .sort((a, b) => a.time.localeCompare(b.time));
    
        const dailySessions = data.allSessions.filter(s => isSameDay(s.date, selectedDate));
    
        const allUncompletedTasks = data.adminTasks.filter(t => !t.completed);
        const filteredForAssigneeTasks = assignee ? allUncompletedTasks.filter(t => t.assignee === assignee) : allUncompletedTasks;
    
        const groupedAndSortedTasks = filteredForAssigneeTasks.reduce((acc, task) => {
            const location = task.location || 'غير محدد';
            if (!acc[location]) acc[location] = [];
            acc[location].push(task);
            return acc;
        }, {} as Record<string, AdminTask[]>);
    
        const importanceOrder = { 'urgent': 3, 'important': 2, 'normal': 1 };
    
        for (const location in groupedAndSortedTasks) {
            groupedAndSortedTasks[location].sort((a, b) => {
                const importanceA = importanceOrder[a.importance];
                const importanceB = importanceOrder[b.importance];
                if (importanceA !== importanceB) return importanceB - importanceA;
                const dateA = new Date(a.dueDate).getTime();
                const dateB = new Date(b.dueDate).getTime();
                if (dateA !== dateB) return dateA - dateB;
                return a.task.localeCompare(b.task, 'ar');
            });
        }
    
        const filteredAppointments = assignee ? dailyAppointments.filter(a => a.assignee === assignee) : dailyAppointments;
        const filteredSessions = assignee ? dailySessions.filter(s => s.assignee === assignee) : dailySessions;
    
        setPrintableReportData({
            assignee: assignee || 'جدول الأعمال العام',
            date: selectedDate,
            appointments: filteredAppointments,
            sessions: filteredSessions,
            adminTasks: groupedAndSortedTasks,
        });
    
        setIsPrintAssigneeModalOpen(false);
        setIsPrintModalOpen(true);
    };

    const handleShareAssigneeReport = (assignee: string | null) => {
        const dailyAppointments = data.appointments.filter(a => isSameDay(a.date, selectedDate)).sort((a, b) => a.time.localeCompare(b.time));
        const dailySessions = data.allSessions.filter(s => isSameDay(s.date, selectedDate));
        const allUncompletedTasks = data.adminTasks.filter(t => !t.completed);
        const filteredForAssigneeTasks = assignee ? allUncompletedTasks.filter(t => t.assignee === assignee) : allUncompletedTasks;
        const groupedAndSortedTasks = filteredForAssigneeTasks.reduce((acc, task) => {
            const location = task.location || 'غير محدد';
            if (!acc[location]) acc[location] = [];
            acc[location].push(task);
            return acc;
        }, {} as Record<string, AdminTask[]>);
        
        const importanceOrder = { 'urgent': 3, 'important': 2, 'normal': 1 };
        for (const location in groupedAndSortedTasks) {
            groupedAndSortedTasks[location].sort((a, b) => {
                const importanceA = importanceOrder[a.importance];
                const importanceB = importanceOrder[b.importance];
                if (importanceA !== importanceB) return importanceB - importanceA;
                const dateA = new Date(a.dueDate).getTime();
                const dateB = new Date(b.dueDate).getTime();
                if (dateA !== dateB) return dateA - dateB;
                return a.task.localeCompare(b.task, 'ar');
            });
        }
        const filteredAppointments = assignee ? dailyAppointments.filter(a => a.assignee === assignee) : dailyAppointments;
        const filteredSessions = assignee ? dailySessions.filter(s => s.assignee === assignee) : dailySessions;

        let message = `*جدول أعمال مكتب المحامي*\n*التاريخ:* ${formatDate(selectedDate)}\n*لـِ:* ${assignee || 'الجميع'}\n\n`;
        if (filteredSessions.length > 0) {
            message += `*القسم الأول: الجلسات (${filteredSessions.length})*\n`;
            filteredSessions.forEach(s => { message += `- (${s.court}) قضية ${s.clientName} ضد ${s.opponentName} (أساس: ${s.caseNumber}).\n`; if (s.postponementReason) message += `  سبب التأجيل السابق: ${s.postponementReason}\n`; });
            message += `\n`;
        }
        if (filteredAppointments.length > 0) {
             const formatTime = (time: string) => { if (!time) return ''; let [hours, minutes] = time.split(':'); let hh = parseInt(hours, 10); const ampm = hh >= 12 ? 'مساءً' : 'صباحًا'; hh = hh % 12; hh = hh ? hh : 12; const finalHours = hh.toString().padStart(2, '0'); return `${finalHours}:${minutes} ${ampm}`; };
             const importanceMap: { [key: string]: { text: string } } = { normal: { text: 'عادي' }, important: { text: 'مهم' }, urgent: { text: 'عاجل' } };
            message += `*القسم الثاني: المواعيد (${filteredAppointments.length})*\n`;
            filteredAppointments.forEach(a => { message += `- (${formatTime(a.time)}) ${a.title}`; if (a.importance !== 'normal') message += ` (${importanceMap[a.importance]?.text})`; message += `\n`; });
            message += `\n`;
        }
        const taskLocations = Object.keys(groupedAndSortedTasks);
        if (taskLocations.length > 0) {
            message += `*القسم الثالث: المهام الإدارية (غير منجزة)*\n`;
            taskLocations.forEach(location => {
                const tasks = groupedAndSortedTasks[location];
                if (tasks.length > 0) {
                    message += `*المكان: ${location}*\n`;
                    tasks.forEach(t => { let importanceText = ''; if (t.importance === 'urgent') importanceText = '[عاجل] '; if (t.importance === 'important') importanceText = '[مهم] '; message += `- ${importanceText}${t.task} - تاريخ الاستحقاق: ${formatDate(t.dueDate)}\n`; });
                }
            });
        }
        if (filteredSessions.length === 0 && filteredAppointments.length === 0 && taskLocations.length === 0) message += "لا توجد بنود في جدول الأعمال لهذا اليوم.";
        
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
        setIsShareAssigneeModalOpen(false);
    };

    // --- Render Logic ---

    if (isAuthLoading || (data.isDataLoading && session)) {
        return <FullScreenLoader text="جاري تحميل البيانات..." />;
    }
    
    const handleLoginSuccess = (user: User, isOfflineLogin: boolean = false) => {
        if (!isOfflineLogin) {
            localStorage.setItem(LAST_USER_CACHE_KEY, JSON.stringify(user));
        }
        // Supabase onAuthStateChange will handle setting the session normally.
        // If offline login, we manually update session here just in case, though App renders based on session prop.
        if (isOfflineLogin) {
             const offlineSession = {
                 access_token: "offline_access_token",
                 refresh_token: "offline_refresh_token",
                 expires_in: 3600 * 24 * 7,
                 token_type: "bearer",
                 user: user
             } as AuthSession;
             setSession(offlineSession);
        }
    };

    // Fix: Reordered the render logic. The manual trigger for the config modal (`showConfigModal`)
    // and the automatic trigger (`data.syncStatus`) are now checked *before* checking the session state.
    // This ensures the modal can open from the login page.
    if (showConfigModal) {
        return <ConfigurationModal onRetry={() => { data.manualSync(); setShowConfigModal(false); }} />;
    }
    
    if (data.syncStatus === 'unconfigured' || data.syncStatus === 'uninitialized') {
        return <ConfigurationModal onRetry={data.manualSync} />;
    }
    
    if (!session) {
        return <LoginPage onForceSetup={() => setShowConfigModal(true)} onLoginSuccess={handleLoginSuccess}/>;
    }
    
    if (!profile) {
        // Only show loader if we are online. If offline and profile is missing (rare if cache works), 
        // we might be in a weird state, but usually profile should be loaded from IDB.
        if (isOnline) {
            return <FullScreenLoader text="جاري تحميل ملف المستخدم..." />;
        } else {
             // Fallback profile for extreme offline cases where profile wasn't in IDB but user object exists
             const fallbackProfile: Profile = {
                 id: session.user.id,
                 full_name: session.user.user_metadata.full_name || 'مستخدم',
                 mobile_number: session.user.user_metadata.mobile_number || '',
                 is_approved: true, // Assume approved if offline login succeeded
                 is_active: true,
                 subscription_start_date: null,
                 subscription_end_date: null,
                 role: 'user'
             };
             // We don't set state here to avoid loops, but pass it down? 
             // Better to just render with a partial profile check or return loader if strict.
             // For now, let's assume data hook handles it or return loader.
             // If offline and data.profiles is empty, we are stuck.
             if (data.profiles.length === 0) {
                  // Force a reload or retry might be needed, or just show limited UI.
                  return <FullScreenLoader text="جاري استرجاع البيانات المحلية..." />;
             }
        }
    }

    // Safety check for profile existence before accessing properties
    const effectiveProfile = profile || data.profiles.find(p => p.id === session.user.id);
    
    if (!effectiveProfile) {
         return <FullScreenLoader text="جاري تحميل الملف الشخصي..." />;
    }

    if (!effectiveProfile.is_approved) {
        return <PendingApprovalPage onLogout={handleLogout} />;
    }

    if (!effectiveProfile.is_active || (effectiveProfile.subscription_end_date && new Date(effectiveProfile.subscription_end_date) < new Date())) {
        return <SubscriptionExpiredPage onLogout={handleLogout} />;
    }
    
    if (effectiveProfile.role === 'admin') {
         return (
            <DataProvider value={data}>
                <AdminDashboard onLogout={handleLogout} />
                <NotificationCenter 
                    appointmentAlerts={data.triggeredAlerts}
                    realtimeAlerts={data.realtimeAlerts}
                    userApprovalAlerts={data.userApprovalAlerts}
                    dismissAppointmentAlert={data.dismissAlert}
                    dismissRealtimeAlert={data.dismissRealtimeAlert}
                    dismissUserApprovalAlert={data.dismissUserApprovalAlert}
                />
            </DataProvider>
        );
    }

    const renderPage = () => {
        switch (currentPage) {
            case 'clients':
                return <ClientsPage showContextMenu={showContextMenu} onOpenAdminTaskModal={handleOpenAdminTaskModal} onCreateInvoice={handleCreateInvoice} />;
            case 'accounting':
                return <AccountingPage initialInvoiceData={initialInvoiceData} clearInitialInvoiceData={() => setInitialInvoiceData(undefined)} />;
            case 'settings':
                return <SettingsPage />;
            case 'admin-tasks':
                return <HomePage onOpenAdminTaskModal={handleOpenAdminTaskModal} showContextMenu={showContextMenu} mainView="adminTasks" selectedDate={selectedDate} setSelectedDate={setSelectedDate} />;
            case 'home':
            default:
                return <HomePage onOpenAdminTaskModal={handleOpenAdminTaskModal} showContextMenu={showContextMenu} mainView="agenda" selectedDate={selectedDate} setSelectedDate={setSelectedDate} />;
        }
    };
    
    const homePageActions = (
        <div ref={actionsMenuRef} className="relative">
            <button
                onClick={() => setIsActionsMenuOpen(prev => !prev)}
                className="p-2 text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="إجراءات جدول الأعمال"
                aria-haspopup="true"
                aria-expanded={isActionsMenuOpen}
            >
                <PrintIcon className="w-5 h-5" />
            </button>
            {isActionsMenuOpen && (
                <div className="absolute left-0 mt-2 w-56 origin-top-left bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-20">
                    <div className="py-1" role="menu" aria-orientation="vertical">
                        <button onClick={() => { setIsPrintAssigneeModalOpen(true); setIsActionsMenuOpen(false); }} className="w-full text-right flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">
                            <PrintIcon className="w-5 h-5 text-gray-500" />
                            <span>طباعة جدول الأعمال</span>
                        </button>
                        <button onClick={() => { setIsShareAssigneeModalOpen(true); setIsActionsMenuOpen(false); }} className="w-full text-right flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">
                            <ShareIcon className="w-5 h-5 text-gray-500" />
                            <span>إرسال عبر واتساب</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <DataProvider value={data}>
            <div className="flex flex-col h-screen bg-gray-50">
                <Navbar
                    currentPage={currentPage}
                    onNavigate={handleNavigation}
                    onLogout={handleLogout}
                    syncStatus={data.syncStatus}
                    lastSyncError={data.lastSyncError}
                    isDirty={data.isDirty}
                    isOnline={isOnline}
                    onManualSync={data.manualSync}
                    profile={effectiveProfile}
                    isAutoSyncEnabled={data.isAutoSyncEnabled}
                    homePageActions={homePageActions}
                />
                <OfflineBanner />
                <main className="flex-grow p-4 sm:p-6 overflow-y-auto">
                    {renderPage()}
                </main>
                
                <AdminTaskModal 
                    isOpen={isAdminTaskModalOpen}
                    onClose={() => setIsAdminTaskModalOpen(false)}
                    onSubmit={handleSaveAdminTask}
                    initialData={initialAdminTaskData}
                    assistants={data.assistants}
                />

                <ContextMenu 
                    isOpen={contextMenu.isOpen}
                    position={contextMenu.position}
                    menuItems={contextMenu.menuItems}
                    onClose={closeContextMenu}
                />
                
                <UnpostponedSessionsModal
                    isOpen={data.showUnpostponedSessionsModal}
                    onClose={() => data.setShowUnpostponedSessionsModal(false)}
                    sessions={data.unpostponedSessions}
                    onPostpone={data.postponeSession}
                    assistants={data.assistants}
                />

                <NotificationCenter 
                    appointmentAlerts={data.triggeredAlerts}
                    realtimeAlerts={data.realtimeAlerts}
                    userApprovalAlerts={data.userApprovalAlerts}
                    dismissAppointmentAlert={data.dismissAlert}
                    dismissRealtimeAlert={data.dismissRealtimeAlert}
                    dismissUserApprovalAlert={data.dismissUserApprovalAlert}
                />

                 {/* Modals lifted from HomePage */}
                {isPrintAssigneeModalOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={() => setIsPrintAssigneeModalOpen(false)}>
                        <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                            <h2 className="text-xl font-bold mb-4 border-b pb-3">اختر الشخص لطباعة جدول أعماله</h2>
                            <div className="space-y-3 max-h-80 overflow-y-auto">
                                <button onClick={() => handleGenerateAssigneeReport(null)} className="w-full text-right px-4 py-3 bg-blue-50 text-blue-800 font-semibold rounded-lg hover:bg-blue-100 transition-colors">
                                    طباعة جدول الأعمال العام (لكل المهام اليومية)
                                </button>
                                <h3 className="text-md font-semibold text-gray-600 pt-2">أو طباعة لشخص محدد:</h3>
                                {data.assistants.map(name => (
                                    <button
                                        key={name}
                                        onClick={() => handleGenerateAssigneeReport(name)}
                                        className="w-full text-right block px-4 py-2 bg-gray-50 text-gray-800 rounded-md hover:bg-gray-100 transition-colors"
                                    >
                                        {name}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-6 flex justify-end">
                                <button type="button" onClick={() => setIsPrintAssigneeModalOpen(false)} className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors">إغلاق</button>
                            </div>
                        </div>
                    </div>
                )}
                
                {isShareAssigneeModalOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={() => setIsShareAssigneeModalOpen(false)}>
                        <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                            <h2 className="text-xl font-bold mb-4 border-b pb-3">اختر الشخص لإرسال جدول أعماله عبر واتساب</h2>
                            <div className="space-y-3 max-h-80 overflow-y-auto">
                                <button
                                    onClick={() => handleShareAssigneeReport(null)}
                                    className="w-full text-right px-4 py-3 bg-green-50 text-green-800 font-semibold rounded-lg hover:bg-green-100 transition-colors"
                                >
                                    إرسال جدول الأعمال العام (لكل المهام اليومية)
                                </button>
                                <h3 className="text-md font-semibold text-gray-600 pt-2">أو إرسال لشخص محدد:</h3>
                                {data.assistants.map(name => (
                                    <button
                                        key={name}
                                        onClick={() => handleShareAssigneeReport(name)}
                                        className="w-full text-right block px-4 py-2 bg-gray-50 text-gray-800 rounded-md hover:bg-gray-100 transition-colors"
                                    >
                                        {name}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-6 flex justify-end">
                                <button type="button" onClick={() => setIsShareAssigneeModalOpen(false)} className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors">إغلاق</button>
                            </div>
                        </div>
                    </div>
                )}

                {isPrintModalOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setIsPrintModalOpen(false)}>
                        <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="overflow-y-auto" ref={printReportRef}>
                                <PrintableReport reportData={printableReportData} />
                            </div>
                            <div className="mt-6 flex justify-end gap-4 border-t pt-4 no-print">
                                <button
                                    type="button"
                                    className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                                    onClick={() => setIsPrintModalOpen(false)}
                                >
                                    إغلاق
                                </button>
                                <button
                                    type="button"
                                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                                    onClick={() => printElement(printReportRef.current)}
                                >
                                    <PrintIcon className="w-5 h-5" />
                                    <span>طباعة</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </DataProvider>
    );
};

export default App;
