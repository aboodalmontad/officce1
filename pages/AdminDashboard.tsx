import * as React from 'react';
import AdminPage from './AdminPage';
import { PowerIcon, UserGroupIcon, ChartPieIcon, Bars3Icon, XMarkIcon, CurrencyDollarIcon, ExclamationTriangleIcon } from '../components/icons';
import { useData } from '../App';
import AdminAnalyticsPage from './AdminAnalyticsPage';
import SiteFinancesPage from './SiteFinancesPage';

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
    const { profiles, isDataLoading: loading } = useData();
    const [view, setView] = React.useState<AdminView>('analytics');
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
    const [showPendingAlert, setShowPendingAlert] = React.useState(true);

    const pendingUsersCount = React.useMemo(() => {
        return profiles.filter(p => !p.is_approved).length;
    }, [profiles]);


    const renderView = () => {
        switch (view) {
            case 'analytics':
                return <AdminAnalyticsPage />;
            case 'users':
                return <AdminPage />;
            case 'finances':
                return <SiteFinancesPage />;
            default:
                return <AdminAnalyticsPage />;
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

    const PendingUsersAlert = () => {
        if (!showPendingAlert || pendingUsersCount === 0) {
            return null;
        }

        return (
            <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 rounded-lg shadow-md mb-6 animate-fade-in" role="alert">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex items-center">
                        <ExclamationTriangleIcon className="h-6 w-6 text-yellow-500 me-3 flex-shrink-0" />
                        <div>
                            <p className="font-bold">تنبيه: يوجد مستخدمون جدد بانتظار الموافقة</p>
                            <p className="text-sm">هناك {pendingUsersCount} مستخدم(ين) ينتظر(ون) تفعيل حساباتهم.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                            onClick={() => {
                                setView('users');
                                // Scroll to top on mobile to make sure user list is visible
                                window.scrollTo(0, 0);
                            }}
                            className="px-4 py-2 bg-yellow-500 text-white font-semibold rounded-lg hover:bg-yellow-600 transition-colors text-sm whitespace-nowrap"
                        >
                            الانتقال إلى إدارة المستخدمين
                        </button>
                        <button onClick={() => setShowPendingAlert(false)} className="p-2 text-yellow-600 hover:bg-yellow-200 rounded-full" aria-label="إغلاق التنبيه">
                            <XMarkIcon className="w-5 h-5"/>
                        </button>
                    </div>
                </div>
            </div>
        );
    };

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
                    <PendingUsersAlert />
                    {renderView()}
                </main>
            </div>
        </div>
    );
};

export default AdminDashboard;