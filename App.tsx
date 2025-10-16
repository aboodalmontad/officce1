import * as React from 'react';
import { HashRouter, NavLink, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ClientsPage from './pages/ClientsPage';
import AccountingPage from './pages/AccountingPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import { HomeIcon, UsersIcon, CurrencyDollarIcon, DocumentChartBarIcon, SettingsIcon, ArrowPathIcon, CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon, CloudArrowUpIcon } from './components/icons';
import { useSupabaseData, SyncStatus } from './hooks/useSupabaseData';
import { useAnalysis } from './hooks/useSync';
import { isBeforeToday } from './utils/dateUtils';
import SetupWizard from './components/SetupWizard';
import { useLocalStorage } from './hooks/useLocalStorage';

const SyncIndicator: React.FC<{ status: SyncStatus; onSync: () => void; offlineMode: boolean; lastSyncError: string | null; isDirty: boolean; }> = ({ status, onSync, offlineMode, lastSyncError, isDirty }) => {
    const messages: Record<SyncStatus | 'dirty', { text: string; icon: React.ReactElement; color: string }> = {
        loading: { text: 'جاري تحميل البيانات...', icon: <ArrowPathIcon className="w-4 h-4 animate-spin" />, color: 'text-gray-300' },
        syncing: { text: 'جاري المزامنة...', icon: <ArrowPathIcon className="w-4 h-4 animate-spin" />, color: 'text-yellow-300' },
        synced: { text: 'تم الحفظ', icon: <CheckCircleIcon className="w-4 h-4" />, color: 'text-green-400' },
        offline: { text: 'التطبيق يعمل دون اتصال', icon: <CheckCircleIcon className="w-4 h-4" />, color: 'text-gray-400' },
        error: { text: 'فشلت المزامنة', icon: <ExclamationTriangleIcon className="w-4 h-4" />, color: 'text-red-400' },
        unconfigured: { text: 'Supabase غير مهيأ', icon: <ExclamationTriangleIcon className="w-4 h-4" />, color: 'text-orange-400' },
        uninitialized: { text: 'قاعدة البيانات غير مهيأة', icon: <ExclamationTriangleIcon className="w-4 h-4" />, color: 'text-orange-400' },
        dirty: { text: 'تغييرات غير محفوظة', icon: <ExclamationTriangleIcon className="w-4 h-4" />, color: 'text-yellow-400' },
    };
    
    let displayStatus: SyncStatus | 'dirty' = status;
    if (isDirty && !['loading', 'syncing', 'error', 'unconfigured', 'uninitialized'].includes(status)) {
        displayStatus = 'dirty';
    }

    const current = messages[displayStatus] || messages.loading;
    const showSyncButton = !offlineMode && isDirty && !['syncing', 'loading', 'unconfigured', 'uninitialized'].includes(status);
    const titleText = status === 'error' && lastSyncError ? `فشلت المزامنة: ${lastSyncError}` : current.text;


    return (
        <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs ${current.color}`} title={titleText}>
                {current.icon}
                <span>{current.text}</span>
            </div>
            {showSyncButton && (
                 <button onClick={onSync} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-500 transition-colors animate-pulse" title="حفظ التغييرات إلى قاعدة البيانات">
                    <CloudArrowUpIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">حفظ التغييرات</span>
                </button>
            )}
        </div>
    );
};


const App: React.FC<{ onRefresh: () => void }> = ({ onRefresh }) => {
  const [isAuthenticated, setIsAuthenticated] = React.useState(() => {
    try {
      return sessionStorage.getItem('isAuthenticated') === 'true';
    } catch {
      return false;
    }
  });

  const [offlineModeSetting, setOfflineModeSetting] = useLocalStorage('lawyerAppOfflineMode', false);
  
  // The data hook now directly uses the user's setting.
  const { clients, adminTasks, appointments, accountingEntries, setClients, setAdminTasks, setAppointments, setAccountingEntries, setFullData, assistants, setAssistants, credentials, setCredentials, syncStatus, forceSync, manualSync, lastSyncError, isDirty } = useSupabaseData(offlineModeSetting);
  
  const allSessions = React.useMemo(() => 
    clients.flatMap(c => 
        c.cases.flatMap(cs => 
            cs.stages.flatMap(st => 
                st.sessions.map(sess => ({ 
                    ...sess, 
                    stageId: st.id, 
                    stageDecisionDate: st.decisionDate 
                }))
            )
        )
    ), 
[clients]);

  const { analysisStatus, lastAnalysis, triggerAnalysis, analysisReport } = useAnalysis();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  
  const isLoading = syncStatus === 'loading';
  
  // The wizard is shown if the user wants to be online, but the sync status indicates a setup problem.
  const needsSetup = !offlineModeSetting && (syncStatus === 'unconfigured' || syncStatus === 'uninitialized');

  // --- Pull-to-refresh state and handlers ---
  const [pullStart, setPullStart] = React.useState<number | null>(null);
  const [pullDistance, setPullDistance] = React.useState(0);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const REFRESH_THRESHOLD = 80; // Pixels to pull before refresh triggers

  const handleTouchStart = (e: React.TouchEvent) => {
      // Only start pull-to-refresh if we are at the top of the page
      if (window.scrollY === 0) {
          setPullStart(e.targetTouches[0].clientY);
      } else {
          setPullStart(null);
      }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      if (pullStart === null || isRefreshing) return;

      const touchY = e.targetTouches[0].clientY;
      let distance = touchY - pullStart;

      // Don't allow pulling up past the start point
      if (distance < 0) distance = 0;

      // Apply some resistance to the pull for a more natural feel
      setPullDistance(distance / 2.5);
  };

  const handleTouchEnd = () => {
      if (pullStart === null || isRefreshing) return;

      if (pullDistance > REFRESH_THRESHOLD) {
          setIsRefreshing(true);
          // Animate the spinner into view and hold the position
          setPullDistance(60); 

          // Wait for the animation to show, then trigger the actual refresh
          setTimeout(() => {
              onRefresh();
              // State will be reset automatically on component remount via AppWrapper key change
          }, 500);

      } else {
          // Animate back to original position smoothly
          setPullDistance(0);
      }
      setPullStart(null);
  };

  const handleLoginSuccess = () => {
    sessionStorage.setItem('isAuthenticated', 'true');
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('isAuthenticated');
    setIsAuthenticated(false);
  };


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

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} credentials={credentials} />;
  }

  if (isLoading) {
    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="text-center">
                <ArrowPathIcon className="w-12 h-12 text-blue-600 animate-spin mx-auto" />
                <p className="mt-4 text-lg font-semibold text-gray-700">جاري تحميل البيانات...</p>
            </div>
        </div>
    );
  }
  
  if (needsSetup) {
      return <SetupWizard onRetry={forceSync} />;
  }
  
  const pullToRefreshIndicator = (
      <div 
          className="no-print absolute top-20 left-0 right-0 flex justify-center items-center text-gray-500 z-0"
          style={{ 
              opacity: isRefreshing ? 1 : Math.min(pullDistance / REFRESH_THRESHOLD, 1),
          }}
      >
          <div className="bg-white rounded-full p-2 shadow-lg">
              <ArrowPathIcon 
                  className={`w-6 h-6 transition-transform duration-200 ${isRefreshing ? 'animate-spin' : ''}`}
                  style={{ transform: `rotate(${isRefreshing ? 0 : pullDistance * 2.5}deg)`}}
              />
          </div>
      </div>
  );


  return (
    <HashRouter>
      <div 
        className="relative min-h-screen bg-gray-100 text-gray-800"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <header className="no-print fixed top-0 left-0 right-0 w-full bg-gray-800 text-white shadow-lg z-50">
          <div className="container mx-auto flex items-center justify-between h-16 px-4 sm:px-6">
            <div className="flex items-center gap-4">
              <div className="text-xl font-bold">
                <span>مكتب المحامي</span>
              </div>
              <SyncIndicator status={syncStatus} onSync={manualSync} offlineMode={offlineModeSetting} lastSyncError={lastSyncError} isDirty={isDirty} />
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
        
        {pullToRefreshIndicator}

        <main 
          className={`container mx-auto p-4 md:p-8 transition-all duration-300 ${isMenuOpen ? 'pt-80' : 'pt-28 md:pt-32'}`}
          style={{
              transform: `translateY(${pullDistance}px)`,
              transition: pullStart === null ? 'transform 0.3s' : 'none',
          }}
        >
          <Routes>
            <Route path="/" element={<HomePage appointments={appointments} setClients={setClients} allSessions={allSessions} setAppointments={setAppointments} adminTasks={adminTasks} setAdminTasks={setAdminTasks} assistants={assistants} />} />
            <Route path="/clients" element={<ClientsPage clients={clients} setClients={setClients} accountingEntries={accountingEntries} setAccountingEntries={setAccountingEntries} assistants={assistants} />} />
            <Route path="/accounting" element={<AccountingPage accountingEntries={accountingEntries} setAccountingEntries={setAccountingEntries} clients={clients} />} />
            <Route path="/reports" element={<ReportsPage clients={clients} accountingEntries={accountingEntries} />} />
            <Route path="/settings" element={<SettingsPage setFullData={setFullData} analysisStatus={analysisStatus} lastAnalysis={lastAnalysis} triggerAnalysis={triggerAnalysis} assistants={assistants} setAssistants={setAssistants} analysisReport={analysisReport} offlineMode={offlineModeSetting} setOfflineMode={setOfflineModeSetting} onLogout={handleLogout} credentials={credentials} setCredentials={setCredentials} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
};

export default App;