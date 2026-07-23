import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { BarChart2, Clock, DollarSign, TrendingUp, ChevronDown, Download, Fuel, Banknote, MapPin, Package } from 'lucide-react';

type Period = 'week' | 'month' | 'year' | 'custom';

type HnisLoad = {
  id: string;
  driver_name: string;
  load_number: string;
  log_date: string;
  supplier_name: string;
  supplier_address: string;
  departure_time_to_supplier: string | null;
  arrival_time_to_supplier: string | null;
  departure_time_from_supplier: string | null;
  arrival_time_to_plant: string | null;
  tolls_accrued: number | null;
  notes: string;
};

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
  const [activeTab, setActiveTab] = useState<'drivers' | 'stops' | 'hnis'>('drivers');
  const [hnisLoads, setHnisLoads] = useState<HnisLoad[]>([]);
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

    const [routeLogsRes, timesheetsRes, fuelRes, tollReceiptsRes, driverNamesRes] = await Promise.all([
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
      supabase.rpc('get_driver_names'),
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

    // Map auth user id → display name via SECURITY DEFINER function (sees all drivers)
    const driverIdToName: Record<string, string> = {};
    for (const d of driverNamesRes.data ?? []) {
      if (d.display_name && !/^\d+$/.test(d.display_name)) {
        driverIdToName[d.driver_id] = d.display_name;
      }
    }

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
      const name = driverIdToName[driverId];
      if (!name) continue;
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

    // --- HNIS loads ---
    const { data: hnisData } = await supabase
      .from('hnis_loads')
      .select('*')
      .gte('log_date', from.toISOString().split('T')[0])
      .lte('log_date', to.toISOString().split('T')[0])
      .order('log_date', { ascending: false });
    setHnisLoads(hnisData ?? []);

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
    } else if (activeTab === 'stops') {
      const rows = [
        ['Stop / Vendor', 'Visits', 'Avg Dwell Time', 'Toll per Visit', 'Est. Revenue'],
        ...sortedStops().map(s => [
          s.vendor_name, s.visit_count, fmt(s.avg_dwell_min), `$${s.toll_amount.toFixed(2)}`, `$${s.estimated_revenue.toFixed(2)}`,
        ]),
      ];
      download(rows, 'stop_report');
    } else {
      const rows = [
        ['Driver', 'Load #', 'Date', 'Supplier', 'Supplier Address', 'Depart to Supplier', 'Arrive at Supplier', 'Depart from Supplier', 'Arrive at Plant', 'Tolls', 'Notes'],
        ...hnisLoads.map(h => [
          h.driver_name,
          h.load_number,
          new Date(h.log_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
          h.supplier_name,
          h.supplier_address,
          h.departure_time_to_supplier ?? '',
          h.arrival_time_to_supplier ?? '',
          h.departure_time_from_supplier ?? '',
          h.arrival_time_to_plant ?? '',
          h.tolls_accrued != null ? `$${Number(h.tolls_accrued).toFixed(2)}` : '',
          h.notes,
        ]),
      ];
      download(rows, 'hnis_loads_report');
    }
  }

  function download(rows: (string | number)[][], name: string) {
    const { from, to } = getPeriodRange(period, customFrom, customTo);
    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${name}_${fromStr}_to_${toStr}.csv`;
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
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-edge px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-light text-mist tracking-tight">Reports</h1>
            <p className="text-faint text-sm mt-1">Driver performance, stop analytics, and cost breakdowns</p>
          </div>
          <button
            onClick={exportCSV}
            className="gbtn flex items-center gap-2 px-4 py-2.5 text-sm font-medium"
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
                  ? 'bg-signal text-[#1a1205] border-signal'
                  : 'text-dim border-edge hover:border-edge2'
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
                className="ginput px-3 py-1.5 text-sm text-mist"
              />
              <span className="text-faint text-sm">to</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="ginput px-3 py-1.5 text-sm text-mist"
              />
            </div>
          )}
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total Stops', value: totalDriverStops, icon: MapPin, color: 'text-signal', bg: 'bg-signal-dim' },
            { label: 'Total Hours', value: totalHours.toFixed(1) + 'h', icon: Clock, color: 'text-ok', bg: 'bg-[rgba(75,211,160,0.12)]' },
            { label: 'Fuel Costs', value: '$' + totalFuel.toFixed(2), icon: Fuel, color: 'text-signal', bg: 'bg-signal-dim' },
            { label: 'Toll Costs', value: '$' + totalTolls.toFixed(2), icon: Banknote, color: 'text-bad', bg: 'bg-[rgba(255,107,107,0.12)]' },
          ].map(card => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-faint text-sm">{card.label}</span>
                  <div className={`w-8 h-8 ${card.bg} rounded-lg flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 ${card.color}`} />
                  </div>
                </div>
                <p className="text-2xl font-semibold text-mist">{loading ? '—' : card.value}</p>
              </div>
            );
          })}
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-glass2 p-1 rounded-lg w-fit border border-edge">
          <button
            onClick={() => { setActiveTab('drivers'); setSortField('total_stops'); }}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'drivers' ? 'bg-signal text-[#1a1205]' : 'text-faint hover:text-mist'
            }`}
          >
            Driver Reports
          </button>
          <button
            onClick={() => { setActiveTab('stops'); setSortField('visit_count'); }}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'stops' ? 'bg-signal text-[#1a1205]' : 'text-faint hover:text-mist'
            }`}
          >
            Stop Profitability
          </button>
          <button
            onClick={() => { setActiveTab('hnis'); setSortField('log_date'); }}
            className={`flex items-center gap-1.5 px-5 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'hnis' ? 'bg-signal text-[#1a1205]' : 'text-faint hover:text-mist'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            HNIS Loads
            {hnisLoads.length > 0 && (
              <span className="ml-1 text-xs font-semibold bg-signal-dim text-signal px-1.5 py-0.5 rounded-full">{hnisLoads.length}</span>
            )}
          </button>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-edge border-t-signal rounded-full animate-spin"></div>
            </div>
          ) : activeTab === 'hnis' ? (
            <>
              <div className="px-6 py-4 border-b border-edge flex items-center gap-2">
                <Package className="w-5 h-5 text-signal" />
                <h2 className="font-semibold text-mist">HNIS Load Logs</h2>
                <span className="ml-auto text-xs text-faint">{hnisLoads.length} load{hnisLoads.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[rgba(23,26,32,0.94)] backdrop-blur border-b border-edge">
                      {[
                        'Driver', 'Load #', 'Date', 'Supplier', 'Supplier Address',
                        'Depart → Supplier', 'Arrive at Supplier', 'Depart from Supplier', 'Arrive at Plant', 'Tolls',
                      ].map(col => (
                        <th key={col} className="px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide text-left whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {hnisLoads.length === 0 ? (
                      <tr><td colSpan={10} className="px-6 py-12 text-center text-faint">No HNIS loads for this period</td></tr>
                    ) : hnisLoads.map((h, i) => (
                      <tr key={h.id} className={`hover:bg-glass2 transition-colors ${i % 2 === 0 ? '' : 'bg-glass2'}`}>
                        <td className="px-4 py-3 font-medium text-mist whitespace-nowrap">{h.driver_name}</td>
                        <td className="px-4 py-3 text-dim font-mono">{h.load_number || '—'}</td>
                        <td className="px-4 py-3 text-dim whitespace-nowrap">
                          {new Date(h.log_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 text-mist font-medium">{h.supplier_name || '—'}</td>
                        <td className="px-4 py-3 text-dim max-w-[160px] truncate" title={h.supplier_address}>{h.supplier_address || '—'}</td>
                        <td className="px-4 py-3 text-dim font-mono">{h.departure_time_to_supplier ?? '—'}</td>
                        <td className="px-4 py-3 text-dim font-mono">{h.arrival_time_to_supplier ?? '—'}</td>
                        <td className="px-4 py-3 text-dim font-mono">{h.departure_time_from_supplier ?? '—'}</td>
                        <td className="px-4 py-3 text-dim font-mono">{h.arrival_time_to_plant ?? '—'}</td>
                        <td className="px-4 py-3 text-bad font-medium">
                          {h.tolls_accrued != null && Number(h.tolls_accrued) > 0 ? `$${Number(h.tolls_accrued).toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : activeTab === 'drivers' ? (
            <>
              <div className="px-6 py-4 border-b border-edge flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-faint" />
                <h2 className="font-semibold text-mist">Driver Performance</h2>
                <span className="ml-auto text-xs text-faint">{sortedDrivers().length} drivers</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[rgba(23,26,32,0.94)] backdrop-blur border-b border-edge">
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
                          className={`px-6 py-3 text-xs font-semibold text-faint uppercase tracking-wide cursor-pointer hover:text-mist select-none text-${col.align}`}
                        >
                          {col.label}<SortIcon field={col.field} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {sortedDrivers().length === 0 ? (
                      <tr><td colSpan={7} className="px-6 py-12 text-center text-faint">No data for this period</td></tr>
                    ) : sortedDrivers().map((d, i) => (
                      <tr key={d.driver_name} className={`hover:bg-glass2 transition-colors ${i % 2 === 0 ? '' : 'bg-glass2'}`}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-mist">{d.driver_name}</span>
                            <span className="text-xs font-semibold bg-glass2 text-dim px-2 py-0.5 rounded-full">{d.total_stops}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-dim">{d.total_stops}</td>
                        <td className="px-6 py-4 text-right text-dim">{fmt(d.avg_stop_duration_min)}</td>
                        <td className="px-6 py-4 text-right text-dim">{fmt(d.avg_travel_time_min)}</td>
                        <td className="px-6 py-4 text-right text-dim">{d.total_hours > 0 ? d.total_hours.toFixed(1) + 'h' : '—'}</td>
                        <td className="px-6 py-4 text-right text-dim">{d.total_fuel > 0 ? '$' + d.total_fuel.toFixed(2) : '—'}</td>
                        <td className="px-6 py-4 text-right text-dim">{d.total_tolls > 0 ? '$' + d.total_tolls.toFixed(2) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className="px-6 py-4 border-b border-edge flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-faint" />
                <h2 className="font-semibold text-mist">Stop Profitability</h2>
                <span className="ml-auto text-xs text-faint">{sortedStops().length} stops</span>
              </div>
              <div className="px-6 py-3 bg-signal-dim border-b border-edge text-xs text-signal flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" />
                Estimated revenue uses a $45/hr rate based on average dwell time per visit, minus toll costs.
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[rgba(23,26,32,0.94)] backdrop-blur border-b border-edge">
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
                          className={`px-6 py-3 text-xs font-semibold text-faint uppercase tracking-wide cursor-pointer hover:text-mist select-none text-${col.align}`}
                        >
                          {col.label}<SortIcon field={col.field} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {sortedStops().length === 0 ? (
                      <tr><td colSpan={5} className="px-6 py-12 text-center text-faint">No data for this period</td></tr>
                    ) : sortedStops().map((s, i) => (
                      <tr key={s.vendor_name} className={`hover:bg-glass2 transition-colors ${i % 2 === 0 ? '' : 'bg-glass2'}`}>
                        <td className="px-6 py-4 font-medium text-mist whitespace-nowrap">{s.vendor_name}</td>
                        <td className="px-6 py-4 text-right text-dim">{s.visit_count}</td>
                        <td className="px-6 py-4 text-right text-dim">{fmt(s.avg_dwell_min)}</td>
                        <td className="px-6 py-4 text-right text-dim">{s.toll_amount > 0 ? '$' + s.toll_amount.toFixed(2) : '—'}</td>
                        <td className="px-6 py-4 text-right">
                          <span className={`font-semibold ${s.estimated_revenue >= 0 ? 'text-ok' : 'text-bad'}`}>
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
        <div className="flex flex-wrap gap-6 text-xs text-faint pb-4">
          <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Avg stop time = time between arrival and departure at each stop</span>
          <span className="flex items-center gap-1.5"><ChevronDown className="w-3.5 h-3.5 rotate-90" /> Avg travel time = time between departing one stop and arriving at next</span>
        </div>
      </div>
    </div>
  );
}
