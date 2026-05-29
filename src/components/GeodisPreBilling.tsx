import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ChevronLeft, ChevronRight, FileSpreadsheet } from 'lucide-react';
import XLSX from 'xlsx-js-style';

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

  const exportToExcel = () => {
    if (!weekData) return;

    // ── Style helpers ──────────────────────────────────────────────────────────
    const thinBorder = {
      top:    { style: 'thin', color: { rgb: 'BBBBBB' } },
      bottom: { style: 'thin', color: { rgb: 'BBBBBB' } },
      left:   { style: 'thin', color: { rgb: 'BBBBBB' } },
      right:  { style: 'thin', color: { rgb: 'BBBBBB' } },
    };
    const thickBorder = {
      top:    { style: 'medium', color: { rgb: '555555' } },
      bottom: { style: 'medium', color: { rgb: '555555' } },
      left:   { style: 'medium', color: { rgb: '555555' } },
      right:  { style: 'medium', color: { rgb: '555555' } },
    };

    const cell = (
      v: string | number | null,
      t: 's' | 'n',
      s: object = {}
    ) => ({ v: v ?? '', t, s: { border: thinBorder, ...s } });

    const headerStyle = {
      fill: { fgColor: { rgb: '1F2937' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: thickBorder,
    };
    const subHeaderStyle = {
      fill: { fgColor: { rgb: '374151' } },
      font: { bold: true, color: { rgb: 'F9FAFB' }, sz: 9 },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: thickBorder,
    };
    const colHeaderStyle = {
      fill: { fgColor: { rgb: 'F3F4F6' } },
      font: { bold: true, color: { rgb: '111827' }, sz: 9 },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: thinBorder,
    };
    const totalsStyle = {
      fill: { fgColor: { rgb: 'E5E7EB' } },
      font: { bold: true, color: { rgb: '111827' }, sz: 10 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: thinBorder,
    };
    const summaryLabelStyle = {
      fill: { fgColor: { rgb: 'F9FAFB' } },
      font: { bold: true, color: { rgb: '374151' }, sz: 10 },
      alignment: { horizontal: 'right' },
      border: thinBorder,
    };
    const summaryValueStyle = {
      fill: { fgColor: { rgb: 'F9FAFB' } },
      font: { bold: true, color: { rgb: '111827' }, sz: 10 },
      alignment: { horizontal: 'right' },
      border: thinBorder,
      numFmt: '$#,##0.00',
    };
    const grandTotalLabelStyle = {
      fill: { fgColor: { rgb: '1F2937' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
      alignment: { horizontal: 'right' },
      border: thickBorder,
    };
    const grandTotalValueStyle = {
      fill: { fgColor: { rgb: '1F2937' } },
      font: { bold: true, color: { rgb: 'F59E0B' }, sz: 11 },
      alignment: { horizontal: 'right' },
      border: thickBorder,
      numFmt: '$#,##0.00',
    };

    // ── Number of columns: Rate Schedule, Driver, Truck, Fuel, Tolls, 7 days, Reg Hrs, Rate, Total = 14
    const NCOLS = 14;
    const dataRowStyles = (even: boolean) => ({
      fill: { fgColor: { rgb: even ? 'FFFFFF' : 'F9FAFB' } },
      font: { color: { rgb: '111827' }, sz: 10 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: thinBorder,
    });
    const dataRowLeftStyle = (even: boolean) => ({
      ...dataRowStyles(even),
      alignment: { horizontal: 'left', vertical: 'center' },
    });
    const moneyStyle = (even: boolean) => ({
      ...dataRowStyles(even),
      numFmt: '$#,##0.00',
    });

    const wb = XLSX.utils.book_new();
    const ws: Record<string, unknown> = {};

    let row = 1; // 1-indexed

    // ── Row 1: Title ──────────────────────────────────────────────────────────
    ws[XLSX.utils.encode_cell({ r: row - 1, c: 0 })] = {
      v: 'MEIBORG SHUTTLES – GEODIS PRE-BILLING',
      t: 's',
      s: {
        fill: { fgColor: { rgb: '1F2937' } },
        font: { bold: true, color: { rgb: 'F59E0B' }, sz: 14 },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: thickBorder,
      },
    };
    ws['!merges'] = [{ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: NCOLS - 1 } }];
    row++;

    // ── Row 2: Billing period ─────────────────────────────────────────────────
    ws[XLSX.utils.encode_cell({ r: row - 1, c: 0 })] = {
      v: `Week Ending: ${fmt(weekData.weekEnd)}   |   Bill To: Logisnext / Geodis, Houston Production — Attn: Damon Gobble   |   From: Meiborg Shuttles, 240 N Prospect St, Marengo, IL 60152`,
      t: 's',
      s: subHeaderStyle,
    };
    (ws['!merges'] as object[]).push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: NCOLS - 1 } });
    row++;

    // ── Row 3: blank spacer ───────────────────────────────────────────────────
    row++;

    // ── Row 4: Column headers ─────────────────────────────────────────────────
    const colHeaders = [
      'Rate Schedule', 'Driver', 'Truck #', 'Fuel', 'Tolls',
      ...DAYS,
      'Reg Hrs', 'Rate', 'Total',
    ];
    colHeaders.forEach((h, c) => {
      ws[XLSX.utils.encode_cell({ r: row - 1, c })] = { v: h, t: 's', s: colHeaderStyle };
    });
    row++;

    // ── Data rows ─────────────────────────────────────────────────────────────
    weekData.drivers.forEach((d, i) => {
      const even = i % 2 === 0;
      const lineTotal = d.totalHours * HOURLY_RATE;
      const cols: { v: string | number; t: 's' | 'n'; s: object }[] = [
        { v: `40 hr – Shuttle Driver ${i + 1}`, t: 's', s: dataRowLeftStyle(even) },
        { v: d.driver_name, t: 's', s: { ...dataRowLeftStyle(even), font: { bold: true, color: { rgb: '111827' }, sz: 10 } } },
        { v: d.vehicle_number || '—', t: 's', s: dataRowStyles(even) },
        { v: d.fuel > 0 ? d.fuel : '', t: d.fuel > 0 ? 'n' : 's', s: { ...moneyStyle(even), numFmt: d.fuel > 0 ? '"($"#,##0.00")"' : undefined } },
        { v: d.tolls > 0 ? d.tolls : '', t: d.tolls > 0 ? 'n' : 's', s: { ...moneyStyle(even), numFmt: d.tolls > 0 ? '"($"#,##0.00")"' : undefined } },
        ...d.dailyHours.map(h => ({
          v: h != null ? h : '',
          t: h != null ? 'n' as const : 's' as const,
          s: { ...dataRowStyles(even), numFmt: h != null ? '0.00' : undefined },
        })),
        { v: d.totalHours > 0 ? d.totalHours : '', t: d.totalHours > 0 ? 'n' : 's', s: { ...dataRowStyles(even), font: { bold: true, color: { rgb: '111827' }, sz: 10 }, numFmt: '0.00' } },
        { v: HOURLY_RATE, t: 'n', s: { ...moneyStyle(even), numFmt: '$#,##0.00' } },
        { v: lineTotal > 0 ? lineTotal : '', t: lineTotal > 0 ? 'n' : 's', s: { ...moneyStyle(even), font: { bold: true, color: { rgb: '111827' }, sz: 10 }, numFmt: '$#,##0.00' } },
      ];
      cols.forEach((c, ci) => {
        ws[XLSX.utils.encode_cell({ r: row - 1, c: ci })] = c;
      });
      row++;
    });

    // ── Daily totals row ──────────────────────────────────────────────────────
    const dailyTotals = DAYS.map((_, di) =>
      weekData.drivers.reduce((s, d) => s + (d.dailyHours[di] ?? 0), 0)
    );
    const totalsRowCells = [
      { v: 'Daily Totals', t: 's', s: { ...totalsStyle, alignment: { horizontal: 'left' } } },
      { v: '', t: 's', s: totalsStyle },
      { v: '', t: 's', s: totalsStyle },
      { v: '', t: 's', s: totalsStyle },
      { v: '', t: 's', s: totalsStyle },
      ...dailyTotals.map(t => ({ v: t > 0 ? t : '', t: t > 0 ? 'n' as const : 's' as const, s: { ...totalsStyle, numFmt: '0.00' } })),
      { v: weekData.drivers.reduce((s, d) => s + d.totalHours, 0), t: 'n' as const, s: { ...totalsStyle, numFmt: '0.00' } },
      { v: '', t: 's', s: totalsStyle },
      { v: '', t: 's', s: totalsStyle },
    ];
    totalsRowCells.forEach((c, ci) => {
      ws[XLSX.utils.encode_cell({ r: row - 1, c: ci })] = c;
    });
    row++;

    // ── Spacer ────────────────────────────────────────────────────────────────
    row++;

    // ── Summary block (right-aligned, last 2 cols) ────────────────────────────
    const summaryItems = [
      { label: 'Subtotal (labor)', value: weekData.subtotal },
      { label: 'Fuel', value: weekData.totalFuel },
      { label: 'Tolls', value: weekData.totalTolls },
    ];
    for (const item of summaryItems) {
      ws[XLSX.utils.encode_cell({ r: row - 1, c: NCOLS - 2 })] = { v: item.label, t: 's', s: summaryLabelStyle };
      ws[XLSX.utils.encode_cell({ r: row - 1, c: NCOLS - 1 })] = { v: item.value, t: 'n', s: summaryValueStyle };
      row++;
    }
    // Grand total row
    ws[XLSX.utils.encode_cell({ r: row - 1, c: NCOLS - 2 })] = { v: 'TOTAL DUE', t: 's', s: grandTotalLabelStyle };
    ws[XLSX.utils.encode_cell({ r: row - 1, c: NCOLS - 1 })] = { v: weekData.grandTotal, t: 'n', s: grandTotalValueStyle };

    // ── Sheet range ───────────────────────────────────────────────────────────
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row - 1, c: NCOLS - 1 } });

    // ── Column widths ─────────────────────────────────────────────────────────
    ws['!cols'] = [
      { wch: 26 }, { wch: 22 }, { wch: 9 }, { wch: 10 }, { wch: 10 },
      ...DAYS.map(() => ({ wch: 8 })),
      { wch: 9 }, { wch: 8 }, { wch: 12 },
    ];

    // ── Row heights ───────────────────────────────────────────────────────────
    ws['!rows'] = [
      { hpt: 30 },  // title
      { hpt: 22 },  // billing info
      { hpt: 6 },   // spacer
      { hpt: 28 },  // col headers
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Pre-Billing');

    const weekStr = weekData.weekStart.toISOString().split('T')[0];
    XLSX.writeFile(wb, `Geodis_PreBilling_${weekStr}.xlsx`);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 font-serif">Geodis Pre-Billing</h1>
          <p className="text-gray-500 text-sm mt-0.5">Weekly billing preview — approved timesheets only · $79.00/hr</p>
        </div>
        <button
          onClick={exportToExcel}
          disabled={!weekData}
          className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-all"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Export to Excel
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
