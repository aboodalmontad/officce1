import * as React from 'react';
import { Session as AuthSession, User } from '@supabase/supabase-js';

// Lazy load page components for code splitting and faster initial load
const HomePage = React.lazy(() => import('./pages/HomePage'));
const ClientsPage = React.lazy(() => import('./pages/ClientsPage'));
const AccountingPage = React.lazy(() => import('./pages/AccountingPage'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'));
const PendingApprovalPage = React.lazy(() => import('./pages/PendingApprovalPage'));
const SubscriptionExpiredPage = React.lazy(() => import('./pages/SubscriptionExpiredPage'));

import ConfigurationModal from './components/ConfigurationModal';
import { useSupabaseData, SyncStatus, AppData } from './hooks/useSupabaseData';
import { HomeIcon, UserIcon, CalculatorIcon, ChartBarIcon, Cog6ToothIcon, ArrowPathIcon, NoSymbolIcon, CheckCircleIcon, ExclamationCircleIcon, ExclamationTriangleIcon, ServerIcon, CloudArrowDownIcon, CloudArrowUpIcon, DocumentTextIcon, PowerIcon, ChevronLeftIcon, CloudIcon } from './components/icons';
import ContextMenu, { MenuItem } from './components/ContextMenu';
import AdminTaskModal from './components/AdminTaskModal';
import { AdminTask, Profile, Session, Client, Appointment, AccountingEntry, Invoice } from './types';
import { getSupabaseClient } from './supabaseClient';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { toInputDateString } from './utils/dateUtils';


// --- Data Context for avoiding prop drilling ---
interface IDataContext extends AppData {
    setClients: (updater: React.SetStateAction<Client[]>) => void;
    setAdminTasks: (updater: React.SetStateAction<AdminTask[]>) => void;
    setAppointments: (updater: React.SetStateAction<Appointment[]>) => void;
    setAccountingEntries: (updater: React.SetStateAction<AccountingEntry[]>) => void;
    setInvoices: (updater: React.SetStateAction<Invoice[]>) => void;
    setAssistants: (updater: React.SetStateAction<string[]>) => void;
    allSessions: (Session & { stageId?: string, stageDecisionDate?: Date })[];
    setFullData: (data: any) => void;
    syncStatus: SyncStatus;
    manualSync: () => Promise<void>;
    lastSyncError: string | null;
    isDirty: boolean;
    userId?: string;
    isDataLoading: boolean;
    isAuthLoading: boolean;
    isAutoSyncEnabled: boolean;
    setAutoSyncEnabled: (enabled: boolean) => void;
    deleteClient: (clientId: string) => void;
    deleteCase: (caseId: string, clientId: string) => void;
    deleteStage: (stageId: string, caseId: string, clientId: string) => void;
    deleteSession: (sessionId: string, stageId: string, caseId: string, clientId: string) => void;
    deleteAdminTask: (taskId: string) => void;
    deleteAppointment: (appointmentId: string) => void;
    deleteAccountingEntry: (entryId: string) => void;
    deleteInvoice: (invoiceId: string) => void;
    deleteAssistant: (name: string) => void;
}

const DataContext = React.createContext<IDataContext | null>(null);

export const useData = () => {
    const context = React.useContext(DataContext);
    if (!context) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
};

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
            icon: <CloudArrowUpIcon className="w-5 h-5 text-yellow-600 animate-pulse" />,
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
            icon: <CloudArrowUpIcon className="w-5 h-5 text-blue-500 animate-pulse" />,
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
            icon: <CloudArrowUpIcon className="w-5 h-5 text-yellow-600" />,
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
                <h1 className="text-xl font-bold text-gray-800 hidden md:block">مكتب المحامي</h1>
                 <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                    {navItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => onNavigate(item.id as Page)}
                            className={`flex items-center gap-2 px-2 sm:px-3 py-2 rounded-md text-sm font-medium transition-colors ${currentPage === item.id ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            <item.icon className="w-5 h-5" />
                            <span>{item.label}</span>
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

const DataProvider = DataContext.Provider;

const LAST_USER_CACHE_KEY = 'lawyerAppLastUser';

const App: React.FC<AppProps> = ({ onRefresh }) => {
    const [session, setSession] = React.useState<AuthSession | null>(null);
    const [profile, setProfile] = React.useState<Profile | null>(null);
    const [isAuthLoading, setIsAuthLoading] = React.useState(true);
    const [authError, setAuthError] = React.useState<string | null>(null);
    const [showConfigModal, setShowConfigModal] = React.useState(false);

    const [currentPage, setCurrentPage] = React.useState<Page>('home');
    const [isAdminTaskModalOpen, setIsAdminTaskModalOpen] = React.useState(false);
    const [initialAdminTaskData, setInitialAdminTaskData] = React.useState<any>(null);
    const [contextMenu, setContextMenu] = React.useState<{ isOpen: boolean; position: { x: number; y: number }; menuItems: MenuItem[] }>({ isOpen: false, position: { x: 0, y: 0 }, menuItems: [] });
    const [initialInvoiceData, setInitialInvoiceData] = React.useState<{ clientId: string; caseId?: string } | undefined>(undefined);

    const isOnline = useOnlineStatus();
    const supabase = getSupabaseClient();
    const supabaseData = useSupabaseData(session?.user ?? null, isAuthLoading);

    React.useEffect(() => {
        if (supabaseData.syncStatus === 'unconfigured' || supabaseData.syncStatus === 'uninitialized') {
            setShowConfigModal(true);
        } else {
            setShowConfigModal(false);
        }
    }, [supabaseData.syncStatus]);
    
    // This effect runs once to get the initial session state from Supabase.
    React.useEffect(() => {
        if (!supabase) {
            setIsAuthLoading(false);
            return;
        }
        setIsAuthLoading(true);
        supabase.auth.getSession()
            .then(({ data: { session: initialSession }, error }) => {
                if (error) {
                    // This is expected when offline and the token needs to be refreshed.
                    console.warn("Initial getSession() failed, likely offline. This is okay.", error.message);
                }
                setSession(initialSession);
            })
            .catch(err => {
                // This catches unexpected errors in the client library itself.
                console.error("A critical error occurred during initial session retrieval:", err);
                setSession(null);
            });
    }, [supabase]); // IMPORTANT: Runs only once when the supabase client is initialized.

    // This effect subscribes to all subsequent auth state changes.
    React.useEffect(() => {
        if (!supabase) return;
        
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
            // Using a functional update for setSession avoids needing `session` in the dependency array.
            // This prevents re-subscribing on every session change.
            // We also check if the user or token has actually changed to prevent re-renders on token refresh events.
            setSession(currentSession => {
                const hasChanged = newSession?.user.id !== currentSession?.user.id || newSession?.access_token !== currentSession?.access_token;
                return hasChanged ? newSession : currentSession;
            });
        });
        
        return () => {
            subscription.unsubscribe();
        };
    }, [supabase]);


    // This effect handles fetching the user profile and managing auth state.
    React.useEffect(() => {
        const fetchAndSetProfile = async () => {
            // If there's no session, we're logged out. Clear data and stop loading.
            if (!session) {
                setProfile(null);
                setAuthError(null);
                setIsAuthLoading(false);
                return;
            }

            // A session exists. Start the verification/loading process.
            setAuthError(null);
            const userId = session.user.id;
            const PROFILE_CACHE_KEY = `lawyerAppProfile_${userId}`;

            try {
                // 1. Try to load profile from local cache first for a faster UI.
                let profileFromCache: Profile | null = null;
                try {
                    const cachedProfileRaw = localStorage.getItem(PROFILE_CACHE_KEY);
                    if (cachedProfileRaw) {
                        profileFromCache = JSON.parse(cachedProfileRaw);
                        // If we have a cached profile, show it immediately.
                        setProfile(profileFromCache);
                    }
                } catch (e) {
                    console.error("Failed to parse cached profile. Clearing cache.", e);
                    localStorage.removeItem(PROFILE_CACHE_KEY); // Clear corrupted data
                }
                
                // 2. If online, attempt to fetch the latest profile from the server.
                if (isOnline) {
                    setIsAuthLoading(true); // Set loading true only when fetching from network
                    const { data, error, status } = await supabase!.from('profiles').select('*').eq('id', userId).single();
                    
                    if (data) {
                        // Success: update state and cache.
                        setProfile(data);
                        localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data));
                        // Save user object for offline login profile creation
                        localStorage.setItem(LAST_USER_CACHE_KEY, JSON.stringify(session.user));
                    } else if (error && status !== 406) {
                        // A real error occurred, and we have no cached data to fall back on.
                        if (!profileFromCache) {
                            throw new Error('فشل الاتصال بالخادم لجلب ملفك الشخصي. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.');
                        } else {
                            // We have a cache, so we can continue. Log the error for debugging.
                            console.warn("Failed to refresh profile, using cached version. Error:", error.message);
                        }
                    } else if (!data && !profileFromCache) {
                        // Authenticated but no profile found and nothing in cache. This is a critical error.
                         throw new Error("User is authenticated, but no profile was found.");
                    }
                } else if (!profileFromCache) {
                    // Offline and no cached profile.
                    throw new Error("أنت غير متصل ولا توجد بيانات محفوظة على هذا الجهاز. يرجى الاتصال بالإنترنت.");
                }

            } catch (e: any) {
                console.error("Error in profile loading sequence:", e);
                setAuthError(e.message);
                setProfile(null); // Clear profile on critical error
            } finally {
                setIsAuthLoading(false); // Always stop the main "Checking identity" loader.
            }
        };

        fetchAndSetProfile();
    }, [session, isOnline, supabase]);

    const handleLogout = async () => {
        setCurrentPage('home');
        if (supabase) {
            // Attempt to sign out from the server, but don't let it block the UI.
            const { error } = await supabase.auth.signOut();
            if (error) {
                 console.error('Supabase signOut error (likely offline, this is okay):', error.message);
            }
        }
        // Manually clear local state for immediate feedback & reliable offline logout.
        // The onAuthStateChange listener will also catch this if online.
        setSession(null);
    };
    
    const handleLoginSuccess = (user: User) => {
        // Cache the user object to enable temporary profile creation if needed.
        localStorage.setItem(LAST_USER_CACHE_KEY, JSON.stringify(user));
        // Trigger the authentication flow by setting a session-like object.
        setSession({
            user,
            access_token: 'local-session', // Placeholder for local/offline auth
            token_type: 'bearer',
            refresh_token: 'local-session',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
        } as AuthSession);
    };

    const handleOpenAdminTaskModal = (initialData: any = null) => {
        setInitialAdminTaskData(initialData);
        setIsAdminTaskModalOpen(true);
    };

    const handleAdminTaskSubmit = (taskData: Omit<AdminTask, 'id' | 'completed'> & { id?: string }) => {
        if (taskData.id) { // Editing
            supabaseData.setAdminTasks(prev => prev.map(t => t.id === taskData.id ? { ...t, ...taskData, updated_at: new Date() } : t));
        } else { // Adding
            const newTask: AdminTask = { ...taskData, id: `task-${Date.now()}`, completed: false, updated_at: new Date() };
            supabaseData.setAdminTasks(prev => [...prev, newTask]);
        }
        setIsAdminTaskModalOpen(false);
    };
    
    const showContextMenu = (event: React.MouseEvent, menuItems: MenuItem[]) => {
        event.preventDefault();
        setContextMenu({ isOpen: true, position: { x: event.clientX, y: event.clientY }, menuItems });
    };

    const handleCreateInvoice = (clientId: string, caseId?: string) => {
        setInitialInvoiceData({ clientId, caseId });
        setCurrentPage('accounting');
    };
    
    const clearInitialInvoiceData = () => setInitialInvoiceData(undefined);

    const renderPage = () => {
        switch (currentPage) {
            case 'home': return <HomePage onOpenAdminTaskModal={handleOpenAdminTaskModal} showContextMenu={showContextMenu} />;
            case 'clients': return <ClientsPage onOpenAdminTaskModal={handleOpenAdminTaskModal} showContextMenu={showContextMenu} onCreateInvoice={handleCreateInvoice} />;
            case 'accounting': return <AccountingPage initialInvoiceData={initialInvoiceData} clearInitialInvoiceData={clearInitialInvoiceData} />;
            case 'settings': return <SettingsPage />;
            default: return <HomePage onOpenAdminTaskModal={handleOpenAdminTaskModal} showContextMenu={showContextMenu} />;
        }
    };
    
    const FullScreenLoader: React.FC<{ text?: string }> = ({ text = 'جاري التحميل...' }) => (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-[100]">
        <ArrowPathIcon className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="mt-4 text-gray-600">{text}</p>
      </div>
    );
    
    const AuthErrorScreen: React.FC<{ message: string; onRetry: () => void; onLogout: () => void }> = ({ message, onRetry, onLogout }) => (
        <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
            <div className="w-full max-w-md p-8 text-center bg-white rounded-lg shadow-md">
                <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-500" />
                <h1 className="mt-4 text-2xl font-bold text-gray-800">خطأ في المصادقة</h1>
                <p className="mt-2 text-gray-600">{message}</p>
                <div className="mt-6 flex justify-center gap-4">
                     <button onClick={onLogout} className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">تسجيل الخروج</button>
                     <button onClick={onRetry} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">إعادة المحاولة</button>
                </div>
            </div>
        </div>
    );
    
    if (showConfigModal) {
        return <ConfigurationModal onRetry={onRefresh} />;
    }
    
    if (isAuthLoading) {
        return <FullScreenLoader text="جاري التحقق من الهوية..." />;
    }
    
    if (authError) {
        return <AuthErrorScreen message={authError} onRetry={onRefresh} onLogout={handleLogout} />;
    }

    if (!session || !profile) {
        return <LoginPage onForceSetup={() => setShowConfigModal(true)} onLoginSuccess={handleLoginSuccess} />;
    }
    
    if (supabaseData.isDataLoading) {
        return <FullScreenLoader text="جاري تحميل بيانات المكتب..." />;
    }
    
    if (!profile.is_approved && profile.role !== 'admin') {
        return <PendingApprovalPage onLogout={handleLogout} />;
    }
    
    const subscriptionEndDate = profile.subscription_end_date ? new Date(profile.subscription_end_date) : new Date(0);
    if (subscriptionEndDate < new Date() && profile.role !== 'admin') {
        return <SubscriptionExpiredPage onLogout={handleLogout} />;
    }
    
    if (profile.role === 'admin') {
        return <AdminDashboard onLogout={handleLogout} />;
    }

    return (
        <DataProvider value={{...supabaseData, isAuthLoading}}>
            <div className="min-h-screen flex flex-col bg-gray-100">
                <Navbar
                    currentPage={currentPage}
                    onNavigate={setCurrentPage}
                    onLogout={handleLogout}
                    profile={profile}
                    syncStatus={supabaseData.syncStatus}
                    lastSyncError={supabaseData.lastSyncError}
                    isDirty={supabaseData.isDirty}
                    isOnline={isOnline}
                    onManualSync={supabaseData.manualSync}
                    isAutoSyncEnabled={supabaseData.isAutoSyncEnabled}
                />
                <main className="flex-grow p-4 sm:p-6">
                    <React.Suspense fallback={<FullScreenLoader />}>
                        {renderPage()}
                    </React.Suspense>
                </main>
            </div>
            <AdminTaskModal
                isOpen={isAdminTaskModalOpen}
                onClose={() => setIsAdminTaskModalOpen(false)}
                onSubmit={handleAdminTaskSubmit}
                initialData={initialAdminTaskData}
            />
            <ContextMenu 
                isOpen={contextMenu.isOpen}
                position={contextMenu.position}
                menuItems={contextMenu.menuItems}
                onClose={() => setContextMenu(p => ({...p, isOpen: false}))}
            />
        </DataProvider>
    );
};

export default App;
