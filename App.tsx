import * as React from 'react';
// FIX: An error "does not provide an export named 'Redirect'" indicates a version mismatch. The code was using react-router-dom v5 syntax while the project imports v6.
// This change updates the routing logic to be compatible with react-router-dom v6.
// FIX: Corrected react-router-dom v6 imports. The previous wildcard import (`import * as ReactRouterDOM`) was causing errors. Switched to named imports (`{ HashRouter, NavLink, ... }`) which is the standard for v6. This resolves all "Property does not exist" errors.
import { HashRouter, NavLink, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ClientsPage from './pages/ClientsPage';
import AccountingPage from './pages/AccountingPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import { HomeIcon, UsersIcon, CurrencyDollarIcon, DocumentChartBarIcon, SettingsIcon } from './components/icons';
import { useMockData } from './hooks/useMockData';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useSync } from './hooks/useSync';
import { isBeforeToday } from './utils/dateUtils';

const App: React.FC = () => {
  const { clients, adminTasks, appointments, accountingEntries, setClients, setAdminTasks, setAppointments, setAccountingEntries, allSessions, setFullData, assistants, setAssistants } = useMockData();
  const isOnline = useOnlineStatus();
  const { syncStatus, lastSync, triggerSync, syncReport } = useSync();
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

  React.useEffect(() => {
    const needsSync = localStorage.getItem('lawyerAppNeedsSync') === 'true';
    if (isOnline && needsSync && syncStatus !== 'syncing') {
        console.log('Application is online and has pending changes. Triggering automatic sync.');
        triggerSync();
    }
  }, [isOnline, syncStatus, triggerSync]);
  
  // Effect for handling appointment notifications
  React.useEffect(() => {
    // 1. Request permission on component mount if not already determined
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }

    // 2. Set up an interval to check for appointments
    const intervalId = setInterval(() => {
      if (!('Notification' in window) || Notification.permission !== 'granted') {
        return; // Don't do anything if notifications are not supported or permitted
      }

      const now = new Date();
      
      appointments.forEach(apt => {
        if (apt.notified || apt.reminderTimeInMinutes === undefined) return; // Skip if already notified or no reminder is set

        const reminderMinutes = apt.reminderTimeInMinutes;

        const [hours, minutes] = apt.time.split(':').map(Number);
        const appointmentDateTime = new Date(apt.date);
        appointmentDateTime.setHours(hours, minutes, 0, 0);
        
        // Skip past appointments
        if (now > appointmentDateTime) return;

        const reminderTime = new Date(appointmentDateTime.getTime() - reminderMinutes * 60 * 1000);

        // Check if it's time to notify (within the last minute)
        if (now >= reminderTime && now < appointmentDateTime) {
          // Show notification
          new Notification('تذكير بموعد', {
            body: `موعدك "${apt.title}" بعد ${reminderMinutes} دقيقة.`,
            icon: './icon.svg',
            lang: 'ar',
            dir: 'rtl'
          });

          // Mark as notified to prevent re-notifying
          setAppointments(prev =>
            prev.map(p => (p.id === apt.id ? { ...p, notified: true } : p))
          );
        }
      });
    }, 60000); // Check every minute

    // 3. Clean up the interval on component unmount
    return () => clearInterval(intervalId);

  }, [appointments, setAppointments]);

  // Effect for periodic background sync registration for unpostponed sessions
  React.useEffect(() => {
      const registerPeriodicSync = async () => {
          if ('serviceWorker' in navigator && 'PeriodicSyncManager' in window) {
              try {
                  const registration = await navigator.serviceWorker.ready;
                  // @ts-ignore
                  await registration.periodicSync.register('check-unpostponed-sessions', {
                      minInterval: 12 * 60 * 60 * 1000, // Check roughly every 12 hours
                  });
                  console.log('Periodic sync for unpostponed sessions registered.');
              } catch (error) {
                  console.error('Periodic sync registration failed:', error);
              }
          } else {
              console.log('Periodic Background Sync not supported.');
          }
      };
      
      registerPeriodicSync();
  }, []);

  // Effect for daily reminder of unpostponed sessions (fallback for when app is open)
  React.useEffect(() => {
      const checkUnpostponedSessions = () => {
          if (Notification.permission !== 'granted') return;

          const LAST_CHECK_KEY = 'lastUnpostponedNotificationCheck';
          const lastCheckTimestamp = localStorage.getItem(LAST_CHECK_KEY);
          const now = new Date();
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

          if (lastCheckTimestamp) {
              const lastCheckDate = new Date(parseInt(lastCheckTimestamp, 10));
              const startOfLastCheckDate = new Date(lastCheckDate.getFullYear(), lastCheckDate.getMonth(), lastCheckDate.getDate());
              if (startOfLastCheckDate.getTime() === startOfToday.getTime()) {
                  return; // Already notified today
              }
          }

          const unpostponed = allSessions.filter(s => !s.isPostponed && isBeforeToday(s.date));

          if (unpostponed.length > 0) {
              new Notification('تنبيه بالجلسات غير المرحلة', {
                  body: `لديك ${unpostponed.length} جلسات سابقة لم يتم ترحيلها. الرجاء مراجعتها.`,
                  icon: './icon.svg',
                  lang: 'ar',
                  dir: 'rtl'
              });
              localStorage.setItem(LAST_CHECK_KEY, Date.now().toString());
          }
      };

      // Check 5 seconds after app load, and then periodically every hour
      const timer = setTimeout(checkUnpostponedSessions, 5000); 
      const intervalId = setInterval(checkUnpostponedSessions, 60 * 60 * 1000);

      return () => {
          clearTimeout(timer);
          clearInterval(intervalId);
      };
  }, [allSessions]);


  const navLinkClasses = "flex items-center px-3 py-2 rounded-lg transition-colors duration-200 hover:bg-gray-700";
  const activeNavLinkClasses = "bg-blue-600 text-white";
  const mobileNavLinkClasses = "flex items-center px-3 py-2 rounded-lg text-base font-medium transition-colors duration-200 text-gray-300 hover:bg-gray-700 hover:text-white";


  return (
    // FIX: Replaced all `ReactRouterDOM.*` component usages with direct component names
    // (e.g., `HashRouter`, `NavLink`, `Routes`) to align with the updated named imports.
    <HashRouter>
      <div className="relative min-h-screen bg-gray-100 text-gray-800">
        <header className="no-print fixed top-0 left-0 right-0 w-full bg-gray-800 text-white shadow-lg z-50">
          <div className="container mx-auto flex items-center justify-between h-16 px-4 sm:px-6">
            <div className="flex items-center gap-2">
              <div className="text-xl font-bold">
                <span>مكتب المحامي</span>
              </div>
              <div className="flex items-center gap-2" title={isOnline ? 'أنت متصل بالإنترنت' : 'أنت غير متصل بالإنترنت'}>
                <span className={`w-3 h-3 rounded-full transition-colors ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
                <span className="text-sm text-gray-300">{isOnline ? 'متصل' : 'غير متصل'}</span>
              </div>
            </div>
            <div className="flex items-center gap-x-4">
               {/* Desktop Menu */}
              <nav className="hidden md:flex items-center gap-x-2">
                <NavLink to="/" end className={({ isActive }) => `${navLinkClasses} ${isActive ? activeNavLinkClasses : ''}`}><HomeIcon className="w-5 h-5 me-2" /><span>الرئيسية</span></NavLink>
                <NavLink to="/clients" className={({ isActive }) => `${navLinkClasses} ${isActive ? activeNavLinkClasses : ''}`}><UsersIcon className="w-5 h-5 me-2" /><span>الموكلين</span></NavLink>
                <NavLink to="/accounting" className={({ isActive }) => `${navLinkClasses} ${isActive ? activeNavLinkClasses : ''}`}><CurrencyDollarIcon className="w-5 h-5 me-2" /><span>المحاسبة</span></NavLink>
                <NavLink to="/reports" className={({ isActive }) => `${navLinkClasses} ${isActive ? activeNavLinkClasses : ''}`}><DocumentChartBarIcon className="w-5 h-5 me-2" /><span>التقارير</span></NavLink>
                <NavLink to="/settings" className={({ isActive }) => `${navLinkClasses} ${isActive ? activeNavLinkClasses : ''}`}><SettingsIcon className="w-5 h-5 me-2" /><span>الإعدادات</span></NavLink>
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
              <NavLink to="/" end onClick={() => setIsMenuOpen(false)} className={({ isActive }) => `${mobileNavLinkClasses} ${isActive ? activeNavLinkClasses : ''}`}><HomeIcon className="w-5 h-5 me-2" /><span>الرئيسية</span></NavLink>
              <NavLink to="/clients" onClick={() => setIsMenuOpen(false)} className={({ isActive }) => `${mobileNavLinkClasses} ${isActive ? activeNavLinkClasses : ''}`}><UsersIcon className="w-5 h-5 me-2" /><span>الموكلين</span></NavLink>
              <NavLink to="/accounting" onClick={() => setIsMenuOpen(false)} className={({ isActive }) => `${mobileNavLinkClasses} ${isActive ? activeNavLinkClasses : ''}`}><CurrencyDollarIcon className="w-5 h-5 me-2" /><span>المحاسبة</span></NavLink>
              <NavLink to="/reports" onClick={() => setIsMenuOpen(false)} className={({ isActive }) => `${mobileNavLinkClasses} ${isActive ? activeNavLinkClasses : ''}`}><DocumentChartBarIcon className="w-5 h-5 me-2" /><span>التقارير</span></NavLink>
              <NavLink to="/settings" onClick={() => setIsMenuOpen(false)} className={({ isActive }) => `${mobileNavLinkClasses} ${isActive ? activeNavLinkClasses : ''}`}><SettingsIcon className="w-5 h-5 me-2" /><span>الإعدادات</span></NavLink>
            </nav>
          </div>
        </header>
        
        <main className={`container mx-auto p-4 md:p-8 transition-all duration-300 ${isMenuOpen ? 'pt-80' : 'pt-28 md:pt-32'}`}>
          <Routes>
            <Route path="/" element={<HomePage appointments={appointments} setClients={setClients} allSessions={allSessions} setAppointments={setAppointments} adminTasks={adminTasks} setAdminTasks={setAdminTasks} assistants={assistants} />} />
            <Route path="/clients" element={<ClientsPage clients={clients} setClients={setClients} accountingEntries={accountingEntries} setAccountingEntries={setAccountingEntries} assistants={assistants} />} />
            <Route path="/accounting" element={<AccountingPage accountingEntries={accountingEntries} setAccountingEntries={setAccountingEntries} clients={clients} />} />
            <Route path="/reports" element={<ReportsPage clients={clients} accountingEntries={accountingEntries} />} />
            <Route path="/settings" element={<SettingsPage setFullData={setFullData} syncStatus={syncStatus} lastSync={lastSync} triggerSync={triggerSync} assistants={assistants} setAssistants={setAssistants} syncReport={syncReport} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
};

export default App;