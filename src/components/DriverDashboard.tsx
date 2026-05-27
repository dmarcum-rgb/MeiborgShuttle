import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Navigation, ChevronDown, CheckCircle, Loader2, AlertCircle, Clock, LogIn, LogOut, Menu, X as XIcon } from 'lucide-react';
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

const VENDORS: Vendor[] = [
  { name: 'Alliance Ind. (Waupaca)', address: 'N. 2467 Vaughan Rd, Waupaca, WI 54981', toll: null, lat: 44.3266842, lng: -89.0013343 },
  { name: 'Bolzoni Auramo Inc.', address: '17635 Hoffman Way, Homewood, IL 60430', toll: 84.50, lat: 41.5702390, lng: -87.6459885 },
  { name: 'BTS 5', address: '6709 Main St. Union, IL 60180', toll: null, lat: 42.2307898, lng: -88.5431338 },
  { name: 'Capital Equip. Kaukauna', address: '2550 Progress Way, Kaukauna, WI 54130', toll: null, note: 'w/ Heartland', lat: 44.3047952, lng: -88.2591546 },
  { name: 'CCTV', address: '1111 Rose Rd. Lake Zurich, IL 60047', toll: null, note: 'w/ Clipper', lat: 42.2010611, lng: -88.0693165 },
  { name: 'Clipper Ind. Inc.', address: '1520 W. Norwood Ave, Itasca, IL 60143', toll: 23.30, lat: 41.9859581, lng: -88.0410774 },
  { name: 'DLS Elect. Systems', address: '166 South Carter, Genoa City, WI 53128', toll: null, lat: 42.5014586, lng: -88.3256606 },
  { name: 'Donghua', address: '493 Mission St. Carol Stream, IL 60188', toll: null, note: "w/ O'Hare", lat: 41.9256210, lng: -88.1013515 },
  { name: 'Equipment Depot - Itasca', address: '751 Expressway Dr. Itasca, IL 60143', toll: 23.30, lat: 41.9796393, lng: -88.0258205 },
  { name: 'Equipment Depot - Heartland', address: '1100 Cottonwood Ave. Heartland, WI 53029', toll: null, lat: 43.0828485, lng: -88.3509866 },
  { name: 'Equipment Depot - Rockford', address: '4414 11th Street, Rockford, IL 61109', toll: null, lat: 42.2127933, lng: -89.0723229 },
  { name: 'Fairchild Ind.', address: '475 Capital Drive, Lake Zurich, IL 60047', toll: null, lat: 42.2064137, lng: -88.0650475 },
  { name: 'Friedman (Flatbed)', address: '4303 Kenedy Ave. East Chicago, IN 46312', toll: 115.95, lat: 41.6386198, lng: -87.4616017 },
  { name: 'Grammer', address: 'Meiborg/Opps. LOAD', toll: null },
  { name: 'Kapco Inc. (3am from Rockford)', address: '1150 Cheyenne Ave. Grafton, WI 53024', toll: 19.35, note: 'Drop & Hook', lat: 43.3193221, lng: -87.9350483 },
  { name: 'Kuriyama Of America Inc.', address: '14200 Commerce Court, Huntley, IL 60142', toll: 6.40, lat: 42.1243796, lng: -88.4262014 },
  { name: 'L.J. Fab.', address: '944 Research Pkwy. Rockford, IL 61109', toll: null, lat: 42.2183322, lng: -89.0830221 },
  { name: 'Leading Americas', address: '130 Arrowhead Dr. Hampshire, IL 60410', toll: null, lat: 42.1487165, lng: -88.5084026 },
  { name: 'Leibovich', address: '305 Peoples Ave. Rockford, IL 61104', toll: 33.90, note: 'Drop & Hook', lat: 42.2413258, lng: -89.0899886 },
  { name: 'Liftek', address: 'Meiborg/Opps. LOAD', toll: null },
  { name: 'Loginext, MLA, C.L.', address: '340 Commerce Dr. Unit A, Crystal Lake, IL 60014', toll: null, lat: 42.2496403, lng: -88.3297300 },
  { name: 'MAHLE Rockford', address: '4814 American Rd. Rockford, IL 61109', toll: null, lat: 42.2296901, lng: -89.0223648 },
  { name: 'Meiborg Belvedere WH', address: '795 Landmark Dr. Belvedere, IL 61008', toll: null, lat: 42.2524515, lng: -88.8931015 },
  { name: 'Michellin - OEM (Camso)', address: '24601 S. Bradley St, Channahon, IL 60410', toll: 67.60, lat: 41.4441171, lng: -88.1949385 },
  { name: 'Milama', address: 'Meiborg/Opps. LOAD', toll: null },
  { name: 'Misa/Miyama', address: 'Meiborg/Opps. LOAD', toll: null },
  { name: 'New Age', address: '2120 N. West St. River Grove, IL 60171', toll: 23.30, note: 'w/ Northfield', lat: 41.9183795, lng: -87.8501759 },
  { name: 'Northfield Ind. LLC (980)', address: '980 Lunt Ave. Elk Grove Village, IL 60007', toll: 23.30, note: 'w/ New Age', lat: 42.0019422, lng: -87.9724457 },
  { name: "O'Hare Metal Prod. Div", address: '1098 Touhy Ave. Elk Grove Village, IL 60007', toll: 23.30, lat: 42.0076960, lng: -87.9706280 },
  { name: 'PHC', address: 'Meiborg/Opps. LOAD', toll: null },
  { name: 'PMW, Shhhhhh', address: '1005 McKinley Ave. Belvidere, IL 61008', toll: null, lat: 42.2705504, lng: -88.8414257 },
  { name: 'Timber Creek (Wedges)', address: '128 Badger St. Walworth, WI 53184', toll: null, lat: 42.5381975, lng: -88.5982851 },
  { name: 'UCA Marengo', address: '240 N. Prospect Ave. Marengo, IL 60152', toll: null, lat: 42.2501490, lng: -88.6081303 },
  { name: 'Value Added', address: '1595 Northrock Ct. Rockford, IL 61103', toll: null, lat: 42.3351396, lng: -89.0700624 },
];

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

