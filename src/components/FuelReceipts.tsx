import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit, Trash2, X, Fuel, Truck, FileText, Image, ChevronLeft, ChevronRight } from 'lucide-react';

type FuelRow = {
  id: string;
  source: 'timesheet' | 'manual';
  date: string;
  driver_name: string;
  vehicle_number: string;
  gallons: number | null;
  amount: number | null;
  location: string;
  receipt_number: string;
  timesheet_id?: string;
  receiptImageUrls: string[];
};

type ManualFormData = {
  driver_name: string;
  vehicle_number: string;
  date: string;
  amount: string;
  gallons: string;
  location: string;
  receipt_number: string;
};

const BLANK_FORM: ManualFormData = {
  driver_name: '',
  vehicle_number: '',
  date: new Date().toISOString().split('T')[0],
  amount: '',
  gallons: '',
  location: '',
  receipt_number: '',
};

export function FuelReceipts() {
  const [rows, setRows] = useState<FuelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ManualFormData>(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);

    const [tsRes, manualRes] = await Promise.all([
      supabase
        .from('timesheets')
        .select('id, driver_name, vehicle_number, work_date, fuel_gallons, fuel_dollars')
        .not('fuel_gallons', 'is', null)
        .gt('fuel_gallons', 0)
        .order('work_date', { ascending: false }),
      supabase
        .from('fuel_receipts')
        .select('*')
        .order('date', { ascending: false }),
    ]);

    const timesheetIds = (tsRes.data ?? []).map((t: any) => t.id);
    const imagesByTs = new Map<string, string[]>();
    if (timesheetIds.length > 0) {
      const { data: imgs } = await supabase
        .from('receipt_images')
        .select('timesheet_id, storage_path')
        .eq('receipt_type', 'fuel')
        .in('timesheet_id', timesheetIds);
      for (const img of imgs ?? []) {
        const { data: signed } = await supabase.storage
          .from('receipts')
          .createSignedUrl(img.storage_path, 3600);
        if (signed?.signedUrl) {
          if (!imagesByTs.has(img.timesheet_id)) imagesByTs.set(img.timesheet_id, []);
          imagesByTs.get(img.timesheet_id)!.push(signed.signedUrl);
        }
      }
    }

    const tsRows: FuelRow[] = (tsRes.data ?? []).map((t: any) => ({
      id: t.id,
      source: 'timesheet',
      date: t.work_date,
      driver_name: t.driver_name,
      vehicle_number: t.vehicle_number,
      gallons: t.fuel_gallons ? Number(t.fuel_gallons) : null,
      amount: t.fuel_dollars ? Number(t.fuel_dollars) : null,
      location: '',
      receipt_number: '',
      timesheet_id: t.id,
      receiptImageUrls: imagesByTs.get(t.id) ?? [],
    }));

    const manualRows: FuelRow[] = (manualRes.data ?? []).map((r: any) => ({
      id: r.id,
      source: 'manual',
      date: r.date,
      driver_name: r.driver_name ?? '',
      vehicle_number: r.vehicle_number ?? '',
      gallons: r.gallons ? Number(r.gallons) : null,
      amount: r.amount ? Number(r.amount) : null,
      location: r.location ?? '',
      receipt_number: r.receipt_number ?? '',
      receiptImageUrls: [],
    }));

    const all = [...tsRows, ...manualRows].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    setRows(all);
    setLoading(false);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(BLANK_FORM);
    setShowModal(true);
  };

  const openEdit = (row: FuelRow) => {
    if (row.source !== 'manual') return;
    setEditingId(row.id);
    setForm({
      driver_name: row.driver_name,
      vehicle_number: row.vehicle_number,
      date: row.date,
      amount: row.amount != null ? String(row.amount) : '',
      gallons: row.gallons != null ? String(row.gallons) : '',
      location: row.location,
      receipt_number: row.receipt_number,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(BLANK_FORM);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      driver_name: form.driver_name.trim(),
      vehicle_number: form.vehicle_number.trim(),
      date: form.date,
      amount: form.amount ? parseFloat(form.amount) : null,
      gallons: form.gallons ? parseFloat(form.gallons) : null,
      location: form.location.trim(),
      receipt_number: form.receipt_number.trim(),
    };
    if (editingId) {
      await supabase.from('fuel_receipts').update(payload).eq('id', editingId);
    } else {
      await supabase.from('fuel_receipts').insert([payload]);
    }
    await fetchData();
    closeModal();
    setSaving(false);
  };

  const handleDelete = async (row: FuelRow) => {
    if (row.source !== 'manual') return;
    if (!confirm('Delete this fuel receipt?')) return;
    setDeleting(row.id);
    await supabase.from('fuel_receipts').delete().eq('id', row.id);
    setRows(r => r.filter(x => x.id !== row.id));
    setDeleting(null);
  };

  const totalGallons = rows.reduce((s, r) => s + (r.gallons ?? 0), 0);
  const totalAmount = rows.reduce((s, r) => s + (r.amount ?? 0), 0);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  const inputCls = 'w-full px-3 py-2.5 ginput text-sm';
  const labelCls = 'block text-sm font-medium text-dim mb-1.5';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-light tracking-tight text-mist">Fuel Receipts</h1>
          <p className="text-faint text-sm mt-0.5">Track fuel purchases for all drivers</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 gbtn text-sm font-medium transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Receipt
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="w-9 h-9 bg-signal-dim rounded-lg flex items-center justify-center mb-3">
            <Fuel className="w-4 h-4 text-signal" />
          </div>
          <p className="text-2xl font-semibold text-mist">{fmt(totalAmount)}</p>
          <p className="text-xs text-faint mt-0.5">Total Fuel Expenses</p>
        </div>
        <div className="card p-4">
          <div className="w-9 h-9 bg-glass2 rounded-lg flex items-center justify-center mb-3">
            <Fuel className="w-4 h-4 text-dim" />
          </div>
          <p className="text-2xl font-semibold text-mist">{totalGallons.toFixed(3)} gal</p>
          <p className="text-xs text-faint mt-0.5">Total Gallons</p>
        </div>
        <div className="card p-4">
          <div className="w-9 h-9 bg-glass2 rounded-lg flex items-center justify-center mb-3">
            <FileText className="w-4 h-4 text-faint" />
          </div>
          <p className="text-2xl font-semibold text-mist">{rows.length}</p>
          <p className="text-xs text-faint mt-0.5">Total Entries</p>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-edge border-t-signal rounded-full animate-spin" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[rgba(23,26,32,0.94)] backdrop-blur border-b border-edge">
                <tr>
                  {['Date', 'Driver', 'Truck #', 'Location', 'Gallons', 'Amount', 'Receipt', 'Source', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-faint uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-faint">
                      <Fuel className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No fuel receipts recorded yet.
                    </td>
                  </tr>
                ) : rows.map(row => (
                  <tr key={`${row.source}-${row.id}`} className="hover:bg-glass2 transition-colors">
                    <td className="px-4 py-3 text-mist whitespace-nowrap font-medium">
                      {new Date(row.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-mist">
                      <div className="flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 text-faint flex-shrink-0" />
                        {row.driver_name || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-dim">
                      {row.vehicle_number ? `#${row.vehicle_number}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-dim">
                      {row.location || '—'}
                    </td>
                    <td className="px-4 py-3 text-dim whitespace-nowrap">
                      {row.gallons != null ? `${row.gallons.toFixed(3)} gal` : '—'}
                    </td>
                    <td className="px-4 py-3 text-signal font-semibold whitespace-nowrap">
                      {row.amount != null ? fmt(row.amount) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {row.receiptImageUrls.length > 0 ? (
                        <button
                          onClick={() => setLightbox({ urls: row.receiptImageUrls, index: 0 })}
                          className="flex items-center gap-1.5 text-signal hover:brightness-110 transition-all group"
                        >
                          <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-edge group-hover:border-edge2 transition-colors flex-shrink-0">
                            <img
                              src={row.receiptImageUrls[0]}
                              alt="Receipt"
                              className="w-full h-full object-cover"
                            />
                            {row.receiptImageUrls.length > 1 && (
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                <span className="text-white text-xs font-semibold">+{row.receiptImageUrls.length - 1}</span>
                              </div>
                            )}
                          </div>
                          <span className="text-xs font-medium">
                            {row.receiptImageUrls.length === 1 ? 'View' : `${row.receiptImageUrls.length} imgs`}
                          </span>
                        </button>
                      ) : (
                        <span className="text-faint text-xs">
                          {row.receipt_number || '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.source === 'timesheet' ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-glass2 text-dim font-medium">
                          <FileText className="w-3 h-3" /> Timesheet
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-glass2 text-faint font-medium">
                          Manual
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {row.source === 'manual' && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(row)}
                            className="p-1.5 text-faint hover:text-mist hover:bg-glass2 rounded-lg transition-all"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(row)}
                            disabled={deleting === row.id}
                            className="p-1.5 text-faint hover:text-bad hover:bg-[rgba(255,107,107,0.1)] rounded-lg transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Receipt image lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative card max-w-3xl w-full overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-edge">
              <div className="flex items-center gap-2">
                <Image className="w-4 h-4 text-faint" />
                <span className="text-sm font-semibold text-mist">
                  Fuel Receipt
                  {lightbox.urls.length > 1 && (
                    <span className="text-faint font-normal ml-1">
                      {lightbox.index + 1} / {lightbox.urls.length}
                    </span>
                  )}
                </span>
              </div>
              <button
                onClick={() => setLightbox(null)}
                className="p-1.5 text-faint hover:text-mist hover:bg-glass2 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative bg-[#1b1f27]">
              <img
                src={lightbox.urls[lightbox.index]}
                alt={`Receipt ${lightbox.index + 1}`}
                className="w-full max-h-[70vh] object-contain"
              />
              {lightbox.urls.length > 1 && (
                <>
                  <button
                    onClick={() => setLightbox(l => l && l.index > 0 ? { ...l, index: l.index - 1 } : l)}
                    disabled={lightbox.index === 0}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-[#1b1f27] border border-edge2 hover:bg-glass2 rounded-full shadow-md text-mist disabled:opacity-30 transition-all"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setLightbox(l => l && l.index < l.urls.length - 1 ? { ...l, index: l.index + 1 } : l)}
                    disabled={lightbox.index === lightbox.urls.length - 1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-[#1b1f27] border border-edge2 hover:bg-glass2 rounded-full shadow-md text-mist disabled:opacity-30 transition-all"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>
            {lightbox.urls.length > 1 && (
              <div className="flex gap-2 p-3 bg-[#1b1f27] overflow-x-auto">
                {lightbox.urls.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setLightbox(l => l ? { ...l, index: i } : l)}
                    className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${i === lightbox.index ? 'border-signal' : 'border-edge hover:border-edge2'}`}
                  >
                    <img src={url} alt={`Receipt ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit modal */}      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-edge">
              <h2 className="text-lg font-semibold text-mist">
                {editingId ? 'Edit Fuel Receipt' : 'Add Fuel Receipt'}
              </h2>
              <button onClick={closeModal} className="p-1.5 text-faint hover:text-mist hover:bg-glass2 rounded-lg transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Driver Name</label>
                  <input className={inputCls} value={form.driver_name} required placeholder="Full name"
                    onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Truck #</label>
                  <input className={inputCls} value={form.vehicle_number} placeholder="e.g. 609"
                    onChange={e => setForm(f => ({ ...f, vehicle_number: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Date</label>
                <input type="date" className={inputCls} value={form.date} required
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>

              <div>
                <label className={labelCls}>Location</label>
                <input className={inputCls} value={form.location} placeholder="Gas station name / location"
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Amount ($)</label>
                  <input type="number" step="0.01" min="0" className={inputCls} value={form.amount} required placeholder="0.00"
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Gallons</label>
                  <input type="number" step="0.001" min="0" className={inputCls} value={form.gallons} placeholder="0.000"
                    onChange={e => setForm(f => ({ ...f, gallons: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Receipt # (optional)</label>
                <input className={inputCls} value={form.receipt_number} placeholder="Reference number"
                  onChange={e => setForm(f => ({ ...f, receipt_number: e.target.value }))} />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal}
                  className="flex-1 py-2.5 gbtn-ghost text-sm font-medium transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 gbtn text-sm font-medium transition-all">
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
