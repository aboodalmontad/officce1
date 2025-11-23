
import * as React from 'react';
import { getSupabaseClient } from './supabaseClient';
import LoginPage from './pages/LoginPage';
import PendingApprovalPage from './pages/PendingApprovalPage';
import SubscriptionExpiredPage from './pages/SubscriptionExpiredPage';
import AdminDashboard from './pages/AdminDashboard';
import HomePage from './pages/HomePage';
import ClientsPage from './pages/ClientsPage';
import AccountingPage from './pages/AccountingPage';
import SettingsPage from './pages/SettingsPage';
import { DataProvider } from './context/DataContext';
import { useSupabaseData } from './hooks/useSupabaseData';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { NoSymbolIcon, UserGroupIcon, Cog6ToothIcon, CurrencyDollarIcon, PowerIcon, BuildingLibraryIcon, ArrowPathIcon, CalendarDaysIcon } from './components/icons';
import NotificationCenter from './components/RealtimeNotifier';
import AdminTaskModal from './components/AdminTaskModal';
import ContextMenu, { MenuItem } from './components/ContextMenu';
import UnpostponedSessionsModal from './components/UnpostponedSessionsModal';
import ConfigurationModal from './components/ConfigurationModal';
import type { User } from '@supabase/supabase-js';

// Define FullScreenLoader locally since it's used but file might be missing or implicit
const FullScreenLoader: React.FC<{ text?: string }> = ({ text }) => (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-50 z-50">
        <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
        <p className="text-gray-600 font-medium animate-pulse">{text || 'جاري التحميل...'}</p>
    </div>
);

interface AppProps {
    onRefresh?: () => void;
}

