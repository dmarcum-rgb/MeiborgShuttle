import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Clock, CheckCircle, CalendarClock, ChevronRight, AlertCircle } from 'lucide-react';

type PendingTimesheet = {
  id: string;
  driver_name: string;
  vehicle_number: string;
  work_date: string;
  total_hours: number;
  submitted_at: string | null;
};

function getNextMonday(): Date {
  const now = new Date();
  const day = now.getDay(); // 0 = Sun, 1 = Mon ...
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7;
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntilMonday);
  next.setHours(0, 0, 0, 0);
  return next;
}

function useCountdown(target: Date) {
  const [diff, setDiff] = useState(() => target.getTime() - Date.now());

  useEffect(() => {
    const id = setInterval(() => setDiff(target.getTime() - Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  const totalSecs = Math.max(0, Math.floor(diff / 1000));
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  return { days, hours, mins, secs, totalSecs };
}

function pad2(n: number) { return String(n).padStart(2, '0'); }

export function Dashboard() {
  const [pending, setPending] = useState<PendingTimesheet[]>([]);
  const [approvedCount, setApprovedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const nextMonday = getNextMonday();
  const countdown = useCountdown(nextMonday);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);

    // Get the current week's Sunday–Saturday range
    const now = new Date();
    const day = now.getDay();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - day);
    sunday.setHours(0, 0, 0, 0);
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);

    const weekStart = sunday.toISOString().split('T')[0];
    const weekEnd = saturday.toISOString().split('T')[0];

    const [submittedRes, approvedRes] = await Promise.all([
      supabase
        .from('timesheets')
        .select('id, driver_name, vehicle_number, work_date, total_hours, submitted_at')
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: true }),
      supabase
        .from('timesheets')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')
        .gte('work_date', weekStart)
        .lte('work_date', weekEnd),
    ]);

    setPending(submittedRes.data ?? []);
    setApprovedCount(approvedRes.count ?? 0);
    setLoading(false);
  };

  const approveTimesheet = async (id: string) => {
    await supabase.from('timesheets').update({ status: 'approved' }).eq('id', id);
    setPending(ts => ts.filter(t => t.id !== id));
    setApprovedCount(c => c + 1);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const timeSince = (iso: string | null) => {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const urgency = countdown.days === 0 && countdown.hours < 12;

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-gray-900 font-serif">Dashboard</h1>
        <p className="text-gray-500 mt-1">Weekly operations at a glance</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Timesheets to approve */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${pending.length > 0 ? 'bg-blue-50' : 'bg-gray-50'}`}>
                <Clock className={`w-5 h-5 ${pending.length > 0 ? 'text-blue-600' : 'text-gray-400'}`} />
              </div>
              <div>
                <h2 className="text-gray-900 font-semibold">Timesheets to Approve</h2>
                <p className="text-xs text-gray-400 mt-0.5">{approvedCount} approved this week</p>
              </div>
            </div>
            {pending.length > 0 && (
              <span className="flex items-center justify-center w-7 h-7 bg-blue-600 text-white text-sm font-semibold rounded-full">
                {pending.length}
              </span>
            )}
          </div>

          <div className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
              </div>
            ) : pending.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <CheckCircle className="w-10 h-10 mb-3 text-green-400" />
                <p className="font-medium text-gray-600">All caught up</p>
                <p className="text-sm mt-1">No timesheets waiting for approval</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {pending.map(ts => (
                  <li key={ts.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 text-sm">{ts.driver_name || 'Unknown Driver'}</p>
                        <span className="text-xs text-gray-400">Truck #{ts.vehicle_number}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-gray-500">{formatDate(ts.work_date)}</p>
                        <span className="text-gray-300">·</span>
                        <p className="text-xs font-medium text-gray-700">{ts.total_hours.toFixed(2)} hrs</p>
                        {ts.submitted_at && (
                          <>
                            <span className="text-gray-300">·</span>
                            <p className="text-xs text-gray-400">{timeSince(ts.submitted_at)}</p>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => approveTimesheet(ts.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-all flex-shrink-0"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Approve
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {pending.length > 0 && (
            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50">
              <a href="#timesheets" className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1 transition-colors">
                View all in Timesheets tab <ChevronRight className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>

        {/* Billing countdown */}
        <div className={`rounded-2xl shadow-sm overflow-hidden flex flex-col border ${urgency ? 'border-red-200 bg-red-50' : 'bg-white border-gray-200'}`}>
          <div className={`px-6 py-5 border-b flex items-center gap-3 ${urgency ? 'border-red-200' : 'border-gray-100'}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${urgency ? 'bg-red-100' : 'bg-gray-50'}`}>
              {urgency
                ? <AlertCircle className="w-5 h-5 text-red-600" />
                : <CalendarClock className="w-5 h-5 text-gray-600" />
              }
            </div>
            <div>
              <h2 className={`font-semibold ${urgency ? 'text-red-800' : 'text-gray-900'}`}>Geodis Billing Deadline</h2>
              <p className={`text-xs mt-0.5 ${urgency ? 'text-red-500' : 'text-gray-400'}`}>
                Every Monday — Pre-billing due to Geodis
              </p>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 gap-6">
            {/* Countdown tiles */}
            <div className="flex items-end gap-3">
              {[
                { value: countdown.days, label: 'Days' },
                { value: countdown.hours, label: 'Hours' },
                { value: countdown.mins, label: 'Min' },
                { value: countdown.secs, label: 'Sec' },
              ].map(({ value, label }, i) => (
                <div key={label} className="flex items-end gap-3">
                  {i > 0 && <span className={`text-2xl font-light mb-3 ${urgency ? 'text-red-400' : 'text-gray-300'}`}>:</span>}
                  <div className="flex flex-col items-center">
                    <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-bold tabular-nums shadow-sm ${
                      urgency ? 'bg-red-600 text-white' : 'bg-gray-900 text-white'
                    }`}>
                      {pad2(value)}
                    </div>
                    <span className={`text-xs mt-1.5 font-medium ${urgency ? 'text-red-500' : 'text-gray-400'}`}>{label}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center">
              <p className={`text-sm font-medium ${urgency ? 'text-red-700' : 'text-gray-700'}`}>
                Next billing: {nextMonday.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              {urgency && (
                <p className="text-xs text-red-500 mt-1 font-medium">Billing due soon — submit Pre-Billing now</p>
              )}
              {!urgency && pending.length > 0 && (
                <p className="text-xs text-amber-600 mt-1 font-medium">{pending.length} timesheet{pending.length > 1 ? 's' : ''} still need approval before billing</p>
              )}
              {!urgency && pending.length === 0 && (
                <p className="text-xs text-green-600 mt-1 font-medium">All timesheets approved — ready to bill</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
