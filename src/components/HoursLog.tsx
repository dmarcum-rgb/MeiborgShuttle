import { useEffect, useState } from 'react';
import { supabase, HoursLog, Driver } from '../lib/supabase';
import { Plus, Edit, Trash2, X, Clock, Truck, Check } from 'lucide-react';

type HoursLogFormData = {
  driver_id: string;
  date: string;
  hours: string;
  notes: string;
};

export function HoursLogComponent() {
  const [hoursLogs, setHoursLogs] = useState<(HoursLog & { driver: Driver })[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingLog, setEditingLog] = useState<HoursLog | null>(null);
  const [formData, setFormData] = useState<HoursLogFormData>({
    driver_id: '',
    date: new Date().toISOString().split('T')[0],
    hours: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<string>('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [hoursRes, driversRes] = await Promise.all([
      supabase.from('hours_log').select('*, driver:drivers(*)').order('date', { ascending: false }),
      supabase.from('drivers').select('*').eq('status', 'active'),
    ]);

    const hoursData = (hoursRes.data || []).map((h) => ({
      ...h,
      driver: Array.isArray(h.driver) ? h.driver[0] : h.driver,
    })) as (HoursLog & { driver: Driver })[];

    setHoursLogs(hoursData);
    setDrivers(driversRes.data || []);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const data = {
        driver_id: formData.driver_id,
        date: formData.date,
        hours: parseFloat(formData.hours),
        notes: formData.notes,
      };

      if (editingLog) {
        await supabase.from('hours_log').update(data).eq('id', editingLog.id);
      } else {
        await supabase.from('hours_log').insert([data]);
      }
      await fetchData();
      closeModal();
    } catch (error) {
      console.error('Error saving hours log:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this hours log?')) return;
    await supabase.from('hours_log').delete().eq('id', id);
    await fetchData();
  };

  const openModal = (log?: HoursLog) => {
    if (log) {
      setEditingLog(log);
      setFormData({
        driver_id: log.driver_id,
        date: log.date,
        hours: log.hours.toString(),
        notes: log.notes || '',
      });
    } else {
      setEditingLog(null);
      setFormData({
        driver_id: selectedDriver || drivers[0]?.id || '',
        date: new Date().toISOString().split('T')[0],
        hours: '',
        notes: '',
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingLog(null);
    setFormData({
      driver_id: '',
      date: new Date().toISOString().split('T')[0],
      hours: '',
      notes: '',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const filteredLogs = selectedDriver
    ? hoursLogs.filter((log) => log.driver_id === selectedDriver)
    : hoursLogs;

  const totalHours = filteredLogs.reduce((sum, log) => sum + Number(log.hours), 0);
  const unbilledHours = filteredLogs.filter((log) => !log.billed).reduce((sum, log) => sum + Number(log.hours), 0);
  const unbilledAmount = unbilledHours * 79;

  if (loading) {
    return (
      <div className="p-8">
        <div className="space-y-4">
          <div className="h-10 skeleton w-1/4"></div>
          <div className="h-96 skeleton"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-light tracking-tight text-mist">Hours Log</h1>
          <p className="text-faint mt-1">Track driver hours for Geodis billing at $79/hour</p>
        </div>
        <button
          onClick={() => openModal()}
          disabled={drivers.length === 0}
          className="flex items-center gap-2 px-4 py-2 gbtn font-medium transition-all"
        >
          <Plus className="w-4 h-4" />
          Log Hours
        </button>
      </div>

      {drivers.length === 0 && (
        <div className="bg-signal-dim border border-[rgba(255,201,60,0.35)] rounded-lg p-4 mb-6">
          <p className="text-signal text-sm">
            No active drivers found. Please add drivers first before logging hours.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-faint text-sm">Total Hours</p>
              <p className="text-3xl font-bold text-mist">{totalHours.toFixed(1)}</p>
            </div>
            <div className="w-12 h-12 bg-glass2 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-dim" />
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-faint text-sm">Unbilled Hours</p>
              <p className="text-3xl font-bold text-signal">{unbilledHours.toFixed(1)}</p>
            </div>
            <div className="w-12 h-12 bg-signal-dim rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-signal" />
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-faint text-sm">Potential Billing</p>
              <p className="text-3xl font-bold text-ok">{formatCurrency(unbilledAmount)}</p>
              <p className="text-xs text-faint">at $79/hour</p>
            </div>
            <div className="w-12 h-12 bg-[rgba(75,211,160,0.12)] rounded-lg flex items-center justify-center">
              <Check className="w-6 h-6 text-ok" />
            </div>
          </div>
        </div>
      </div>

      <div className="card p-4 mb-6">
        <div className="flex items-center gap-4">
          <label className="text-sm text-faint">Filter by Driver:</label>
          <select
            value={selectedDriver}
            onChange={(e) => setSelectedDriver(e.target.value)}
            className="px-4 py-2 ginput"
          >
            <option value="">All Drivers</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name} (Truck #{driver.truck_number})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[rgba(23,26,32,0.94)] backdrop-blur">
                <th className="px-6 py-3 text-left text-xs font-medium text-faint uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-faint uppercase tracking-wider">Driver</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-faint uppercase tracking-wider">Hours</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-faint uppercase tracking-wider">Billable</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-faint uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-faint uppercase tracking-wider">Notes</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-faint uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-glass2 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-mist">
                    {new Date(log.date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-faint" />
                      <span className="text-dim">{log.driver?.name || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-mist font-medium">
                    {Number(log.hours).toFixed(1)} hrs
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-ok font-medium">
                    {formatCurrency(Number(log.hours) * 79)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      log.billed
                        ? 'bg-[rgba(75,211,160,0.12)] text-ok'
                        : 'bg-signal-dim text-signal'
                    }`}>
                      {log.billed ? 'Billed' : 'Unbilled'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-faint text-sm max-w-xs truncate">
                    {log.notes || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => openModal(log)}
                      className="p-2 text-faint hover:text-mist hover:bg-glass2 rounded-lg transition-all"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(log.id)}
                      className="p-2 text-faint hover:text-bad hover:bg-[rgba(255,107,107,0.1)] rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-faint">
                    No hours logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-edge">
              <h2 className="text-xl font-semibold text-mist">
                {editingLog ? 'Edit Hours Log' : 'Log Hours'}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 text-faint hover:text-mist hover:bg-glass2 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-dim mb-2">
                  Driver
                </label>
                <select
                  value={formData.driver_id}
                  onChange={(e) => setFormData({ ...formData, driver_id: e.target.value })}
                  required
                  className="w-full px-4 py-3 ginput"
                >
                  <option value="">Select a driver</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name} (Truck #{driver.truck_number})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-dim mb-2">
                  Date
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                  className="w-full px-4 py-3 ginput"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dim mb-2">
                  Hours Worked
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="24"
                  value={formData.hours}
                  onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
                  required
                  className="w-full px-4 py-3 ginput"
                  placeholder="8.0"
                />
                <p className="text-xs text-faint mt-1">Billable at $79/hour to Geodis</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-dim mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-3 ginput resize-none"
                  placeholder="Route, job details, etc."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-3 gbtn-ghost font-medium transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-3 gbtn font-medium transition-all"
                >
                  {saving ? 'Saving...' : editingLog ? 'Update' : 'Log Hours'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
