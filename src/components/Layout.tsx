import { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { LogOut, LayoutDashboard, Users, MapPin, Fuel, Banknote, FileText, ReceiptText, BarChart2, Newspaper, AlertTriangle, FileSpreadsheet } from 'lucide-react';
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
  { id: 'toll-sheets', label: 'Toll Sheets', icon: FileSpreadsheet },
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

  const displayName = user?.email?.split('@')[0] ?? '';

  return (
    <div className="min-h-screen flex flex-col lg:flex-row gap-4 p-3 sm:p-4">
      {/* Left rail */}
      <aside className="rail lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] w-full lg:w-[212px] flex-shrink-0 flex flex-col p-3">
        {/* Brand */}
        <div className="flex items-center gap-3 px-2 py-2 mb-2">
          <img src="/logo.png" alt="Meiborg Shuttles" className="w-10 h-10 rounded-xl object-contain" />
          <div className="leading-tight">
            <h1 className="text-mist text-[15px] font-light tracking-tight">
              Meiborg <span className="font-semibold">Shuttles</span>
            </h1>
            <p className="text-faint text-[11px]">Fleet Management</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-row flex-wrap lg:flex-col gap-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-full text-[13px] font-medium transition-all ${
                  isActive
                    ? 'bg-signal text-[#1a1205] shadow-[0_4px_16px_rgba(255,201,60,0.3)]'
                    : 'text-dim hover:text-mist hover:bg-glass2'
                }`}
              >
                <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                <span className="flex-1 text-left hidden sm:inline">{item.label}</span>
                {item.id === 'errors' && openErrorCount > 0 && (
                  <span className={`flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-bold rounded-full ${
                    isActive ? 'bg-[#1a1205]/20 text-[#1a1205]' : 'bg-bad text-white'
                  }`}>
                    {openErrorCount > 99 ? '99+' : openErrorCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User */}
        <div className="mt-2 pt-3 border-t border-edge">
          <div className="flex items-center gap-3 px-1 mb-2">
            <div className="w-9 h-9 rounded-full bg-glass2 border border-edge flex items-center justify-center flex-shrink-0">
              <span className="text-mist text-sm font-medium">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-mist text-[13px] font-medium truncate">{displayName}</p>
              <p className="text-faint text-[11px]">{role === 'office' ? 'Office' : 'Driver'}</p>
            </div>
            {role === 'office' && <NotificationBell />}
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-full text-[13px] font-medium text-dim hover:text-mist hover:bg-glass2 transition-all"
          >
            <LogOut className="w-[18px] h-[18px]" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        {children}
      </main>

      {role === 'office' && <ClockToast />}
    </div>
  );
}
