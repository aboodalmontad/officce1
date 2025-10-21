import * as React from 'react';
import { Session as AuthSession } from '@supabase/supabase-js';

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
import { useSupabaseData, SyncStatus, APP_DATA_KEY, AppData } from './hooks/useSupabaseData';
import { HomeIcon, UserIcon, CalculatorIcon, ChartBarIcon, Cog6ToothIcon, ArrowPathIcon, WifiIcon, NoSymbolIcon, CheckCircleIcon, ExclamationCircleIcon, CloudIcon, ExclamationTriangleIcon, ServerIcon, CloudArrowDownIcon, CloudArrowUpIcon, DocumentTextIcon, PowerIcon, ChevronLeftIcon } from './components/icons';
import ContextMenu, { MenuItem } from './components/ContextMenu';
import AdminTaskModal from './components/AdminTaskModal';
import { AdminTask, Profile, Session, Client, Appointment, AccountingEntry, Invoice } from './types';
import { getSupabaseClient } from './supabaseClient';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { toInputDateString } from './utils/dateUtils';


// --- Data Context for avoiding prop drilling ---
// We define the context shape based on the return value of useSupabaseData
interface IDataContext {
    clients: Client[];
    adminTasks: AdminTask[];
    appointments: Appointment[];
    accountingEntries: AccountingEntry[];
    invoices: Invoice[];
    assistants: string[];
    setClients: (updater: React.SetStateAction<Client[]>) => void;
    setAdminTasks: (updater: React.SetStateAction<AdminTask[]>) => void;
    setAppointments: (updater: React.SetStateAction<Appointment[]>) => void;
    setAccountingEntries: (updater: React.SetStateAction<AccountingEntry[]>) => void;
    setInvoices: (updater: React.SetStateAction<Invoice[]>) => void;
    setAssistants: (updater: React.SetStateAction<string[]>) => void;
    allSessions: (Session & { stageId?: string, stageDecisionDate?: Date })[];
    setFullData: (data: any) => void;
    syncStatus: SyncStatus;
    forceSync: () => Promise<void>;
    manualSync: () => Promise<void>;
    lastSyncError: string | null;
    isDirty: boolean;
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

const SyncStatusIndicator: React.FC<{ status: SyncStatus, lastError: string | null, isDirty: boolean, onSync: () => void, isOnline: boolean }> = ({ status, lastError, isDirty, onSync, isOnline }) => {
    
    let displayStatus: { icon: React.ReactNode; text: string; color: string; error?: string; };

    if (status === 'loading') {
        displayStatus = { icon: <ArrowPathIcon className="w-5 h-5 animate-spin" />, text: 'جاري التحميل...', color: 'text-gray-500' };
    } else if (status === 'syncing') {
        displayStatus = { icon: <ArrowPathIcon className="w-5 h-5 animate-spin" />, text: 'جاري المزامنة...', color: 'text-blue-500' };
    } else if (status === 'error') {
        displayStatus = { icon: <ExclamationCircleIcon className="w-5 h-5" />, text: 'خطأ في المزامنة', color: 'text-red-500', error: lastError };
    } else if (status === 'unconfigured') {
        displayStatus = { icon: <ExclamationTriangleIcon className="w-5 h-5" />, text: 'فشل الإعداد', color: 'text-yellow-600' };
    } else if (status === 'uninitialized') {
        displayStatus = { icon: <ServerIcon className="w-5 h-5" />, text: 'البيانات غير مهيأة', color: 'text-yellow-600' };
    } else if (!isOnline) {
        if (isDirty) {
            displayStatus = { icon: <CloudArrowDownIcon className="w-5 h-5" />, text: 'التغييرات محفوظة محلياً', color: 'text-gray-700' };
        } else {
            displayStatus = { icon: <NoSymbolIcon className="w-5 h-5" />, text: 'أنت غير متصل', color: 'text-gray-500' };
        }
    } else { // isOnline
        if (isDirty) {
            displayStatus = { icon: <CloudArrowUpIcon className="w-5 h-5" />, text: 'تغييرات غير متزامنة', color: 'text-yellow-600' };
        } else {
             displayStatus = { icon: <CheckCircleIcon className="w-5 h-5" />, text: 'تمت المزامنة', color: 'text-green-500' };
        }
    }

    const { icon, text, color, error } = displayStatus;

    const showSyncButton = isOnline && isDirty && status !== 'syncing' && status !== 'loading';

    return (
         <div className="flex items-center gap-4 text-sm">
            <div className={`flex items-center gap-2 ${color}`} title={error || text}>
                {icon}
                <span className="hidden sm:inline">{text}</span>
            </div>
            {showSyncButton && (
                <button
                    onClick={onSync}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 animate-fade-in"
                >
                    <ArrowPathIcon className="w-4 h-4" />
                    مزامنة الآن
                </button>
            )}
        </div>
    );
};

const NavLink: React.FC<{ page: Page, label: string, icon: React.ReactElement<any>, currentPage: Page, setCurrentPage: (page: Page) => void }> = ({ page, label, icon, currentPage, setCurrentPage }) => (
    <a
        href="#"
        onClick={(e) => { e.preventDefault(); setCurrentPage(page); }}
        className={`flex-shrink-0 flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${currentPage === page ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-200'}`}
    >
        {React.cloneElement(icon, { className: "w-5 h-5 text-gray-500"})}
        <span className="ms-2">{label}</span>
    </a>
);

const Navbar: React.FC<{ currentPage: Page, setCurrentPage: (page: Page) => void, syncStatus: SyncStatus, lastSyncError: string | null, isDirty: boolean, onLogout: () => void, profile: Profile | null, onSync: () => void, isOnline: boolean }> = ({ currentPage, setCurrentPage, syncStatus, lastSyncError, isDirty, onLogout, profile, onSync, isOnline }) => {
    const [openDropdown, setOpenDropdown] = React.useState<string | null>(null);
    const navRef = React.useRef<HTMLElement>(null);

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (navRef.current && !navRef.current.contains(event.target as Node)) {
                setOpenDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const navItems = [
        { id: 'home', label: 'الرئيسية', icon: <HomeIcon className="w-5 h-5" /> },
        { id: 'clients', label: 'الموكلين', icon: <UserIcon className="w-5 h-5" /> },
        { 
            id: 'accounting-group', 
            label: 'المحاسبة', 
            icon: <CalculatorIcon className="w-5 h-5" />,
            children: [
                { id: 'accounting', label: 'المحاسبة', icon: <CalculatorIcon className="w-5 h-5" /> },
                { id: 'invoices', label: 'الفواتير', icon: <DocumentTextIcon className="w-5 h-5" /> },
                { id: 'reports', label: 'التقارير', icon: <ChartBarIcon className="w-5 h-5" /> },
            ] 
        },
        { id: 'settings', label: 'الإعدادات', icon: <Cog6ToothIcon className="w-5 h-5" /> },
    ];

    const fullName = profile?.full_name?.trim();

    return (
        <header className="fixed top-0 right-0 left-0 z-40 bg-gray-50 border-b shadow-sm">
            <div className="flex items-center justify-between h-16 px-4">
                <div className="flex items-center gap-4">
                    <a href="#" className="flex-shrink-0 flex items-center" onClick={(e) => { e.preventDefault(); setCurrentPage('home'); }}>
                        <h1 className="text-xl font-bold text-gray-800">مكتب المحامي</h1>
                    </a>
                    {fullName && (
                        <span className="text-xs sm:text-sm font-medium text-gray-600 animate-fade-in whitespace-nowrap">
                            مرحباً، {fullName}
                        </span>
                    )}
                </div>

                <nav className="hidden md:flex items-center gap-x-2" ref={navRef}>
                    {navItems.map(item => {
                        if (item.children) {
                            const isGroupActive = item.children.some(child => child.id === currentPage);
                            return (
                                <div key={item.id} className="relative">
                                    <button
                                        onClick={() => setOpenDropdown(openDropdown === item.id ? null : item.id)}
                                        className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${isGroupActive ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-200'}`}
                                    >
                                        {React.cloneElement(item.icon, { className: "w-5 h-5 text-gray-500"})}
                                        <span className="ms-2">{item.label}</span>
                                        <ChevronLeftIcon className={`w-4 h-4 ms-1 transition-transform ${openDropdown === item.id ? '-rotate-90' : 'rotate-0'}`} />
                                    </button>
                                    {openDropdown === item.id && (
                                        <div className="absolute start-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50">
                                            {item.children.map(child => (
                                                <a
                                                    key={child.id}
                                                    href="#"
                                                    onClick={(e) => { 
                                                        e.preventDefault(); 
                                                        setCurrentPage(child.id as Page); 
                                                        setOpenDropdown(null); 
                                                    }}
                                                    className={`w-full flex items-center px-4 py-2 text-sm ${currentPage === child.id ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100'}`}
                                                >
                                                    {React.cloneElement(child.icon, { className: "w-5 h-5 text-gray-400"})}
                                                    <span className="ms-3">{child.label}</span>
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        }
                        return <NavLink key={item.id} page={item.id as Page} label={item.label} icon={item.icon} currentPage={currentPage} setCurrentPage={setCurrentPage} />;
                    })}
                </nav>

                <div className="flex-shrink-0 flex items-center gap-4">
                    <SyncStatusIndicator status={syncStatus} lastError={lastSyncError} isDirty={isDirty} onSync={onSync} isOnline={isOnline} />
                    <button
                        onClick={onLogout}
                        className="p-2 text-gray-500 rounded-full hover:bg-gray-200 hover:text-gray-800 transition-colors"
                        title="تسجيل الخروج"
                    >
                        <PowerIcon className="w-6 h-6" />
                    </button>
                </div>
            </div>

            <div className="md:hidden border-t">
                <nav className="flex items-center gap-x-2 p-2 overflow-x-auto">
                     {navItems.flatMap(item => item.children ?? [item]).map(item => (
                        <NavLink key={item.id} page={item.id as Page} label={item.label} icon={item.icon} currentPage={currentPage} setCurrentPage={setCurrentPage} />
                    ))}
                </nav>
            </div>
        </header>
    );
};

const MemoizedNavbar = React.memo(Navbar);

const PageLoader: React.FC<{ message?: string }> = ({ message = "جاري تحميل بيانات المستخدم..." }) => (
    <div className="flex flex-col justify-center items-center h-screen bg-gray-100">
        <div className="spinner"></div>
        <p className="mt-4 text-gray-600">{message}</p>
    </div>
);

const App: React.FC<AppProps> = ({ onRefresh }) => {
    const [currentPage, setCurrentPage] = React.useState<Page>('home');
    const [session, setSession] = React.useState<AuthSession | null>(null);
    const [isAuthLoading, setIsAuthLoading] = React.useState(true);
    const [profile, setProfile] = React.useState<Profile | null>(null);
    const [offlineMode, setOfflineMode] = React.useState(false);
    const [forceShowSetup, setForceShowSetup] = React.useState(false);
    const [initialInvoiceData, setInitialInvoiceData] = React.useState<{ clientId: string; caseId?: string } | undefined>();
    const isOnline = useOnlineStatus();

    React.useEffect(() => {
        if ('serviceWorker' in navigator) {
            const registerServiceWorker = () => {
                const swUrl = `${location.origin}/sw.js`;
                navigator.serviceWorker.register(swUrl).then(registration => {
                    console.log('SW registered from React: ', registration);
                }).catch(registrationError => {
                    console.log('SW registration failed from React: ', registrationError);
                });
            };
            window.addEventListener('load', registerServiceWorker);
            return () => window.removeEventListener('load', registerServiceWorker);
        }
    }, []);
    
    React.useEffect(() => {
        const supabase = getSupabaseClient();
        if (!supabase) {
            setIsAuthLoading(false);
            return;
        }

        // onAuthStateChange handles everything: initial session, login, and logout.
        // It fires once on component mount.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, currentSession) => {
                // Case 1: User is logged out or session is invalid
                if (!currentSession?.user) {
                    setSession(null);
                    setProfile(null);
                    setIsAuthLoading(false); // Stable state: show login page
                    return;
                }

                // Case 2: Session exists, we must verify a matching profile exists.
                try {
                    const { data, error } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', currentSession.user.id)
                        .maybeSingle();

                    if (error) throw error;

                    if (data) {
                        // Stable state: user is logged in with a valid profile
                        setProfile(data);
                        setSession(currentSession);
                        setIsAuthLoading(false);
                    } else {
                        // Unstable state: session exists but no profile.
                        // This can happen briefly after signup or if a profile is deleted.
                        // Log the user out to force a clean login. The next onAuthStateChange event will handle it.
                        console.warn("Session exists without a profile, signing out to correct state.");
                        await supabase.auth.signOut();
                    }
                } catch (e) {
                    console.error("Error fetching profile, signing out:", e);
                    await supabase.auth.signOut();
                }
            }
        );

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const supabaseData = useSupabaseData(offlineMode, session?.user ?? null);
    const { syncStatus, manualSync, lastSyncError, isDirty, assistants, setAdminTasks } = supabaseData;

    const [adminTaskModalState, setAdminTaskModalState] = React.useState<{ isOpen: boolean; initialData?: any }>({ isOpen: false });
    const [contextMenuState, setContextMenuState] = React.useState<{ isOpen: boolean; position: { x: number; y: number }; menuItems: MenuItem[] }>({
        isOpen: false,
        position: { x: 0, y: 0 },
        menuItems: [],
    });
    
    const handleOpenAdminTaskModal = (initialData: any = {}) => {
        const isEditing = !!initialData.id;
        const preparedData = isEditing 
            ? { ...initialData, dueDate: toInputDateString(initialData.dueDate) } 
            : { dueDate: toInputDateString(new Date()), ...initialData };
        setAdminTaskModalState({ isOpen: true, initialData: preparedData });
    };

    const handleCloseAdminTaskModal = () => setAdminTaskModalState({ isOpen: false, initialData: undefined });

    const handleTaskSubmit = (taskData: Omit<AdminTask, 'id' | 'completed'> & { id?: string }) => {
        if (taskData.id) {
            setAdminTasks(prev => prev.map(t => t.id === taskData.id ? { ...t, ...taskData, completed: t.completed } as AdminTask : t));
        } else {
            setAdminTasks(prev => [...prev, { ...taskData, id: `task-${Date.now()}`, completed: false } as AdminTask]);
        }
        handleCloseAdminTaskModal();
    };

    const showContextMenu = (event: React.MouseEvent, menuItems: MenuItem[]) => {
        event.preventDefault();
        setContextMenuState({
            isOpen: true,
            position: { x: event.clientX, y: event.clientY },
            menuItems,
        });
    };

    const handleCloseContextMenu = () => setContextMenuState(prev => ({ ...prev, isOpen: false }));
    
    const handleLogout = React.useCallback(async () => {
        const supabase = getSupabaseClient();
        if (!supabase) return;
    
        const userId = session?.user?.id;
    
        try {
            const { error } = await supabase.auth.signOut();
            if (error) {
                throw error;
            }
        } catch (error) {
            console.error("Logout failed:", error);
            alert(`فشل تسجيل الخروج. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.`);
            return; // Stop if sign out fails
        }
        
        // After successful sign out, clear all app-related local storage.
        if (userId) {
            localStorage.removeItem(`${APP_DATA_KEY}_${userId}`);
            localStorage.removeItem(`lawyerAppIsDirty_${userId}`);
        }
        localStorage.removeItem(APP_DATA_KEY);
        
        // Explicitly clear session state to ensure the UI updates to the login page immediately.
        // onAuthStateChange will also handle this, but being explicit prevents flickers.
        setSession(null);
        setProfile(null);
        
        // Then, force a full app refresh to completely reset all other component states,
        // ensuring no user data remains in memory.
        onRefresh();
        
    }, [session?.user?.id, onRefresh]);

    const handleCreateInvoiceFor = (clientId: string, caseId?: string) => {
        setInitialInvoiceData({ clientId, caseId });
        setCurrentPage('invoices');
    };

    const clearInitialInvoiceData = () => {
        setInitialInvoiceData(undefined);
    };

    if (isAuthLoading) {
        // Render nothing, allowing the initial HTML loader to show.
        // This prevents flashes of incorrect UI before auth state is determined.
        return null;
    }

    if (syncStatus === 'error' && lastSyncError && lastSyncError.includes('فشل الاتصال بالخادم')) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4" dir="rtl">
                <div className="w-full max-w-lg p-8 space-y-4 bg-white rounded-lg shadow-md text-center">
                    <ExclamationTriangleIcon className="h-12 w-12 text-red-500 mx-auto" />
                    <h1 className="text-2xl font-bold text-gray-800">خطأ في الاتصال</h1>
                    <p className="text-gray-600">{lastSyncError}</p>
                    <div className="text-right bg-gray-50 p-4 rounded-md border text-sm space-y-2">
                        <p className="font-semibold">خطوات مقترحة للحل:</p>
                        <ol className="list-decimal list-inside">
                            <li>تأكد من أن جهازك متصل بالإنترنت بشكل صحيح.</li>
                            <li>تأكد من أن بيانات اعتماد Supabase (URL and Key) في ملف <code className="bg-gray-200 p-1 rounded text-xs">supabaseClient.ts</code> صحيحة.</li>
                            <li>
                                تحقق من إعدادات CORS في لوحة تحكم Supabase. اذهب إلى:
                                <code className="block bg-gray-200 p-2 rounded text-xs my-1 ltr text-left">Project Settings &rarr; API &rarr; CORS configuration</code>
                                وتأكد من أن <code className="bg-gray-200 p-1 rounded text-xs">*</code> أو نطاق التطبيق الخاص بك مضاف.
                            </li>
                        </ol>
                    </div>
                    <button 
                        onClick={onRefresh}
                        className="mt-4 px-6 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                    >
                        إعادة المحاولة
                    </button>
                </div>
            </div>
        );
    }
    
    if (forceShowSetup || syncStatus === 'unconfigured' || syncStatus === 'uninitialized') {
        return <ConfigurationModal onRetry={onRefresh} />;
    }
    
    if (!session) {
        return <React.Suspense fallback={<PageLoader />}><LoginPage onForceSetup={() => setForceShowSetup(true)} /></React.Suspense>;
    }

    // When a session exists, we must have a profile. If not, it's an inconsistent state,
    // and the app should show a loader until onAuthStateChange corrects it by logging out.
    if (!profile) {
        return <PageLoader />;
    }
    
    // Role-based routing
    if (profile.role === 'admin') {
        return <React.Suspense fallback={<PageLoader />}><AdminDashboard onLogout={handleLogout} /></React.Suspense>;
    }
    
    // User-specific flow
    if (!profile.is_approved) {
        return <React.Suspense fallback={<PageLoader />}><PendingApprovalPage onLogout={handleLogout} /></React.Suspense>;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day for comparison

    const subStartDate = profile.subscription_start_date ? new Date(profile.subscription_start_date) : null;
    if (subStartDate) subStartDate.setHours(0, 0, 0, 0);

    const subEndDate = profile.subscription_end_date ? new Date(profile.subscription_end_date) : null;
    if (subEndDate) subEndDate.setHours(0, 0, 0, 0);

    // Access is denied if the subscription period is invalid.
    // A period is considered invalid if:
    // 1. The start date is not set or the end date is not set.
    // 2. The subscription hasn't started yet.
    // 3. The subscription has already ended.
    if (!subStartDate || !subEndDate || today < subStartDate || today > subEndDate) {
        return <React.Suspense fallback={<PageLoader />}><SubscriptionExpiredPage onLogout={handleLogout} /></React.Suspense>;
    }

    // Render the main application for the regular user
    let pageComponent: React.ReactNode;
    switch (currentPage) {
        case 'home': pageComponent = <HomePage onOpenAdminTaskModal={handleOpenAdminTaskModal} showContextMenu={showContextMenu} />; break;
        case 'clients': pageComponent = <ClientsPage onCreateInvoice={handleCreateInvoiceFor} onOpenAdminTaskModal={handleOpenAdminTaskModal} showContextMenu={showContextMenu} />; break;
        case 'accounting': pageComponent = <AccountingPage />; break;
        case 'invoices': pageComponent = <InvoicesPage initialInvoiceData={initialInvoiceData} clearInitialInvoiceData={clearInitialInvoiceData} />; break;
        case 'reports': pageComponent = <ReportsPage />; break;
        case 'settings': pageComponent = <SettingsPage offlineMode={offlineMode} setOfflineMode={setOfflineMode} />; break;
        default: pageComponent = <HomePage onOpenAdminTaskModal={handleOpenAdminTaskModal} showContextMenu={showContextMenu} />;
    }

    return (
        <DataContext.Provider value={supabaseData}>
            <div dir="rtl">
                <MemoizedNavbar 
                    currentPage={currentPage} 
                    setCurrentPage={setCurrentPage}
                    syncStatus={syncStatus}
                    lastSyncError={lastSyncError}
                    isDirty={isDirty}
                    onLogout={handleLogout}
                    profile={profile}
                    onSync={manualSync}
                    isOnline={isOnline}
                />
                <div className="p-4 pt-32 md:pt-20">
                    <main>
                         <React.Suspense fallback={<PageLoader message="جاري تحميل الصفحة..."/>}>
                            {pageComponent}
                        </React.Suspense>
                    </main>
                </div>

                <AdminTaskModal 
                    isOpen={adminTaskModalState.isOpen}
                    onClose={handleCloseAdminTaskModal}
                    onSubmit={handleTaskSubmit}
                    initialData={adminTaskModalState.initialData}
                />
                <ContextMenu 
                    isOpen={contextMenuState.isOpen}
                    onClose={handleCloseContextMenu}
                    position={contextMenuState.position}
                    menuItems={contextMenuState.menuItems}
                />
            </div>
        </DataContext.Provider>
    );
};

export default App;