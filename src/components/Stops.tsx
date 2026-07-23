import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, X, MapPin, Loader2, ToggleLeft, ToggleRight, Search, AlertTriangle } from 'lucide-react';

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
  const missingGeofence = stops.filter(s => s.active && (s.lat == null || s.lng == null)).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-light tracking-tight text-mist">Stops</h1>
          <p className="text-faint text-sm mt-0.5">
            {activeCount} active location{activeCount !== 1 ? 's' : ''} &middot; {stops.length} total
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 gbtn text-sm font-medium transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Stop
        </button>
      </div>

      {/* Missing geofence banner */}
      {missingGeofence > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-signal-dim border border-[rgba(255,201,60,0.35)] rounded-xl text-sm text-signal">
          <AlertTriangle className="w-4 h-4 text-signal flex-shrink-0" />
          <span><span className="font-semibold">{missingGeofence} active stop{missingGeofence !== 1 ? 's' : ''}</span> missing geofence coordinates — drivers won't be able to auto-log arrivals at these locations.</span>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
        <input
          type="text"
          placeholder="Search stops..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 ginput text-sm"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-edge border-t-signal rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-faint">
          <MapPin className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">{search ? 'No stops match your search' : 'No stops yet'}</p>
          {!search && <p className="text-sm mt-1">Add your first vendor location to get started</p>}
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(stop => (
            <div
              key={stop.id}
              className={`card transition-all ${stop.active ? '' : 'opacity-60'}`}
            >
              <div className="flex items-start gap-4 p-4">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 bg-glass2">
                  <MapPin className={`w-4 h-4 ${stop.active ? 'text-dim' : 'text-faint'}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-mist">{stop.name}</p>
                    {!stop.active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-glass2 text-faint font-medium">Inactive</span>
                    )}
                    {stop.toll_amount != null && stop.toll_amount > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-signal-dim text-signal font-medium">
                        ${Number(stop.toll_amount).toFixed(2)} toll
                      </span>
                    )}
                    {stop.active && (stop.lat == null || stop.lng == null) && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-signal-dim text-signal font-medium border border-[rgba(255,201,60,0.35)]">
                        <AlertTriangle className="w-3 h-3" /> No geofence
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-dim mt-0.5">{stop.address}{stop.city ? `, ${stop.city}` : ''}</p>
                  {stop.notes && <p className="text-xs text-faint mt-1 italic">{stop.notes}</p>}
                  {stop.lat != null && stop.lng != null && (
                    <p className="text-xs text-faint mt-1">
                      Geofence: {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggleActive(stop)}
                    className="p-2 rounded-lg text-faint hover:text-mist hover:bg-glass2 transition-all"
                    title={stop.active ? 'Deactivate' : 'Activate'}
                  >
                    {stop.active
                      ? <ToggleRight className="w-5 h-5 text-ok" />
                      : <ToggleLeft className="w-5 h-5" />
                    }
                  </button>
                  <button
                    onClick={() => openEdit(stop)}
                    className="p-2 rounded-lg text-faint hover:text-mist hover:bg-glass2 transition-all"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(stop.id)}
                    disabled={deleting === stop.id}
                    className="p-2 rounded-lg text-faint hover:text-bad hover:bg-[rgba(255,107,107,0.1)] transition-all"
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
          <div className="card w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-edge">
              <h2 className="text-lg font-semibold text-mist">{editing ? 'Edit Stop' : 'Add Stop'}</h2>
              <button onClick={closeModal} className="p-1.5 text-faint hover:text-mist hover:bg-glass2 rounded-lg transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-dim mb-1.5">Vendor / Location Name <span className="text-bad">*</span></label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Alliance Ind. (Waupaca)"
                  className="w-full px-3 py-2.5 ginput text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-dim mb-1.5">Street Address</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="N. 2467 Vaughan Rd"
                    className="w-full px-3 py-2.5 ginput text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dim mb-1.5">City / State</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    placeholder="Waupaca, WI 54981"
                    className="w-full px-3 py-2.5 ginput text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-dim mb-1.5">Toll Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.toll_amount}
                      onChange={e => setForm(f => ({ ...f, toll_amount: e.target.value }))}
                      placeholder="0.00"
                      className="w-full pl-6 pr-3 py-2.5 ginput text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-dim mb-1.5">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={form.lat}
                    onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
                    placeholder="44.3601"
                    className="w-full px-3 py-2.5 ginput text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dim mb-1.5">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={form.lng}
                    onChange={e => setForm(f => ({ ...f, lng: e.target.value }))}
                    placeholder="-89.0746"
                    className="w-full px-3 py-2.5 ginput text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-dim mb-1.5">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Special instructions, gate codes, etc."
                  className="w-full px-3 py-2.5 ginput text-sm resize-none"
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div
                  onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                  className={`relative w-10 h-6 rounded-full transition-colors ${form.active ? 'bg-ok' : 'bg-glass2'}`}
                >
                  <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.active ? 'translate-x-4' : ''}`} />
                </div>
                <span className="text-sm font-medium text-dim">Active (visible in driver app)</span>
              </label>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal}
                  className="flex-1 py-2.5 gbtn-ghost text-sm font-medium transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 gbtn text-sm font-medium transition-all flex items-center justify-center gap-2">
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
