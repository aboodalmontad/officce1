import * as React from 'react';
import HomePage from './pages/HomePage';
import ClientsPage from './pages/ClientsPage';
import AccountingPage from './pages/AccountingPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import SetupWizard from './components/SetupWizard';
import { useSupabaseData, SyncStatus } from './hooks/useSupabaseData';
import { HomeIcon, UserIcon, CalculatorIcon, ChartBarIcon, Cog6ToothIcon, ArrowPathIcon, WifiIcon, NoSymbolIcon, CheckCircleIcon, ExclamationCircleIcon, CloudIcon, ExclamationTriangleIcon, ServerIcon, CloudArrowDownIcon, CloudArrowUpIcon, BuildingLibraryIcon } from './components/icons';
import { useAnalysis } from './hooks/useSync';
import ContextMenu, { MenuItem } from './components/ContextMenu';
import AdminTaskModal from './components/AdminTaskModal';
import { AdminTask } from './types';

type Page = 'home' | 'clients' | 'accounting' | 'reports' | 'settings';

interface AppProps {
    onRefresh: () => void;
}

const SyncStatusIndicator: React.FC<{ status: SyncStatus, lastError: string | null, onSync: () => void, isDirty: boolean }> = ({ status, lastError, onSync, isDirty }) => {
    
    let displayStatus: { icon: React.ReactNode; text: string; color: string; error?: string; showSyncButton?: boolean } = {
        icon: <WifiIcon className="w-5 h-5" />, text: 'متصل', color: 'text-gray-500'
    };

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
    } else if (status === 'offline') {
        if (isDirty) {
            displayStatus = { icon: <CloudArrowDownIcon className="w-5 h-5" />, text: 'التغييرات محفوظة محلياً', color: 'text-gray-700' };
        } else {
            displayStatus = { icon: <NoSymbolIcon className="w-5 h-5" />, text: 'أنت غير متصل', color: 'text-gray-500' };
        }
    } else if (status === 'synced') {
        if (isDirty) {
            displayStatus = { icon: <CloudArrowUpIcon className="w-5 h-5 text-yellow-600" />, text: 'توجد تغييرات غير متزامنة', color: 'text-yellow-800', showSyncButton: true };
        } else {
            displayStatus = { icon: <CheckCircleIcon className="w-5 h-5" />, text: 'تمت المزامنة', color: 'text-green-500' };
        }
    }

    const { icon, text, color, error, showSyncButton } = displayStatus;

    return (
         <div className="flex items-center gap-4 text-sm">
            <div className={`flex items-center gap-2 ${color}`} title={error || text}>
                {icon}
                <span className="hidden sm:inline">{text}</span>
            </div>
            {showSyncButton && (
                <button
                    onClick={onSync}
                    className="flex animate-fade-in items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded-lg hover:bg-yellow-200 transition-colors"
                    title="اضغط لمزامنة التغييرات المحلية مع السحابة."
                >
                    <CloudIcon className="w-4 h-4" />
                    <span>مزامنة الآن</span>
                </button>
            )}
        </div>
    );
};


// This component replaces the old `Sidebar`
const Navbar: React.FC<{ currentPage: Page, setCurrentPage: (page: Page) => void, syncStatus: SyncStatus, lastSyncError: string | null, onSync: () => void, isDirty: boolean }> = ({ currentPage, setCurrentPage, syncStatus, lastSyncError, onSync, isDirty }) => {
    const navItems = [
        { id: 'home', label: 'الرئيسية', icon: <HomeIcon className="w-5 h-5" /> },
        { id: 'clients', label: 'الموكلين', icon: <UserIcon className="w-5 h-5" /> },
        { id: 'accounting', label: 'المحاسبة', icon: <CalculatorIcon className="w-5 h-5" /> },
        { id: 'reports', label: 'التقارير', icon: <ChartBarIcon className="w-5 h-5" /> },
        { id: 'settings', label: 'الإعدادات', icon: <Cog6ToothIcon className="w-5 h-5" /> },
    ];

    const NavLink: React.FC<{ page: Page, label: string, icon: React.ReactNode }> = ({ page, label, icon }) => (
        <a
            href="#"
            onClick={(e) => { e.preventDefault(); setCurrentPage(page); }}
            className={`flex-shrink-0 flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${currentPage === page ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-200'}`}
        >
            {React.cloneElement(icon as React.ReactElement, { className: "w-5 h-5 text-gray-500"})}
            <span className="ms-2">{label}</span>
        </a>
    );

    return (
        <header className="fixed top-0 right-0 left-0 z-40 bg-gray-50 border-b shadow-sm">
            <div className="flex items-center justify-between h-16 px-4">
                {/* Logo */}
                <a href="#" className="flex-shrink-0 flex items-center" onClick={(e) => { e.preventDefault(); setCurrentPage('home'); }}>
                    <h1 className="text-xl font-bold text-gray-800">مكتب المحامي</h1>
                </a>

                {/* Desktop Nav */}
                <nav className="hidden md:flex items-center gap-x-2">
                    {navItems.map(item => (
                        <NavLink key={item.id} page={item.id as Page} label={item.label} icon={item.icon} />
                    ))}
                </nav>

                {/* Sync Status */}
                <div className="flex-shrink-0">
                    <SyncStatusIndicator status={syncStatus} lastError={lastSyncError} onSync={onSync} isDirty={isDirty} />
                </div>
            </div>

             {/* Mobile Nav - Horizontally scrollable */}
            <div className="md:hidden border-t">
                <nav className="flex items-center gap-x-2 p-2 overflow-x-auto">
                     {navItems.map(item => (
                        <NavLink key={item.id} page={item.id as Page} label={item.label} icon={item.icon} />
                    ))}
                </nav>
            </div>
        </header>
    );
};


