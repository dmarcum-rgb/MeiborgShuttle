import { useState, useEffect, Fragment } from 'react';
import { supabase } from '../lib/supabase';
import { ChevronLeft, ChevronRight, FileSpreadsheet, ChevronDown, MapPin, Clock, Coffee, ExternalLink } from 'lucide-react';
import XLSX from 'xlsx-js-style';

const HOURLY_RATE = 79.00;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type StopDetail = {
  vendor: string;
  city: string;
  arrive: string;
  depart: string;
  delay: string;
};

type DayDetail = {
  date: string;
  start: string | null;
  end: string | null;
  lunchStart: string | null;
  lunchEnd: string | null;
  hours: number;
  notes: string;
  fuel: number;
  stops: StopDetail[];
  fuelReceiptUrls: string[];
  tollReceiptUrls: string[];
};

type DriverRow = {
  driver_name: string;
  vehicle_number: string;
  dailyHours: (number | null)[];
  totalHours: number;
  fuel: number;
  tolls: number;
  startTimes: (string | null)[];
  endTimes: (string | null)[];
  fuelReceiptUrls: string[];
  tollReceiptUrls: string[];
  days: (DayDetail | null)[];
  stopCount: number;
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
    fuelReceiptUrls: [],
    tollReceiptUrls: [],
    days: [null, null, null, null, null, null, null],
    stopCount: 0,
  };
}

function lunchMinutes(ls: string | null, le: string | null): number {
  if (!ls || !le) return 0;
  const toMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  return Math.max(0, toMins(le) - toMins(ls));
}

// Supporting-data text shown when Geodis hovers a day's hours cell in the export
function dayProof(day: DayDetail): string {
  const lm = lunchMinutes(day.lunchStart, day.lunchEnd);
  const lines: string[] = [];
  lines.push(`Start: ${to12hr(day.start) || '—'}    End: ${to12hr(day.end) || '—'}`);
  if (lm > 0) lines.push(`Lunch: ${lm} min deducted`);
  lines.push(`Total: ${day.hours.toFixed(2)} hrs`);
  if (day.fuel > 0) lines.push(`Fuel: $${day.fuel.toFixed(2)}${day.fuelReceiptUrls.length ? ' (receipt on file)' : ''}`);
  if (day.stops.length > 0) {
    lines.push('', `Stops (${day.stops.length}):`);
    for (const s of day.stops) {
      let l = `• ${s.vendor || '—'}`;
      if (s.city) l += ` — ${s.city}`;
      if (s.arrive || s.depart) l += ` (${to12hr(s.arrive) || '—'}–${to12hr(s.depart) || '—'})`;
      if (s.delay) l += ` [delay: ${s.delay}]`;
      lines.push(l);
    }
  } else {
    lines.push('', 'No stops recorded');
  }
  if (day.notes) lines.push('', `Note: ${day.notes}`);
  return lines.join('\n');
}

