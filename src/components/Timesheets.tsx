import { useState, useEffect } from 'react';
import { CheckCircle, Clock, ChevronDown, ChevronRight, Download, Image, FileText, Truck, ExternalLink, Receipt, Trash2, Loader2, Edit2, Plus, X, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Timesheet = {
  id: string;
  driver_name: string;
  vehicle_number: string;
  work_date: string;
  start_time: string;
  end_time: string;
  total_hours: number;
  lunch_start: string;
  lunch_end: string;
  notes: string;
  fuel_gallons: number | null;
  fuel_dollars: number | null;
  toll_total: number | null;
  status: 'pending' | 'submitted' | 'approved';
  submitted_at: string | null;
  stops: Stop[];
  receipts: ReceiptImage[];
};

type Stop = {
  id: string;
  vendor_name: string;
  city_address: string;
  arrive_time: string;
  departure_time: string;
  delay_reason: string;
  sort_order: number;
  toll_amount: number | null;
};

type ReceiptImage = {
  id: string;
  receipt_type: 'toll' | 'fuel';
  storage_path: string;
};

type EditForm = {
  driver_name: string;
  vehicle_number: string;
  work_date: string;
  start_time: string;
  end_time: string;
  total_hours: string;
  lunch_start: string;
  lunch_end: string;
  notes: string;
  fuel_gallons: string;
  fuel_dollars: string;
  toll_total: string;
};

type EditStop = {
  id: string | null; // null = new (unsaved)
  vendor_name: string;
  city_address: string;
  arrive_time: string;
  departure_time: string;
  delay_reason: string;
  toll_amount: string;
};

const STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-50 text-blue-700',
  approved: 'bg-green-50 text-green-700',
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const BLANK_STOP: EditStop = {
  id: null, vendor_name: '', city_address: '', arrive_time: '', departure_time: '', delay_reason: '', toll_amount: '',
};

function tsToForm(ts: Timesheet): EditForm {
  return {
    driver_name: ts.driver_name,
    vehicle_number: ts.vehicle_number,
    work_date: ts.work_date,
    start_time: ts.start_time,
    end_time: ts.end_time,
    total_hours: String(ts.total_hours),
    lunch_start: ts.lunch_start ?? '',
    lunch_end: ts.lunch_end ?? '',
    notes: ts.notes ?? '',
    fuel_gallons: ts.fuel_gallons != null ? String(ts.fuel_gallons) : '',
    fuel_dollars: ts.fuel_dollars != null ? String(ts.fuel_dollars) : '',
    toll_total: ts.toll_total != null ? String(ts.toll_total) : '',
  };
}

export function Timesheets() {
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'submitted' | 'approved'>('submitted');
  const [filterWeek, setFilterWeek] = useState('');
  const [receiptUrls, setReceiptUrls] = useState<Record<string, string>>({});

  // Edit modal state
  const [editingTs, setEditingTs] = useState<Timesheet | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editStops, setEditStops] = useState<EditStop[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTimesheets();
  }, [filterStatus, filterWeek]);

  const fetchTimesheets = async () => {
    setLoading(true);

    let query = supabase
      .from('timesheets')
      .select(`
        id, driver_name, vehicle_number, work_date, start_time, end_time,
        total_hours, lunch_start, lunch_end, notes, fuel_gallons, fuel_dollars, toll_total,
        status, submitted_at,
        timesheet_stops (id, vendor_name, city_address, arrive_time, departure_time, delay_reason, sort_order, toll_amount),
        receipt_images (id, receipt_type, storage_path)
      `)
      .order('work_date', { ascending: false });

    if (filterStatus !== 'all') query = query.eq('status', filterStatus);

    if (filterWeek) {
      const d = new Date(filterWeek);
      const start = new Date(d);
      start.setDate(d.getDate() - d.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      query = query
        .gte('work_date', start.toISOString().split('T')[0])
        .lte('work_date', end.toISOString().split('T')[0]);
    }

    const { data } = await query;

    const mapped = (data ?? []).map((ts: any) => ({
      ...ts,
      stops: (ts.timesheet_stops ?? []).sort((a: Stop, b: Stop) => a.sort_order - b.sort_order),
      receipts: ts.receipt_images ?? [],
    }));

    setTimesheets(mapped);
    setLoading(false);
  };

  const approveTimesheet = async (id: string) => {
    setApproving(id);
    await supabase.from('timesheets').update({ status: 'approved' }).eq('id', id);
    setTimesheets(ts => ts.map(t => t.id === id ? { ...t, status: 'approved' } : t));
    setApproving(null);
  };

  const deleteTimesheet = async (id: string) => {
    setDeleting(id);
    await supabase.from('timesheet_stops').delete().eq('timesheet_id', id);
    await supabase.from('receipt_images').delete().eq('timesheet_id', id);
    await supabase.from('timesheets').delete().eq('id', id);
    setTimesheets(ts => ts.filter(t => t.id !== id));
    if (expanded === id) setExpanded(null);
    setConfirmDelete(null);
    setDeleting(null);
  };

  const openEdit = (ts: Timesheet, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTs(ts);
    setEditForm(tsToForm(ts));
    setEditStops(ts.stops.map(s => ({
      id: s.id,
      vendor_name: s.vendor_name,
      city_address: s.city_address,
      arrive_time: s.arrive_time,
      departure_time: s.departure_time,
      delay_reason: s.delay_reason ?? '',
      toll_amount: s.toll_amount != null ? String(s.toll_amount) : '',
    })));
  };

  const closeEdit = () => {
    setEditingTs(null);
    setEditForm(null);
    setEditStops([]);
  };

  const saveEdit = async () => {
    if (!editingTs || !editForm) return;
    setSaving(true);

    const tsPayload = {
      driver_name: editForm.driver_name.trim(),
      vehicle_number: editForm.vehicle_number.trim(),
      work_date: editForm.work_date,
      start_time: editForm.start_time,
      end_time: editForm.end_time,
      total_hours: parseFloat(editForm.total_hours) || 0,
      lunch_start: editForm.lunch_start || null,
      lunch_end: editForm.lunch_end || null,
      notes: editForm.notes.trim(),
      fuel_gallons: editForm.fuel_gallons ? parseFloat(editForm.fuel_gallons) : null,
      fuel_dollars: editForm.fuel_dollars ? parseFloat(editForm.fuel_dollars) : null,
      toll_total: editForm.toll_total ? parseFloat(editForm.toll_total) : null,
    };

    await supabase.from('timesheets').update(tsPayload).eq('id', editingTs.id);

    // Delete all existing stops, re-insert in order
    await supabase.from('timesheet_stops').delete().eq('timesheet_id', editingTs.id);
    const stopsToInsert = editStops
      .filter(s => s.vendor_name.trim())
      .map((s, i) => ({
        timesheet_id: editingTs.id,
        vendor_name: s.vendor_name.trim(),
        city_address: s.city_address.trim(),
        arrive_time: s.arrive_time,
        departure_time: s.departure_time,
        delay_reason: s.delay_reason.trim(),
        toll_amount: s.toll_amount ? parseFloat(s.toll_amount) : null,
        sort_order: i,
      }));
    if (stopsToInsert.length > 0) {
      await supabase.from('timesheet_stops').insert(stopsToInsert);
    }

    await fetchTimesheets();
    closeEdit();
    setSaving(false);
  };

  const getReceiptUrl = async (path: string): Promise<string> => {
    if (receiptUrls[path]) return receiptUrls[path];
    const { data } = await supabase.storage.from('receipts').createSignedUrl(path, 3600);
    if (data?.signedUrl) {
      setReceiptUrls(u => ({ ...u, [path]: data.signedUrl }));
      return data.signedUrl;
    }
    return '';
  };

  const openReceipt = async (path: string) => {
    const url = await getReceiptUrl(path);
    if (url) window.open(url, '_blank');
  };

  const weekOf = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    const day = d.getDay();
    const sun = new Date(d); sun.setDate(d.getDate() - day);
    const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
    return `${sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sat.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  const dayName = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return DAYS[d.getDay()];
  };

  const totalHoursAll = timesheets.reduce((s, t) => s + t.total_hours, 0);
  const totalFuelGallons = timesheets.reduce((s, t) => s + (t.fuel_gallons ?? 0), 0);
  const totalFuelDollars = timesheets.reduce((s, t) => s + (t.fuel_dollars ?? 0), 0);
  const totalTolls = timesheets.reduce((s, t) => s + (t.toll_total ?? 0), 0);
  const pendingApproval = timesheets.filter(t => t.status === 'submitted').length;

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 transition-all bg-white';
  const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 font-serif">Timesheets</h1>
          <p className="text-gray-500 text-sm mt-0.5">Digital daily timesheets from all drivers</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Pending Approval', value: pendingApproval, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Total Hours', value: totalHoursAll.toFixed(2), icon: Clock, color: 'text-gray-700', bg: 'bg-gray-50' },
          { label: 'Fuel Gallons', value: totalFuelGallons.toFixed(3), icon: Truck, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Fuel Spend', value: `$${totalFuelDollars.toFixed(2)}`, icon: Download, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Total Tolls', value: `$${totalTolls.toFixed(2)}`, icon: Receipt, color: 'text-rose-600', bg: 'bg-rose-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className="text-2xl font-semibold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden">
          {(['submitted', 'approved', 'all'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                filterStatus === s ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}>
              {s === 'all' ? 'All' : s === 'submitted' ? 'Needs Approval' : 'Approved'}
            </button>
          ))}
        </div>
        <input
          type="week"
          value={filterWeek}
          onChange={e => setFilterWeek(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-gray-800"
        />
        {filterWeek && (
          <button onClick={() => setFilterWeek('')} className="text-sm text-gray-500 hover:text-gray-700 underline">
            Clear
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
        </div>
      ) : timesheets.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No timesheets found</p>
          <p className="text-sm mt-1">Timesheets appear here after drivers clock out</p>
        </div>
      ) : (
        <div className="space-y-3">
          {timesheets.map(ts => (
            <div key={ts.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Row header */}
              <button
                onClick={() => setExpanded(expanded === ts.id ? null : ts.id)}
                className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="w-12 text-center flex-shrink-0">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">{dayName(ts.work_date)}</p>
                  <p className="text-lg font-semibold text-gray-900 leading-tight">{new Date(ts.work_date + 'T12:00:00').getDate()}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{ts.driver_name || 'Unknown Driver'}</p>
                    <span className="text-gray-400 text-xs">Truck #{ts.vehicle_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[ts.status]}`}>
                      {ts.status === 'submitted' ? 'Needs Approval' : ts.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-sm text-gray-600">{ts.start_time} – {ts.end_time}</span>
                    <span className="text-sm font-semibold text-gray-900">{ts.total_hours.toFixed(2)} hrs</span>
                    <span className="text-xs text-gray-500">{weekOf(ts.work_date)}</span>
                    {ts.receipts.length > 0 && (
                      <span className="flex items-center gap-1 text-xs text-blue-600">
                        <Image className="w-3 h-3" />{ts.receipts.length} receipt{ts.receipts.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {ts.status === 'submitted' && (
                    <button
                      onClick={e => { e.stopPropagation(); approveTimesheet(ts.id); }}
                      disabled={approving === ts.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-all"
                    >
                      {approving === ts.id ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      Approve
                    </button>
                  )}
                  <button
                    onClick={e => openEdit(ts, e)}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
                    title="Edit timesheet"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setConfirmDelete(ts.id); }}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    title="Delete timesheet"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {expanded === ts.id ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                </div>
              </button>

              {/* Expanded detail */}
              {expanded === ts.id && (
                <div className="border-t border-gray-100 px-5 py-4 space-y-5 bg-gray-50">
                  {/* Hours detail */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Start Time', value: ts.start_time },
                      { label: 'End Time', value: ts.end_time },
                      { label: 'Total Hours', value: ts.total_hours.toFixed(2) },
                      { label: 'Lunch', value: ts.lunch_start && ts.lunch_end ? `${ts.lunch_start}–${ts.lunch_end}` : '—' },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-white rounded-lg p-3 border border-gray-200">
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
                        <p className="font-semibold text-gray-900">{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Stops table */}
                  {ts.stops.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Stops</p>
                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Vendor</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">City/Address</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Arrive</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Depart</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Toll</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Delay</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {ts.stops.map(stop => (
                              <tr key={stop.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2 font-medium text-gray-900">{stop.vendor_name}</td>
                                <td className="px-3 py-2 text-gray-600">{stop.city_address}</td>
                                <td className="px-3 py-2 text-gray-700">{stop.arrive_time}</td>
                                <td className="px-3 py-2 text-gray-700">{stop.departure_time}</td>
                                <td className="px-3 py-2 text-rose-600 font-medium text-sm">
                                  {stop.toll_amount != null && stop.toll_amount > 0 ? `$${Number(stop.toll_amount).toFixed(2)}` : '—'}
                                </td>
                                <td className="px-3 py-2 text-amber-600 text-xs">{stop.delay_reason || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Fuel & Tolls */}
                  {(ts.fuel_gallons || ts.fuel_dollars || ts.toll_total) && (
                    <div className="flex flex-wrap gap-3">
                      {ts.fuel_gallons != null && ts.fuel_gallons > 0 && (
                        <div className="bg-white rounded-lg p-3 border border-gray-200">
                          <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Fuel Gallons</p>
                          <p className="font-semibold text-gray-900">{ts.fuel_gallons}</p>
                        </div>
                      )}
                      {ts.fuel_dollars != null && ts.fuel_dollars > 0 && (
                        <div className="bg-white rounded-lg p-3 border border-gray-200">
                          <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Fuel Spend</p>
                          <p className="font-semibold text-gray-900">${ts.fuel_dollars.toFixed(2)}</p>
                        </div>
                      )}
                      {ts.toll_total != null && ts.toll_total > 0 && (
                        <div className="bg-rose-50 rounded-lg p-3 border border-rose-200">
                          <p className="text-xs text-rose-500 uppercase tracking-wider mb-0.5">Total Tolls</p>
                          <p className="font-semibold text-rose-700">${ts.toll_total.toFixed(2)}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes */}
                  {ts.notes && (
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Notes</p>
                      <p className="text-gray-700 text-sm">{ts.notes}</p>
                    </div>
                  )}

                  {/* Receipts */}
                  {ts.receipts.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Receipt Images</p>
                      <div className="flex flex-wrap gap-2">
                        {ts.receipts.map(r => (
                          <button
                            key={r.id}
                            onClick={() => openReceipt(r.storage_path)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                              r.receipt_type === 'toll'
                                ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                                : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                            }`}
                          >
                            <Image className="w-4 h-4" />
                            <span className="capitalize">{r.receipt_type} Receipt</span>
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bottom actions */}
                  <div className="flex gap-3">
                    {ts.status === 'submitted' && (
                      <button
                        onClick={() => approveTimesheet(ts.id)}
                        disabled={approving === ts.id}
                        className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2"
                      >
                        {approving === ts.id ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        Approve Timesheet
                      </button>
                    )}
                    {ts.status === 'approved' && (
                      <div className="flex items-center justify-center gap-2 py-2 text-green-600 flex-1">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">Approved</span>
                      </div>
                    )}
                    <button
                      onClick={e => openEdit(ts, e)}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-all text-sm"
                    >
                      <Edit2 className="w-4 h-4" /> Edit
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (() => {
        const ts = timesheets.find(t => t.id === confirmDelete);
        if (!ts) return null;
        return (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Delete Timesheet?</h3>
                  <p className="text-sm text-gray-500 mt-0.5">This cannot be undone.</p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700 space-y-1">
                <p><span className="font-medium">{ts.driver_name || 'Unknown Driver'}</span> — Truck #{ts.vehicle_number}</p>
                <p className="text-gray-500">{new Date(ts.work_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} &middot; {ts.total_hours.toFixed(2)} hrs</p>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteTimesheet(confirmDelete)}
                  disabled={deleting === confirmDelete}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {deleting === confirmDelete
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Deleting...</>
                    : <><Trash2 className="w-4 h-4" />Delete</>
                  }
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit modal */}
      {editingTs && editForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl my-6">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Edit Timesheet</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {editingTs.driver_name} — {new Date(editingTs.work_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <button onClick={closeEdit} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Driver & date */}
              <div>
                <p className={labelCls}>Driver Info</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Driver Name</label>
                    <input className={inputCls} value={editForm.driver_name}
                      onChange={e => setEditForm(f => f ? { ...f, driver_name: e.target.value } : f)} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Truck #</label>
                    <input className={inputCls} value={editForm.vehicle_number}
                      onChange={e => setEditForm(f => f ? { ...f, vehicle_number: e.target.value } : f)} />
                  </div>
                </div>
              </div>

              {/* Date & Hours */}
              <div>
                <p className={labelCls}>Date & Hours</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Work Date</label>
                    <input type="date" className={inputCls} value={editForm.work_date}
                      onChange={e => setEditForm(f => f ? { ...f, work_date: e.target.value } : f)} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Start Time</label>
                    <input type="time" className={inputCls} value={editForm.start_time}
                      onChange={e => setEditForm(f => f ? { ...f, start_time: e.target.value } : f)} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">End Time</label>
                    <input type="time" className={inputCls} value={editForm.end_time}
                      onChange={e => setEditForm(f => f ? { ...f, end_time: e.target.value } : f)} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Total Hours</label>
                    <input type="number" step="0.01" min="0" className={inputCls} value={editForm.total_hours}
                      onChange={e => setEditForm(f => f ? { ...f, total_hours: e.target.value } : f)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Lunch Start</label>
                    <input type="time" className={inputCls} value={editForm.lunch_start}
                      onChange={e => setEditForm(f => f ? { ...f, lunch_start: e.target.value } : f)} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Lunch End</label>
                    <input type="time" className={inputCls} value={editForm.lunch_end}
                      onChange={e => setEditForm(f => f ? { ...f, lunch_end: e.target.value } : f)} />
                  </div>
                </div>
              </div>

              {/* Fuel & Tolls */}
              <div>
                <p className={labelCls}>Fuel & Tolls</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Fuel Gallons</label>
                    <input type="number" step="0.001" min="0" className={inputCls} value={editForm.fuel_gallons} placeholder="0.000"
                      onChange={e => setEditForm(f => f ? { ...f, fuel_gallons: e.target.value } : f)} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Fuel Dollars ($)</label>
                    <input type="number" step="0.01" min="0" className={inputCls} value={editForm.fuel_dollars} placeholder="0.00"
                      onChange={e => setEditForm(f => f ? { ...f, fuel_dollars: e.target.value } : f)} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Total Tolls ($)</label>
                    <input type="number" step="0.01" min="0" className={inputCls} value={editForm.toll_total} placeholder="0.00"
                      onChange={e => setEditForm(f => f ? { ...f, toll_total: e.target.value } : f)} />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <p className={labelCls}>Notes</p>
                <textarea rows={2} className={`${inputCls} resize-none`} value={editForm.notes} placeholder="Optional notes..."
                  onChange={e => setEditForm(f => f ? { ...f, notes: e.target.value } : f)} />
              </div>

              {/* Stops */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className={labelCls}>Stops ({editStops.length})</p>
                  <button
                    type="button"
                    onClick={() => setEditStops(s => [...s, { ...BLANK_STOP }])}
                    className="flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:text-gray-900 px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Stop
                  </button>
                </div>

                {editStops.length === 0 ? (
                  <p className="text-sm text-gray-400 italic py-2">No stops recorded.</p>
                ) : (
                  <div className="space-y-3">
                    {editStops.map((stop, idx) => (
                      <div key={idx} className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-500">Stop {idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => setEditStops(s => s.filter((_, i) => i !== idx))}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Vendor Name</label>
                            <input className={inputCls} value={stop.vendor_name} placeholder="Vendor / Location"
                              onChange={e => setEditStops(s => s.map((x, i) => i === idx ? { ...x, vendor_name: e.target.value } : x))} />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">City / Address</label>
                            <input className={inputCls} value={stop.city_address} placeholder="City, State"
                              onChange={e => setEditStops(s => s.map((x, i) => i === idx ? { ...x, city_address: e.target.value } : x))} />
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Arrive</label>
                            <input type="time" className={inputCls} value={stop.arrive_time}
                              onChange={e => setEditStops(s => s.map((x, i) => i === idx ? { ...x, arrive_time: e.target.value } : x))} />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Depart</label>
                            <input type="time" className={inputCls} value={stop.departure_time}
                              onChange={e => setEditStops(s => s.map((x, i) => i === idx ? { ...x, departure_time: e.target.value } : x))} />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Toll ($)</label>
                            <input type="number" step="0.01" min="0" className={inputCls} value={stop.toll_amount} placeholder="0.00"
                              onChange={e => setEditStops(s => s.map((x, i) => i === idx ? { ...x, toll_amount: e.target.value } : x))} />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Delay Reason</label>
                            <input className={inputCls} value={stop.delay_reason} placeholder="Optional"
                              onChange={e => setEditStops(s => s.map((x, i) => i === idx ? { ...x, delay_reason: e.target.value } : x))} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex gap-3 px-6 pb-6">
              <button type="button" onClick={closeEdit}
                className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-all">
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={saving}
                className="flex-1 py-2.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Changes</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
