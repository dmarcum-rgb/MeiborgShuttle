import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';

const HOURLY_RATE = 79.00;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type DriverRow = {
  driver_name: string;
  vehicle_number: string;
  dailyHours: (number | null)[];
  totalHours: number;
  fuel: number;
  tolls: number;
  startTimes: (string | null)[];
  endTimes: (string | null)[];
};

type WeekData = {
  weekStart: Date;
  weekEnd: Date;
  drivers: DriverRow[];
  totalFuel: number;
  totalTolls: number;
  subtotal: number;
  grandTotal: number;
};

function getSundayWeekStart(d: Date): Date {
  const sun = new Date(d);
  sun.setDate(d.getDate() - d.getDay());
  sun.setHours(0, 0, 0, 0);
  return sun;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmt(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

function weekLabel(start: Date): string {
  const end = addDays(start, 6);
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function to12hr(time: string | null): string {
  if (!time) return '';
  const [hStr, mStr] = time.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${ampm}`;
}

function blankRow(name: string): DriverRow {
  return {
    driver_name: name,
    vehicle_number: '',
    dailyHours: [null, null, null, null, null, null, null],
    startTimes: [null, null, null, null, null, null, null],
    endTimes: [null, null, null, null, null, null, null],
    totalHours: 0,
    fuel: 0,
    tolls: 0,
  };
}

export function GeodisPreBilling() {
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState<Date>(() => getSundayWeekStart(new Date()));
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [allDriverNames, setAllDriverNames] = useState<string[]>([]);

  useEffect(() => {
    loadAllDrivers();
  }, []);

  useEffect(() => {
    // Wait until we have the driver list before fetching week data
    if (allDriverNames.length > 0) {
      fetchWeek(weekStart);
    }
  }, [weekStart, allDriverNames]);

  const loadAllDrivers = async () => {
    // Collect names from both timesheets and drivers table so we never miss anyone
    const [tsRes, driverRes] = await Promise.all([
      supabase.from('timesheets').select('driver_name').not('driver_name', 'is', null),
      supabase.from('drivers').select('name').eq('status', 'active'),
    ]);

    const fromTimesheets = (tsRes.data ?? []).map((r: any) => r.driver_name as string).filter(Boolean);
    const fromDrivers = (driverRes.data ?? []).map((r: any) => r.name as string).filter(Boolean);

    const merged = Array.from(new Set([...fromDrivers, ...fromTimesheets])).sort();

    // Always seed with known crew — union with anything from DB
    const crew = ['Antonio Cadena', 'Armando Luna', 'Jaime Cuevas'];
    const final = Array.from(new Set([...crew, ...merged])).sort();

    setAllDriverNames(final);
  };

  const fetchWeek = async (sun: Date) => {
    setLoading(true);
    const sat = addDays(sun, 6);
    const startStr = sun.toISOString().split('T')[0];
    const endStr = sat.toISOString().split('T')[0];

    const { data } = await supabase
      .from('timesheets')
      .select('driver_name, vehicle_number, work_date, start_time, end_time, total_hours, fuel_dollars, toll_total')
      .gte('work_date', startStr)
      .lte('work_date', endStr)
      .eq('status', 'approved')
      .order('work_date', { ascending: true });

    // Seed map with ALL known drivers as blank rows first
    const map = new Map<string, DriverRow>();
    for (const name of allDriverNames) {
      map.set(name, blankRow(name));
    }

    // Fill in data from approved timesheets
    for (const ts of data ?? []) {
      const key = ts.driver_name || 'Unknown Driver';
      if (!map.has(key)) {
        map.set(key, blankRow(key));
      }
      const row = map.get(key)!;
      if (ts.vehicle_number && !row.vehicle_number) {
        row.vehicle_number = ts.vehicle_number;
      }
      const dayIdx = new Date(ts.work_date + 'T12:00:00').getDay();
      row.dailyHours[dayIdx] = (row.dailyHours[dayIdx] ?? 0) + Number(ts.total_hours);
      row.totalHours += Number(ts.total_hours);
      row.fuel += Number(ts.fuel_dollars ?? 0);
      row.tolls += Number(ts.toll_total ?? 0);
      row.startTimes[dayIdx] = ts.start_time;
      row.endTimes[dayIdx] = ts.end_time;
    }

    const drivers = Array.from(map.values()).sort((a, b) => a.driver_name.localeCompare(b.driver_name));
    const totalFuel = drivers.reduce((s, d) => s + d.fuel, 0);
    const totalTolls = drivers.reduce((s, d) => s + d.tolls, 0);
    const subtotal = drivers.reduce((s, d) => s + d.totalHours * HOURLY_RATE, 0);
    const grandTotal = subtotal + totalFuel + totalTolls;

    setWeekData({ weekStart: sun, weekEnd: sat, drivers, totalFuel, totalTolls, subtotal, grandTotal });
    setLoading(false);
  };

  const prevWeek = () => setWeekStart(w => addDays(w, -7));
  const nextWeek = () => setWeekStart(w => addDays(w, 7));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 font-serif">Geodis Pre-Billing</h1>
          <p className="text-gray-500 text-sm mt-0.5">Weekly billing preview — approved timesheets only · $79.00/hr</p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-all"
        >
          <Printer className="w-4 h-4" />
          Print
        </button>
      </div>

      {/* Week navigator */}
      <div className="flex items-center gap-3">
        <button onClick={prevWeek} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 transition-all">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-800 min-w-[220px] text-center">
          Week of {weekLabel(weekStart)}
        </div>
        <button onClick={nextWeek} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 transition-all">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
        </div>
      ) : weekData && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Company header */}
          <div className="bg-gray-900 text-white px-6 py-4 flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-0.5">Bill To</p>
              <p className="font-semibold text-lg">Logisnext / Geodis</p>
              <p className="text-gray-300 text-sm">Houston Production</p>
              <p className="text-gray-400 text-xs mt-0.5">Attn: Damon Gobble</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-0.5">From</p>
              <p className="font-semibold">Meiborg Shuttles</p>
              <p className="text-gray-300 text-sm">240 N Prospect St</p>
              <p className="text-gray-400 text-xs">Marengo, IL 60152</p>
              <p className="text-gray-300 text-sm mt-2">
                <span className="text-gray-400">Week Ending: </span>
                {fmt(weekData.weekEnd)}
              </p>
            </div>
          </div>

          {/* Billing table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-300">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Rate Schedule</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Driver / Truck #</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">Fuel</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">Tolls</th>
                  {DAYS.map(d => (
                    <th key={d} className="text-center px-2 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wider w-20">{d}</th>
                  ))}
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Reg Hrs</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">Rate</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {weekData.drivers.map((driver, i) => {
                  const lineTotal = driver.totalHours * HOURLY_RATE;
                  const hasData = driver.totalHours > 0 || driver.fuel > 0 || driver.tolls > 0;
                  return (
                    <tr key={driver.driver_name} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                      <td className="px-4 py-3 text-xs text-gray-500 font-medium whitespace-nowrap">
                        40 hr – Shuttle Driver {i + 1}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <p className={`font-medium ${hasData ? 'text-gray-900' : 'text-gray-500'}`}>{driver.driver_name}</p>
                        {driver.vehicle_number && (
                          <p className="text-xs text-gray-400">Truck #{driver.vehicle_number}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-xs whitespace-nowrap">
                        {driver.fuel > 0
                          ? <span className="text-gray-700">($${driver.fuel.toFixed(2)})</span>
                          : <span className="text-gray-300">($ —)</span>}
                      </td>
                      <td className="px-3 py-3 text-right text-xs whitespace-nowrap">
                        {driver.tolls > 0
                          ? <span className="text-gray-700">($${driver.tolls.toFixed(2)})</span>
                          : <span className="text-gray-300">($ —)</span>}
                      </td>
                      {driver.dailyHours.map((h, di) => (
                        <td key={di} className="px-2 py-3 text-center align-top">
                          {h != null ? (
                            <div>
                              <p className="text-gray-900 font-semibold text-sm">{h.toFixed(2)}</p>
                              {driver.startTimes[di] && (
                                <p className="text-gray-400 leading-tight" style={{ fontSize: '10px' }}>{to12hr(driver.startTimes[di])}</p>
                              )}
                              {driver.endTimes[di] && (
                                <p className="text-gray-400 leading-tight" style={{ fontSize: '10px' }}>{to12hr(driver.endTimes[di])}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-200 text-xs">—</span>
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right font-semibold whitespace-nowrap">
                        {hasData
                          ? <span className="text-gray-900">{driver.totalHours.toFixed(2)}</span>
                          : <span className="text-gray-300">0.00</span>}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-500 text-xs whitespace-nowrap">
                        ${HOURLY_RATE.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                        {hasData
                          ? <span className="text-gray-900">${lineTotal.toFixed(2)}</span>
                          : <span className="text-gray-300">$0.00</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 border-t-2 border-gray-300">
                  <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Daily Totals
                  </td>
                  {DAYS.map((_, di) => {
                    const dayTotal = weekData.drivers.reduce((s, d) => s + (d.dailyHours[di] ?? 0), 0);
                    return (
                      <td key={di} className="px-2 py-2.5 text-center text-sm font-semibold text-gray-800">
                        {dayTotal > 0 ? dayTotal.toFixed(2) : <span className="text-gray-300">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-right font-bold text-gray-900">
                    {weekData.drivers.reduce((s, d) => s + d.totalHours, 0).toFixed(2)}
                  </td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Summary */}
          <div className="border-t border-gray-200 px-6 py-5 flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal (labor)</span>
                <span className="font-medium text-gray-900">${weekData.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Fuel</span>
                <span className="font-medium text-gray-700">
                  {weekData.totalFuel > 0 ? `($${weekData.totalFuel.toFixed(2)})` : <span className="text-gray-400">($ —)</span>}
                </span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Tolls</span>
                <span className="font-medium text-gray-700">
                  {weekData.totalTolls > 0 ? `($${weekData.totalTolls.toFixed(2)})` : <span className="text-gray-400">($ —)</span>}
                </span>
              </div>
              <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-300 pt-2">
                <span>Total</span>
                <span>${weekData.grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
