import XLSX from 'xlsx-js-style';

/**
 * Parses the official toll-provider workbook ("Customer Toll Details" for
 * Meiborg Bros, account 206789). The "Original Data" sheet holds every toll
 * transaction; we locate the header row by name (robust to layout shifts) and
 * pull one record per row keyed by Truck ID + Exit Date.
 */

export type TollTxn = {
  truck_id: string;
  post_date: string | null;   // YYYY-MM-DD
  invoice_date: string | null;
  source: string;
  read_type: string;
  device_id: string;
  agency: string;
  entry_plaza: string;
  exit_plaza: string;
  exit_date: string | null;   // YYYY-MM-DD (attribution / week key)
  exit_time: string;          // HH:MM
  toll_class: string;
  amount: number;
};

export type ParsedTollSheet = {
  fileName: string;
  account: string;
  periodStart: string | null; // YYYY-MM-DD
  periodEnd: string | null;
  totalAmount: number;
  transactions: TollTxn[];
  truckSummary: { truck_id: string; count: number; total: number }[];
};

function norm(v: unknown): string {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Extract a YYYY-MM-DD date from a Date, an Excel serial number, or a string. */
function toYMD(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (typeof v === 'number' && isFinite(v)) {
    // Excel serial date -> JS date (via SheetJS helper if available)
    const parsed = (XLSX as any).SSF?.parse_date_code?.(v);
    if (parsed && parsed.y) return `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}`;
    return null;
  }
  const s = String(v).trim();
  if (!s) return null;
  // ISO-ish: 2026-07-13 or 2026-07-13T...
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // US: 7/13/2026 or 07/13/2026
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (us) {
    let [, mo, da, yr] = us;
    if (yr.length === 2) yr = `20${yr}`;
    return `${yr}-${pad(Number(mo))}-${pad(Number(da))}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return null;
}

/** Extract HH:MM (24h) from a Date or a time-ish string. */
function toHM(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${pad(v.getHours())}:${pad(v.getMinutes())}`;
  }
  const s = String(v ?? '').trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) return `${pad(Number(m[1]))}:${m[2]}`;
  return '';
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(/[$,]/g, '').trim());
  return isFinite(n) ? n : 0;
}

// Header label -> internal field. Matched against normalized header cells.
const HEADER_MAP: Record<string, keyof TollTxn | 'entry_date' | 'entry_time'> = {
  'post date': 'post_date',
  'invoice date': 'invoice_date',
  'source': 'source',
  'read type': 'read_type',
  'toll device id or plate': 'device_id',
  'truck id': 'truck_id',
  'agency': 'agency',
  'entry plaza': 'entry_plaza',
  'exit plaza': 'exit_plaza',
  'exit date': 'exit_date',
  'exit time': 'exit_time',
  'cl': 'toll_class',
  'toll $': 'amount',
};

export async function parseTollWorkbook(file: File): Promise<ParsedTollSheet> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });

  // Prefer the "Original Data" sheet (the complete flat dataset).
  const dataSheetName =
    wb.SheetNames.find((n) => norm(n) === 'original data') ??
    wb.SheetNames.find((n) => norm(n).includes('original')) ??
    wb.SheetNames[0];
  const ws = wb.Sheets[dataSheetName];
  if (!ws) throw new Error('No worksheet found in this workbook.');

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: '',
  });

  // Find the header row: contains both "truck id" and "toll $".
  let headerRowIdx = -1;
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r].map(norm);
    if (cells.includes('truck id') && cells.includes('toll $')) {
      headerRowIdx = r;
      break;
    }
  }
  if (headerRowIdx === -1) {
    throw new Error(
      'Could not find the toll data header (expected "Truck ID" and "Toll $"). Make sure this is the toll-provider export.'
    );
  }

  // Map field -> column index from the header row.
  const colOf: Partial<Record<string, number>> = {};
  rows[headerRowIdx].forEach((h, c) => {
    const field = HEADER_MAP[norm(h)];
    if (field && colOf[field] === undefined) colOf[field] = c;
  });

  if (colOf.truck_id === undefined || colOf.amount === undefined) {
    throw new Error('Toll sheet is missing the Truck ID or Toll $ column.');
  }

  const get = (row: unknown[], field: string): unknown => {
    const c = colOf[field];
    return c === undefined ? '' : row[c];
  };

  const transactions: TollTxn[] = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const truck = cellStr(get(row, 'truck_id'));
    const amtRaw = get(row, 'amount');
    // Skip subtotal / blank rows: no truck id, or no numeric amount.
    if (!truck) continue;
    const amount = toNum(amtRaw);
    if (!amount) continue;

    transactions.push({
      truck_id: truck,
      post_date: toYMD(get(row, 'post_date')),
      invoice_date: toYMD(get(row, 'invoice_date')),
      source: cellStr(get(row, 'source')),
      read_type: cellStr(get(row, 'read_type')),
      device_id: cellStr(get(row, 'device_id')),
      agency: cellStr(get(row, 'agency')),
      entry_plaza: cellStr(get(row, 'entry_plaza')),
      exit_plaza: cellStr(get(row, 'exit_plaza')),
      exit_date: toYMD(get(row, 'exit_date')),
      exit_time: toHM(get(row, 'exit_time')),
      toll_class: cellStr(get(row, 'toll_class')),
      amount,
    });
  }

  if (transactions.length === 0) {
    throw new Error('No toll transactions were found in this workbook.');
  }

  // Account + period from the Masterfile sheet params, falling back to the data.
  let account = '';
  let periodStart: string | null = null;
  let periodEnd: string | null = null;

  const masterName = wb.SheetNames.find((n) => norm(n).includes('masterfile'));
  if (masterName) {
    const mrows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[masterName], {
      header: 1,
      raw: true,
      blankrows: false,
      defval: '',
    });
    for (const row of mrows) {
      // Label is somewhere in the row; value is the next non-empty cell after it.
      for (let c = 0; c < row.length; c++) {
        const label = norm(row[c]);
        const valueAfter = () => {
          for (let k = c + 1; k < row.length; k++) {
            if (cellStr(row[k])) return row[k];
          }
          return '';
        };
        if (label === 'account' && !account) account = cellStr(valueAfter());
        else if (label === 'start date' && !periodStart) periodStart = toYMD(valueAfter());
        else if (label === 'end date' && !periodEnd) periodEnd = toYMD(valueAfter());
      }
    }
  }

  const exitDates = transactions.map((t) => t.exit_date).filter(Boolean) as string[];
  exitDates.sort();
  if (!periodStart && exitDates.length) periodStart = exitDates[0];
  if (!periodEnd && exitDates.length) periodEnd = exitDates[exitDates.length - 1];

  const totalAmount = transactions.reduce((s, t) => s + t.amount, 0);

  const truckMap = new Map<string, { count: number; total: number }>();
  for (const t of transactions) {
    const cur = truckMap.get(t.truck_id) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += t.amount;
    truckMap.set(t.truck_id, cur);
  }
  const truckSummary = Array.from(truckMap.entries())
    .map(([truck_id, v]) => ({ truck_id, ...v }))
    .sort((a, b) => b.total - a.total);

  return {
    fileName: file.name,
    account,
    periodStart,
    periodEnd,
    totalAmount,
    transactions,
    truckSummary,
  };
}
