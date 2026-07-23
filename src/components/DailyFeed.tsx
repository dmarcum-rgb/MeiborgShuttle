import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle, LogOut, Clock, ChevronLeft, ChevronRight, RefreshCw, Radio } from 'lucide-react';

type RawLog = {
  id: string;
  driver_id: string;
  vendor_name: string;
  address: string;
  started_at: string;
  arrived_at: string | null;
  departed_at: string | null;
};

type DriverMap = Record<string, string>; // driver_id → display_name

type FeedEvent = {
  id: string;
  ts: Date;
  kind: 'departed' | 'arrived';
  driverName: string;
  vendorName: string;
  address: string;
  logId: string;
  isNew?: boolean;
};

function fmt(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function dayLabel(d: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function dateKey(d: Date): string {
  return d.toISOString().split('T')[0];
}

// Build a flat sorted list of events from raw logs
function buildEvents(logs: RawLog[], drivers: DriverMap, newIds: Set<string>): FeedEvent[] {
  const events: FeedEvent[] = [];

  for (const log of logs) {
    const driverName = drivers[log.driver_id] ?? 'Unknown Driver';

    // Departed from a stop (departed_at set)
    if (log.departed_at) {
      events.push({
        id: `${log.id}-dep`,
        ts: new Date(log.departed_at),
        kind: 'departed',
        driverName,
        vendorName: log.vendor_name,
        address: log.address,
        logId: log.id,
        isNew: newIds.has(`${log.id}-dep`),
      });
    }

    // Arrived at a stop (arrived_at set)
    if (log.arrived_at) {
      events.push({
        id: `${log.id}-arr`,
        ts: new Date(log.arrived_at),
        kind: 'arrived',
        driverName,
        vendorName: log.vendor_name,
        address: log.address,
        logId: log.id,
        isNew: newIds.has(`${log.id}-arr`),
      });
    }

  }

  return events.sort((a, b) => b.ts.getTime() - a.ts.getTime());
}

const EVENT_CONFIG = {
  departed: {
    icon: LogOut,
    iconBg: 'bg-glass2',
    iconColor: 'text-faint',
    label: 'Departed',
    labelColor: 'text-dim',
    dot: 'bg-faint',
    badgeBg: 'bg-glass2',
    badgeText: 'text-dim',
  },
  arrived: {
    icon: CheckCircle,
    iconBg: 'bg-[rgba(75,211,160,0.12)]',
    iconColor: 'text-ok',
    label: 'Arrived',
    labelColor: 'text-ok',
    dot: 'bg-ok',
    badgeBg: 'bg-[rgba(75,211,160,0.12)]',
    badgeText: 'text-ok',
  },
};

export function DailyFeed() {
  const [logs, setLogs] = useState<RawLog[]>([]);
  const [drivers, setDrivers] = useState<DriverMap>({});
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const newIdsRef = useRef<Set<string>>(new Set());

  // Fetch driver name map once
  useEffect(() => {
    supabase.rpc('get_driver_names').then(({ data }) => {
      const map: DriverMap = {};
      for (const row of data ?? []) map[row.driver_id] = row.display_name;
      setDrivers(map);
    });
  }, []);

  // Fetch logs for the selected date
  useEffect(() => {
    fetchLogs();
  }, [selectedDate]);

  // Realtime subscription — adds incoming rows live if they match today
  useEffect(() => {
    const channel = supabase
      .channel('daily-feed-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'route_logs' },
        (payload) => {
          const today = dateKey(selectedDate);
          const row = payload.new as RawLog;
          if (!row?.started_at) return;
          if (dateKey(new Date(row.started_at)) !== today) return;

          // Mark new events
          const candidates = [`${row.id}-dep`, `${row.id}-arr`, `${row.id}-enr`];
          const nextNew = new Set(newIdsRef.current);
          candidates.forEach(c => nextNew.add(c));
          newIdsRef.current = nextNew;
          setNewIds(new Set(nextNew));

          // Upsert the log row
          setLogs(prev => {
            const filtered = prev.filter(l => l.id !== row.id);
            return [row, ...filtered];
          });

          // Clear "new" highlights after 4s
          setTimeout(() => {
            const s = new Set(newIdsRef.current);
            candidates.forEach(c => s.delete(c));
            newIdsRef.current = s;
            setNewIds(new Set(s));
          }, 4000);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedDate]);

  const fetchLogs = async () => {
    setLoading(true);
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(23, 59, 59, 999);

    const { data } = await supabase
      .from('route_logs')
      .select('id, driver_id, vendor_name, address, started_at, arrived_at, departed_at')
      .gte('started_at', dayStart.toISOString())
      .lte('started_at', dayEnd.toISOString())
      .order('started_at', { ascending: false });

    setLogs((data as RawLog[]) ?? []);
    setLoading(false);
  };

  const shiftDay = (n: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + n);
    setSelectedDate(d);
  };

  const isToday = dateKey(selectedDate) === dateKey(new Date());

  const events = buildEvents(logs, drivers, newIds);

  // Group by day (always same day here, but kept generic for future)
  const grouped: { label: string; events: FeedEvent[] }[] = [];
  if (events.length > 0) {
    grouped.push({ label: dayLabel(selectedDate), events });
  }

  // Stats
  const arrivals = events.filter(e => e.kind === 'arrived').length;
  const departures = events.filter(e => e.kind === 'departed').length;
  const uniqueDrivers = new Set(events.map(e => e.driverName)).size;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-mist">Daily Feed</h1>
          <p className="text-faint mt-1">Real-time driver departures and arrivals</p>
        </div>
        <div className="flex items-center gap-2">
          {isToday && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[rgba(75,211,160,0.12)] border border-[rgba(75,211,160,0.35)] rounded-full">
              <Radio className="w-3.5 h-3.5 text-ok animate-pulse" />
              <span className="text-xs font-semibold text-ok">Live</span>
            </div>
          )}
          <button
            onClick={fetchLogs}
            className="p-2 text-faint hover:text-mist hover:bg-glass2 rounded-lg transition-all"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Date nav */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => shiftDay(-1)}
          className="p-2 border border-edge rounded-xl text-faint hover:text-mist hover:bg-glass2 transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 text-center">
          <p className="text-lg font-semibold text-mist">{dayLabel(selectedDate)}</p>
          <p className="text-xs text-faint">
            {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <button
          onClick={() => shiftDay(1)}
          disabled={isToday}
          className="p-2 border border-edge rounded-xl text-faint hover:text-mist hover:bg-glass2 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Arrivals', value: arrivals, icon: CheckCircle, color: 'text-ok', bg: 'bg-[rgba(75,211,160,0.12)]' },
          { label: 'Departures', value: departures, icon: LogOut, color: 'text-dim', bg: 'bg-glass2' },
          { label: 'Active Drivers', value: uniqueDrivers, icon: Clock, color: 'text-signal', bg: 'bg-signal-dim' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-faint uppercase tracking-wide">{label}</span>
              <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
            </div>
            <p className="text-3xl font-bold text-mist tabular-nums">{loading ? '—' : value}</p>
          </div>
        ))}
      </div>

      {/* Feed */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-edge border-t-signal rounded-full animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-faint">
            <Clock className="w-10 h-10 mb-3 text-faint" />
            <p className="font-medium text-dim">No activity yet</p>
            <p className="text-sm mt-1">Driver stops will appear here as they happen</p>
          </div>
        ) : (
          <div>
            {grouped.map(group => (
              <div key={group.label}>
                <div className="px-6 py-3 bg-glass2 border-b border-edge">
                  <p className="text-xs font-semibold text-faint uppercase tracking-wider">{group.label}</p>
                </div>
                <div className="divide-y divide-edge">
                  {group.events.map(event => {
                    const cfg = EVENT_CONFIG[event.kind];
                    const Icon = cfg.icon;
                    return (
                      <div
                        key={event.id}
                        className={`flex items-start gap-4 px-6 py-4 transition-colors duration-700 ${
                          event.isNew ? 'bg-signal-dim' : 'hover:bg-glass2'
                        }`}
                      >
                        {/* Timeline dot + icon */}
                        <div className="flex flex-col items-center gap-1 pt-0.5 flex-shrink-0">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${cfg.iconBg}`}>
                            <Icon className={`w-4 h-4 ${cfg.iconColor}`} />
                          </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-mist">{event.driverName}</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badgeBg} ${cfg.badgeText}`}>
                              {cfg.label}
                            </span>
                            {event.isNew && (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-signal-dim text-signal animate-pulse">
                                New
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-dim mt-0.5 font-medium">{event.vendorName}</p>
                          <p className="text-xs text-faint mt-0.5 truncate">{event.address}</p>
                        </div>

                        {/* Time */}
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold text-mist tabular-nums">
                            {fmt(event.ts.toISOString())}
                          </p>
                          <p className="text-xs text-faint mt-0.5">
                            {event.ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
