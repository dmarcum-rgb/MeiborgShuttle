import { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Upload, X, CheckCircle,
  Loader2, Camera, FileText, Clock, Truck, User
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

type Stop = {
  vendor_name: string;
  city_address: string;
  arrive_time: string;
  departure_time: string;
  delay_reason: string;
  toll_amount: string;
};

type ReceiptFile = {
  id: string;
  file: File;
  type: 'toll' | 'fuel';
  preview: string;
};

type Props = {
  clockInTime: Date;
  clockOutTime: Date;
  workDate: Date;
  prefillStops: { vendor_name: string; city_address: string; arrive_time: string; departure_time: string; toll_amount?: number | null }[];
  onSubmitted: () => void;
  onCancel: () => void;
};

type Step = 'profile' | 'hours' | 'stops' | 'receipts' | 'review';
const STEPS: Step[] = ['profile', 'hours', 'stops', 'receipts', 'review'];

function pad2(n: number) { return String(n).padStart(2, '0'); }

function toHHMM(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function calcHours(start: string, end: string, lunchStart: string, lunchEnd: string): number {
  const toMins = (t: string) => {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const worked = toMins(end) - toMins(start);
  const lunchMins = (lunchStart && lunchEnd) ? toMins(lunchEnd) - toMins(lunchStart) : 0;
  return Math.max(0, (worked - Math.max(0, lunchMins)) / 60);
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function TimesheetSubmission({ clockInTime, clockOutTime, workDate, prefillStops, onSubmitted, onCancel }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('profile');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Profile
  const [fullName, setFullName] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Hours
  const [startTime, setStartTime] = useState(toHHMM(clockInTime));
  const [endTime, setEndTime] = useState(toHHMM(clockOutTime));
  const [lunchStart, setLunchStart] = useState('');
  const [lunchEnd, setLunchEnd] = useState('');
  const [notes, setNotes] = useState('');

  // Stops
  const [stops, setStops] = useState<Stop[]>(() =>
    prefillStops.length > 0
      ? prefillStops.map(s => ({
          vendor_name: s.vendor_name,
          city_address: s.city_address,
          arrive_time: s.arrive_time,
          departure_time: s.departure_time,
          delay_reason: '',
          toll_amount: s.toll_amount != null ? String(s.toll_amount) : '',
        }))
      : [{ vendor_name: '', city_address: '', arrive_time: '', departure_time: '', delay_reason: '', toll_amount: '' }]
  );

  // Fuel
  const [fuelGallons, setFuelGallons] = useState('');
  const [fuelDollars, setFuelDollars] = useState('');

  // Toll total — kept in sync with per-stop toll fields
  const [tollTotal, setTollTotal] = useState(() => {
    const sum = prefillStops.reduce((acc, s) => acc + (s.toll_amount ?? 0), 0);
    return sum > 0 ? sum.toFixed(2) : '';
  });

  // Receipts
  const [receipts, setReceipts] = useState<ReceiptFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [receiptType, setReceiptType] = useState<'toll' | 'fuel'>('toll');
  const [lightboxReceipt, setLightboxReceipt] = useState<ReceiptFile | null>(null);

  const totalHours = calcHours(startTime, endTime, lunchStart, lunchEnd);

  // Derive display name from email slug (driver-antonio-cadena@meiborg.local → Antonio Cadena)
  function nameFromEmail(email: string): string {
    const match = email.match(/^driver-(.+)@meiborg\.local$/);
    if (!match) return '';
    return match[1]
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  // Load saved driver profile — auto-populate name from email if not yet saved
  useEffect(() => {
    if (!user || profileLoaded) return;
    supabase
      .from('driver_profiles')
      .select('full_name, vehicle_number')
      .eq('driver_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data && data.full_name) {
          setFullName(data.full_name);
          setVehicleNumber(data.vehicle_number);
        } else {
          // First login — derive name from email
          const derived = nameFromEmail(user.email ?? '');
          if (derived) setFullName(derived);
        }
        setProfileLoaded(true);
      });
  }, [user, profileLoaded]);

  // ── Stop helpers ──────────────────────────────────────────────────────────
  const addStop = () => setStops(s => [...s, { vendor_name: '', city_address: '', arrive_time: '', departure_time: '', delay_reason: '', toll_amount: '' }]);
  const removeStop = (i: number) => setStops(s => s.filter((_, idx) => idx !== i));
  const updateStop = (i: number, field: keyof Stop, val: string) =>
    setStops(s => s.map((st, idx) => idx === i ? { ...st, [field]: val } : st));

  // ── Receipt helpers ───────────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(file => {
      const preview = URL.createObjectURL(file);
      setReceipts(r => [...r, { id: crypto.randomUUID(), file, type: receiptType, preview }]);
    });
    e.target.value = '';
  };

  const removeReceipt = (id: string) =>
    setReceipts(r => r.filter(x => x.id !== id));

  // ── Submission ────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!user || submitting) return;
    setSubmitting(true);

    // Upsert profile
    await supabase.from('driver_profiles').upsert({
      driver_id: user.id,
      full_name: fullName,
      vehicle_number: vehicleNumber,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'driver_id' });

    // Insert timesheet
    const { data: ts, error: tsErr } = await supabase
      .from('timesheets')
      .insert({
        driver_id: user.id,
        driver_name: fullName,
        vehicle_number: vehicleNumber,
        work_date: workDate.toISOString().split('T')[0],
        start_time: startTime,
        end_time: endTime,
        total_hours: parseFloat(totalHours.toFixed(2)),
        lunch_start: lunchStart,
        lunch_end: lunchEnd,
        notes,
        fuel_gallons: fuelGallons ? parseFloat(fuelGallons) : null,
        fuel_dollars: fuelDollars ? parseFloat(fuelDollars) : null,
        toll_total: tollTotal ? parseFloat(tollTotal) : null,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (tsErr || !ts) { setSubmitting(false); return; }

    // Insert stops
    const filteredStops = stops.filter(s => s.vendor_name.trim());
    if (filteredStops.length > 0) {
      await supabase.from('timesheet_stops').insert(
        filteredStops.map((s, i) => ({ ...s, timesheet_id: ts.id, sort_order: i }))
      );
    }

    // Upload receipt images
    for (const receipt of receipts) {
      const ext = receipt.file.name.split('.').pop() ?? 'jpg';
      const path = `${user.id}/${ts.id}/${receipt.type}-${receipt.id}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('receipts')
        .upload(path, receipt.file);
      if (!uploadErr) {
        await supabase.from('receipt_images').insert({
          timesheet_id: ts.id,
          driver_id: user.id,
          receipt_type: receipt.type,
          storage_path: path,
        });
      }
    }

    setSubmitting(false);
    setSubmitted(true);
    setTimeout(onSubmitted, 2500);
  };

  // ── Navigation ────────────────────────────────────────────────────────────
  const stepIndex = STEPS.indexOf(step);
  const canNext = () => {
    if (step === 'profile') return fullName.trim().length > 0 && vehicleNumber.trim().length > 0;
    if (step === 'hours') return startTime && endTime;
    return true;
  };

  const nextStep = () => {
    if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1]);
  };
  const prevStep = () => {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
  };

  // ── Submitted screen ──────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="fixed inset-0 bg-gray-900 z-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-semibold text-white mb-2 font-serif">Timesheet Submitted</h2>
          <p className="text-gray-400">Your timesheet for {DAYS[workDate.getDay()]}, {workDate.toLocaleDateString()} has been submitted to the office.</p>
        </div>
      </div>
    );
  }

  // ── Lightbox ──────────────────────────────────────────────────────────────
  if (lightboxReceipt) {
    return (
      <div className="fixed inset-0 z-[60] bg-black flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${
              lightboxReceipt.type === 'toll' ? 'bg-blue-600 text-white' : 'bg-amber-500 text-white'
            }`}>{lightboxReceipt.type} Receipt</span>
            <span className="text-gray-400 text-xs truncate max-w-[160px]">{lightboxReceipt.file.name}</span>
          </div>
          <button
            onClick={() => setLightboxReceipt(null)}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Image */}
        <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
          {lightboxReceipt.file.type.startsWith('image/') ? (
            <img
              src={lightboxReceipt.preview}
              alt="receipt"
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <FileText className="w-16 h-16" />
              <p className="text-sm">{lightboxReceipt.file.name}</p>
            </div>
          )}
        </div>

        {/* Footer — confirm or retake */}
        <div className="px-4 pb-8 pt-3 flex gap-3 flex-shrink-0">
          <button
            onClick={() => { removeReceipt(lightboxReceipt.id); setLightboxReceipt(null); }}
            className="flex-1 py-3 border border-red-500 text-red-400 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-red-500/10 transition-colors"
          >
            <X className="w-4 h-4" />Retake / Remove
          </button>
          <button
            onClick={() => setLightboxReceipt(null)}
            className="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <CheckCircle className="w-4 h-4" />Looks Good
          </button>
        </div>
      </div>
    );
  }

  // ── Step progress bar ─────────────────────────────────────────────────────
  const stepLabels: Record<Step, string> = {
    profile: 'Profile',
    hours: 'Hours',
    stops: 'Stops',
    receipts: 'Receipts',
    review: 'Review',
  };

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <button onClick={onCancel} className="text-gray-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
        <div className="text-center">
          <p className="text-white font-semibold text-sm">Daily Timesheet</p>
          <p className="text-gray-400 text-xs">{DAYS[workDate.getDay()]}, {workDate.toLocaleDateString()}</p>
        </div>
        <div className="w-5" />
      </div>

      {/* Step indicator */}
      <div className="bg-gray-800 px-4 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              <button
                onClick={() => i < stepIndex && setStep(s)}
                className={`flex flex-col items-center gap-1 ${i < stepIndex ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                  s === step ? 'bg-white text-gray-900' :
                  i < stepIndex ? 'bg-green-500 text-white' : 'bg-gray-600 text-gray-400'
                }`}>
                  {i < stepIndex ? <CheckCircle className="w-4 h-4" /> : i + 1}
                </div>
                <span className={`text-xs ${s === step ? 'text-white' : 'text-gray-500'}`}>{stepLabels[s]}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-px mx-1 mb-4 ${i < stepIndex ? 'bg-green-500' : 'bg-gray-600'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-lg mx-auto p-4 pb-24">

          {/* ── PROFILE ─────────────────────────────────────── */}
          {step === 'profile' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 font-serif mb-1">Driver Profile</h2>
                <p className="text-gray-500 text-sm">Confirm your info before submitting.</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <User className="inline w-4 h-4 mr-1" />Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="e.g. Antonio Cadena"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Truck className="inline w-4 h-4 mr-1" />Vehicle Number
                  </label>
                  <input
                    type="text"
                    value={vehicleNumber}
                    onChange={e => setVehicleNumber(e.target.value)}
                    placeholder="e.g. 609"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800 text-gray-900"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── HOURS ────────────────────────────────────────── */}
          {step === 'hours' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 font-serif mb-1">Hours & Schedule</h2>
                <p className="text-gray-500 text-sm">Review your clock-in/out times.</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                    <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                    <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800" />
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Hours Today</p>
                  <p className="text-3xl font-semibold text-gray-900">{totalHours.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    <Clock className="inline w-4 h-4 mr-1" />Lunch Break (30 min)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Start</label>
                      <input type="time" value={lunchStart} onChange={e => setLunchStart(e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">End</label>
                      <input type="time" value={lunchEnd} onChange={e => setLunchEnd(e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800 text-sm" />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Any notes for the office..."
                    rows={3}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800 text-sm resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── STOPS ────────────────────────────────────────── */}
          {step === 'stops' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 font-serif mb-1">Stops</h2>
                <p className="text-gray-500 text-sm">Review and edit your stops. Auto-filled from your routes.</p>
              </div>
              <div className="space-y-3">
                {stops.map((stop, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Stop {i + 1}</span>
                      {stops.length > 1 && (
                        <button onClick={() => removeStop(i)} className="text-red-400 hover:text-red-600 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Vendor</label>
                          <input type="text" value={stop.vendor_name} onChange={e => updateStop(i, 'vendor_name', e.target.value)}
                            placeholder="UCA, Leading Americas..."
                            className="w-full px-2.5 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">City / Address</label>
                          <input type="text" value={stop.city_address} onChange={e => updateStop(i, 'city_address', e.target.value)}
                            placeholder="Marengo, IL"
                            className="w-full px-2.5 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800 text-sm" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Departure Time</label>
                          <input type="time" value={stop.departure_time} onChange={e => updateStop(i, 'departure_time', e.target.value)}
                            className="w-full px-2.5 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Arrive Time</label>
                          <input type="time" value={stop.arrive_time} onChange={e => updateStop(i, 'arrive_time', e.target.value)}
                            className="w-full px-2.5 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800 text-sm" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Toll Amount</label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                            <input
                              type="number"
                              step="0.01"
                              value={stop.toll_amount}
                              onChange={e => {
                                updateStop(i, 'toll_amount', e.target.value);
                                const updated = stops.map((s, idx) => idx === i ? { ...s, toll_amount: e.target.value } : s);
                                const sum = updated.reduce((acc, s) => acc + (parseFloat(s.toll_amount) || 0), 0);
                                setTollTotal(sum > 0 ? sum.toFixed(2) : '');
                              }}
                              placeholder="0.00"
                              className="w-full pl-6 pr-2.5 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800 text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Delay Reason (if any)</label>
                          <input type="text" value={stop.delay_reason} onChange={e => updateStop(i, 'delay_reason', e.target.value)}
                            placeholder="Optional"
                            className="w-full px-2.5 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800 text-sm" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={addStop}
                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-all flex items-center justify-center gap-2 text-sm font-medium">
                <Plus className="w-4 h-4" />Add Stop
              </button>
            </div>
          )}

          {/* ── RECEIPTS ─────────────────────────────────────── */}
          {step === 'receipts' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 font-serif mb-1">Receipt Photos</h2>
                <p className="text-gray-500 text-sm">Upload photos of your toll and fuel receipts. Tap any image to confirm it looks correct.</p>
              </div>

              {/* Fuel totals */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-700">Fuel Summary</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Fuel Gallons</label>
                    <input type="number" step="0.001" value={fuelGallons} onChange={e => setFuelGallons(e.target.value)}
                      placeholder="0.000"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Fuel $ Amount</label>
                    <input type="number" step="0.01" value={fuelDollars} onChange={e => setFuelDollars(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800 text-sm" />
                  </div>
                </div>
              </div>

              {/* Toll totals */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Toll Summary</p>
                  <p className="text-xs text-gray-500 mt-0.5">Auto-filled from your stops. Adjust if needed.</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Total Toll $ Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={tollTotal}
                      onChange={e => setTollTotal(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800 text-sm"
                    />
                  </div>
                </div>
                {stops.some(s => s.toll_amount) && (
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                    {stops.filter(s => s.vendor_name && s.toll_amount).map((s, i) => (
                      <div key={i} className="flex justify-between text-xs text-gray-600">
                        <span className="truncate mr-2">{s.vendor_name}</span>
                        <span className="font-medium flex-shrink-0">${parseFloat(s.toll_amount || '0').toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Upload area */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <div className="flex gap-2">
                  {(['toll', 'fuel'] as const).map(t => (
                    <button key={t} onClick={() => setReceiptType(t)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
                        receiptType === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {t} Receipt
                    </button>
                  ))}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple capture="environment" onChange={handleFileSelect} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()}
                  className="w-full py-8 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-all active:bg-gray-50">
                  <Camera className="w-8 h-8" />
                  <span className="text-sm font-medium">Tap to take photo or choose file</span>
                  <span className="text-xs text-gray-400">Adding as: <strong className="capitalize">{receiptType}</strong> receipt</span>
                </button>
              </div>

              {/* Uploaded receipts — image grid with tap-to-preview */}
              {receipts.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-700">{receipts.length} receipt{receipts.length > 1 ? 's' : ''} added</p>
                    <div className="flex gap-1.5">
                      {receipts.filter(r => r.type === 'toll').length > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                          {receipts.filter(r => r.type === 'toll').length} toll
                        </span>
                      )}
                      {receipts.filter(r => r.type === 'fuel').length > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                          {receipts.filter(r => r.type === 'fuel').length} fuel
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {receipts.map(r => (
                      <div key={r.id} className="relative group">
                        {/* Tap target — opens lightbox */}
                        <button
                          onClick={() => setLightboxReceipt(r)}
                          className="w-full aspect-[3/4] rounded-xl overflow-hidden border-2 border-gray-200 hover:border-gray-400 active:scale-95 transition-all block"
                        >
                          {r.file.type.startsWith('image/') ? (
                            <img src={r.preview} alt="receipt" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gray-100 flex flex-col items-center justify-center gap-2">
                              <FileText className="w-8 h-8 text-gray-400" />
                              <span className="text-xs text-gray-500 px-2 text-center truncate w-full">{r.file.name}</span>
                            </div>
                          )}
                          {/* Type badge overlay */}
                          <div className={`absolute top-2 left-2 text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                            r.type === 'toll' ? 'bg-blue-600 text-white' : 'bg-amber-500 text-white'
                          }`}>{r.type}</div>
                          {/* View hint */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-xl flex items-center justify-center">
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium bg-black/50 px-2 py-1 rounded-full">Tap to verify</span>
                          </div>
                        </button>
                        {/* Remove button */}
                        <button
                          onClick={() => removeReceipt(r.id)}
                          className="absolute top-2 right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 text-center">Tap an image to verify it looks correct before continuing</p>
                </div>
              )}
            </div>
          )}

          {/* ── REVIEW ───────────────────────────────────────── */}
          {step === 'review' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 font-serif mb-1">Review & Submit</h2>
                <p className="text-gray-500 text-sm">Confirm everything is correct before submitting.</p>
              </div>

              {/* Header summary */}
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                <div className="p-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Driver</p>
                    <p className="text-gray-900 font-semibold mt-0.5">{fullName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Vehicle #</p>
                    <p className="text-gray-900 font-semibold mt-0.5">{vehicleNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Date</p>
                    <p className="text-gray-900 font-medium mt-0.5">{DAYS[workDate.getDay()]}, {workDate.toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Total Hours</p>
                    <p className="text-2xl font-semibold text-gray-900 mt-0.5">{totalHours.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Start / End</p>
                    <p className="text-gray-900 font-medium mt-0.5">{startTime} – {endTime}</p>
                  </div>
                  {(lunchStart || lunchEnd) && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Lunch</p>
                      <p className="text-gray-900 font-medium mt-0.5">{lunchStart} – {lunchEnd}</p>
                    </div>
                  )}
                </div>
                {notes && (
                  <div className="p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Notes</p>
                    <p className="text-gray-700 text-sm">{notes}</p>
                  </div>
                )}
              </div>

              {/* Stops */}
              {stops.filter(s => s.vendor_name).length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <p className="text-sm font-semibold text-gray-700">Stops ({stops.filter(s => s.vendor_name).length})</p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {stops.filter(s => s.vendor_name).map((s, i) => (
                      <div key={i} className="px-4 py-3 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="font-medium text-gray-900">{s.vendor_name}</p>
                          <p className="text-gray-500 text-xs">{s.city_address}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-gray-700">{s.arrive_time} → {s.departure_time}</p>
                          {s.delay_reason && <p className="text-xs text-amber-600">{s.delay_reason}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fuel & Toll */}
              {(fuelGallons || fuelDollars || tollTotal) && (
                <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-2 gap-3">
                  {fuelGallons && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Fuel Gallons</p>
                      <p className="text-gray-900 font-semibold mt-0.5">{fuelGallons}</p>
                    </div>
                  )}
                  {fuelDollars && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Fuel $</p>
                      <p className="text-gray-900 font-semibold mt-0.5">${parseFloat(fuelDollars).toFixed(2)}</p>
                    </div>
                  )}
                  {tollTotal && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Total Tolls</p>
                      <p className="text-gray-900 font-semibold mt-0.5">${parseFloat(tollTotal).toFixed(2)}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Receipts */}
              {receipts.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Receipts Attached ({receipts.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {receipts.map(r => (
                      <span key={r.id} className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${
                        r.type === 'toll' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
                      }`}>{r.type}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-3 max-w-lg mx-auto">
        {stepIndex > 0 && (
          <button onClick={prevStep}
            className="flex items-center gap-1.5 px-5 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-all">
            <ChevronLeft className="w-4 h-4" />Back
          </button>
        )}
        {step !== 'review' ? (
          <button onClick={nextStep} disabled={!canNext()}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-all">
            Continue <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={submitting}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl font-semibold transition-all text-lg">
            {submitting ? <><Loader2 className="w-5 h-5 animate-spin" />Submitting...</> : <><Upload className="w-5 h-5" />Submit Timesheet</>}
          </button>
        )}
      </div>
    </div>
  );
}
