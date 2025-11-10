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
import { UserIcon, CalculatorIcon, Cog6ToothIcon, ArrowPathIcon, NoSymbolIcon, CheckCircleIcon, ExclamationCircleIcon, ExclamationTriangleIcon, PowerIcon, HomeIcon } from './components/icons';
import ContextMenu, { MenuItem } from './components/ContextMenu';
import AdminTaskModal from './components/AdminTaskModal';
import { AdminTask, Profile, Session, Client, Appointment, AccountingEntry, Invoice, CaseDocument, AppData, SiteFinancialEntry } from './types';
import { getSupabaseClient } from './supabaseClient';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import UnpostponedSessionsModal from './components/UnpostponedSessionsModal';
import NotificationCenter, { RealtimeAlert } from './components/RealtimeNotifier';
import { IDataContext, DataProvider } from './context/DataContext';


type Page = 'home' | 'clients' | 'accounting' | 'settings';

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
}> = ({ currentPage, onNavigate, onLogout, syncStatus, lastSyncError, isDirty, isOnline, onManualSync, profile, isAutoSyncEnabled }) => {
    
    const navItems = [
        { id: 'home', label: 'الرئيسية', icon: HomeIcon },
        { id: 'clients', label: 'الموكلين', icon: UserIcon },
        { id: 'accounting', label: 'المحاسبة', icon: CalculatorIcon },
        { id: 'settings', label: 'الإعدادات', icon: Cog6ToothIcon },
    ];
    
    return (
        <header className="bg-white shadow-md p-2 sm:p-4 flex justify-between items-center no-print sticky top-0 z-30">
            <nav className="flex items-center gap-1 sm:gap-4 flex-wrap">
                <button onClick={() => onNavigate('home')} className="flex items-center" aria-label="العودة إلى الصفحة الرئيسية">
                    <div className="flex items-baseline gap-2">
                        <h1 className="text-xl font-bold text-gray-800">مكتب المحامي</h1>
                        <span className="text-xs text-gray-500">الإصدار: 10-11-2025-3</span>
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
                </div>
            </nav>
            <div className="flex items-center gap-2 sm:gap-4">
                 {profile && (
                    <div className="text-right hidden sm:block">
                        <p className="font-semibold text-sm text-gray-800">{profile.full_name}</p>
                        <p className="text-xs text-gray-500">{profile.role === 'admin' ? 'مدير' : 'مستخدم'}</p>
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
    
    const supabase = getSupabaseClient();
    const isOnline = useOnlineStatus();

    // This effect handles authentication state changes.
    React.useEffect(() => {
        const { data: { subscription } } = supabase!.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setIsAuthLoading(false);
            
            // If user logs out, clear the last user cache to prevent auto-login next time.
            if (_event === 'SIGNED_OUT') {
                localStorage.removeItem(LAST_USER_CACHE_KEY);
                 localStorage.setItem('lawyerAppLoggedOut', 'true');
            } else if (_event === 'SIGNED_IN') {
                localStorage.removeItem('lawyerAppLoggedOut');
            }
        });
        
        // Check for initial session
        supabase!.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setSession(session);
            }
            setIsAuthLoading(false);
        });

        return () => subscription.unsubscribe();
    }, [supabase]);
    
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
            const newTask: AdminTask = {
                id: `task-${Date.now()}`,
                ...taskData,
                completed: false,
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

    // --- Render Logic ---

    if (isAuthLoading || (data.isDataLoading && session)) {
        return <FullScreenLoader text="جاري تحميل البيانات..." />;
    }
    
    const handleLoginSuccess = (user: User, isOfflineLogin: boolean = false) => {
        if (!isOfflineLogin) {
            localStorage.setItem(LAST_USER_CACHE_KEY, JSON.stringify(user));
        }
        // Supabase onAuthStateChange will handle setting the session
    };

    if (data.syncStatus === 'unconfigured' || data.syncStatus === 'uninitialized') {
        return <ConfigurationModal onRetry={data.manualSync} />;
    }
    
    if (!session) {
        return <LoginPage onForceSetup={() => setShowConfigModal(true)} onLoginSuccess={handleLoginSuccess}/>;
    }
    
    if (showConfigModal) { // Allow forcing setup even when logged in
        return <ConfigurationModal onRetry={() => { data.manualSync(); setShowConfigModal(false); }} />;
    }
    
    if (!profile) {
        return <FullScreenLoader text="جاري تحميل ملف المستخدم..." />;
    }

    if (!profile.is_approved) {
        return <PendingApprovalPage onLogout={handleLogout} />;
    }

    if (!profile.is_active || (profile.subscription_end_date && new Date(profile.subscription_end_date) < new Date())) {
        return <SubscriptionExpiredPage onLogout={handleLogout} />;
    }
    
    if (profile.role === 'admin') {
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
            case 'home':
            default:
                return <HomePage onOpenAdminTaskModal={handleOpenAdminTaskModal} showContextMenu={showContextMenu} />;
        }
    };

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
                    profile={profile}
                    isAutoSyncEnabled={data.isAutoSyncEnabled}
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
            </div>
        </DataProvider>
    );
};

export default App;
