import { useEffect, useState } from 'react';
import { supabase, TollReceipt, Driver } from '../lib/supabase';
import { Plus, Edit, Trash2, X, Banknote, Truck } from 'lucide-react';

type TollReceiptFormData = {
  driver_id: string;
  date: string;
  amount: string;
  location: string;
  receipt_number: string;
};

export function TollReceipts() {
  const [receipts, setReceipts] = useState<(TollReceipt & { driver: Driver })[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<TollReceipt | null>(null);
  const [formData, setFormData] = useState<TollReceiptFormData>({
    driver_id: '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    location: '',
    receipt_number: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [receiptsRes, driversRes] = await Promise.all([
      supabase.from('toll_receipts').select('*, driver:drivers(*)').order('date', { ascending: false }),
      supabase.from('drivers').select('*').eq('status', 'active'),
    ]);

    const receiptsData = (receiptsRes.data || []).map((r) => ({
      ...r,
      driver: Array.isArray(r.driver) ? r.driver[0] : r.driver,
    })) as (TollReceipt & { driver: Driver })[];

    setReceipts(receiptsData);
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
        amount: parseFloat(formData.amount),
        location: formData.location,
        receipt_number: formData.receipt_number,
      };

      if (editingReceipt) {
        await supabase.from('toll_receipts').update(data).eq('id', editingReceipt.id);
      } else {
        await supabase.from('toll_receipts').insert([data]);
      }
      await fetchData();
      closeModal();
    } catch (error) {
      console.error('Error saving toll receipt:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this receipt?')) return;
    await supabase.from('toll_receipts').delete().eq('id', id);
    await fetchData();
  };

  const openModal = (receipt?: TollReceipt) => {
    if (receipt) {
      setEditingReceipt(receipt);
      setFormData({
        driver_id: receipt.driver_id,
        date: receipt.date,
        amount: receipt.amount.toString(),
        location: receipt.location,
        receipt_number: receipt.receipt_number || '',
      });
    } else {
      setEditingReceipt(null);
      setFormData({
        driver_id: drivers[0]?.id || '',
        date: new Date().toISOString().split('T')[0],
        amount: '',
        location: '',
        receipt_number: '',
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingReceipt(null);
    setFormData({
      driver_id: '',
      date: new Date().toISOString().split('T')[0],
      amount: '',
      location: '',
      receipt_number: '',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const totalTolls = receipts.reduce((sum, r) => sum + Number(r.amount), 0);

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-slate-800 rounded w-1/4"></div>
          <div className="h-96 bg-slate-800 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Toll Receipts</h1>
          <p className="text-slate-400 mt-1">Track toll payments for all drivers</p>
        </div>
        <button
          onClick={() => openModal()}
          disabled={drivers.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-500/50 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-lg shadow-amber-500/20 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Receipt
        </button>
      </div>

      {drivers.length === 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-6">
          <p className="text-amber-400 text-sm">
            No active drivers found. Please add drivers first before logging toll receipts.
          </p>
        </div>
      )}

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-sm">Total Toll Expenses</p>
            <p className="text-3xl font-bold text-white">{formatCurrency(totalTolls)}</p>
          </div>
          <div className="w-12 h-12 bg-orange-500/20 rounded-lg flex items-center justify-center">
            <Banknote className="w-6 h-6 text-orange-400" />
          </div>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-900/50">
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Driver</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Receipt #</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {receipts.map((receipt) => (
                <tr key={receipt.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-white">
                    {new Date(receipt.date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-300">{receipt.driver?.name || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-300">
                    {receipt.location}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-orange-400 font-medium">
                    {formatCurrency(receipt.amount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-400 text-sm">
                    {receipt.receipt_number || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => openModal(receipt)}
                      className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(receipt.id)}
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {receipts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    No toll receipts recorded yet.
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
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="text-xl font-semibold text-white">
                {editingReceipt ? 'Edit Toll Receipt' : 'Add Toll Receipt'}
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
                  Driver
                </label>
                <select
                  value={formData.driver_id}
                  onChange={(e) => setFormData({ ...formData, driver_id: e.target.value })}
                  required
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
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
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Date
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Location
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  required
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                  placeholder="Toll plaza/location"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Amount ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Receipt Number (Optional)
                </label>
                <input
                  type="text"
                  value={formData.receipt_number}
                  onChange={(e) => setFormData({ ...formData, receipt_number: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                  placeholder="Receipt reference number"
                />
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
                  {saving ? 'Saving...' : editingReceipt ? 'Update' : 'Add Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