// Estimate drive time assuming ~55 mph average highway speed
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
};

type CompletedRoute = {
  vendor_name: string;
  city_address: string;
  arrive_time: string;
  departure_time: string;
};

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
        // Fetch today's completed route logs to pre-fill timesheet stops
        const { data: routes } = await supabase
          .from('route_logs')
          .select('vendor_name, address, started_at, arrived_at, departed_at')
          .eq('driver_id', userId)
          .gte('started_at', clockInTime!.toISOString())
          .not('arrived_at', 'is', null)
          .order('started_at', { ascending: true });

        const completedRoutes: CompletedRoute[] = (routes ?? []).map(r => {
          const vendor = VENDORS.find(v => v.name === r.vendor_name);
          return {
            vendor_name: r.vendor_name,
            city_address: r.address,
            arrive_time: r.arrived_at ? new Date(r.arrived_at).toTimeString().slice(0, 5) : '',
            departure_time: r.departed_at ? new Date(r.departed_at).toTimeString().slice(0, 5) : '',
            toll_amount: vendor?.toll ?? null,
          };
        });

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
  const watchIdRef = useRef<number | null>(null);
  const arrivedRef = useRef(false);
  const routeLogIdRef = useRef<string | null>(null);

  const selectedVendor = VENDORS.find(v => v.name === selected);
  const isMeiborg = selectedVendor?.address.startsWith('Meiborg') ?? false;
  const hasCoords = !!(selectedVendor?.lat && selectedVendor?.lng);

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
    setRouteState('active');
    if (hasCoords && !isMeiborg) startGeofence(selectedVendor, data.id);
  };

  const handleNextRoute = async () => {
    // Record departure time before moving to next route
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
                  onClick={handleNextRoute}
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
                  onClick={handleNextRoute}
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
                    {VENDORS.map((vendor) => (
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
        </div>
      </div>
    </div>
  );
}
