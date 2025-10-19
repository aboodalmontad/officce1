import * as React from 'react';
import { Session } from '@supabase/supabase-js';

// Lazy load page components for code splitting and faster initial load
const HomePage = React.lazy(() => import('./pages/HomePage'));
const ClientsPage = React.lazy(() => import('./pages/ClientsPage'));
const AccountingPage = React.lazy(() => import('./pages/AccountingPage'));
const InvoicesPage = React.lazy(() => import('./pages/InvoicesPage'));
const ReportsPage = React.lazy(() => import('./pages/ReportsPage'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));
const AuthPage = React.lazy(() => import('./pages/AuthPage'));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'));
const PendingApprovalPage = React.lazy(() => import('./pages/PendingApprovalPage'));
const SubscriptionExpiredPage = React.lazy(() => import('./pages/SubscriptionExpiredPage'));

import SetupWizard from './components/SetupWizard';
import { useSupabaseData, SyncStatus, APP_DATA_KEY } from './hooks/useSupabaseData';
import { HomeIcon, UserIcon, CalculatorIcon, ChartBarIcon, Cog6ToothIcon, ArrowPathIcon, WifiIcon, NoSymbolIcon, CheckCircleIcon, ExclamationCircleIcon, CloudIcon, ExclamationTriangleIcon, ServerIcon, CloudArrowDownIcon, CloudArrowUpIcon, DocumentTextIcon, PowerIcon, ChevronLeftIcon } from './components/icons';
import { useAnalysis } from './hooks/useSync';
import ContextMenu, { MenuItem } from './components/ContextMenu';
import AdminTaskModal from './components/AdminTaskModal';
import { AdminTask, Profile } from './types';
import { getSupabaseClient } from './supabaseClient';
import { useOnlineStatus } from './hooks/useOnlineStatus';


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

    const NavLink: React.FC<{ page: Page, label: string, icon: React.ReactElement<any> }> = ({ page, label, icon }) => (
        <a
            href="#"
            onClick={(e) => { e.preventDefault(); setCurrentPage(page); }}
            className={`flex-shrink-0 flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${currentPage === page ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-200'}`}
        >
            {React.cloneElement(icon, { className: "w-5 h-5 text-gray-500"})}
            <span className="ms-2">{label}</span>
        </a>
    );

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
                        return <NavLink key={item.id} page={item.id as Page} label={item.label} icon={item.icon} />;
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
                        <NavLink key={item.id} page={item.id as Page} label={item.label} icon={item.icon} />
                    ))}
                </nav>
            </div>
        </header>
    );
};

const MemoizedNavbar = React.memo(Navbar);

const PageLoader: React.FC = () => (
    <div className="flex justify-center items-center h-96">
        <div className="spinner"></div>
    </div>
);

