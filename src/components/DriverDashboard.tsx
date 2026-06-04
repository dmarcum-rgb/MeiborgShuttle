import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Navigation, ChevronDown, CheckCircle, Loader2, AlertCircle, Clock, LogIn, LogOut, Menu, X as XIcon, Package, Receipt, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { TimesheetSubmission } from './TimesheetSubmission';

const ARRIVAL_RADIUS_M = 200;

type Vendor = {
  name: string;
  address: string;
  toll: number | null;
  note?: string;
  lat?: number;
  lng?: number;
};

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters: number): string {
  const miles = meters / 1609.344;
  if (miles < 0.1) return `${Math.round(meters * 3.28084)} ft`;
  return `${miles.toFixed(1)} mi`;
}

function estimateTime(meters: number): string {
  const hours = meters / 1609.344 / 55;
  const totalMins = Math.round(hours * 60);
  if (totalMins < 1) return '< 1 min';
  if (totalMins < 60) return `${totalMins} min`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

type RouteState = 'idle' | 'active' | 'arrived';
type ClockStatus = 'loading' | 'clocked_out' | 'clocked_in';

type ClockBarProps = {
  userId: string | undefined;
  onClockOut: (clockInTime: Date, clockOutTime: Date, completedRoutes: CompletedRoute[]) => void;
  onSignOut: () => void;
  onStatusChange: (clocked: boolean) => void;
};

type CompletedRoute = {
  vendor_name: string;
  city_address: string;
  arrive_time: string;
  departure_time: string;
  toll_amount?: number | null;
};

// ─── CLOCK BAR ────────────────────────────────────────────────────────────────
function ClockBar({ userId, onClockOut, onSignOut, onStatusChange }: ClockBarProps) {
  const [status, setStatus] = useState<ClockStatus>('loading');
  const [clockInTime, setClockInTime] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState('');
  const [toggling, setToggling] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('clock_events')
      .select('type, timestamp')
      .eq('driver_id', userId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.type === 'clock_in') {
          setStatus('clocked_in');
          setClockInTime(new Date(data.timestamp));
          onStatusChange(true);
        } else {
          setStatus('clocked_out');
          onStatusChange(false);
        }
      });
  }, [userId]);

  useEffect(() => {
    if (status !== 'clocked_in' || !clockInTime) { setElapsed(''); return; }
    const tick = () => {
      const secs = Math.floor((Date.now() - clockInTime.getTime()) / 1000);
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      setElapsed(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [status, clockInTime]);

  const toggle = async () => {
    if (!userId || toggling) return;
    setToggling(true);
    const newType = status === 'clocked_in' ? 'clock_out' : 'clock_in';
    const now = new Date();
    const { error } = await supabase
      .from('clock_events')
      .insert({ driver_id: userId, type: newType, timestamp: now.toISOString() });

    if (!error) {
      if (newType === 'clock_in') {
        setStatus('clocked_in');
        setClockInTime(now);
        onStatusChange(true);
      } else {
        const { data: routes } = await supabase
          .from('route_logs')
          .select('vendor_name, address, started_at, arrived_at, departed_at')
          .eq('driver_id', userId)
          .gte('started_at', clockInTime!.toISOString())
          .not('arrived_at', 'is', null)
          .order('started_at', { ascending: true });

        // Look up toll amounts from vendor_stops for each route
        const vendorNames = [...new Set((routes ?? []).map(r => r.vendor_name))];
        const { data: tollData } = vendorNames.length
          ? await supabase.from('vendor_stops').select('name, toll_amount').in('name', vendorNames)
          : { data: [] };
        const tollMap: Record<string, number | null> = {};
        for (const vs of tollData ?? []) tollMap[vs.name] = vs.toll_amount != null ? Number(vs.toll_amount) : null;

        const completedRoutes: CompletedRoute[] = (routes ?? []).map(r => ({
          vendor_name: r.vendor_name,
          city_address: r.address,
          arrive_time: r.arrived_at ? new Date(r.arrived_at).toTimeString().slice(0, 5) : '',
          departure_time: r.departed_at ? new Date(r.departed_at).toTimeString().slice(0, 5) : '',
          toll_amount: tollMap[r.vendor_name] ?? null,
        }));

        setStatus('clocked_out');
        onStatusChange(false);
        onClockOut(clockInTime!, now, completedRoutes);
        setClockInTime(null);
      }
    }
    setToggling(false);
  };

  if (status === 'loading') return null;

  const isClockedIn = status === 'clocked_in';

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-500" />
          {isClockedIn ? (
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wider">Clocked In</span>
              {elapsed && <span className="ml-2 text-sm font-mono font-medium text-gray-900">{elapsed}</span>}
            </div>
          ) : (
            <span className="text-sm text-gray-500">Not clocked in</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            disabled={toggling}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              isClockedIn
                ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                : 'bg-gray-900 text-white hover:bg-gray-800'
            }`}
          >
            {toggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isClockedIn ? <LogOut className="w-3.5 h-3.5" /> : <LogIn className="w-3.5 h-3.5" />}
            {isClockedIn ? 'Clock Out' : 'Clock In'}
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            >
              {menuOpen ? <XIcon className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                <button
                  onClick={() => { setMenuOpen(false); onSignOut(); }}
                  className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type TimesheetTrigger = {
  clockInTime: Date;
  clockOutTime: Date;
  completedRoutes: CompletedRoute[];
};

export function DriverDashboard() {
  const { user } = useAuth();
  const [selected, setSelected] = useState('');
  const [open, setOpen] = useState(false);
  const [routeState, setRouteState] = useState<RouteState>('idle');
  const [distance, setDistance] = useState<number | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [arrivedVendor, setArrivedVendor] = useState<Vendor | null>(null);
  const [timesheetTrigger, setTimesheetTrigger] = useState<TimesheetTrigger | null>(null);
  const [clockedIn, setClockedIn] = useState<boolean | null>(null);
  const [driverName, setDriverName] = useState('');
  const [hnisNumber, setHnisNumber] = useState('');
  const [vendors, setVendors] = useState<Vendor[]>([]);

  // Toll summary state
  type TodayStop = { vendor_name: string; toll: number | null; arrived_at: string };
  type WeekSummary = { work_date: string; toll_total: number };
  const [todayStops, setTodayStops] = useState<TodayStop[]>([]);
  const [weekHistory, setWeekHistory] = useState<WeekSummary[]>([]);
  const [tollsExpanded, setTollsExpanded] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  const arrivedRef = useRef(false);
  const routeLogIdRef = useRef<string | null>(null);

  const selectedVendor = vendors.find(v => v.name === selected);
  const isMeiborg = selectedVendor?.address.startsWith('Meiborg') ?? false;
  const hasCoords = !!(selectedVendor?.lat && selectedVendor?.lng);

  // Fetch active vendor stops from the database
  useEffect(() => {
    supabase
      .from('vendor_stops')
      .select('name, address, lat, lng, toll_amount, notes')
      .eq('active', true)
      .order('name')
      .then(({ data }) => {
        setVendors(
          (data ?? []).map(r => ({
            name: r.name,
            address: r.address,
            lat: r.lat ?? undefined,
            lng: r.lng ?? undefined,
            toll: r.toll_amount != null ? Number(r.toll_amount) : null,
            note: r.notes || undefined,
          }))
        );
      });
  }, []);

  // Resolve driver display name for HNIS form
  useEffect(() => {
    if (!user?.id) return;
    supabase.rpc('get_driver_names').then(({ data }) => {
      const match = (data ?? []).find((d: any) => d.driver_id === user.id);
      if (match?.display_name) setDriverName(match.display_name);
    });
  }, [user?.id]);

  // Broadcast presence so the office can see who's online
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase.channel('driver_presence', {
      config: { presence: { key: user.id } },
    });
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ user_id: user.id, online_at: new Date().toISOString() });
      }
    });
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // Fetch toll data when idle
  useEffect(() => {
    if (!user?.id || routeState !== 'idle') return;
    const today = new Date().toISOString().split('T')[0];

    // Today's completed stops with toll amounts
    supabase
      .from('route_logs')
      .select('vendor_name, arrived_at')
      .eq('driver_id', user.id)
      .gte('started_at', today + 'T00:00:00')
      .not('arrived_at', 'is', null)
      .order('arrived_at', { ascending: true })
      .then(({ data }) => {
        const stops: TodayStop[] = (data ?? []).map(r => ({
          vendor_name: r.vendor_name,
          toll: vendors.find(v => v.name === r.vendor_name)?.toll ?? null,
          arrived_at: r.arrived_at,
        }));
        setTodayStops(stops);
      });

    // Last 5 weeks of timesheet toll history
    const fiveWeeksAgo = new Date();
    fiveWeeksAgo.setDate(fiveWeeksAgo.getDate() - 35);
    supabase
      .from('timesheets')
      .select('work_date, toll_total')
      .eq('driver_id', user.id)
      .gte('work_date', fiveWeeksAgo.toISOString().split('T')[0])
      .not('toll_total', 'is', null)
      .order('work_date', { ascending: false })
      .then(({ data }) => {
        setWeekHistory(
          (data ?? [])
            .filter(t => (t.toll_total ?? 0) > 0)
            .map(t => ({ work_date: t.work_date, toll_total: Number(t.toll_total) }))
        );
      });
  }, [user?.id, routeState]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => () => stopWatching(), [stopWatching]);

  const markArrived = useCallback(async (logId: string, vendor: Vendor) => {
    if (arrivedRef.current) return;
    arrivedRef.current = true;
    stopWatching();
    setArrivedVendor(vendor);
    setShowHnisPrompt(true);
    setRouteState('arrived');
    await supabase
      .from('route_logs')
      .update({ arrived_at: new Date().toISOString() })
      .eq('id', logId);
  }, [stopWatching]);

  const startGeofence = useCallback((vendor: Vendor, logId: string) => {
    if (!vendor.lat || !vendor.lng || !navigator.geolocation) {
      if (!navigator.geolocation) setGeoError('Geolocation not supported on this device.');
      return;
    }
    setGeoError(null);
    arrivedRef.current = false;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const d = distanceMeters(pos.coords.latitude, pos.coords.longitude, vendor.lat!, vendor.lng!);
        setDistance(Math.round(d));
        if (d <= ARRIVAL_RADIUS_M) markArrived(logId, vendor);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED)
          setGeoError('Location access denied. Enable location for arrival detection.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  }, [markArrived]);

  const handleStartRoute = async () => {
    if (!selectedVendor || !user) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('route_logs')
      .insert({
        driver_id: user.id,
        vendor_name: selectedVendor.name,
        address: selectedVendor.address,
        lat: selectedVendor.lat ?? null,
        lng: selectedVendor.lng ?? null,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    setSaving(false);
    if (error || !data) { setGeoError('Failed to log route. Please try again.'); return; }
    routeLogIdRef.current = data.id;

    // Save HNIS number if provided
    if (hnisNumber.trim()) {
      await supabase.from('hnis_loads').insert({
        driver_id: user.id,
        driver_name: driverName,
        load_number: hnisNumber.trim(),
        log_date: new Date().toISOString().split('T')[0],
        supplier_name: selectedVendor.name,
        supplier_address: selectedVendor.address,
        notes: '',
      });
      setHnisNumber('');
    }

    setRouteState('active');
    if (hasCoords && !isMeiborg) startGeofence(selectedVendor, data.id);
  };

  const proceedToNextRoute = async () => {
    if (routeLogIdRef.current) {
      await supabase
        .from('route_logs')
        .update({ departed_at: new Date().toISOString() })
        .eq('id', routeLogIdRef.current);
    }
    stopWatching();
    setSelected('');
    setRouteState('idle');
    setDistance(null);
    setGeoError(null);
    setArrivedVendor(null);
    arrivedRef.current = false;
    routeLogIdRef.current = null;
  };

  const handleClockOut = (clockInTime: Date, clockOutTime: Date, completedRoutes: CompletedRoute[]) => {
    setTimesheetTrigger({ clockInTime, clockOutTime, completedRoutes });
  };

  const handleSignOut = async () => {
    stopWatching();
    await supabase.auth.signOut();
  };

  // ─── TIMESHEET MODAL ─────────────────────────────────────────────────────────
  if (timesheetTrigger) {
    return (
      <TimesheetSubmission
        clockInTime={timesheetTrigger.clockInTime}
        clockOutTime={timesheetTrigger.clockOutTime}
        workDate={timesheetTrigger.clockOutTime}
        prefillStops={timesheetTrigger.completedRoutes}
        onSubmitted={() => setTimesheetTrigger(null)}
        onCancel={() => setTimesheetTrigger(null)}
      />
    );
  }

  // ─── ARRIVED SCREEN ───────────────────────────────────────────────────────────
  if (routeState === 'arrived' && arrivedVendor) {
    return (
      <div className="min-h-screen bg-gray-50 pt-14">
        <ClockBar userId={user?.id} onClockOut={handleClockOut} onSignOut={handleSignOut} onStatusChange={setClockedIn} />

        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] p-6">
          <div className="w-full max-w-lg">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-gray-900 px-6 py-5 flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-green-400" />
                <div>
                  <span className="text-green-400 text-sm font-medium uppercase tracking-widest block">Arrived</span>
                  <h2 className="text-2xl font-semibold text-white font-serif">{arrivedVendor.name}</h2>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-gray-600">Your arrival has been automatically logged.</p>
                {arrivedVendor.toll !== null && (
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Toll Amount</p>
                    <p className="text-2xl font-semibold text-gray-900">${arrivedVendor.toll.toFixed(2)}</p>
                  </div>
                )}
                {arrivedVendor.note && (
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Note</p>
                    <p className="text-gray-700 font-medium">{arrivedVendor.note}</p>
                  </div>
                )}
                <button
                  onClick={proceedToNextRoute}
                  className="w-full py-4 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl transition-all text-lg tracking-wide flex items-center justify-center gap-2"
                >
                  <Navigation className="w-5 h-5" />
                  Select Next Route
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── ACTIVE ROUTE SCREEN ──────────────────────────────────────────────────────
  if (routeState === 'active' && selectedVendor) {
    return (
      <div className="min-h-screen bg-gray-50 pt-14">
        <ClockBar userId={user?.id} onClockOut={handleClockOut} onSignOut={handleSignOut} onStatusChange={setClockedIn} />
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] p-6">
          <div className="w-full max-w-lg">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-gray-900 px-6 py-5">
                <div className="flex items-center gap-2 mb-1">
                  <Navigation className="w-4 h-4 text-white" />
                  <span className="text-white text-sm font-medium uppercase tracking-widest">Route Active</span>
                </div>
                <h2 className="text-2xl font-semibold text-white font-serif">{selectedVendor.name}</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Destination</p>
                  <p className="text-gray-900 font-medium text-lg">{selectedVendor.address}</p>
                </div>

                {hasCoords && !isMeiborg && (
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Distance to Destination</p>
                    {geoError ? (
                      <div className="flex items-center gap-2 text-amber-600">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <p className="text-sm">{geoError}</p>
                      </div>
                    ) : distance !== null ? (
                      <div className="flex items-center gap-6">
                        <div>
                          <p className="text-2xl font-semibold text-gray-900">{formatDistance(distance)}</p>
                          <p className="text-xs text-gray-500 mt-0.5">Arrival auto-detects within 650 ft</p>
                        </div>
                        <div className="border-l border-gray-300 pl-6">
                          <p className="text-2xl font-semibold text-gray-900">{estimateTime(distance)}</p>
                          <p className="text-xs text-gray-500 mt-0.5">Est. drive time</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-gray-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">Acquiring location...</span>
                      </div>
                    )}
                  </div>
                )}

                {selectedVendor.toll !== null && (
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Toll Amount</p>
                    <p className="text-2xl font-semibold text-gray-900">${selectedVendor.toll.toFixed(2)}</p>
                  </div>
                )}
                {selectedVendor.note && (
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Note</p>
                    <p className="text-gray-700 font-medium">{selectedVendor.note}</p>
                  </div>
                )}

                {!isMeiborg && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedVendor.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 bg-gray-800 hover:bg-gray-900 text-white font-medium rounded-xl transition-all"
                  >
                    <MapPin className="w-4 h-4" />
                    Open in Maps
                  </a>
                )}

                <button
                  onClick={() => routeLogIdRef.current ? markArrived(routeLogIdRef.current, selectedVendor) : setRouteState('arrived')}
                  className="w-full py-3 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Mark as Arrived
                </button>

                <button
                  onClick={proceedToNextRoute}
                  className="w-full py-3 border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium rounded-xl transition-all"
                >
                  Select Different Route
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── ROUTE SELECTION SCREEN ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 pt-14">
      <ClockBar userId={user?.id} onClockOut={handleClockOut} onSignOut={handleSignOut} onStatusChange={setClockedIn} />
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] p-6">
        <div className="w-full max-w-lg">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-semibold text-gray-900 font-serif mb-2">Start Your Route</h1>
            <p className="text-gray-600">Select your destination to begin</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Destination</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpen(!open)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-gray-800 focus:border-transparent transition-all"
                >
                  <span className={selected ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                    {selected || 'Select a vendor / location'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>

                {open && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-72 overflow-y-auto">
                    {vendors.map((vendor) => (
                      <button
                        key={vendor.name}
                        type="button"
                        onClick={() => { setSelected(vendor.name); setOpen(false); }}
                        className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 ${
                          selected === vendor.name ? 'bg-gray-50' : ''
                        }`}
                      >
                        <p className="text-gray-900 font-medium text-sm">{vendor.name}</p>
                        <p className="text-gray-500 text-xs mt-0.5 truncate">{vendor.address}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {selectedVendor && (
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Address</p>
                  <p className="text-gray-900 font-medium mt-0.5">{selectedVendor.address}</p>
                </div>
                {selectedVendor.toll !== null && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Toll</p>
                    <p className="text-gray-900 font-semibold mt-0.5">${selectedVendor.toll.toFixed(2)}</p>
                  </div>
                )}
                {selectedVendor.note && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Note</p>
                    <p className="text-gray-700 mt-0.5">{selectedVendor.note}</p>
                  </div>
                )}
                {hasCoords && !isMeiborg && (
                  <div className="flex items-center gap-1.5 pt-1">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <p className="text-xs text-green-700 font-medium">Geofence arrival detection enabled</p>
                  </div>
                )}
              </div>
            )}

            {clockedIn === false && (
              <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <p className="text-sm text-amber-700 font-medium">You must clock in before starting a route.</p>
              </div>
            )}

            <button
              onClick={handleStartRoute}
              disabled={!selected || saving || clockedIn !== true}
              className="w-full py-4 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all text-lg tracking-wide flex items-center justify-center gap-2"
            >
              {saving ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Logging Route...</>
              ) : (
                <><Navigation className="w-5 h-5" /> Start Route</>
              )}
            </button>
          </div>

          {/* ── HNIS Load Number ── */}
          <div className="mt-4 bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-amber-500" />
              <p className="text-sm font-semibold text-gray-700">HNIS Load # <span className="text-gray-400 font-normal">(optional)</span></p>
            </div>
            <input
              type="text"
              value={hnisNumber}
              onChange={e => setHnisNumber(e.target.value)}
              placeholder="Enter HNIS load number..."
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-800 transition-all"
            />
          </div>

          {/* ── Toll Summary Card ── */}
          {(() => {
            const todayTotal = todayStops.reduce((s, st) => s + (st.toll ?? 0), 0);
            const stopsWithToll = todayStops.filter(st => st.toll != null && st.toll > 0);
            return (
              <div className="mt-4 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => setTollsExpanded(e => !e)}
                  className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-rose-50 rounded-lg flex items-center justify-center">
                      <Receipt className="w-4 h-4 text-rose-600" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-900">Today's Tolls</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {todayStops.length === 0
                          ? 'No stops logged yet'
                          : `${todayStops.length} stop${todayStops.length !== 1 ? 's' : ''} completed`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xl font-bold ${todayTotal > 0 ? 'text-rose-600' : 'text-gray-400'}`}>
                      ${todayTotal.toFixed(2)}
                    </span>
                    {tollsExpanded
                      ? <ChevronUp className="w-4 h-4 text-gray-400" />
                      : <ChevronDown className="w-4 h-4 text-gray-400" />
                    }
                  </div>
                </button>

                {tollsExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-4 space-y-4">
                    {/* Today's stop breakdown */}
                    {todayStops.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Today's Stops</p>
                        <div className="space-y-2">
                          {todayStops.map((s, i) => (
                            <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2.5 border border-gray-200">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900 truncate">{s.vendor_name}</p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  Arrived {new Date(s.arrived_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                </p>
                              </div>
                              <span className={`ml-3 text-sm font-semibold flex-shrink-0 ${s.toll && s.toll > 0 ? 'text-rose-600' : 'text-gray-400'}`}>
                                {s.toll && s.toll > 0 ? `$${s.toll.toFixed(2)}` : 'No toll'}
                              </span>
                            </div>
                          ))}
                        </div>
                        {stopsWithToll.length > 0 && (
                          <div className="mt-3 flex items-center justify-between px-3 py-2 bg-rose-50 rounded-lg border border-rose-200">
                            <p className="text-sm font-semibold text-rose-700">Total today</p>
                            <p className="text-sm font-bold text-rose-700">${todayTotal.toFixed(2)}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic text-center py-2">No stops logged today yet.</p>
                    )}

                    {/* Recent history */}
                    {weekHistory.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Recent History</p>
                        <div className="space-y-1.5">
                          {weekHistory.map((w, i) => {
                            const d = new Date(w.work_date + 'T12:00:00');
                            const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                            return (
                              <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-200">
                                <p className="text-sm text-gray-700">{label}</p>
                                <p className="text-sm font-semibold text-rose-600">${w.toll_total.toFixed(2)}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