export function GeodisPreBilling() {
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState<Date>(() => getSundayWeekStart(new Date()));
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [allDriverNames, setAllDriverNames] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

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
      .select('id, driver_name, vehicle_number, work_date, start_time, end_time, total_hours, lunch_start, lunch_end, notes, fuel_dollars, toll_total')
      .gte('work_date', startStr)
      .lte('work_date', endStr)
      .eq('status', 'approved')
      .order('work_date', { ascending: true });

    // Fetch receipt images for all timesheets in this week
    const timesheetIds = (data ?? []).map((ts: any) => ts.id);
    const receiptImagesByTs = new Map<string, { receipt_type: string; storage_path: string }[]>();
    // Stops (suppliers visited) for all timesheets in this week — the audit backup Geodis needs
    const stopsByTs = new Map<string, StopDetail[]>();
    if (timesheetIds.length > 0) {
      const [{ data: images }, { data: stops }] = await Promise.all([
        supabase
          .from('receipt_images')
          .select('timesheet_id, receipt_type, storage_path')
          .in('timesheet_id', timesheetIds),
        supabase
          .from('timesheet_stops')
          .select('timesheet_id, vendor_name, city_address, arrive_time, departure_time, delay_reason, sort_order')
          .in('timesheet_id', timesheetIds)
          .order('sort_order', { ascending: true }),
      ]);
      for (const img of images ?? []) {
        if (!receiptImagesByTs.has(img.timesheet_id)) receiptImagesByTs.set(img.timesheet_id, []);
        receiptImagesByTs.get(img.timesheet_id)!.push(img);
      }
      for (const s of stops ?? []) {
        if (!stopsByTs.has(s.timesheet_id)) stopsByTs.set(s.timesheet_id, []);
        stopsByTs.get(s.timesheet_id)!.push({
          vendor: s.vendor_name ?? '',
          city: s.city_address ?? '',
          arrive: s.arrive_time ?? '',
          depart: s.departure_time ?? '',
          delay: s.delay_reason ?? '',
        });
      }
    }

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

      const stops = stopsByTs.get(ts.id) ?? [];
      row.stopCount += stops.length;

      // Attach receipt image signed URLs (bucket is private, signed URLs expire in 1 hour)
      const dayFuelUrls: string[] = [];
      const dayTollUrls: string[] = [];
      const imgs = receiptImagesByTs.get(ts.id) ?? [];
      for (const img of imgs) {
        const { data: urlData } = await supabase.storage
          .from('receipts')
          .createSignedUrl(img.storage_path, 3600);
        if (urlData?.signedUrl) {
          if (img.receipt_type === 'fuel') { row.fuelReceiptUrls.push(urlData.signedUrl); dayFuelUrls.push(urlData.signedUrl); }
          else if (img.receipt_type === 'toll') { row.tollReceiptUrls.push(urlData.signedUrl); dayTollUrls.push(urlData.signedUrl); }
        }
      }

      // Per-day detail powers the drill-down and the Excel proof-on-hover comments
      row.days[dayIdx] = {
        date: ts.work_date,
        start: ts.start_time || null,
        end: ts.end_time || null,
        lunchStart: ts.lunch_start || null,
        lunchEnd: ts.lunch_end || null,
        hours: Number(ts.total_hours),
        notes: ts.notes ?? '',
        fuel: Number(ts.fuel_dollars ?? 0),
        stops,
        fuelReceiptUrls: dayFuelUrls,
        tollReceiptUrls: dayTollUrls,
      };
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
      v: 'GEODIS BILLING',
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
      v: `Week Ending: ${fmt(weekData.weekEnd)}   |   Bill To: Logisnext / Geodis, Houston Production, 240 N Prospect St, Marengo IL 60152 — Attn: Kimberly Rote   |   From: Meiborg, 2210 Harrison Ave, Rockford, IL 61104`,
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
    const dataStartRow = row;
    weekData.drivers.forEach((d, i) => {
      const even = i % 2 === 0;
      const lineTotal = d.totalHours * HOURLY_RATE;
      const cols: { v: string | number; t: 's' | 'n'; s: object; l?: object; c?: any }[] = [
        { v: `40 hr – Shuttle Driver ${i + 1}`, t: 's', s: dataRowLeftStyle(even) },
        { v: d.driver_name, t: 's', s: { ...dataRowLeftStyle(even), font: { bold: true, color: { rgb: '111827' }, sz: 10 } } },
        { v: d.vehicle_number || '—', t: 's', s: dataRowStyles(even) },
        {
          v: d.fuel > 0 ? d.fuel : '',
          t: d.fuel > 0 ? 'n' : 's',
          s: {
            ...moneyStyle(even),
            numFmt: d.fuel > 0 ? '"($"#,##0.00")"' : undefined,
            font: d.fuelReceiptUrls.length > 0
              ? { color: { rgb: '1D4ED8' }, underline: true, sz: 10 }
              : { color: { rgb: '111827' }, sz: 10 },
          },
          ...(d.fuelReceiptUrls.length > 0 ? {
            l: {
              Target: d.fuelReceiptUrls[0],
              Tooltip: d.fuelReceiptUrls.length === 1
                ? 'View fuel receipt'
                : `View fuel receipts (${d.fuelReceiptUrls.length} images):\n${d.fuelReceiptUrls.join('\n')}`,
            },
          } : {}),
        },
        {
          v: d.tolls > 0 ? d.tolls : '',
          t: d.tolls > 0 ? 'n' : 's',
          s: {
            ...moneyStyle(even),
            numFmt: d.tolls > 0 ? '"($"#,##0.00")"' : undefined,
            font: d.tollReceiptUrls.length > 0
              ? { color: { rgb: '1D4ED8' }, underline: true, sz: 10 }
              : { color: { rgb: '111827' }, sz: 10 },
          },
          ...(d.tollReceiptUrls.length > 0 ? {
            l: {
              Target: d.tollReceiptUrls[0],
              Tooltip: d.tollReceiptUrls.length === 1
                ? 'View toll receipt'
                : `View toll receipts (${d.tollReceiptUrls.length} images):\n${d.tollReceiptUrls.join('\n')}`,
            },
          } : {}),
        },
        ...d.days.map((day, di) => {
          const h = d.dailyHours[di];
          const cellObj: { v: string | number; t: 's' | 'n'; s: object; c?: any } = {
            v: h != null ? h : '',
            t: h != null ? 'n' as const : 's' as const,
            s: { ...dataRowStyles(even), numFmt: h != null ? '0.00' : undefined },
          };
          if (day) {
            const c: any = [{ a: 'Meiborg', t: dayProof(day) }];
            c.hidden = true; // show on hover, not always
            cellObj.c = c;
          }
          return cellObj;
        }),
        { v: d.totalHours > 0 ? d.totalHours : '', t: d.totalHours > 0 ? 'n' : 's', s: { ...dataRowStyles(even), font: { bold: true, color: { rgb: '111827' }, sz: 10 }, numFmt: '0.00' } },
        { v: HOURLY_RATE, t: 'n', s: { ...moneyStyle(even), numFmt: '$#,##0.00' } },
        { v: lineTotal > 0 ? lineTotal : '', t: lineTotal > 0 ? 'n' : 's', s: { ...moneyStyle(even), font: { bold: true, color: { rgb: '111827' }, sz: 10 }, numFmt: '$#,##0.00' } },
      ];
      cols.forEach((c, ci) => {
        ws[XLSX.utils.encode_cell({ r: row - 1, c: ci })] = c;
      });
      row++;
    });
    const dataEndRow = row - 1;

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
    // Subtotal uses a SUM formula over the Total column (col O = index 14) for all driver rows
    const totalCol = XLSX.utils.encode_col(NCOLS - 1);
    const subtotalFormula = `SUM(${totalCol}${dataStartRow}:${totalCol}${dataEndRow})`;

    ws[XLSX.utils.encode_cell({ r: row - 1, c: NCOLS - 2 })] = { v: 'Subtotal (labor)', t: 's', s: summaryLabelStyle };
    ws[XLSX.utils.encode_cell({ r: row - 1, c: NCOLS - 1 })] = { v: weekData.subtotal, f: subtotalFormula, t: 'n', s: summaryValueStyle };
    row++;

    const remainingItems = [
      { label: 'Fuel', value: weekData.totalFuel },
      { label: 'Tolls', value: weekData.totalTolls },
    ];
    for (const item of remainingItems) {
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

    // ── Stops Detail sheet — pull-anytime audit backup of where every driver went ──
    const stopRows: (string | number)[][] = [[
      'Date', 'Driver', 'Truck #', 'Supplier / Vendor', 'City / Address', 'Arrive', 'Depart', 'Day Hours', 'Delay Reason',
    ]];
    for (const d of weekData.drivers) {
      d.days.forEach((day) => {
        if (!day || day.stops.length === 0) return;
        const dateStr = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
        day.stops.forEach((s, si) => {
          stopRows.push([
            si === 0 ? dateStr : '',
            si === 0 ? d.driver_name : '',
            si === 0 ? (d.vehicle_number || '—') : '',
            s.vendor || '',
            s.city || '',
            to12hr(s.arrive),
            to12hr(s.depart),
            si === 0 ? day.hours : '',
            s.delay || '',
          ]);
        });
      });
    }
    const wsStops = XLSX.utils.aoa_to_sheet(stopRows);
    wsStops['!cols'] = [
      { wch: 12 }, { wch: 20 }, { wch: 9 }, { wch: 28 }, { wch: 28 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 26 },
    ];
    const stopHdrStyle = {
      fill: { fgColor: { rgb: '1F2937' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: thinBorder,
    };
    for (let c = 0; c < 9; c++) {
      const ref = XLSX.utils.encode_cell({ r: 0, c });
      if (wsStops[ref]) (wsStops[ref] as any).s = stopHdrStyle;
    }
    XLSX.utils.book_append_sheet(wb, wsStops, 'Stops Detail');

    const weekStr = weekData.weekStart.toISOString().split('T')[0];
    XLSX.writeFile(wb, `Geodis_Billing_${weekStr}.xlsx`);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-light text-mist tracking-tight">Geodis Pre-Billing</h1>
          <p className="text-faint text-sm mt-0.5">Weekly billing preview — approved timesheets only · $79.00/hr</p>
        </div>
        <button
          onClick={exportToExcel}
          disabled={!weekData}
          className="gbtn-ghost flex items-center gap-2 px-3 py-2 text-sm disabled:opacity-40"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Export to Excel
        </button>
      </div>

      {/* Week navigator */}
      <div className="flex items-center gap-3">
        <button onClick={prevWeek} className="p-2 rounded-lg border border-edge text-faint hover:bg-glass2 transition-all">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="px-4 py-2 card rounded-lg text-sm font-medium text-mist min-w-[220px] text-center">
          Week of {weekLabel(weekStart)}
        </div>
        <button onClick={nextWeek} className="p-2 rounded-lg border border-edge text-faint hover:bg-glass2 transition-all">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-edge border-t-signal rounded-full animate-spin" />
        </div>
      ) : weekData && (
        <div className="card overflow-hidden">
          {/* Company header */}
          <div className="bg-[#1b1f27] text-mist px-6 py-4 flex items-start justify-between border-b border-edge">
            <div>
              <p className="text-xs text-faint uppercase tracking-widest mb-0.5">Bill To</p>
              <p className="font-semibold text-lg">Logisnext / Geodis</p>
              <p className="text-dim text-sm">Houston Production</p>
              <p className="text-dim text-sm">240 N Prospect St</p>
              <p className="text-faint text-xs">Marengo, IL 60152</p>
              <p className="text-faint text-xs mt-0.5">Attn: Kimberly Rote</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-faint uppercase tracking-widest mb-0.5">From</p>
              <p className="font-semibold">Meiborg</p>
              <p className="text-dim text-sm">2210 Harrison Ave</p>
              <p className="text-faint text-xs">Rockford, IL 61104</p>
              <p className="text-dim text-sm mt-2">
                <span className="text-faint">Week Ending: </span>
                {fmt(weekData.weekEnd)}
              </p>
            </div>
          </div>

          {/* Billing table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[rgba(23,26,32,0.94)] backdrop-blur border-b border-edge">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-faint uppercase tracking-wider whitespace-nowrap">Rate Schedule</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-faint uppercase tracking-wider whitespace-nowrap">Driver / Truck #</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-faint uppercase tracking-wider">Fuel</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-faint uppercase tracking-wider">Tolls</th>
                  {DAYS.map(d => (
                    <th key={d} className="text-center px-2 py-2.5 text-xs font-semibold text-faint uppercase tracking-wider w-20">{d}</th>
                  ))}
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-faint uppercase tracking-wider whitespace-nowrap">Reg Hrs</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-faint uppercase tracking-wider">Rate</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-faint uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {weekData.drivers.map((driver, i) => {
                  const lineTotal = driver.totalHours * HOURLY_RATE;
                  const hasData = driver.totalHours > 0 || driver.fuel > 0 || driver.tolls > 0;
                  const isOpen = expanded === driver.driver_name;
                  const workedDays = driver.days.filter(Boolean) as DayDetail[];
                  return (
                    <Fragment key={driver.driver_name}>
                    <tr
                      className={`${i % 2 === 0 ? '' : 'bg-glass2'} ${hasData ? 'cursor-pointer hover:bg-glass2' : ''} ${isOpen ? 'bg-glass2' : ''}`}
                      onClick={hasData ? () => setExpanded(isOpen ? null : driver.driver_name) : undefined}
                    >
                      <td className="px-4 py-3 text-xs text-faint font-medium whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {hasData && <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? '' : '-rotate-90'}`} />}
                          40 hr – Shuttle Driver {i + 1}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <p className={`font-medium ${hasData ? 'text-mist' : 'text-faint'}`}>{driver.driver_name}</p>
                        <div className="flex items-center gap-2">
                          {driver.vehicle_number && (
                            <p className="text-xs text-faint">Truck #{driver.vehicle_number}</p>
                          )}
                          {driver.stopCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-signal">
                              <MapPin className="w-3 h-3" />{driver.stopCount} stop{driver.stopCount === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-xs whitespace-nowrap">
                        {driver.fuel > 0
                          ? <span className="text-dim">($${driver.fuel.toFixed(2)})</span>
                          : <span className="text-faint">($ —)</span>}
                      </td>
                      <td className="px-3 py-3 text-right text-xs whitespace-nowrap">
                        {driver.tolls > 0
                          ? <span className="text-dim">($${driver.tolls.toFixed(2)})</span>
                          : <span className="text-faint">($ —)</span>}
                      </td>
                      {driver.dailyHours.map((h, di) => (
                        <td key={di} className="px-2 py-3 text-center align-top">
                          {h != null ? (
                            <div>
                              <p className="text-mist font-semibold text-sm">{h.toFixed(2)}</p>
                              {driver.startTimes[di] && (
                                <p className="text-faint leading-tight" style={{ fontSize: '10px' }}>{to12hr(driver.startTimes[di])}</p>
                              )}
                              {driver.endTimes[di] && (
                                <p className="text-faint leading-tight" style={{ fontSize: '10px' }}>{to12hr(driver.endTimes[di])}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-faint text-xs">—</span>
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right font-semibold whitespace-nowrap">
                        {hasData
                          ? <span className="text-mist">{driver.totalHours.toFixed(2)}</span>
                          : <span className="text-faint">0.00</span>}
                      </td>
                      <td className="px-3 py-3 text-right text-faint text-xs whitespace-nowrap">
                        ${HOURLY_RATE.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                        {hasData
                          ? <span className="text-mist">${lineTotal.toFixed(2)}</span>
                          : <span className="text-faint">$0.00</span>}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-[#14171d]">
                        <td colSpan={14} className="px-4 py-4 border-b border-edge2">
                          <p className="text-xs uppercase tracking-widest text-faint mb-3">
                            {driver.driver_name} · daily detail — hours, lunch, and stops
                          </p>
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {workedDays.map((day, di) => {
                              const lm = lunchMinutes(day.lunchStart, day.lunchEnd);
                              const dateObj = new Date(day.date + 'T12:00:00');
                              return (
                                <div key={di} className="rounded-xl border border-edge bg-glass2 p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-mist text-sm font-semibold">
                                      {dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                                    </p>
                                    <span className="text-signal text-sm font-semibold">{day.hours.toFixed(2)} hrs</span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mb-2">
                                    <span className="inline-flex items-center gap-1 text-dim"><Clock className="w-3 h-3 text-faint" />{to12hr(day.start) || '—'} – {to12hr(day.end) || '—'}</span>
                                    {lm > 0 && <span className="inline-flex items-center gap-1 text-faint"><Coffee className="w-3 h-3" />{lm} min lunch deducted</span>}
                                    {day.fuel > 0 && (
                                      day.fuelReceiptUrls[0]
                                        ? <a href={day.fuelReceiptUrls[0]} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 text-signal hover:underline">Fuel (${day.fuel.toFixed(2)}) <ExternalLink className="w-3 h-3" /></a>
                                        : <span className="text-faint">Fuel (${day.fuel.toFixed(2)})</span>
                                    )}
                                  </div>
                                  {day.stops.length > 0 ? (
                                    <ul className="space-y-1">
                                      {day.stops.map((s, si) => (
                                        <li key={si} className="flex items-start gap-2 text-xs">
                                          <MapPin className="w-3 h-3 text-faint mt-0.5 flex-shrink-0" />
                                          <span className="text-dim">
                                            <span className="text-mist font-medium">{s.vendor || '—'}</span>
                                            {s.city && <span className="text-faint"> · {s.city}</span>}
                                            {(s.arrive || s.depart) && <span className="text-faint"> · {to12hr(s.arrive) || '—'}–{to12hr(s.depart) || '—'}</span>}
                                            {s.delay && <span className="text-bad"> · delay: {s.delay}</span>}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="text-faint text-xs">No stops recorded</p>
                                  )}
                                  {day.notes && <p className="text-faint text-xs mt-2 italic">Note: {day.notes}</p>}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-glass2 border-t-2 border-edge2">
                  <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-faint uppercase tracking-wider">
                    Daily Totals
                  </td>
                  {DAYS.map((_, di) => {
                    const dayTotal = weekData.drivers.reduce((s, d) => s + (d.dailyHours[di] ?? 0), 0);
                    return (
                      <td key={di} className="px-2 py-2.5 text-center text-sm font-semibold text-dim">
                        {dayTotal > 0 ? dayTotal.toFixed(2) : <span className="text-faint">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-right font-bold text-mist">
                    {weekData.drivers.reduce((s, d) => s + d.totalHours, 0).toFixed(2)}
                  </td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Summary */}
          <div className="border-t border-edge px-6 py-5 flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm text-dim">
                <span>Subtotal (labor)</span>
                <span className="font-medium text-mist">${weekData.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-dim">
                <span>Fuel</span>
                <span className="font-medium text-dim">
                  {weekData.totalFuel > 0 ? `($${weekData.totalFuel.toFixed(2)})` : <span className="text-faint">($ —)</span>}
                </span>
              </div>
              <div className="flex justify-between text-sm text-dim">
                <span>Tolls</span>
                <span className="font-medium text-dim">
                  {weekData.totalTolls > 0 ? `($${weekData.totalTolls.toFixed(2)})` : <span className="text-faint">($ —)</span>}
                </span>
              </div>
              <div className="flex justify-between text-lg font-light text-mist border-t border-edge2 pt-2">
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