const App: React.FC<AppProps> = ({ onRefresh }) => {
    const [currentPage, setCurrentPage] = React.useState<Page>('home');
    const [session, setSession] = React.useState<Session | null>(null);
    const [isAuthLoading, setIsAuthLoading] = React.useState(true);
    const [profile, setProfile] = React.useState<Profile | null>(null);
    const [offlineMode, setOfflineMode] = React.useState(false);
    const [forceShowSetup, setForceShowSetup] = React.useState(false);
    const [initialInvoiceData, setInitialInvoiceData] = React.useState<{ clientId: string; caseId?: string } | undefined>();
    const isOnline = useOnlineStatus();

    React.useEffect(() => {
        if ('serviceWorker' in navigator) {
            const swUrl = `${location.origin}/sw.js`;
            navigator.serviceWorker.register(swUrl).then(registration => {
                console.log('SW registered from React: ', registration);
            }).catch(registrationError => {
                console.log('SW registration failed from React: ', registrationError);
            });
        }
    }, []);
    
    React.useEffect(() => {
        const supabase = getSupabaseClient();
        if (!supabase) {
            setIsAuthLoading(false);
            return;
        }

        const checkInitialSession = async () => {
            try {
                const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
                if (sessionError) throw sessionError;

                if (currentSession?.user) {
                    const { data, error } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', currentSession.user.id)
                        .maybeSingle();

                    if (error) throw error;
                    setProfile(data);
                } else {
                    setProfile(null);
                }
                setSession(currentSession);
            } catch (error) {
                console.error("Error bootstrapping session:", error);
                setSession(null);
                setProfile(null);
            } finally {
                setIsAuthLoading(false);
            }
        };

        checkInitialSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, newSession) => {
                setSession(newSession);
                if (newSession?.user) {
                    try {
                        const { data, error } = await supabase
                            .from('profiles')
                            .select('*')
                            .eq('id', newSession.user.id)
                            .maybeSingle();
                        if (error) throw error;
                        setProfile(data);
                    } catch (e) {
                        console.error("Error fetching profile on auth state change:", e);
                        setProfile(null);
                    }
                } else {
                    setProfile(null);
                }
            }
        );
    
        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const {
        clients, adminTasks, appointments, accountingEntries, assistants, invoices,
        setClients, setAdminTasks, setAppointments, setAccountingEntries, setAssistants, setInvoices,
        allSessions, setFullData, syncStatus, forceSync, manualSync, lastSyncError, isDirty
    } = useSupabaseData(offlineMode, session?.user ?? null);

    const { analysisStatus, lastAnalysis, triggerAnalysis, analysisReport } = useAnalysis();

    const [adminTaskModalState, setAdminTaskModalState] = React.useState<{ isOpen: boolean; initialData?: any }>({ isOpen: false });
    const [contextMenuState, setContextMenuState] = React.useState<{ isOpen: boolean; position: { x: number; y: number }; menuItems: MenuItem[] }>({
        isOpen: false,
        position: { x: 0, y: 0 },
        menuItems: [],
    });
    
    const toInputDateString = (date: Date) => {
        const y = date.getFullYear();
        const m = date.getMonth() + 1;
        const d = date.getDate();
        return `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    }

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

        try {
            const userId = session?.user?.id;
            const { error } = await supabase.auth.signOut();

            if (error) {
                throw error;
            }

            if (userId) {
                localStorage.removeItem(`${APP_DATA_KEY}_${userId}`);
                localStorage.removeItem(`lawyerAppIsDirty_${userId}`);
            }
            localStorage.removeItem(APP_DATA_KEY);
            
            onRefresh();
        } catch (error) {
            console.error("Logout failed:", error);
            alert(`فشل تسجيل الخروج. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.`);
        }
    }, [session?.user?.id, onRefresh]);

    const handleCreateInvoiceFor = (clientId: string, caseId?: string) => {
        setInitialInvoiceData({ clientId, caseId });
        setCurrentPage('invoices');
    };

    const clearInitialInvoiceData = () => {
        setInitialInvoiceData(undefined);
    };

    const renderUserApp = () => {
        const commonProps = { showContextMenu, onOpenAdminTaskModal: handleOpenAdminTaskModal };
        let pageComponent: React.ReactNode;
        switch (currentPage) {
            case 'home': pageComponent = <HomePage appointments={appointments} clients={clients} setClients={setClients} allSessions={allSessions} setAppointments={setAppointments} adminTasks={adminTasks} setAdminTasks={setAdminTasks} assistants={assistants} {...commonProps} />; break;
            case 'clients': pageComponent = <ClientsPage clients={clients} setClients={setClients} accountingEntries={accountingEntries} setAccountingEntries={setAccountingEntries} assistants={assistants} onCreateInvoice={handleCreateInvoiceFor} {...commonProps} />; break;
            case 'accounting': pageComponent = <AccountingPage accountingEntries={accountingEntries} setAccountingEntries={setAccountingEntries} clients={clients} />; break;
            case 'invoices': pageComponent = <InvoicesPage invoices={invoices} setInvoices={setInvoices} clients={clients} initialInvoiceData={initialInvoiceData} clearInitialInvoiceData={clearInitialInvoiceData} />; break;
            case 'reports': pageComponent = <ReportsPage clients={clients} accountingEntries={accountingEntries} />; break;
            case 'settings': pageComponent = <SettingsPage setFullData={setFullData} analysisStatus={analysisStatus} lastAnalysis={lastAnalysis} triggerAnalysis={triggerAnalysis} assistants={assistants} setAssistants={setAssistants} analysisReport={analysisReport} offlineMode={offlineMode} setOfflineMode={setOfflineMode} />; break;
            default: pageComponent = <HomePage appointments={appointments} clients={clients} setClients={setClients} allSessions={allSessions} setAppointments={setAppointments} adminTasks={adminTasks} setAdminTasks={setAdminTasks} assistants={assistants} {...commonProps} />;
        }

        return (
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
                         <React.Suspense fallback={<PageLoader />}>
                            {pageComponent}
                        </React.Suspense>
                    </main>
                </div>

                <AdminTaskModal 
                    isOpen={adminTaskModalState.isOpen}
                    onClose={handleCloseAdminTaskModal}
                    onSubmit={handleTaskSubmit}
                    initialData={adminTaskModalState.initialData}
                    assistants={assistants}
                />
                <ContextMenu 
                    isOpen={contextMenuState.isOpen}
                    onClose={handleCloseContextMenu}
                    position={contextMenuState.position}
                    menuItems={contextMenuState.menuItems}
                />
            </div>
        );
    };
    
    if (isAuthLoading) {
        return null;
    }
    
    if (forceShowSetup || syncStatus === 'unconfigured' || syncStatus === 'uninitialized') {
        return <SetupWizard onRetry={onRefresh} />;
    }
    
    if (!session) {
        return <React.Suspense fallback={<PageLoader />}><AuthPage onForceSetup={() => setForceShowSetup(true)} /></React.Suspense>;
    }
    
    // Role-based routing
    if (profile?.role === 'admin') {
        return <React.Suspense fallback={<PageLoader />}><AdminDashboard onLogout={handleLogout} /></React.Suspense>;
    }
    
    // User-specific flow
    if (profile && !profile.is_approved) {
        return <React.Suspense fallback={<PageLoader />}><PendingApprovalPage onLogout={handleLogout} /></React.Suspense>;
    }
    
    if (profile) {
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
    }

    // Render the main application for the regular user
    return renderUserApp();
};

export default App;