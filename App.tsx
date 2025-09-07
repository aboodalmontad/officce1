import React, { useState } from 'react';
import { HashRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ClientsPage from './pages/ClientsPage';
import AccountingPage from './pages/AccountingPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import { HomeIcon, UsersIcon, CurrencyDollarIcon, DocumentChartBarIcon, SettingsIcon, CloudArrowUpIcon, ArrowPathIcon, CheckCircleIcon, XCircleIcon } from './components/icons';
import { useMockData } from './hooks/useMockData';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useSync } from './hooks/useSync';

const App: React.FC = () => {
  const { clients, adminTasks, appointments, accountingEntries, setClients, setAdminTasks, setAppointments, setAccountingEntries, allSessions, setFullData, assistants, setAssistants } = useMockData();
  const isOnline = useOnlineStatus();
  const { syncStatus, lastSync, triggerSync } = useSync();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const getSyncButtonContent = () => {
    switch (syncStatus) {
      case 'syncing':
        return <><ArrowPathIcon className="w-5 h-5 animate-spin" /> <span>جاري المزامنة...</span></>;
      case 'success':
        return <><CheckCircleIcon className="w-5 h-5 text-green-400" /> <span>تمت المزامنة</span></>;
      case 'error':
        return <><XCircleIcon className="w-5 h-5 text-red-400" /> <span>فشل المزامنة</span></>;
      default:
        return <><CloudArrowUpIcon className="w-5 h-5" /> <span>مزامنة</span></>;
    }
  };

  const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) => `flex items-center px-3 py-2 rounded-lg text-base font-medium transition-colors duration-200 ${isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`;
  const desktopNavLinkClass = ({ isActive }: { isActive: boolean }) => `flex items-center px-3 py-2 rounded-lg transition-colors duration-200 ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-gray-700'}`;


  return (
    <HashRouter>
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
                <NavLink to="/" className={desktopNavLinkClass}><HomeIcon className="w-5 h-5 me-2" /><span>الرئيسية</span></NavLink>
                <NavLink to="/clients" className={desktopNavLinkClass}><UsersIcon className="w-5 h-5 me-2" /><span>الموكلين</span></NavLink>
                <NavLink to="/accounting" className={desktopNavLinkClass}><CurrencyDollarIcon className="w-5 h-5 me-2" /><span>المحاسبة</span></NavLink>
                <NavLink to="/reports" className={desktopNavLinkClass}><DocumentChartBarIcon className="w-5 h-5 me-2" /><span>التقارير</span></NavLink>
                <NavLink to="/settings" className={desktopNavLinkClass}><SettingsIcon className="w-5 h-5 me-2" /><span>الإعدادات</span></NavLink>
              </nav>

              <div className="hidden md:block h-8 border-s border-gray-600"></div>
              
              <div className="hidden md:flex">
                <button
                  onClick={triggerSync}
                  disabled={!isOnline || syncStatus === 'syncing'}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors duration-200 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
                  title={!isOnline ? 'المزامنة تتطلب اتصالاً بالإنترنت' : 'مزامنة البيانات مع الخادم'}
                >
                  {getSyncButtonContent()}
                </button>
              </div>

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
          {isMenuOpen && (
            <div className="md:hidden" id="mobile-menu">
              <nav className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
                <NavLink to="/" onClick={() => setIsMenuOpen(false)} className={mobileNavLinkClass}><HomeIcon className="w-5 h-5 me-2" /><span>الرئيسية</span></NavLink>
                <NavLink to="/clients" onClick={() => setIsMenuOpen(false)} className={mobileNavLinkClass}><UsersIcon className="w-5 h-5 me-2" /><span>الموكلين</span></NavLink>
                <NavLink to="/accounting" onClick={() => setIsMenuOpen(false)} className={mobileNavLinkClass}><CurrencyDollarIcon className="w-5 h-5 me-2" /><span>المحاسبة</span></NavLink>
                <NavLink to="/reports" onClick={() => setIsMenuOpen(false)} className={mobileNavLinkClass}><DocumentChartBarIcon className="w-5 h-5 me-2" /><span>التقارير</span></NavLink>
                <NavLink to="/settings" onClick={() => setIsMenuOpen(false)} className={mobileNavLinkClass}><SettingsIcon className="w-5 h-5 me-2" /><span>الإعدادات</span></NavLink>
              </nav>
              <div className="border-t border-gray-700 pt-4 pb-3">
                <div className="flex items-center px-4">
                  <button
                    onClick={() => { triggerSync(); setIsMenuOpen(false); }}
                    disabled={!isOnline || syncStatus === 'syncing'}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-colors duration-200 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
                    title={!isOnline ? 'المزامنة تتطلب اتصالاً بالإنترنت' : 'مزامنة البيانات مع الخادم'}
                  >
                    {getSyncButtonContent()}
                  </button>
                </div>
              </div>
            </div>
          )}
        </header>
        
        <main className="container mx-auto pt-24 p-4 md:p-8">
          <Routes>
            <Route path="/" element={<HomePage appointments={appointments} setClients={setClients} allSessions={allSessions} setAppointments={setAppointments} adminTasks={adminTasks} setAdminTasks={setAdminTasks} assistants={assistants} />} />
            <Route path="/clients" element={<ClientsPage clients={clients} setClients={setClients} accountingEntries={accountingEntries} setAccountingEntries={setAccountingEntries} assistants={assistants} />} />
            <Route path="/accounting" element={<AccountingPage accountingEntries={accountingEntries} setAccountingEntries={setAccountingEntries} clients={clients} />} />
            <Route path="/reports" element={<ReportsPage clients={clients} accountingEntries={accountingEntries} />} />
            <Route path="/settings" element={<SettingsPage setFullData={setFullData} syncStatus={syncStatus} lastSync={lastSync} triggerSync={triggerSync} assistants={assistants} setAssistants={setAssistants} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
};

export default App;
