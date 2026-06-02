import { useState, useEffect } from 'react';
import { useAuth, AuthProvider } from './hooks/useAuth';
import { Auth } from './components/Auth';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { DailyFeed } from './components/DailyFeed';
import { DriverDashboard } from './components/DriverDashboard';
import { Drivers } from './components/Drivers';
import { Stops } from './components/Stops';
import { FuelReceipts } from './components/FuelReceipts';
import { TollReceipts } from './components/TollReceipts';
import { GeodisPreBilling } from './components/GeodisPreBilling';
import { Timesheets } from './components/Timesheets';
import { Reports } from './components/Reports';

function AppContent() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');

  const isDriver = user?.email?.startsWith('driver-') ?? false;

  useEffect(() => {
    if (!user && !loading) {
      setCurrentPage('dashboard');
    }
  }, [user, loading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-gray-800 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  if (isDriver) {
    return <DriverDashboard />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'feed':
        return <DailyFeed />;
      case 'drivers':
        return <Drivers />;
      case 'stops':
        return <Stops />;
      case 'fuel':
        return <FuelReceipts />;
      case 'tolls':
        return <TollReceipts />;
      case 'hours':
        return <GeodisPreBilling />;
      case 'timesheets':
        return <Timesheets />;
      case 'reports':
        return <Reports />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
