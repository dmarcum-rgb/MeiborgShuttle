import { useState, useEffect, useRef, Fragment } from 'react';
import { supabase } from '../lib/supabase';
import { parseTollWorkbook, ParsedTollSheet } from '../lib/tollSheet';
import { useAuth } from '../hooks/useAuth';
import {
  FileSpreadsheet, UploadCloud, Trash2, ChevronDown, Check, X, Truck, AlertTriangle, Loader2,
} from 'lucide-react';

type UploadRow = {
  id: string;
  filename: string;
  account: string;
  period_start: string | null;
  period_end: string | null;
  transaction_count: number;
  total_amount: number;
  uploaded_at: string;
};

type TruckSummary = { truck_id: string; count: number; total: number };

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function TollSheets() {
  const { user } = useAuth();
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedTollSheet | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [truckSummaries, setTruckSummaries] = useState<Record<string, TruckSummary[]>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadUploads();
  }, []);

  const loadUploads = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('toll_uploads')
      .select('id, filename, account, period_start, period_end, transaction_count, total_amount, uploaded_at')
      .order('period_start', { ascending: false, nullsFirst: false })
      .order('uploaded_at', { ascending: false });
    setUploads((data as UploadRow[]) ?? []);
    setLoading(false);
  };

  const handleFile = async (file: File) => {
    setError(null);
    setPreview(null);
    setParsing(true);
    try {
      const parsed = await parseTollWorkbook(file);
      setPreview(parsed);
    } catch (e: any) {
      setError(e?.message ?? 'Could not read that file.');
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const saveUpload = async () => {
    if (!preview) return;
    setSaving(true);
    setError(null);
    try {
      const { data: upload, error: upErr } = await supabase
        .from('toll_uploads')
        .insert({
          filename: preview.fileName,
          account: preview.account,
          period_start: preview.periodStart,
          period_end: preview.periodEnd,
          transaction_count: preview.transactions.length,
          total_amount: preview.totalAmount,
          uploaded_by: user?.id ?? null,
        })
        .select('id')
        .single();
      if (upErr || !upload) throw upErr ?? new Error('Insert failed.');

      const rows = preview.transactions.map((t) => ({
        upload_id: upload.id,
        truck_id: t.truck_id,
        post_date: t.post_date,
        invoice_date: t.invoice_date,
        source: t.source,
        read_type: t.read_type,
        device_id: t.device_id,
        agency: t.agency,
        entry_plaza: t.entry_plaza,
        exit_plaza: t.exit_plaza,
        exit_date: t.exit_date,
        exit_time: t.exit_time,
        toll_class: t.toll_class,
        amount: t.amount,
      }));
      // Insert in chunks so a large sheet (hundreds of rows) does not hit limits.
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error: rowErr } = await supabase.from('master_tolls').insert(rows.slice(i, i + CHUNK));
        if (rowErr) {
          // Roll back the batch so we never leave a half-saved upload.
          await supabase.from('toll_uploads').delete().eq('id', upload.id);
          throw rowErr;
        }
      }
      setPreview(null);
      await loadUploads();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save the toll sheet.');
    } finally {
      setSaving(false);
    }
  };

  const deleteUpload = async (id: string) => {
    if (!confirm('Delete this toll sheet and all its transactions? This affects Geodis billing for its period.')) return;
    await supabase.from('toll_uploads').delete().eq('id', id);
    setExpanded((e) => (e === id ? null : e));
    await loadUploads();
  };

  const toggleExpand = async (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!truckSummaries[id]) {
      const { data } = await supabase
        .from('master_tolls')
        .select('truck_id, amount')
        .eq('upload_id', id);
      const map = new Map<string, TruckSummary>();
      for (const r of (data as { truck_id: string; amount: number }[]) ?? []) {
        const cur = map.get(r.truck_id) ?? { truck_id: r.truck_id, count: 0, total: 0 };
        cur.count += 1;
        cur.total += Number(r.amount);
        map.set(r.truck_id, cur);
      }
      const summary = Array.from(map.values()).sort((a, b) => b.total - a.total);
      setTruckSummaries((s) => ({ ...s, [id]: summary }));
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-light text-mist tracking-tight">Toll Sheets</h1>
        <p className="text-faint text-sm mt-0.5">
          Upload the toll-provider master sheet — it becomes the authoritative toll amount on Geodis billing, matched to each driver by truck &amp; date.
        </p>
      </div>

      {/* Upload / preview */}
      {!preview ? (
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="card rounded-2xl border border-dashed border-edge2 p-10 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-glass2 transition-all"
        >
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onInputChange} />
          {parsing ? (
            <>
              <Loader2 className="w-9 h-9 text-signal animate-spin mb-3" />
              <p className="text-mist font-medium">Reading toll sheet…</p>
            </>
          ) : (
            <>
              <UploadCloud className="w-9 h-9 text-faint mb-3" />
              <p className="text-mist font-medium">Drop the toll sheet here, or click to choose</p>
              <p className="text-faint text-xs mt-1">.xlsx export from the toll provider (Customer Toll Details)</p>
            </>
          )}
        </div>
      ) : (
        <div className="card rounded-2xl overflow-hidden">
          <div className="bg-[#1b1f27] px-6 py-4 border-b border-edge flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 text-signal" />
              <div>
                <p className="text-mist font-semibold">{preview.fileName}</p>
                <p className="text-faint text-xs">
                  {preview.account ? `Account ${preview.account} · ` : ''}
                  {fmtDate(preview.periodStart)} – {fmtDate(preview.periodEnd)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreview(null)}
                disabled={saving}
                className="gbtn-ghost flex items-center gap-2 px-3 py-2 text-sm disabled:opacity-40"
              >
                <X className="w-4 h-4" /> Discard
              </button>
              <button
                onClick={saveUpload}
                disabled={saving}
                className="gbtn flex items-center gap-2 px-3 py-2 text-sm disabled:opacity-40"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? 'Saving…' : 'Save toll sheet'}
              </button>
            </div>
          </div>

          {/* Preview stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-edge border-b border-edge">
            <Stat label="Transactions" value={preview.transactions.length.toLocaleString()} />
            <Stat label="Total tolls" value={money(preview.totalAmount)} accent />
            <Stat label="Trucks" value={String(preview.truckSummary.length)} />
            <Stat label="Period" value={`${fmtDate(preview.periodStart)}`} sub={`to ${fmtDate(preview.periodEnd)}`} />
          </div>

          {/* Per-truck breakdown */}
          <div className="p-5">
            <p className="text-xs uppercase tracking-widest text-faint mb-3">Per-truck breakdown</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {preview.truckSummary.map((t) => (
                <div key={t.truck_id} className="flex items-center justify-between rounded-lg border border-edge bg-glass2 px-3 py-2">
                  <span className="flex items-center gap-2 text-mist text-sm">
                    <Truck className="w-3.5 h-3.5 text-faint" /> Truck #{t.truck_id}
                  </span>
                  <span className="text-dim text-sm">
                    {money(t.total)} <span className="text-faint text-xs">· {t.count}</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="text-faint text-xs mt-4 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              This sheet covers all Meiborg trucks. Only trucks matched to a shuttle driver (by truck # &amp; date) are billed to Geodis — the rest are excluded automatically.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Uploaded sheets */}
      <div className="card rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-edge">
          <h2 className="text-mist font-medium">Uploaded sheets</h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-2 border-edge border-t-signal rounded-full animate-spin" />
          </div>
        ) : uploads.length === 0 ? (
          <p className="text-faint text-sm px-6 py-10 text-center">No toll sheets uploaded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-faint border-b border-edge">
                <th className="px-6 py-3 font-semibold">Period</th>
                <th className="px-3 py-3 font-semibold">File</th>
                <th className="px-3 py-3 font-semibold text-right">Transactions</th>
                <th className="px-3 py-3 font-semibold text-right">Total</th>
                <th className="px-3 py-3 font-semibold">Uploaded</th>
                <th className="px-6 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {uploads.map((u) => {
                const isOpen = expanded === u.id;
                return (
                  <Fragment key={u.id}>
                    <tr className={`hover:bg-glass2 cursor-pointer ${isOpen ? 'bg-glass2' : ''}`} onClick={() => toggleExpand(u.id)}>
                      <td className="px-6 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-mist font-medium">
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                          {fmtDate(u.period_start)} – {fmtDate(u.period_end)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-dim">{u.filename}</td>
                      <td className="px-3 py-3 text-right text-dim">{u.transaction_count.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right text-mist font-medium">{money(Number(u.total_amount))}</td>
                      <td className="px-3 py-3 text-faint text-xs whitespace-nowrap">
                        {new Date(u.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteUpload(u.id); }}
                          className="text-faint hover:text-bad transition-colors p-1"
                          title="Delete toll sheet"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-[#14171d]">
                        <td colSpan={6} className="px-6 py-4 border-b border-edge2">
                          <p className="text-xs uppercase tracking-widest text-faint mb-3">Per-truck breakdown</p>
                          {!truckSummaries[u.id] ? (
                            <p className="text-faint text-xs">Loading…</p>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {truckSummaries[u.id].map((t) => (
                                <div key={t.truck_id} className="flex items-center justify-between rounded-lg border border-edge bg-glass2 px-3 py-2">
                                  <span className="flex items-center gap-2 text-mist text-sm">
                                    <Truck className="w-3.5 h-3.5 text-faint" /> Truck #{t.truck_id}
                                  </span>
                                  <span className="text-dim text-sm">
                                    {money(t.total)} <span className="text-faint text-xs">· {t.count}</span>
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs uppercase tracking-widest text-faint mb-1">{label}</p>
      <p className={`text-lg font-semibold ${accent ? 'text-signal' : 'text-mist'}`}>{value}</p>
      {sub && <p className="text-faint text-xs">{sub}</p>}
    </div>
  );
}
