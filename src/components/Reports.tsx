import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { BarChart2, Clock, DollarSign, TrendingUp, ChevronDown, Download, Fuel, Banknote, MapPin } from 'lucide-react';

type Period = 'week' | 'month' | 'year' | 'custom';

type DriverReport = {
  driver_name: string;
  total_stops: number;
  avg_stop_duration_min: number;
  avg_travel_time_min: number;
  total_fuel: number;
  total_tolls: number;
  total_hours: number;
};

type StopReport = {
  vendor_name: string;
  visit_count: number;
  avg_dwell_min: number;
  toll_amount: number;
  estimated_revenue: number;
};

function getPeriodRange(period: Period, customFrom: string, customTo: string): { from: Date; to: Date } {
  const now = new Date();
  if (period === 'week') {
    const day = now.getDay();
    const from = new Date(now);
    from.setDate(now.getDate() - day);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  if (period === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from, to };
  }
  if (period === 'year') {
    const from = new Date(now.getFullYear(), 0, 1);
    const to = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { from, to };
  }
  return {
    from: new Date(customFrom + 'T00:00:00'),
    to: new Date(customTo + 'T23:59:59'),
  };
}

function fmt(min: number) {
  if (!min || isNaN(min)) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function Reports() {
  const [period, setPeriod] = useState<Period>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [activeTab, setActiveTab] = useState<'drivers' | 'stops'>('drivers');
  const [driverReports, setDriverReports] = useState<DriverReport[]>([]);
  const [stopReports, setStopReports] = useState<StopReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortField, setSortField] = useState<string>('total_stops');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const load = useCallback(async () => {
    const isCustomReady = period !== 'custom' || (customFrom && customTo);
    if (!isCustomReady) return;

    setLoading(true);
    const { from, to } = getPeriodRange(period, customFrom, customTo);
    const fromISO = from.toISOString();
    const toISO = to.toISOString();

    const [routeLogsRes, timesheetsRes, fuelRes, tollReceiptsRes] = await Promise.all([
      supabase
        .from('route_logs')
        .select('driver_id, vendor_name, started_at, arrived_at, departed_at')
        .gte('started_at', fromISO)
        .lte('started_at', toISO),
      supabase
        .from('timesheets')
        .select('driver_name, total_hours, fuel_dollars, toll_total, work_date')
        .gte('work_date', from.toISOString().split('T')[0])
        .lte('work_date', to.toISOString().split('T')[0])
        .eq('status', 'approved'),
      supabase
        .from('fuel_receipts')
        .select('driver_id, amount, date')
        .gte('date', from.toISOString().split('T')[0])
        .lte('date', to.toISOString().split('T')[0]),
      supabase
        .from('toll_receipts')
        .select('driver_id, amount, date')
        .gte('date', from.toISOString().split('T')[0])
        .lte('date', to.toISOString().split('T')[0]),
    ]);

    const logs = routeLogsRes.data ?? [];
    const timesheets = timesheetsRes.data ?? [];
    const fuelRecs = fuelRes.data ?? [];
    const tollRecs = tollReceiptsRes.data ?? [];

    // --- Driver reports ---
    const driverMap: Record<string, DriverReport> = {};

    for (const ts of timesheets) {
      const name = ts.driver_name;
      if (!driverMap[name]) {
        driverMap[name] = { driver_name: name, total_stops: 0, avg_stop_duration_min: 0, avg_travel_time_min: 0, total_fuel: 0, total_tolls: 0, total_hours: 0 };
      }
      driverMap[name].total_hours += Number(ts.total_hours ?? 0);
      driverMap[name].total_fuel += Number(ts.fuel_dollars ?? 0);
      driverMap[name].total_tolls += Number(ts.toll_total ?? 0);
    }

    // Map auth user id → display name via driver_profiles (set by drivers at first login)
    const driverIdToName: Record<string, string> = {};
    const { data: profilesData } = await supabase.from('driver_profiles').select('driver_id, full_name');
    for (const p of profilesData ?? []) driverIdToName[p.driver_id] = p.full_name;

    for (const f of fuelRecs) {
      const name = driverIdToName[f.driver_id];
      if (!name) continue;
      if (!driverMap[name]) driverMap[name] = { driver_name: name, total_stops: 0, avg_stop_duration_min: 0, avg_travel_time_min: 0, total_fuel: 0, total_tolls: 0, total_hours: 0 };
      driverMap[name].total_fuel += Number(f.amount ?? 0);
    }
    for (const t of tollRecs) {
      const name = driverIdToName[t.driver_id];
      if (!name) continue;
      if (!driverMap[name]) driverMap[name] = { driver_name: name, total_stops: 0, avg_stop_duration_min: 0, avg_travel_time_min: 0, total_fuel: 0, total_tolls: 0, total_hours: 0 };
      driverMap[name].total_tolls += Number(t.amount ?? 0);
    }

    // Stop durations per driver from route_logs
    const driverDwellTimes: Record<string, number[]> = {};
    const driverTravelTimes: Record<string, number[]> = {};

    const sortedLogs = [...logs].sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
    const byDriver: Record<string, typeof sortedLogs> = {};
    for (const l of sortedLogs) {
      if (!byDriver[l.driver_id]) byDriver[l.driver_id] = [];
      byDriver[l.driver_id].push(l);
    }

    for (const [driverId, driverLogs] of Object.entries(byDriver)) {
      const name = driverIdToName[driverId] ?? driverId;
      if (!driverMap[name]) driverMap[name] = { driver_name: name, total_stops: 0, avg_stop_duration_min: 0, avg_travel_time_min: 0, total_fuel: 0, total_tolls: 0, total_hours: 0 };
      driverMap[name].total_stops += driverLogs.length;

      for (let i = 0; i < driverLogs.length; i++) {
        const log = driverLogs[i];
        if (log.arrived_at && log.departed_at) {
          const dwell = (new Date(log.departed_at).getTime() - new Date(log.arrived_at).getTime()) / 60000;
          if (dwell >= 0 && dwell < 480) {
            if (!driverDwellTimes[name]) driverDwellTimes[name] = [];
            driverDwellTimes[name].push(dwell);
          }
        }
        if (i > 0) {
          const prev = driverLogs[i - 1];
          if (prev.departed_at && log.arrived_at) {
            const travel = (new Date(log.arrived_at).getTime() - new Date(prev.departed_at).getTime()) / 60000;
            if (travel >= 0 && travel < 300) {
              if (!driverTravelTimes[name]) driverTravelTimes[name] = [];
              driverTravelTimes[name].push(travel);
            }
          }
        }
      }
    }

    for (const name of Object.keys(driverMap)) {
      const dwells = driverDwellTimes[name] ?? [];
      const travels = driverTravelTimes[name] ?? [];
      driverMap[name].avg_stop_duration_min = dwells.length ? dwells.reduce((a, b) => a + b, 0) / dwells.length : 0;
      driverMap[name].avg_travel_time_min = travels.length ? travels.reduce((a, b) => a + b, 0) / travels.length : 0;
    }

    setDriverReports(Object.values(driverMap));

    // --- Stop reports ---
    const stopMap: Record<string, StopReport> = {};
    const { data: vendorStops } = await supabase.from('vendor_stops').select('name, toll_amount');
    const vendorTollMap: Record<string, number> = {};
    for (const vs of vendorStops ?? []) vendorTollMap[vs.name] = Number(vs.toll_amount ?? 0);

    for (const log of logs) {
      const name = log.vendor_name;
      if (!stopMap[name]) {
        stopMap[name] = { vendor_name: name, visit_count: 0, avg_dwell_min: 0, toll_amount: vendorTollMap[name] ?? 0, estimated_revenue: 0 };
      }
      stopMap[name].visit_count++;
      if (log.arrived_at && log.departed_at) {
        const dwell = (new Date(log.departed_at).getTime() - new Date(log.arrived_at).getTime()) / 60000;
        if (dwell >= 0 && dwell < 480) {
          stopMap[name].avg_dwell_min = (stopMap[name].avg_dwell_min * (stopMap[name].visit_count - 1) + dwell) / stopMap[name].visit_count;
        }
      }
    }

    // Estimate revenue: each stop billed at an assumed $45/hr rate based on dwell + transit time
    const RATE_PER_HOUR = 45;
    for (const s of Object.values(stopMap)) {
      const billableHours = (s.avg_dwell_min / 60) * s.visit_count;
      s.estimated_revenue = billableHours * RATE_PER_HOUR - s.toll_amount * s.visit_count;
    }

    setStopReports(Object.values(stopMap));
    setLoading(false);
  }, [period, customFrom, customTo]);

  useEffect(() => { load(); }, [load]);

  function toggleSort(field: string) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  }

  function sortedDrivers() {
    return [...driverReports].sort((a, b) => {
      const av = (a as Record<string, number | string>)[sortField] as number;
      const bv = (b as Record<string, number | string>)[sortField] as number;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }

  function sortedStops() {
    return [...stopReports].sort((a, b) => {
      const av = (a as Record<string, number | string>)[sortField] as number;
      const bv = (b as Record<string, number | string>)[sortField] as number;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }

  function exportCSV() {
    if (activeTab === 'drivers') {
      const rows = [
        ['Driver', 'Total Stops', 'Avg Stop Duration', 'Avg Travel Time', 'Total Hours', 'Fuel Cost', 'Toll Cost'],
        ...sortedDrivers().map(d => [
          d.driver_name, d.total_stops, fmt(d.avg_stop_duration_min), fmt(d.avg_travel_time_min),
          d.total_hours.toFixed(1), `$${d.total_fuel.toFixed(2)}`, `$${d.total_tolls.toFixed(2)}`,
        ]),
      ];
      download(rows, 'driver_report');
    } else {
      const rows = [
        ['Stop / Vendor', 'Visits', 'Avg Dwell Time', 'Toll per Visit', 'Est. Revenue'],
        ...sortedStops().map(s => [
          s.vendor_name, s.visit_count, fmt(s.avg_dwell_min), `$${s.toll_amount.toFixed(2)}`, `$${s.estimated_revenue.toFixed(2)}`,
        ]),
      ];
      download(rows, 'stop_report');
    }
  }

  function download(rows: (string | number)[][], name: string) {
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${name}_${period}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  }

  const SortIcon = ({ field }: { field: string }) => (
    <span className={`ml-1 text-xs transition-opacity ${sortField === field ? 'opacity-100' : 'opacity-30'}`}>
      {sortField === field && sortDir === 'asc' ? '↑' : '↓'}
    </span>
  );

  const totalDriverStops = driverReports.reduce((a, d) => a + d.total_stops, 0);
  const totalFuel = driverReports.reduce((a, d) => a + d.total_fuel, 0);
  const totalTolls = driverReports.reduce((a, d) => a + d.total_tolls, 0);
  const totalHours = driverReports.reduce((a, d) => a + d.total_hours, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
            <p className="text-gray-500 text-sm mt-0.5">Driver performance, stop analytics, and cost breakdowns</p>
          </div>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-3 mt-5">
          {(['week', 'month', 'year', 'custom'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                period === p
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : p === 'year' ? 'This Year' : 'Custom'}
            </button>
          ))}
          {period === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
              <span className="text-gray-400 text-sm">to</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
          )}
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total Stops', value: totalDriverStops, icon: MapPin, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Total Hours', value: totalHours.toFixed(1) + 'h', icon: Clock, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Fuel Costs', value: '$' + totalFuel.toFixed(2), icon: Fuel, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Toll Costs', value: '$' + totalTolls.toFixed(2), icon: Banknote, color: 'text-rose-600', bg: 'bg-rose-50' },
          ].map(card => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-gray-500 text-sm">{card.label}</span>
                  <div className={`w-8 h-8 ${card.bg} rounded-lg flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 ${card.color}`} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">{loading ? '—' : card.value}</p>
              </div>
            );
          })}
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => { setActiveTab('drivers'); setSortField('total_stops'); }}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'drivers' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Driver Reports
          </button>
          <button
            onClick={() => { setActiveTab('stops'); setSortField('visit_count'); }}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'stops' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Stop Profitability
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin"></div>
            </div>
          ) : activeTab === 'drivers' ? (
            <>
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-gray-400" />
                <h2 className="font-semibold text-gray-800">Driver Performance</h2>
                <span className="ml-auto text-xs text-gray-400">{sortedDrivers().length} drivers</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {[
                        { label: 'Driver', field: 'driver_name', align: 'left' },
                        { label: 'Total Stops', field: 'total_stops', align: 'right' },
                        { label: 'Avg Stop Time', field: 'avg_stop_duration_min', align: 'right' },
                        { label: 'Avg Travel Time', field: 'avg_travel_time_min', align: 'right' },
                        { label: 'Total Hours', field: 'total_hours', align: 'right' },
                        { label: 'Fuel Cost', field: 'total_fuel', align: 'right' },
                        { label: 'Toll Cost', field: 'total_tolls', align: 'right' },
                      ].map(col => (
                        <th
                          key={col.field}
                          onClick={() => toggleSort(col.field)}
                          className={`px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-800 select-none text-${col.align}`}
                        >
                          {col.label}<SortIcon field={col.field} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sortedDrivers().length === 0 ? (
                      <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-400">No data for this period</td></tr>
                    ) : sortedDrivers().map((d, i) => (
                      <tr key={d.driver_name} className={`hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{d.driver_name}</span>
                            <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{d.total_stops}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-gray-700">{d.total_stops}</td>
                        <td className="px-6 py-4 text-right text-gray-700">{fmt(d.avg_stop_duration_min)}</td>
                        <td className="px-6 py-4 text-right text-gray-700">{fmt(d.avg_travel_time_min)}</td>
                        <td className="px-6 py-4 text-right text-gray-700">{d.total_hours > 0 ? d.total_hours.toFixed(1) + 'h' : '—'}</td>
                        <td className="px-6 py-4 text-right text-gray-700">{d.total_fuel > 0 ? '$' + d.total_fuel.toFixed(2) : '—'}</td>
                        <td className="px-6 py-4 text-right text-gray-700">{d.total_tolls > 0 ? '$' + d.total_tolls.toFixed(2) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-gray-400" />
                <h2 className="font-semibold text-gray-800">Stop Profitability</h2>
                <span className="ml-auto text-xs text-gray-400">{sortedStops().length} stops</span>
              </div>
              <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 text-xs text-amber-700 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" />
                Estimated revenue uses a $45/hr rate based on average dwell time per visit, minus toll costs.
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {[
                        { label: 'Stop / Vendor', field: 'vendor_name', align: 'left' },
                        { label: 'Total Visits', field: 'visit_count', align: 'right' },
                        { label: 'Avg Dwell Time', field: 'avg_dwell_min', align: 'right' },
                        { label: 'Toll per Visit', field: 'toll_amount', align: 'right' },
                        { label: 'Est. Revenue', field: 'estimated_revenue', align: 'right' },
                      ].map(col => (
                        <th
                          key={col.field}
                          onClick={() => toggleSort(col.field)}
                          className={`px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-800 select-none text-${col.align}`}
                        >
                          {col.label}<SortIcon field={col.field} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sortedStops().length === 0 ? (
                      <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">No data for this period</td></tr>
                    ) : sortedStops().map((s, i) => (
                      <tr key={s.vendor_name} className={`hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                        <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{s.vendor_name}</td>
                        <td className="px-6 py-4 text-right text-gray-700">{s.visit_count}</td>
                        <td className="px-6 py-4 text-right text-gray-700">{fmt(s.avg_dwell_min)}</td>
                        <td className="px-6 py-4 text-right text-gray-700">{s.toll_amount > 0 ? '$' + s.toll_amount.toFixed(2) : '—'}</td>
                        <td className="px-6 py-4 text-right">
                          <span className={`font-semibold ${s.estimated_revenue >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            ${s.estimated_revenue.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Legend note */}
        <div className="flex flex-wrap gap-6 text-xs text-gray-400 pb-4">
          <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Avg stop time = time between arrival and departure at each stop</span>
          <span className="flex items-center gap-1.5"><ChevronDown className="w-3.5 h-3.5 rotate-90" /> Avg travel time = time between departing one stop and arriving at next</span>
        </div>
      </div>
    </div>
  );
}