const App: React.FC<AppProps> = ({ onRefresh }) => {
    const [currentPage, setCurrentPage] = React.useState<Page>('home');
    const [isLoggedIn, setIsLoggedIn] = React.useState(false);
    const [offlineMode, setOfflineMode] = React.useState(false);

    const {
        clients, adminTasks, appointments, accountingEntries, assistants, credentials,
        setClients, setAdminTasks, setAppointments, setAccountingEntries, setAssistants, setCredentials,
        allSessions, setFullData, syncStatus, forceSync, manualSync, lastSyncError, isDirty
    } = useSupabaseData(offlineMode);
    
    // FIX: React hooks must be called unconditionally. The call to useAnalysis was moved outside the conditional rendering logic to comply with the Rules of Hooks, preventing runtime errors.
    const { analysisStatus, lastAnalysis, triggerAnalysis, analysisReport } = useAnalysis();

    // --- State Management for Global Components ---
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

    const handleCloseAdminTaskModal = () => {
        setAdminTaskModalState({ isOpen: false, initialData: undefined });
    };

    const handleTaskSubmit = (taskData: Omit<AdminTask, 'id' | 'completed'> & { id?: string }) => {
        if (taskData.id) { // Editing
            setAdminTasks(prev => prev.map(t => t.id === taskData.id ? { ...t, ...taskData, completed: t.completed } as AdminTask : t));
        } else { // Adding
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

    const handleCloseContextMenu = () => {
        setContextMenuState(prev => ({ ...prev, isOpen: false }));
    };


    const renderPage = () => {
        const commonProps = {
            showContextMenu,
            onOpenAdminTaskModal: handleOpenAdminTaskModal
        };
        switch (currentPage) {
            case 'home':
                return <HomePage appointments={appointments} clients={clients} setClients={setClients} allSessions={allSessions} setAppointments={setAppointments} adminTasks={adminTasks} setAdminTasks={setAdminTasks} assistants={assistants} {...commonProps} />;
            case 'clients':
                return <ClientsPage clients={clients} setClients={setClients} accountingEntries={accountingEntries} setAccountingEntries={setAccountingEntries} assistants={assistants} {...commonProps} />;
            case 'accounting':
                return <AccountingPage accountingEntries={accountingEntries} setAccountingEntries={setAccountingEntries} clients={clients} />;
            case 'reports':
                return <ReportsPage clients={clients} accountingEntries={accountingEntries} />;
            case 'settings':
                return <SettingsPage setFullData={setFullData} analysisStatus={analysisStatus} lastAnalysis={lastAnalysis} triggerAnalysis={triggerAnalysis} assistants={assistants} setAssistants={setAssistants} analysisReport={analysisReport} offlineMode={offlineMode} setOfflineMode={setOfflineMode} onLogout={() => setIsLoggedIn(false)} credentials={credentials} setCredentials={setCredentials} />;
            default:
                return <HomePage appointments={appointments} clients={clients} setClients={setClients} allSessions={allSessions} setAppointments={setAppointments} adminTasks={adminTasks} setAdminTasks={setAdminTasks} assistants={assistants} {...commonProps} />;
        }
    };
    
    const handleLoginSuccess = () => {
        setIsLoggedIn(true);
    };

    if (syncStatus === 'unconfigured' || syncStatus === 'uninitialized') {
        return <SetupWizard onRetry={onRefresh} />;
    }
    
    if (!isLoggedIn) {
        return <LoginPage onLoginSuccess={handleLoginSuccess} credentials={credentials} />;
    }

    return (
        <div dir="rtl">
            <Navbar 
                currentPage={currentPage} 
                setCurrentPage={setCurrentPage}
                syncStatus={syncStatus}
                lastSyncError={lastSyncError}
                onSync={manualSync}
                isDirty={isDirty}
            />
            <div className="p-4 pt-32 md:pt-20">
                <main>
                    {renderPage()}
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

export default App;
