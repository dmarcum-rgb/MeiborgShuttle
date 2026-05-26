import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, X, MapPin, Loader2, ToggleLeft, ToggleRight, Search } from 'lucide-react';

type VendorStop = {
  id: string;
  name: string;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
  toll_amount: number | null;
  notes: string;
  active: boolean;
  created_at: string;
};

type FormData = {
  name: string;
  address: string;
  city: string;
  lat: string;
  lng: string;
  toll_amount: string;
  notes: string;
  active: boolean;
};

const BLANK: FormData = {
  name: '', address: '', city: '', lat: '', lng: '', toll_amount: '', notes: '', active: true,
};

export function Stops() {
  const [stops, setStops] = useState<VendorStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<VendorStop | null>(null);
  const [form, setForm] = useState<FormData>(BLANK);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => { fetchStops(); }, []);

  const fetchStops = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('vendor_stops')
      .select('*')
      .order('name', { ascending: true });
    setStops(data ?? []);
    setLoading(false);
  };

  const openAdd = () => {
    setEditing(null);
    setForm(BLANK);
    setShowModal(true);
  };

  const openEdit = (stop: VendorStop) => {
    setEditing(stop);
    setForm({
      name: stop.name,
      address: stop.address,
      city: stop.city,
      lat: stop.lat != null ? String(stop.lat) : '',
      lng: stop.lng != null ? String(stop.lng) : '',
      toll_amount: stop.toll_amount != null ? String(stop.toll_amount) : '',
      notes: stop.notes ?? '',
      active: stop.active,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setForm(BLANK);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      lat: form.lat ? parseFloat(form.lat) : null,
      lng: form.lng ? parseFloat(form.lng) : null,
      toll_amount: form.toll_amount ? parseFloat(form.toll_amount) : null,
      notes: form.notes.trim(),
      active: form.active,
    };

    if (editing) {
      await supabase.from('vendor_stops').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('vendor_stops').insert([payload]);
    }

    await fetchStops();
    closeModal();
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this stop from the list?')) return;
    setDeleting(id);
    await supabase.from('vendor_stops').delete().eq('id', id);
    setStops(s => s.filter(x => x.id !== id));
    setDeleting(null);
  };

  const toggleActive = async (stop: VendorStop) => {
    await supabase.from('vendor_stops').update({ active: !stop.active }).eq('id', stop.id);
    setStops(s => s.map(x => x.id === stop.id ? { ...x, active: !x.active } : x));
  };

  const filtered = stops.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.address.toLowerCase().includes(search.toLowerCase()) ||
    s.city.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = stops.filter(s => s.active).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 font-serif">Stops</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {activeCount} active location{activeCount !== 1 ? 's' : ''} &middot; {stops.length} total
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-xl transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Stop
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search stops..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-gray-800 transition-all"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <MapPin className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">{search ? 'No stops match your search' : 'No stops yet'}</p>
          {!search && <p className="text-sm mt-1">Add your first vendor location to get started</p>}
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(stop => (
            <div
              key={stop.id}
              className={`bg-white rounded-xl border transition-all ${stop.active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}
            >
              <div className="flex items-start gap-4 p-4">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${stop.active ? 'bg-gray-100' : 'bg-gray-50'}`}>
                  <MapPin className={`w-4 h-4 ${stop.active ? 'text-gray-600' : 'text-gray-400'}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{stop.name}</p>
                    {!stop.active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Inactive</span>
                    )}
                    {stop.toll_amount != null && stop.toll_amount > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 font-medium">
                        ${Number(stop.toll_amount).toFixed(2)} toll
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">{stop.address}{stop.city ? `, ${stop.city}` : ''}</p>
                  {stop.notes && <p className="text-xs text-gray-400 mt-1 italic">{stop.notes}</p>}
                  {stop.lat != null && stop.lng != null && (
                    <p className="text-xs text-gray-400 mt-1">
                      Geofence: {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggleActive(stop)}
                    className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
                    title={stop.active ? 'Deactivate' : 'Activate'}
                  >
                    {stop.active
                      ? <ToggleRight className="w-5 h-5 text-green-600" />
                      : <ToggleLeft className="w-5 h-5" />
                    }
                  </button>
                  <button
                    onClick={() => openEdit(stop)}
                    className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(stop.id)}
                    disabled={deleting === stop.id}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                  >
                    {deleting === stop.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />
                    }
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{editing ? 'Edit Stop' : 'Add Stop'}</h2>
              <button onClick={closeModal} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Vendor / Location Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Alliance Ind. (Waupaca)"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Street Address</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="N. 2467 Vaughan Rd"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">City / State</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    placeholder="Waupaca, WI 54981"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Toll Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.toll_amount}
                      onChange={e => setForm(f => ({ ...f, toll_amount: e.target.value }))}
                      placeholder="0.00"
                      className="w-full pl-6 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={form.lat}
                    onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
                    placeholder="44.3601"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={form.lng}
                    onChange={e => setForm(f => ({ ...f, lng: e.target.value }))}
                    placeholder="-89.0746"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Special instructions, gate codes, etc."
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-800 transition-all"
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div
                  onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                  className={`relative w-10 h-6 rounded-full transition-colors ${form.active ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.active ? 'translate-x-4' : ''}`} />
                </div>
                <span className="text-sm font-medium text-gray-700">Active (visible in driver app)</span>
              </label>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2">
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : (editing ? 'Save Changes' : 'Add Stop')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