const App: React.FC<AppProps> = ({ onRefresh }) => {
    const [user, setUser] = React.useState<User | null>(null);
    const [isAuthLoading, setIsAuthLoading] = React.useState(true);
    const [currentView, setCurrentView] = React.useState<'home' | 'clients' | 'accounting' | 'settings' | 'adminTasks'>('home');
    const [showAdminTaskModal, setShowAdminTaskModal] = React.useState(false);
    const [adminTaskInitialData, setAdminTaskInitialData] = React.useState<any>(undefined);
    const [contextMenu, setContextMenu] = React.useState<{ isOpen: boolean; x: number; y: number; items: MenuItem[] }>({ isOpen: false, x: 0, y: 0, items: [] });
    const [showConfigModal, setShowConfigModal] = React.useState(false);
    const [accessToken, setAccessToken] = React.useState<string | undefined>(undefined);
    
    // Accounting specific state for deep linking from ClientsPage
    const [invoiceInitialData, setInvoiceInitialData] = React.useState<{ clientId: string; caseId?: string } | undefined>(undefined);

    // Date selection state lifted up from HomePage
    const [selectedDate, setSelectedDate] = React.useState(new Date());

    const supabase = getSupabaseClient();
    const isOnline = useOnlineStatus();

    React.useEffect(() => {
        if (!supabase) {
            setIsAuthLoading(false);
            return;
        }

        const checkSession = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                setUser(session?.user || null);
                setAccessToken(session?.access_token);
            } catch (e) {
                console.error("Session check failed", e);
            } finally {
                setIsAuthLoading(false);
            }
        };

        checkSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user || null);
            setAccessToken(session?.access_token);
            setIsAuthLoading(false);
            
            // Notify other tabs about logout
            if (_event === 'SIGNED_OUT') {
                 localStorage.setItem('lawyerAppLoggedOut', 'true');
                 setTimeout(() => localStorage.removeItem('lawyerAppLoggedOut'), 1000);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const data = useSupabaseData(user, isAuthLoading, accessToken);

    const handleLogout = async () => {
        if (supabase) {
            await supabase.auth.signOut();
        }
        setUser(null);
        setCurrentView('home');
        // Trigger a full app refresh to clear any in-memory state
        if (onRefresh) onRefresh();
        else window.location.reload();
    };

    const handleLoginSuccess = (user: User, isOfflineLogin = false) => {
        setUser(user);
    };

    const handleOpenAdminTaskModal = (initialData?: any) => {
        setAdminTaskInitialData(initialData);
        setShowAdminTaskModal(true);
    };

    const handleShowContextMenu = (event: React.MouseEvent, menuItems: MenuItem[]) => {
        event.preventDefault();
        setContextMenu({
            isOpen: true,
            x: event.clientX,
            y: event.clientY,
            items: menuItems,
        });
    };

    const handleCreateInvoice = (clientId: string, caseId?: string) => {
        setInvoiceInitialData({ clientId, caseId });
        setCurrentView('accounting');
    };

    if (isAuthLoading) {
        return <FullScreenLoader text="جاري التحقق من تسجيل الدخول..." />;
    }

    if (showConfigModal) {
        return <ConfigurationModal onRetry={() => { setShowConfigModal(false); window.location.reload(); }} />;
    }

    // 1. Not Logged In
    if (!user) {
        return <LoginPage onForceSetup={() => setShowConfigModal(true)} onLoginSuccess={handleLoginSuccess} />;
    }

    // 2. Wait for critical profile data or valid sync
    const currentUserProfile = data.profiles.find(p => p.id === user.id);

    // Check for severe sync errors (e.g. schema mismatch) which might require user attention
    if (data.syncStatus === 'uninitialized' || (data.lastSyncError && data.lastSyncError.includes('relation'))) {
         // Potentially show config modal or specific error, but let's proceed to checks
    }

    if (currentUserProfile) {
        if (currentUserProfile.role === 'admin') {
            return (
                <DataProvider value={data}>
                    <AdminDashboard onLogout={handleLogout} onOpenConfig={() => setShowConfigModal(true)} />
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

        if (!currentUserProfile.is_approved) {
            return <PendingApprovalPage onLogout={handleLogout} />;
        }

        if (!currentUserProfile.is_active) {
             return <PendingApprovalPage onLogout={handleLogout} />;
        }

        const today = new Date();
        const subEnd = currentUserProfile.subscription_end_date ? new Date(currentUserProfile.subscription_end_date) : null;
        if (subEnd && subEnd < today) {
            return <SubscriptionExpiredPage onLogout={handleLogout} />;
        }
        
        // Helper for Main Nav Buttons
        const NavButton: React.FC<{ active: boolean, onClick: () => void, icon: React.ReactNode, label: string }> = ({ active, onClick, icon, label }) => (
            <button
                onClick={onClick}
                className={`group flex items-center justify-center gap-2 px-3 py-2 rounded-xl transition-all duration-200 ${
                    active
                        ? 'bg-blue-600 text-white shadow-md transform scale-105' 
                        : 'text-gray-600 hover:bg-gray-100 hover:text-blue-600'
                }`}
                title={label}
            >
                <div className={`flex-shrink-0 ${active ? 'text-white' : 'text-current'}`}>
                    {React.cloneElement(icon as React.ReactElement, { 
                        className: "w-6 h-6 sm:w-7 sm:h-7" 
                    })}
                </div>
                {/* Text only visible on larger screens to prevent scrollbar */}
                <span className={`font-bold text-sm lg:text-base hidden lg:block whitespace-nowrap ${active ? 'text-white' : 'text-gray-700'}`}>
                    {label}
                </span>
            </button>
        );

        // Helper for Icon Buttons (Sync, Settings, Logout)
        const IconButton: React.FC<{ onClick: () => void, icon: React.ReactNode, title: string, color?: string, active?: boolean }> = ({ onClick, icon, title, color, active }) => (
            <button
                onClick={onClick}
                className={`p-2 rounded-full transition-colors duration-200 flex-shrink-0 ${
                    active ? 'bg-blue-100 text-blue-600' : (color || 'text-gray-500 hover:bg-gray-100 hover:text-gray-700')
                }`}
                title={title}
            >
                <div className="w-6 h-6 sm:w-7 sm:h-7">
                    {icon}
                </div>
            </button>
        );

        return (
            <DataProvider value={data}>
                <div className="flex flex-col h-screen bg-gray-100 overflow-hidden">
                    {/* Top Navigation Bar (Header) - Single Row, No Scrollbar */}
                    <header className="bg-white shadow-md z-30 flex-shrink-0">
                        <div className="w-full px-2 sm:px-4">
                            <div className="flex items-center justify-between h-16 sm:h-20">
                                
                                {/* Right Section: Identity */}
                                <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                                    <div className="bg-blue-600 text-white w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-xl text-xl font-bold shadow-sm flex-shrink-0 select-none">
                                        م
                                    </div>
                                    <div className="flex flex-col justify-center min-w-0">
                                        <div className="flex items-baseline gap-2">
                                            <h1 className="text-base sm:text-lg font-bold text-gray-800 whitespace-nowrap">
                                                مكتب المحامي
                                            </h1>
                                            <span className="text-xs sm:text-sm font-medium text-gray-500 truncate max-w-[100px] sm:max-w-[150px]">
                                                {currentUserProfile.full_name}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Center Section: Main Navigation */}
                                <div className="flex items-center justify-center gap-1 sm:gap-4 flex-grow px-2">
                                    <NavButton 
                                        active={currentView === 'home'} 
                                        onClick={() => setCurrentView('home')} 
                                        icon={<CalendarDaysIcon />} 
                                        label="المفكرة" 
                                    />
                                    <NavButton 
                                        active={currentView === 'clients'} 
                                        onClick={() => setCurrentView('clients')} 
                                        icon={<UserGroupIcon />} 
                                        label="الموكلين" 
                                    />
                                    <NavButton 
                                        active={currentView === 'adminTasks'} 
                                        onClick={() => setCurrentView('adminTasks')} 
                                        icon={<BuildingLibraryIcon />} 
                                        label="المهام الإدارية" 
                                    />
                                    <NavButton 
                                        active={currentView === 'accounting'} 
                                        onClick={() => setCurrentView('accounting')} 
                                        icon={<CurrencyDollarIcon />} 
                                        label="المحاسبة" 
                                    />
                                </div>

                                {/* Left Section: Actions */}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <IconButton 
                                        onClick={() => data.manualSync()} 
                                        icon={<ArrowPathIcon className={data.syncStatus === 'syncing' ? 'animate-spin' : ''} />} 
                                        title="مزامنة" 
                                        color="text-blue-600 hover:bg-blue-50"
                                    />
                                    <IconButton 
                                        onClick={() => setCurrentView('settings')} 
                                        icon={<Cog6ToothIcon />} 
                                        title="الإعدادات" 
                                        active={currentView === 'settings'}
                                    />
                                    <IconButton 
                                        onClick={handleLogout} 
                                        icon={<PowerIcon />} 
                                        title="تسجيل الخروج" 
                                        color="text-red-600 hover:bg-red-50"
                                    />
                                </div>
                            </div>
                        </div>
                    </header>

                    {/* Main Content Area */}
                    <main className="flex-1 overflow-y-auto p-2 sm:p-4 lg:p-6 relative scroll-smooth" id="main-content">
                        {currentView === 'home' && (
                            <HomePage 
                                onOpenAdminTaskModal={handleOpenAdminTaskModal}
                                showContextMenu={handleShowContextMenu}
                                mainView="agenda"
                                selectedDate={selectedDate}
                                setSelectedDate={setSelectedDate}
                            />
                        )}
                        {currentView === 'adminTasks' && (
                             <HomePage 
                                onOpenAdminTaskModal={handleOpenAdminTaskModal}
                                showContextMenu={handleShowContextMenu}
                                mainView="adminTasks"
                                selectedDate={selectedDate}
                                setSelectedDate={setSelectedDate}
                            />
                        )}
                        {currentView === 'clients' && (
                            <ClientsPage 
                                showContextMenu={handleShowContextMenu}
                                onOpenAdminTaskModal={handleOpenAdminTaskModal}
                                onCreateInvoice={handleCreateInvoice}
                            />
                        )}
                        {currentView === 'accounting' && (
                            <AccountingPage 
                                initialInvoiceData={invoiceInitialData} 
                                clearInitialInvoiceData={() => setInvoiceInitialData(undefined)}
                            />
                        )}
                        {currentView === 'settings' && <SettingsPage />}
                    </main>

                    {/* Global Modals & Overlays */}
                    <NotificationCenter 
                        appointmentAlerts={data.triggeredAlerts}
                        realtimeAlerts={data.realtimeAlerts}
                        userApprovalAlerts={data.userApprovalAlerts}
                        dismissAppointmentAlert={data.dismissAlert}
                        dismissRealtimeAlert={data.dismissRealtimeAlert}
                        dismissUserApprovalAlert={data.dismissUserApprovalAlert}
                    />
                    
                    <UnpostponedSessionsModal 
                        isOpen={data.showUnpostponedSessionsModal}
                        onClose={() => data.setShowUnpostponedSessionsModal(false)}
                        sessions={data.unpostponedSessions}
                        onPostpone={data.postponeSession}
                        assistants={data.assistants}
                    />

                    {showAdminTaskModal && (
                        <AdminTaskModal
                            isOpen={showAdminTaskModal}
                            onClose={() => { setShowAdminTaskModal(false); setAdminTaskInitialData(undefined); }}
                            onSubmit={(task) => {
                                if (task.id) {
                                    // Edit mode
                                    data.setAdminTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...task, updated_at: new Date() } : t));
                                } else {
                                    // Add mode
                                    const newTask = { ...task, id: `task-${Date.now()}`, completed: false, updated_at: new Date() };
                                    data.setAdminTasks(prev => [...prev, newTask]);
                                }
                                setShowAdminTaskModal(false);
                                setAdminTaskInitialData(undefined);
                            }}
                            initialData={adminTaskInitialData}
                            assistants={data.assistants}
                        />
                    )}

                    <ContextMenu
                        isOpen={contextMenu.isOpen}
                        position={{ x: contextMenu.x, y: contextMenu.y }}
                        menuItems={contextMenu.items}
                        onClose={() => setContextMenu(prev => ({ ...prev, isOpen: false }))}
                    />
                </div>
            </DataProvider>
        );
    }

    // 3. Fallback (should not reach here usually)
    return <LoginPage onForceSetup={() => setShowConfigModal(true)} onLoginSuccess={handleLoginSuccess} />;
};

export default App;
