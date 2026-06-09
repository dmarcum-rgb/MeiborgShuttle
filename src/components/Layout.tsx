import { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { LogOut, LayoutDashboard, Users, MapPin, Fuel, Banknote, FileText, ReceiptText, BarChart2, Newspaper, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { NotificationBell } from './NotificationBell';
import { ClockToast } from './ClockToast';

type LayoutProps = {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
};

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'feed', label: 'Daily Feed', icon: Newspaper },
  { id: 'drivers', label: 'Drivers', icon: Users },
  { id: 'timesheets', label: 'Timesheets', icon: FileText },
  { id: 'stops', label: 'Stops', icon: MapPin },
  { id: 'fuel', label: 'Fuel Receipts', icon: Fuel },
  { id: 'tolls', label: 'Toll Receipts', icon: Banknote },
  { id: 'hours', label: 'Geodis Pre-Billing', icon: ReceiptText },
  { id: 'reports', label: 'Reports', icon: BarChart2 },
  { id: 'errors', label: 'System Errors', icon: AlertTriangle },
];

export function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const { user, signOut } = useAuth();
  const [role, setRole] = useState<'office' | 'driver' | null>(null);
  const [openErrorCount, setOpenErrorCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => setRole((data?.role as 'office' | 'driver') ?? null));
  }, [user]);

  useEffect(() => {
    if (role !== 'office') return;
    supabase
      .from('system_errors')
      .select('id', { count: 'exact', head: true })
      .eq('resolved', false)
      .then(({ count }) => setOpenErrorCount(count ?? 0));

    const channel = supabase
      .channel('system_errors_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_errors' }, () => {
        supabase
          .from('system_errors')
          .select('id', { count: 'exact', head: true })
          .eq('resolved', false)
          .then(({ count }) => setOpenErrorCount(count ?? 0));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [role]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center shadow-lg shadow-gray-900/20">
              <img src="/image copy.png" alt="Logo" className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-white font-semibold text-lg font-serif">Meiborg Shuttles</h1>
              <p className="text-gray-400 text-xs">Fleet Management</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-gray-700 text-white shadow-lg'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="flex-1 text-left">{item.label}</span>
                {item.id === 'errors' && openErrorCount > 0 && (
                  <span className="flex items-center justify-center min-w-5 h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full">
                    {openErrorCount > 99 ? '99+' : openErrorCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">
                {user?.email?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">
                {user?.email}
              </p>
              <p className="text-gray-400 text-xs">
                {role === 'office' ? 'Office' : 'Driver'}
              </p>
            </div>
            {role === 'office' && <NotificationBell />}
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-all"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="pl-64">
        {children}
      </main>

      {role === 'office' && <ClockToast />}
    </div>
  );
}
