
import * as React from 'react';
import AdminPage from './AdminPage';
import { PowerIcon, UserGroupIcon, ChartPieIcon, Bars3Icon, XMarkIcon, CurrencyDollarIcon, Cog6ToothIcon, ExclamationTriangleIcon } from '../components/icons';
import { useData } from '../context/DataContext';
import AdminAnalyticsPage from './AdminAnalyticsPage';
import SiteFinancesPage from './SiteFinancesPage';
import AdminSettingsPage from './AdminSettingsPage';

interface AdminDashboardProps {
    onLogout: () => void;
    onOpenConfig: () => void;
}

type AdminView = 'analytics' | 'users' | 'finances' | 'settings';

const NavLink: React.FC<{
    label: string;
    icon: React.ReactNode;
    isActive: boolean;
    onClick: () => void;
    badgeCount?: number;
}> = ({ label, icon, isActive, onClick, badgeCount }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-right transition-colors ${
            isActive
                ? 'bg-blue-600 text-white'
                : 'text-gray-700 hover:bg-gray-200'
        }`}
    >
        <div className="flex items-center gap-3">
            {icon}
            <span className="font-semibold">{label}</span>
        </div>
        {badgeCount && badgeCount > 0 && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white animate-pulse">
                {badgeCount}
            </span>
        )}
    </button>
);


const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout, onOpenConfig }) => {
    const { profiles, isDataLoading: loading } = useData();
    // Change default view to 'users'
    const [view, setView] = React.useState<AdminView>('users');
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

    const pendingUsersCount = React.useMemo(() => {
        return profiles.filter(p => !p.is_approved && p.role !== 'admin').length;
    }, [profiles]);

    // Automatically unlock audio and vibration on component mount.
    React.useEffect(() => {
        const unlockAudioAndVibration = () => {
            const silentAudio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
            
            const tryVibrate = () => {
                if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
                    navigator.vibrate(0);
                }
            };
            
            const attemptPlay = () => silentAudio.play();
            
            attemptPlay().then(() => {
                console.log('Audio and Vibration APIs unlocked on mount.');
                tryVibrate();
            }).catch(() => {
                console.warn('Audio autoplay was blocked. It will be enabled after the first user interaction.');
                const enableOnInteraction = () => {
                    attemptPlay().catch(() => {}); 
                    tryVibrate();
                    console.log('Audio and Vibration APIs unlocked after user interaction.');
                };
                window.addEventListener('click', enableOnInteraction, { once: true });
                window.addEventListener('touchend', enableOnInteraction, { once: true });
            }); 
        };

        unlockAudioAndVibration();
    }, []); 


    const renderView = () => {
        switch (view) {
            case 'users':
                return <AdminPage />;
            case 'analytics':
                return <AdminAnalyticsPage />;
            case 'finances':
                return <SiteFinancesPage />;
            case 'settings':
                return <AdminSettingsPage onOpenConfig={onOpenConfig} />;
            default:
                return <AdminPage />; // Default fallback also set to AdminPage
        }
    };
    
    if (loading) {
        return <div className="flex justify-center items-center h-screen">جاري التحميل...</div>
    }

    const sidebarContent = (
        <>
            <div className="text-center py-4 mb-4 border-b">
                <h1 className="text-2xl font-bold text-gray-800">لوحة تحكم المدير</h1>
            </div>
            <nav className="flex-grow space-y-2">
                {/* Reordered Navigation: Users first */}
                <NavLink
                    label="إدارة المستخدمين"
                    icon={<UserGroupIcon className="w-6 h-6" />}
                    isActive={view === 'users'}
                    onClick={() => { setView('users'); setIsSidebarOpen(false); }}
                    badgeCount={pendingUsersCount}
                />
                 <NavLink
                    label="التحليلات"
                    icon={<ChartPieIcon className="w-6 h-6" />}
                    isActive={view === 'analytics'}
                    onClick={() => { setView('analytics'); setIsSidebarOpen(false); }}
                />
                 <NavLink
                    label="المحاسبة المالية"
                    icon={<CurrencyDollarIcon className="w-6 h-6" />}
                    isActive={view === 'finances'}
                    onClick={() => { setView('finances'); setIsSidebarOpen(false); }}
                />
                <NavLink
                    label="الإعدادات"
                    icon={<Cog6ToothIcon className="w-6 h-6" />}
                    isActive={view === 'settings'}
                    onClick={() => { setView('settings'); setIsSidebarOpen(false); }}
                />
            </nav>
            <div className="mt-auto border-t pt-4">
                <p className="mb-2 text-center text-xs text-gray-400">الإصدار: 22-11-2025-fix-2</p>
                <button
                    onClick={onLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-red-100 hover:text-red-700 transition-colors"
                >
                    <PowerIcon className="w-6 h-6" />
                    <span className="font-semibold">تسجيل الخروج</span>
                </button>
            </div>
        </>
    );

    return (
        <div className="min-h-screen bg-gray-100" dir="rtl">
            {/* Overlay for mobile */}
            <div className={`fixed inset-0 z-30 bg-black bg-opacity-50 lg:hidden transition-opacity ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsSidebarOpen(false)}></div>
            
            {/* Sidebar */}
            <aside className={`fixed lg:relative inset-y-0 right-0 z-40 w-64 bg-white shadow-md flex flex-col p-4 transition-transform duration-300 ease-in-out lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden self-start p-2 mb-2 text-gray-500 hover:bg-gray-100 rounded-full">
                    <XMarkIcon className="w-6 h-6" />
                </button>
                {sidebarContent}
            </aside>
            
            {/* Main content */}
            <div className="lg:mr-64">
                <header className="sticky top-0 bg-white/75 backdrop-blur-sm p-4 lg:hidden flex justify-between items-center shadow-sm z-10">
                    <h1 className="text-xl font-bold">لوحة التحكم</h1>
                    <button onClick={() => setIsSidebarOpen(true)} className="p-2">
                        <Bars3Icon className="w-6 h-6"/>
                    </button>
                </header>
                <main className="p-4 sm:p-8">
                    {renderView()}
                </main>
            </div>
        </div>
    );
};

export default AdminDashboard;
