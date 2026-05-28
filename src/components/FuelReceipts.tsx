import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit, Trash2, X, Fuel, Truck, FileText } from 'lucide-react';

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

    const tsRows: FuelRow[] = (tsRes.data ?? []).map(t => ({
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
    }));

    const manualRows: FuelRow[] = (manualRes.data ?? []).map(r => ({
      id: r.id,
      source: 'manual',
      date: r.date,
      driver_name: r.driver_name ?? '',
      vehicle_number: r.vehicle_number ?? '',
      gallons: r.gallons ? Number(r.gallons) : null,
      amount: r.amount ? Number(r.amount) : null,
      location: r.location ?? '',
      receipt_number: r.receipt_number ?? '',
    }));

    // Merge and sort by date desc
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

  const inputCls = 'w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-800 transition-all';
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 font-serif">Fuel Receipts</h1>
          <p className="text-gray-500 text-sm mt-0.5">Track fuel purchases for all drivers</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-xl transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Receipt
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center mb-3">
            <Fuel className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-semibold text-gray-900">{fmt(totalAmount)}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total Fuel Expenses</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center mb-3">
            <Fuel className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-semibold text-gray-900">{totalGallons.toFixed(3)} gal</p>
          <p className="text-xs text-gray-500 mt-0.5">Total Gallons</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="w-9 h-9 bg-gray-50 rounded-lg flex items-center justify-center mb-3">
            <FileText className="w-4 h-4 text-gray-600" />
          </div>
          <p className="text-2xl font-semibold text-gray-900">{rows.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total Entries</p>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Date', 'Driver', 'Truck #', 'Location', 'Gallons', 'Amount', 'Receipt #', 'Source', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-gray-400">
                      <Fuel className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No fuel receipts recorded yet.
                    </td>
                  </tr>
                ) : rows.map(row => (
                  <tr key={`${row.source}-${row.id}`} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-900 whitespace-nowrap font-medium">
                      {new Date(row.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      <div className="flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        {row.driver_name || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {row.vehicle_number ? `#${row.vehicle_number}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {row.location || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {row.gallons != null ? `${row.gallons.toFixed(3)} gal` : '—'}
                    </td>
                    <td className="px-4 py-3 text-amber-700 font-semibold whitespace-nowrap">
                      {row.amount != null ? fmt(row.amount) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {row.receipt_number || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {row.source === 'timesheet' ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-100">
                          <FileText className="w-3 h-3" /> Timesheet
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                          Manual
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {row.source === 'manual' && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(row)}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(row)}
                            disabled={deleting === row.id}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
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

      {/* Add/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId ? 'Edit Fuel Receipt' : 'Add Fuel Receipt'}
              </h2>
              <button onClick={closeModal} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all">
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
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white text-sm font-medium rounded-xl transition-all">
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
