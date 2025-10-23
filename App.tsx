
import * as React from 'react';
import { Session as AuthSession, User } from '@supabase/supabase-js';

// Lazy load page components for code splitting and faster initial load
const HomePage = React.lazy(() => import('./pages/HomePage'));
const ClientsPage = React.lazy(() => import('./pages/ClientsPage'));
const AccountingPage = React.lazy(() => import('./pages/AccountingPage'));
const InvoicesPage = React.lazy(() => import('./pages/InvoicesPage'));
const ReportsPage = React.lazy(() => import('./pages/ReportsPage'));
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
}

const DataContext = React.createContext<IDataContext | null>(null);

export const useData = () => {
    const context = React.useContext(DataContext);
    if (!context) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
};

type Page = 'home' | 'clients' | 'accounting' | 'invoices' | 'reports' | 'settings';

interface AppProps {
    onRefresh: () => void;
}

const SyncStatusIndicator: React.FC<{ status: SyncStatus, lastError: string | null, isDirty: boolean, isOnline: boolean, onManualSync: () => void }> = ({ status, lastError, isDirty, isOnline, onManualSync }) => {
    
    let displayStatus;
    if (!isOnline) {
        displayStatus = {
            icon: <NoSymbolIcon className="w-5 h-5 text-gray-500" />,
            text: 'غير متصل',
            className: 'text-gray-500',
            title: 'أنت غير متصل بالإنترنت. التغييرات محفوظة محلياً.'
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
            <span className={displayStatus.className}>{displayStatus.text}</span>
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
}> = ({ currentPage, onNavigate, onLogout, syncStatus, lastSyncError, isDirty, isOnline, onManualSync, profile }) => {
    
    const navItems = [
        { id: 'home', label: 'الرئيسية', icon: HomeIcon },
        { id: 'clients', label: 'الموكلين', icon: UserIcon },
        { id: 'accounting', label: 'المحاسبة', icon: CalculatorIcon },
        { id: 'invoices', label: 'الفواتير', icon: DocumentTextIcon },
        { id: 'reports', label: 'التقارير', icon: ChartBarIcon },
        { id: 'settings', label: 'الإعدادات', icon: Cog6ToothIcon },
    ];
    
    return (
        <header className="bg-white shadow-md p-4 flex justify-between items-center no-print">
            <nav className="flex items-center gap-4">
                <h1 className="text-xl font-bold text-gray-800 hidden md:block">مكتب المحامي</h1>
                 <div className="flex items-center gap-2">
                    {navItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => onNavigate(item.id as Page)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${currentPage === item.id ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            <item.icon className="w-5 h-5" />
                            <span className="hidden sm:inline">{item.label}</span>
                        </button>
                    ))}
                </div>
            </nav>
            <div className="flex items-center gap-4">
                 {profile && (
                    <div className="text-right">
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

    const sessionUserIdRef = React.useRef<string | undefined>();

    React.useEffect(() => {
        if (supabaseData.syncStatus === 'unconfigured' || supabaseData.syncStatus === 'uninitialized') {
            setShowConfigModal(true);
        } else {
            setShowConfigModal(false);
        }
    }, [supabaseData.syncStatus]);
    
    React.useEffect(() => {
        // This effect runs only once to set up the authentication listener.
        if (!supabase) {
            setIsAuthLoading(false);
            return;
        }
    
        // Set initial auth loading to false after the first check.
        supabase.auth.getSession().then(({ data: { session } }) => {
            sessionUserIdRef.current = session?.user?.id;
            setSession(session);
            setIsAuthLoading(false);
        });
        
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            // A user change is a login (null -> user) or logout (user -> null).
            // A token refresh will have the same user ID.
            if (session?.user?.id !== sessionUserIdRef.current) {
                setIsAuthLoading(true); // Show loading screen for user change
                setProfile(null);      // Clear old profile data
            }
            
            // Update ref and state for the next check
            sessionUserIdRef.current = session?.user?.id;
            setSession(session);
    
            if (_event === "SIGNED_IN" && session?.user) {
               localStorage.setItem(LAST_USER_CACHE_KEY, JSON.stringify(session.user));
            }
        });
    
        return () => {
            subscription.unsubscribe();
        };
    }, [supabase]);

    React.useEffect(() => {
        // This effect handles fetching and setting the user profile whenever the session changes or network status changes.
        const fetchAndSetProfile = async () => {
            try {
                // If there's no user, clean up and finish.
                if (!session?.user) {
                    setProfile(null);
                    setAuthError(null);
                    return;
                }
    
                const PROFILE_CACHE_KEY = `lawyerAppProfile_${session.user.id}`;
                let profileFromCache: Profile | null = null;
    
                // 1. Try to load from cache
                try {
                    const cachedData = localStorage.getItem(PROFILE_CACHE_KEY);
                    if (cachedData) {
                        const parsed = JSON.parse(cachedData);
                        // Basic validation to prevent loading corrupted data
                        if (parsed && typeof parsed === 'object' && 'id' in parsed) {
                            profileFromCache = parsed;
                        } else {
                            throw new Error("Invalid cached profile format.");
                        }
                    }
                } catch (e) {
                    console.error("Failed to load or parse profile from cache. Deleting it.", e);
                    localStorage.removeItem(PROFILE_CACHE_KEY); // Clear bad data
                }
                
                // 2. Optimistically set profile from cache for faster UI response
                if (profileFromCache) {
                    setProfile(profileFromCache);
                }
                
                // 3. If online, try to fetch the latest profile from the server.
                if (isOnline) {
                    try {
                        const { data, error, status } = await supabase!.from('profiles').select('*').eq('id', session.user.id).single();
    
                        if (data) {
                            // Success! Update state and cache.
                            setProfile(data);
                            localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data));
                            setAuthError(null); // Clear any previous auth error.
                        } else if (error && status !== 406) { // 406 means no row found, which is handled below.
                            // A real network or DB error occurred.
                            console.error("Error fetching profile from Supabase:", error);
                            // If we don't have a cached profile, we must show an error.
                            if (!profileFromCache) {
                                setAuthError('فشل الاتصال بالخادم لجلب ملفك الشخصي. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.');
                            }
                            // Otherwise, we just fall back to the cached version, and the sync indicator will show the error.
                        } else if (!profileFromCache) {
                            // No error, but no data returned, and no cache. Critical state.
                            setAuthError("User is authenticated, but no profile was found.");
                        }
                    } catch (err) {
                         console.error("Error fetching profile:", err);
                         if (!profileFromCache) {
                            setAuthError('فشل الاتصال بالخادم لجلب ملفك الشخصي. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.');
                        }
                    }
                } else { // 4. We are offline.
                    // If we're offline and have no cached profile, create a temporary one.
                    if (!profileFromCache) {
                        console.log("Offline and no cached profile. Creating temporary profile.");
                        const tempProfile: Profile = {
                            id: session.user.id,
                            full_name: 'مستخدم غير متصل',
                            role: 'user',
                            is_approved: true,
                            is_active: true,
                            subscription_start_date: new Date().toISOString(),
                            subscription_end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
                            mobile_number: '',
                        };
                        setProfile(tempProfile);
                        localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(tempProfile));
                    }
                }
            } catch (e) {
                console.error("Unexpected error in profile fetch logic:", e);
                setAuthError("An unexpected error occurred while loading your profile.");
            } finally {
                // Always ensure the loading state is turned off after attempting to get a profile.
                setIsAuthLoading(false);
            }
        };
    
        fetchAndSetProfile();
    }, [session, isOnline, supabase]);

    const handleLogout = async () => {
        const userId = session?.user?.id;
        if (supabase) {
            const { error } = await supabase.auth.signOut();
            // The onAuthStateChange listener will handle setting the session to null.
            // But if signOut fails (e.g. offline), we force it.
            if (error) {
                console.error('Logout error, likely offline. Forcing local logout.', error.message);
                setSession(null);
            }
        } else {
            // Fallback for when supabase client is not available
            setSession(null);
        }
        
        // Clearing local state should happen after the auth state has been changed
        setCurrentPage('home'); 
        if (userId) {
            localStorage.removeItem(`lawyerAppIsDirty_${userId}`);
        }
    };
    
    const handleLoginSuccess = (user: User) => {
        setIsAuthLoading(true);
        setSession({ user, access_token: '', token_type: '', refresh_token: '' } as AuthSession);
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
        setCurrentPage('invoices');
    };
    
    const clearInitialInvoiceData = () => setInitialInvoiceData(undefined);

    const renderPage = () => {
        switch (currentPage) {
            case 'home': return <HomePage onOpenAdminTaskModal={handleOpenAdminTaskModal} showContextMenu={showContextMenu} />;
            case 'clients': return <ClientsPage onOpenAdminTaskModal={handleOpenAdminTaskModal} showContextMenu={showContextMenu} onCreateInvoice={handleCreateInvoice} />;
            case 'accounting': return <AccountingPage />;
            case 'invoices': return <InvoicesPage initialInvoiceData={initialInvoiceData} clearInitialInvoiceData={clearInitialInvoiceData} />;
            case 'reports': return <ReportsPage />;
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

    if (!session?.user) {
        return <LoginPage onForceSetup={() => setShowConfigModal(true)} onLoginSuccess={handleLoginSuccess} />;
    }
    
    if (supabaseData.isDataLoading || !profile) {
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
                    {...supabaseData}
                    isOnline={isOnline}
                />
                <main className="flex-grow p-6">
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
