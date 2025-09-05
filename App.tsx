import React from 'react';
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ClientsPage from './pages/ClientsPage';
import AccountingPage from './pages/AccountingPage';
import SettingsPage from './pages/SettingsPage';
import { HomeIcon, UsersIcon, CurrencyDollarIcon, SettingsIcon, CloudArrowUpIcon, ArrowPathIcon, CheckCircleIcon, XCircleIcon } from './components/icons';
import { useMockData } from './hooks/useMockData';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useSync } from './hooks/useSync';

const App: React.FC = () => {
  const { clients, adminTasks, appointments, accountingEntries, setClients, setAdminTasks, setAppointments, setAccountingEntries, allSessions, setFullData } = useMockData();
  const isOnline = useOnlineStatus();
  const { syncStatus, lastSync, triggerSync } = useSync();

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

  return (
    <HashRouter>
      <div className="relative min-h-screen bg-gray-100 text-gray-800">
        <header className="no-print fixed top-0 left-0 right-0 w-full bg-gray-800 text-white shadow-lg z-50">
          <div className="container mx-auto flex items-center justify-between h-16 px-6">
            <div className="flex items-center gap-4">
              <div className="text-xl font-bold">
                <span>مكتب المحامي</span>
              </div>
              <div className="flex items-center gap-2" title={isOnline ? 'أنت متصل بالإنترنت' : 'أنت غير متصل بالإنترنت'}>
                <span className={`w-3 h-3 rounded-full transition-colors ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
                <span className="text-sm text-gray-300">{isOnline ? 'متصل' : 'غير متصل'}</span>
              </div>
            </div>
            <div className="flex items-center gap-x-4">
              <nav className="flex items-center gap-x-4">
                <NavLink to="/" className={({ isActive }) => `flex items-center px-3 py-2 rounded-lg transition-colors duration-200 ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-gray-700'}`}>
                  <HomeIcon className="w-5 h-5 me-2" />
                  <span>الرئيسية</span>
                </NavLink>
                <NavLink to="/clients" className={({ isActive }) => `flex items-center px-3 py-2 rounded-lg transition-colors duration-200 ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-gray-700'}`}>
                  <UsersIcon className="w-5 h-5 me-2" />
                  <span>الموكلين</span>
                </NavLink>
                <NavLink to="/accounting" className={({ isActive }) => `flex items-center px-3 py-2 rounded-lg transition-colors duration-200 ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-gray-700'}`}>
                  <CurrencyDollarIcon className="w-5 h-5 me-2" />
                  <span>المحاسبة</span>
                </NavLink>
                <NavLink to="/settings" className={({ isActive }) => `flex items-center px-3 py-2 rounded-lg transition-colors duration-200 ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-gray-700'}`}>
                  <SettingsIcon className="w-5 h-5 me-2" />
                  <span>الإعدادات</span>
                </NavLink>
              </nav>
              <div className="h-8 border-s border-gray-600"></div>
              <button
                onClick={triggerSync}
                disabled={!isOnline || syncStatus === 'syncing'}
                className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors duration-200 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
                title={!isOnline ? 'المزامنة تتطلب اتصالاً بالإنترنت' : 'مزامنة البيانات مع الخادم'}
              >
                {getSyncButtonContent()}
              </button>
            </div>
          </div>
        </header>
        
        <main className="container mx-auto pt-24 p-8">
          <Routes>
            <Route path="/" element={<HomePage appointments={appointments} setClients={setClients} allSessions={allSessions} setAppointments={setAppointments} adminTasks={adminTasks} setAdminTasks={setAdminTasks} />} />
            <Route path="/clients" element={<ClientsPage clients={clients} setClients={setClients} accountingEntries={accountingEntries} setAccountingEntries={setAccountingEntries} />} />
            <Route path="/accounting" element={<AccountingPage accountingEntries={accountingEntries} setAccountingEntries={setAccountingEntries} clients={clients} />} />
            <Route path="/settings" element={<SettingsPage setFullData={setFullData} syncStatus={syncStatus} lastSync={lastSync} triggerSync={triggerSync} />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
};

export default App;