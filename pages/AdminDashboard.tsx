import * as React from 'react';
import AdminPage from './AdminPage';
import { PowerIcon, UserGroupIcon, ChartPieIcon, Bars3Icon, XMarkIcon, CurrencyDollarIcon } from '../components/icons';
import { getSupabaseClient } from '../supabaseClient';
import { RealtimeChannel } from '@supabase/supabase-js';

const AdminAnalyticsPage = React.lazy(() => import('./AdminAnalyticsPage'));
const SiteFinancesPage = React.lazy(() => import('./SiteFinancesPage'));

interface AdminDashboardProps {
    onLogout: () => void;
}

type AdminView = 'analytics' | 'users' | 'finances';

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


const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
    const [view, setView] = React.useState<AdminView>('analytics');
    const [pendingUsersCount, setPendingUsersCount] = React.useState(0);
    const [loading, setLoading] = React.useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
    const supabase = getSupabaseClient();

    const fetchPendingCount = React.useCallback(async () => {
        if (!supabase) return;
        
        const { count, error } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('is_approved', false);

        if (error) {
            console.error("Error fetching pending users count:", error);
        } else if (count !== null) {
            setPendingUsersCount(count);
        }
    }, [supabase]);


    React.useEffect(() => {
        if (!supabase) {
            setLoading(false);
            return;
        }

        fetchPendingCount();
        setLoading(false);

        const channel: RealtimeChannel = supabase.channel('admin-dashboard-profiles-subscription');
        
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, 
            (payload) => {
                console.log('Profile change received, refetching count.', payload);
                fetchPendingCount();
            })
            .subscribe((status, err) => {
                if (err) {
                    console.error("Supabase channel subscription error in AdminDashboard:", err);
                }
            });
            
        return () => {
            if (channel) {
                supabase.removeChannel(channel).catch(error => {
                    console.error("Failed to remove Supabase channel on unmount (AdminDashboard):", error);
                });
            }
        };
    }, [supabase, fetchPendingCount]);


    const renderView = () => {
        switch (view) {
            case 'analytics':
                return <React.Suspense fallback={<div className="text-center p-8">جاري تحميل التحليلات...</div>}><AdminAnalyticsPage /></React.Suspense>;
            case 'users':
                return <AdminPage />;
            case 'finances':
                return <React.Suspense fallback={<div className="text-center p-8">جاري تحميل صفحة المحاسبة...</div>}><SiteFinancesPage /></React.Suspense>;
            default:
                return <React.Suspense fallback={<div className="text-center p-8">جاري تحميل التحليلات...</div>}><AdminAnalyticsPage /></React.Suspense>;
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
                 <NavLink
                    label="التحليلات"
                    icon={<ChartPieIcon className="w-6 h-6" />}
                    isActive={view === 'analytics'}
                    onClick={() => { setView('analytics'); setIsSidebarOpen(false); }}
                />
                <NavLink
                    label="إدارة المستخدمين"
                    icon={<UserGroupIcon className="w-6 h-6" />}
                    isActive={view === 'users'}
                    onClick={() => { setView('users'); setIsSidebarOpen(false); }}
                    badgeCount={pendingUsersCount}
                />
                 <NavLink
                    label="المحاسبة المالية"
                    icon={<CurrencyDollarIcon className="w-6 h-6" />}
                    isActive={view === 'finances'}
                    onClick={() => { setView('finances'); setIsSidebarOpen(false); }}
                />
            </nav>
            <div className="mt-auto">
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