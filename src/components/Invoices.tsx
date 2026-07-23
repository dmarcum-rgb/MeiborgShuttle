import { useEffect, useState } from 'react';
import { supabase, Invoice, InvoiceWithDriver, Driver, HoursLog } from '../lib/supabase';
import { Plus, Eye, FileText, Send, Check, Truck, X } from 'lucide-react';

type InvoiceFormData = {
  driver_id: string;
  date_from: string;
  date_to: string;
  notes: string;
};

export function Invoices() {
  const [invoices, setInvoices] = useState<InvoiceWithDriver[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceWithDriver | null>(null);
  const [formData, setFormData] = useState<InvoiceFormData>({
    driver_id: '',
    date_from: new Date().toISOString().split('T')[0],
    date_to: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [draftTotal, setDraftTotal] = useState<{ hours: number; amount: number } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (formData.driver_id && formData.date_from && formData.date_to) {
      calculateDraftTotal();
    }
  }, [formData]);

  const fetchData = async () => {
    setLoading(true);
    const [invoicesRes, driversRes] = await Promise.all([
      supabase.from('invoices').select('*, driver:drivers(*)').order('created_at', { ascending: false }),
      supabase.from('drivers').select('*'),
    ]);

    const invoicesData = (invoicesRes.data || []).map((inv) => ({
      ...inv,
      driver: Array.isArray(inv.driver) ? inv.driver[0] : inv.driver,
    })) as InvoiceWithDriver[];

    setInvoices(invoicesData);
    setDrivers(driversRes.data || []);
    setLoading(false);
  };

  const calculateDraftTotal = async () => {
    const { data } = await supabase
      .from('hours_log')
      .select('hours')
      .eq('driver_id', formData.driver_id)
      .eq('billed', false)
      .gte('date', formData.date_from)
      .lte('date', formData.date_to);

    if (data) {
      const hours = data.reduce((sum, h) => sum + Number(h.hours), 0);
      setDraftTotal({ hours, amount: hours * 79 });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftTotal || draftTotal.hours === 0) {
      alert('No unbilled hours found for the selected period.');
      return;
    }

    setSaving(true);
    try {
      const invoiceNumber = await generateInvoiceNumber();

      const invoiceData = {
        invoice_number: invoiceNumber,
        driver_id: formData.driver_id,
        date_from: formData.date_from,
        date_to: formData.date_to,
        total_hours: draftTotal.hours,
        rate_per_hour: 79.00,
        total_amount: draftTotal.amount,
        status: 'pending',
        notes: formData.notes,
      };

      const { data: invoice } = await supabase
        .from('invoices')
        .insert([invoiceData])
        .select()
        .single();

      if (invoice) {
        await supabase
          .from('hours_log')
          .update({ billed: true, invoice_id: invoice.id })
          .eq('driver_id', formData.driver_id)
          .eq('billed', false)
          .gte('date', formData.date_from)
          .lte('date', formData.date_to);
      }

      await fetchData();
      closeModal();
    } catch (error) {
      console.error('Error creating invoice:', error);
    } finally {
      setSaving(false);
    }
  };

  const generateInvoiceNumber = async () => {
    const { data } = await supabase.rpc('generate_invoice_number');
    return data || `INV-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-0001`;
  };

  const updateInvoiceStatus = async (id: string, status: 'pending' | 'sent' | 'paid') => {
    const updateData: Partial<Invoice> = { status };
    if (status === 'sent') {
      updateData.sent_at = new Date().toISOString();
    } else if (status === 'paid') {
      updateData.paid_at = new Date().toISOString();
    }
    await supabase.from('invoices').update(updateData).eq('id', id);
    await fetchData();
  };

  const openModal = () => {
    setFormData({
      driver_id: drivers[0]?.id || '',
      date_from: new Date().toISOString().split('T')[0],
      date_to: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setDraftTotal(null);
  };

  const openPreview = async (invoice: InvoiceWithDriver) => {
    const { data: hoursData } = await supabase
      .from('hours_log')
      .select('*, driver:drivers(*)')
      .eq('invoice_id', invoice.id);

    setPreviewInvoice({
      ...invoice,
      hoursLogs: (hoursData || []).map((h) => ({
        ...h,
        driver: Array.isArray(h.driver) ? h.driver[0] : h.driver,
      })),
    } as unknown as InvoiceWithDriver);
    setShowPreview(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-[rgba(75,211,160,0.12)] text-ok';
      case 'sent':
        return 'bg-glass2 text-dim';
      default:
        return 'bg-signal-dim text-signal';
    }
  };

  const totalInvoiced = invoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0);
  const totalPaid = invoices.filter((inv) => inv.status === 'paid').reduce((sum, inv) => sum + Number(inv.total_amount), 0);
  const totalPending = invoices.filter((inv) => inv.status !== 'paid').reduce((sum, inv) => sum + Number(inv.total_amount), 0);

  if (loading) {
    return (
      <div className="p-8">
        <div className="space-y-4">
          <div className="h-10 skeleton w-1/4"></div>
          <div className="h-96 skeleton rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-light text-mist tracking-tight">Invoices</h1>
          <p className="text-faint mt-1">Generate and manage billing invoices for Geodis at $79/hour</p>
        </div>
        <button
          onClick={openModal}
          disabled={drivers.length === 0}
          className="gbtn flex items-center gap-2 px-4 py-2"
        >
          <Plus className="w-4 h-4" />
          Create Invoice
        </button>
      </div>

      {drivers.length === 0 && (
        <div className="bg-signal-dim border border-[rgba(255,201,60,0.35)] rounded-lg p-4 mb-6">
          <p className="text-signal text-sm">
            No drivers found. Please add drivers and log hours before creating invoices.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-faint text-sm">Total Invoiced</p>
              <p className="text-3xl font-light text-mist tracking-tight">{formatCurrency(totalInvoiced)}</p>
            </div>
            <div className="w-12 h-12 bg-glass2 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-faint" />
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-faint text-sm">Pending</p>
              <p className="text-3xl font-light text-signal tracking-tight">{formatCurrency(totalPending)}</p>
            </div>
            <div className="w-12 h-12 bg-signal-dim rounded-lg flex items-center justify-center">
              <Send className="w-6 h-6 text-signal" />
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-faint text-sm">Received</p>
              <p className="text-3xl font-light text-ok tracking-tight">{formatCurrency(totalPaid)}</p>
            </div>
            <div className="w-12 h-12 bg-[rgba(75,211,160,0.12)] rounded-lg flex items-center justify-center">
              <Check className="w-6 h-6 text-ok" />
            </div>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[rgba(23,26,32,0.94)] backdrop-blur">
                <th className="px-6 py-3 text-left text-xs font-medium text-faint uppercase tracking-wider">Invoice #</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-faint uppercase tracking-wider">Driver</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-faint uppercase tracking-wider">Period</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-faint uppercase tracking-wider">Hours</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-faint uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-faint uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-faint uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-glass2 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-mist font-mono">{invoice.invoice_number}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-faint" />
                      <span className="text-dim">{invoice.driver?.name || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-faint text-sm">
                    {new Date(invoice.date_from).toLocaleDateString()} - {new Date(invoice.date_to).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-mist">
                    {Number(invoice.total_hours).toFixed(1)} hrs
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-ok font-medium">
                    {formatCurrency(invoice.total_amount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}>
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => openPreview(invoice)}
                      className="p-2 text-faint hover:text-mist hover:bg-glass2 rounded-lg transition-all"
                      title="View Invoice"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {invoice.status === 'pending' && (
                      <button
                        onClick={() => updateInvoiceStatus(invoice.id, 'sent')}
                        className="p-2 text-faint hover:text-signal hover:bg-glass2 rounded-lg transition-all"
                        title="Mark as Sent"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    )}
                    {(invoice.status === 'pending' || invoice.status === 'sent') && (
                      <button
                        onClick={() => updateInvoiceStatus(invoice.id, 'paid')}
                        className="p-2 text-faint hover:text-ok hover:bg-glass2 rounded-lg transition-all"
                        title="Mark as Paid"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-faint">
                    No invoices created yet. Create an invoice from unbilled hours.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Invoice Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1b1f27] border border-edge2 rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-edge">
              <h2 className="text-xl font-semibold text-mist">Create Invoice for Geodis</h2>
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
                  className="ginput w-full px-4 py-3"
                >
                  <option value="">Select a driver</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name} (Truck #{driver.truck_number})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dim mb-2">
                    From Date
                  </label>
                  <input
                    type="date"
                    value={formData.date_from}
                    onChange={(e) => setFormData({ ...formData, date_from: e.target.value })}
                    required
                    className="ginput w-full px-4 py-3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dim mb-2">
                    To Date
                  </label>
                  <input
                    type="date"
                    value={formData.date_to}
                    onChange={(e) => setFormData({ ...formData, date_to: e.target.value })}
                    required
                    className="ginput w-full px-4 py-3"
                  />
                </div>
              </div>

              {draftTotal && (
                <div className="bg-glass2 border border-edge rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-faint text-sm">Hours to Bill</p>
                      <p className="text-xl font-light text-mist">{draftTotal.hours.toFixed(1)} hrs</p>
                    </div>
                    <div className="text-right">
                      <p className="text-faint text-sm">Total Amount</p>
                      <p className="text-xl font-light text-ok">{formatCurrency(draftTotal.amount)}</p>
                      <p className="text-xs text-faint">@ $79/hour</p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-dim mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="ginput w-full px-4 py-3 resize-none"
                  placeholder="Additional invoice notes..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="gbtn-ghost flex-1 px-4 py-3"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !draftTotal || draftTotal.hours === 0}
                  className="gbtn flex-1 px-4 py-3"
                >
                  {saving ? 'Creating...' : 'Create Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Preview Modal */}
      {showPreview && previewInvoice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1b1f27] border border-edge2 rounded-xl w-full max-w-2xl shadow-xl text-mist">
            <div className="flex items-center justify-between p-6 border-b border-edge">
              <h2 className="text-xl font-semibold">Invoice {previewInvoice.invoice_number}</h2>
              <button
                onClick={() => setShowPreview(false)}
                className="p-2 text-faint hover:text-mist hover:bg-glass2 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {/* Header */}
              <div className="flex justify-between mb-8">
                <div>
                  <h3 className="font-bold text-lg">Meiborg</h3>
                  <p className="text-sm text-dim">Driver Management</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-dim">Bill To:</p>
                  <p className="font-semibold">Geodis</p>
                  <p className="text-sm text-dim">Global Logistics</p>
                </div>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-glass2 rounded-lg">
                <div>
                  <p className="text-sm text-faint">Invoice Number</p>
                  <p className="font-medium">{previewInvoice.invoice_number}</p>
                </div>
                <div>
                  <p className="text-sm text-faint">Driver</p>
                  <p className="font-medium">{previewInvoice.driver?.name}</p>
                </div>
                <div>
                  <p className="text-sm text-faint">Period</p>
                  <p className="font-medium">
                    {new Date(previewInvoice.date_from).toLocaleDateString()} - {new Date(previewInvoice.date_to).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-faint">Status</p>
                  <p className="font-medium capitalize">{previewInvoice.status}</p>
                </div>
              </div>

              {/* Line Items */}
              <table className="w-full mb-6">
                <thead>
                  <tr className="border-b border-edge">
                    <th className="text-left py-2 text-sm text-faint">Description</th>
                    <th className="text-right py-2 text-sm text-faint">Hours</th>
                    <th className="text-right py-2 text-sm text-faint">Rate</th>
                    <th className="text-right py-2 text-sm text-faint">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-edge">
                    <td className="py-3">Driver Services - {previewInvoice.driver?.name}</td>
                    <td className="text-right">{Number(previewInvoice.total_hours).toFixed(1)}</td>
                    <td className="text-right">$79.00</td>
                    <td className="text-right font-medium">{formatCurrency(previewInvoice.total_amount)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Total */}
              <div className="flex justify-end">
                <div className="w-64">
                  <div className="flex justify-between py-2 border-t-2 border-edge2">
                    <span className="font-bold">Total Due</span>
                    <span className="font-bold text-lg">{formatCurrency(previewInvoice.total_amount)}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {previewInvoice.notes && (
                <div className="mt-6 p-4 bg-glass2 rounded-lg">
                  <p className="text-sm text-faint">Notes:</p>
                  <p className="text-sm">{previewInvoice.notes}</p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-edge flex justify-end gap-3">
              <button
                onClick={() => setShowPreview(false)}
                className="gbtn-ghost px-4 py-2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
