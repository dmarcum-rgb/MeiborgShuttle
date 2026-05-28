import { useEffect, useState } from 'react';
import { supabase, Driver } from '../lib/supabase';
import { Plus, Edit, Trash2, X, User, Truck } from 'lucide-react';

type DriverFormData = {
  name: string;
  truck_number: string;
  status: 'active' | 'inactive';
};

export function Drivers() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [clockedInNames, setClockedInNames] = useState<Set<string>>(new Set());
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  // Maps auth user_id → drivers-table name, built during fetchDrivers
  const [userIdToDriverName, setUserIdToDriverName] = useState<Record<string, string>>({});
  const [stopCounts, setStopCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [formData, setFormData] = useState<DriverFormData>({
    name: '',
    truck_number: '',
    status: 'active',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchDrivers();
  }, []);

  // Subscribe to driver presence channel to show who has the app open
  useEffect(() => {
    const channel = supabase.channel('driver_presence');
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ user_id: string }>();
        const ids = new Set(
          Object.values(state).flatMap(presences => presences.map(p => p.user_id))
        );
        setOnlineUserIds(ids);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchDrivers = async () => {
    setLoading(true);

    const [driversRes, clockRes, driverNamesRes, stopsRes] = await Promise.all([
      supabase.from('drivers').select('*').order('created_at', { ascending: false }),
      supabase.from('clock_events').select('driver_id, type, timestamp').order('timestamp', { ascending: false }),
      supabase.rpc('get_driver_names'),
      supabase.from('route_logs').select('driver_id'),
    ]);

    setDrivers(driversRes.data || []);

    // Map auth user id → display name via SECURITY DEFINER function (sees all drivers)
    const idToName: Record<string, string> = {};
    for (const d of driverNamesRes.data ?? []) {
      if (d.display_name && !/^\d+$/.test(d.display_name)) {
        idToName[d.driver_id] = d.display_name;
      }
    }

    // Build normalized name → auth display_name map for fuzzy matching against drivers table
    // Normalization: lowercase first word (first name) for partial matching
    const normalize = (n: string) => n.toLowerCase().split(' ')[0];
    const normalizedToDisplayName: Record<string, string> = {};
    for (const displayName of Object.values(idToName)) {
      normalizedToDisplayName[normalize(displayName)] = displayName;
    }

    // For each drivers-table driver, find the best matching auth display name
    const driverTableToAuthName: Record<string, string> = {};
    for (const d of driversRes.data ?? []) {
      const key = normalize(d.name);
      // Exact match first
      const exactMatch = Object.values(idToName).find(n => n.toLowerCase() === d.name.toLowerCase());
      if (exactMatch) {
        driverTableToAuthName[d.name] = exactMatch;
      } else if (normalizedToDisplayName[key]) {
        // First-name match fallback
        driverTableToAuthName[d.name] = normalizedToDisplayName[key];
      }
    }

    // For each auth user, find their latest clock event — clocked in if it's 'clock_in'
    const latestByDriver: Record<string, string> = {};
    for (const e of clockRes.data ?? []) {
      if (!latestByDriver[e.driver_id]) latestByDriver[e.driver_id] = e.type;
    }
    // Build set of auth display names currently clocked in
    const activeAuthNames = new Set<string>();
    for (const [driverId, type] of Object.entries(latestByDriver)) {
      if (type === 'clock_in' && idToName[driverId]) {
        activeAuthNames.add(idToName[driverId]);
      }
    }
    // Map back to drivers-table names
    const activeDriveNames = new Set<string>();
    for (const [driverTableName, authName] of Object.entries(driverTableToAuthName)) {
      if (activeAuthNames.has(authName)) activeDriveNames.add(driverTableName);
    }
    setClockedInNames(activeDriveNames);

    // Build auth user_id → drivers-table name for presence lookups
    const uidToName: Record<string, string> = {};
    for (const [uid, authName] of Object.entries(idToName)) {
      const driverTableName = Object.entries(driverTableToAuthName).find(([, v]) => v === authName)?.[0];
      if (driverTableName) uidToName[uid] = driverTableName;
    }
    setUserIdToDriverName(uidToName);

    // Count total stops per drivers-table driver name
    const counts: Record<string, number> = {};
    for (const log of stopsRes.data ?? []) {
      const authName = idToName[log.driver_id];
      if (!authName) continue;
      // Find which drivers-table driver this auth name maps to
      const driverTableName = Object.entries(driverTableToAuthName).find(([, v]) => v === authName)?.[0];
      if (driverTableName) counts[driverTableName] = (counts[driverTableName] ?? 0) + 1;
    }
    setStopCounts(counts);

    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingDriver) {
        await supabase
          .from('drivers')
          .update(formData)
          .eq('id', editingDriver.id);
      } else {
        await supabase.from('drivers').insert([formData]);
      }
      await fetchDrivers();
      closeModal();
    } catch (error) {
      console.error('Error saving driver:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this driver?')) return;
    await supabase.from('drivers').delete().eq('id', id);
    await fetchDrivers();
  };

  const openModal = (driver?: Driver) => {
    if (driver) {
      setEditingDriver(driver);
      setFormData({
        name: driver.name,
        truck_number: driver.truck_number,
        status: driver.status,
      });
    } else {
      setEditingDriver(null);
      setFormData({ name: '', truck_number: '', status: 'active' });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingDriver(null);
    setFormData({ name: '', truck_number: '', status: 'active' });
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-slate-800 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-48 bg-slate-800 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Drivers</h1>
          <p className="text-slate-400 mt-1">Manage driver profiles and assignments</p>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg shadow-lg shadow-amber-500/20 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Driver
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {drivers.map((driver) => (
          <div
            key={driver.id}
            className="bg-slate-800 border border-slate-700 rounded-xl p-6 hover:border-slate-500 transition-all"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center">
                  <User className="w-6 h-6 text-slate-400" />
                </div>
                <div>
                  <h3 className="text-white font-medium">{driver.name}</h3>
                  <p className="text-slate-400 text-sm">Driver</p>
                </div>
              </div>
              {(() => {
                const isOnline = [...onlineUserIds].some(uid => userIdToDriverName[uid] === driver.name);
                return (
                  <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
                    isOnline ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                    {isOnline ? 'online' : 'offline'}
                  </span>
                );
              })()}
            </div>

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-slate-400">
                <Truck className="w-4 h-4" />
                <span className="text-sm">Truck #{driver.truck_number}</span>
              </div>
              {(stopCounts[driver.name] ?? 0) > 0 && (
                <span className="text-xs text-slate-400">
                  <span className="font-semibold text-white">{stopCounts[driver.name]}</span> stops
                </span>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-700">
              <p className="text-xs text-slate-500">
                Added {new Date(driver.created_at).toLocaleDateString()}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openModal(driver)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(driver.id)}
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {drivers.length === 0 && (
          <div className="col-span-full bg-slate-800 border border-slate-700 rounded-xl p-12 text-center">
            <User className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-white font-medium mb-2">No drivers yet</h3>
            <p className="text-slate-400 text-sm mb-4">Add your first driver to get started</p>
            <button
              onClick={() => openModal()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Driver
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="text-xl font-semibold text-white">
                {editingDriver ? 'Edit Driver' : 'Add New Driver'}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Driver Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                  placeholder="Enter driver name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Truck Number
                </label>
                <input
                  type="text"
                  value={formData.truck_number}
                  onChange={(e) => setFormData({ ...formData, truck_number: e.target.value })}
                  required
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                  placeholder="e.g., T-101"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-500/50 text-white font-medium rounded-lg transition-all"
                >
                  {saving ? 'Saving...' : editingDriver ? 'Update' : 'Add Driver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
