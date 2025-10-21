import * as React from 'https://esm.sh/react@18.2.0';
import AdminPage from './AdminPage';
import SiteFinancesPage from './SiteFinancesPage';
import { PowerIcon, UserGroupIcon, CalculatorIcon } from '../components/icons';
import { getSupabaseClient } from '../supabaseClient';

interface AdminDashboardProps {
    onLogout: () => void;
}

type AdminView = 'users' | 'finances';

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
    const [view, setView] = React.useState<AdminView>('users');
    const [pendingUsersCount, setPendingUsersCount] = React.useState(0);

    React.useEffect(() => {
        const supabase = getSupabaseClient();
        if (!supabase) return;

        const fetchPendingCount = async () => {
            const { count, error } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('is_approved', false);

            if (error) {
                console.error("Error fetching pending users count:", error);
            } else if (count !== null) {
                setPendingUsersCount(count);
            }
        };

        fetchPendingCount();

        const channel = supabase.channel('public:profiles')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, 
            (payload) => {
                console.log('Profile change received, refetching count.', payload);
                fetchPendingCount();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);


    const renderView = () => {
        switch (view) {
            case 'users':
                return <AdminPage />;
            case 'finances':
                return <SiteFinancesPage />;
            default:
                return <AdminPage />;
        }
    };

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
             {badgeCount !== undefined && badgeCount > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center animate-fade-in">
                    {badgeCount}
                </span>
            )}
        </button>
    );

    return (
        <div className="flex h-screen bg-gray-100" dir="rtl">
            {/* Sidebar */}
            <aside className="w-64 bg-gray-50 border-l flex flex-col p-4">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-gray-800">إدارة الموقع</h1>
                </div>
                <nav className="flex-grow space-y-2">
                    <NavLink
                        label="إدارة المستخدمين"
                        icon={<UserGroupIcon className="w-6 h-6" />}
                        isActive={view === 'users'}
                        onClick={() => setView('users')}
                        badgeCount={pendingUsersCount}
                    />
                    <NavLink
                        label="مالية الموقع"
                        icon={<CalculatorIcon className="w-6 h-6" />}
                        isActive={view === 'finances'}
                        onClick={() => setView('finances')}
                    />
                </nav>
                <div className="mt-auto">
                     <button
                        onClick={onLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-100 transition-colors"
                    >
                        <PowerIcon className="w-6 h-6" />
                        <span className="font-semibold">تسجيل الخروج</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-8 overflow-y-auto">
                {renderView()}
            </main>
        </div>
    );
};

export default AdminDashboard;