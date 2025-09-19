import * as React from 'react';
// FIX: An error "does not provide an export named 'Redirect'" indicates a version mismatch. The code was using react-router-dom v5 syntax while the project imports v6.
// This change updates the routing logic to be compatible with react-router-dom v6.
// FIX: Resolve errors about missing exports from 'react-router-dom' by switching to a wildcard import. This can help with module resolution issues in some build environments.
import * as ReactRouterDOM from 'react-router-dom';
import HomePage from './pages/HomePage';
import ClientsPage from './pages/ClientsPage';
import AccountingPage from './pages/AccountingPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import { HomeIcon, UsersIcon, CurrencyDollarIcon, DocumentChartBarIcon, SettingsIcon } from './components/icons';
import { useMockData } from './hooks/useMockData';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useSync } from './hooks/useSync';

const App: React.FC = () => {
  const { clients, adminTasks, appointments, accountingEntries, setClients, setAdminTasks, setAppointments, setAccountingEntries, allSessions, setFullData, assistants, setAssistants } = useMockData();
  const isOnline = useOnlineStatus();
  const { syncStatus, lastSync, triggerSync } = useSync();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  React.useEffect(() => {
    const handleResize = () => {
        if (window.innerWidth >= 768) { // Tailwind's 'md' breakpoint
            setIsMenuOpen(false);
        }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // Also check on initial mount
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  const navLinkClasses = "flex items-center px-3 py-2 rounded-lg transition-colors duration-200 hover:bg-gray-700";
  const activeNavLinkClasses = "bg-blue-600 text-white";
  const mobileNavLinkClasses = "flex items-center px-3 py-2 rounded-lg text-base font-medium transition-colors duration-200 text-gray-300 hover:bg-gray-700 hover:text-white";


  return (
    <ReactRouterDOM.HashRouter>
      <div className="relative min-h-screen bg-gray-100 text-gray-800">
        <header className="no-print fixed top-0 left-0 right-0 w-full bg-gray-800 text-white shadow-lg z-50">
          <div className="container mx-auto flex items-center justify-between h-16 px-4 sm:px-6">
            <div className="flex items-center gap-4">
              <div className="text-xl font-bold">
                <span>مكتب المحامي</span>
              </div>
              <div className="hidden sm:flex items-center gap-2" title={isOnline ? 'أنت متصل بالإنترنت' : 'أنت غير متصل بالإنترنت'}>
                <span className={`w-3 h-3 rounded-full transition-colors ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
                <span className="text-sm text-gray-300">{isOnline ? 'متصل' : 'غير متصل'}</span>
              </div>
            </div>
            <div className="flex items-center gap-x-4">
               {/* Desktop Menu */}
              <nav className="hidden md:flex items-center gap-x-2">
                <ReactRouterDOM.NavLink to="/" end className={({ isActive }) => `${navLinkClasses} ${isActive ? activeNavLinkClasses : ''}`}><HomeIcon className="w-5 h-5 me-2" /><span>الرئيسية</span></ReactRouterDOM.NavLink>
                <ReactRouterDOM.NavLink to="/clients" className={({ isActive }) => `${navLinkClasses} ${isActive ? activeNavLinkClasses : ''}`}><UsersIcon className="w-5 h-5 me-2" /><span>الموكلين</span></ReactRouterDOM.NavLink>
                <ReactRouterDOM.NavLink to="/accounting" className={({ isActive }) => `${navLinkClasses} ${isActive ? activeNavLinkClasses : ''}`}><CurrencyDollarIcon className="w-5 h-5 me-2" /><span>المحاسبة</span></ReactRouterDOM.NavLink>
                <ReactRouterDOM.NavLink to="/reports" className={({ isActive }) => `${navLinkClasses} ${isActive ? activeNavLinkClasses : ''}`}><DocumentChartBarIcon className="w-5 h-5 me-2" /><span>التقارير</span></ReactRouterDOM.NavLink>
                <ReactRouterDOM.NavLink to="/settings" className={({ isActive }) => `${navLinkClasses} ${isActive ? activeNavLinkClasses : ''}`}><SettingsIcon className="w-5 h-5 me-2" /><span>الإعدادات</span></ReactRouterDOM.NavLink>
              </nav>

              {/* Mobile menu button */}
              <div className="md:hidden">
                <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 rounded-md hover:bg-gray-700 focus:outline-none" aria-label="Open main menu" aria-expanded={isMenuOpen}>
                  <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={isMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Mobile menu, show/hide based on menu state. */}
          <div className={`md:hidden transition-all ease-in-out duration-300 overflow-hidden ${isMenuOpen ? 'max-h-[500px]' : 'max-h-0'}`} id="mobile-menu">
            <nav className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
              <ReactRouterDOM.NavLink to="/" end onClick={() => setIsMenuOpen(false)} className={({ isActive }) => `${mobileNavLinkClasses} ${isActive ? activeNavLinkClasses : ''}`}><HomeIcon className="w-5 h-5 me-2" /><span>الرئيسية</span></ReactRouterDOM.NavLink>
              <ReactRouterDOM.NavLink to="/clients" onClick={() => setIsMenuOpen(false)} className={({ isActive }) => `${mobileNavLinkClasses} ${isActive ? activeNavLinkClasses : ''}`}><UsersIcon className="w-5 h-5 me-2" /><span>الموكلين</span></ReactRouterDOM.NavLink>
              <ReactRouterDOM.NavLink to="/accounting" onClick={() => setIsMenuOpen(false)} className={({ isActive }) => `${mobileNavLinkClasses} ${isActive ? activeNavLinkClasses : ''}`}><CurrencyDollarIcon className="w-5 h-5 me-2" /><span>المحاسبة</span></ReactRouterDOM.NavLink>
              <ReactRouterDOM.NavLink to="/reports" onClick={() => setIsMenuOpen(false)} className={({ isActive }) => `${mobileNavLinkClasses} ${isActive ? activeNavLinkClasses : ''}`}><DocumentChartBarIcon className="w-5 h-5 me-2" /><span>التقارير</span></ReactRouterDOM.NavLink>
              <ReactRouterDOM.NavLink to="/settings" onClick={() => setIsMenuOpen(false)} className={({ isActive }) => `${mobileNavLinkClasses} ${isActive ? activeNavLinkClasses : ''}`}><SettingsIcon className="w-5 h-5 me-2" /><span>الإعدادات</span></ReactRouterDOM.NavLink>
            </nav>
          </div>
        </header>
        
        <main className={`container mx-auto p-4 md:p-8 transition-all duration-300 ${isMenuOpen ? 'pt-72' : 'pt-24'}`}>
          <ReactRouterDOM.Routes>
            <ReactRouterDOM.Route path="/" element={<HomePage appointments={appointments} setClients={setClients} allSessions={allSessions} setAppointments={setAppointments} adminTasks={adminTasks} setAdminTasks={setAdminTasks} assistants={assistants} />} />
            <ReactRouterDOM.Route path="/clients" element={<ClientsPage clients={clients} setClients={setClients} accountingEntries={accountingEntries} setAccountingEntries={setAccountingEntries} assistants={assistants} />} />
            <ReactRouterDOM.Route path="/accounting" element={<AccountingPage accountingEntries={accountingEntries} setAccountingEntries={setAccountingEntries} clients={clients} />} />
            <ReactRouterDOM.Route path="/reports" element={<ReportsPage clients={clients} accountingEntries={accountingEntries} />} />
            <ReactRouterDOM.Route path="/settings" element={<SettingsPage setFullData={setFullData} syncStatus={syncStatus} lastSync={lastSync} triggerSync={triggerSync} assistants={assistants} setAssistants={setAssistants} />} />
            <ReactRouterDOM.Route path="*" element={<ReactRouterDOM.Navigate to="/" />} />
          </ReactRouterDOM.Routes>
        </main>
      </div>
    </ReactRouterDOM.HashRouter>
  );
};

export default App;