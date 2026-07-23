import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

const OFFICE_PASSWORD = '2210';
const DRIVER_PASSWORD = '3814';
const GEODIS_PASSWORD = '60152';

function nameToEmail(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `driver-${slug}@meiborg.local`;
}

export function Auth() {
  const [password, setPassword] = useState('');
  const [selectedDriver, setSelectedDriver] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [drivers, setDrivers] = useState<string[]>([]);
  const { signIn, signUp } = useAuth();

  useEffect(() => {
    supabase
      .from('drivers')
      .select('name')
      .eq('status', 'active')
      .order('name')
      .then(({ data }) => {
        const names = (data ?? []).map((d) => d.name);
        setDrivers([...names, 'Other / Not Listed']);
      });
  }, []);

  const isDriverPassword = password === DRIVER_PASSWORD;
  const isOfficePassword = password === OFFICE_PASSWORD;
  const isGeodisPassword = password === GEODIS_PASSWORD;
  const isValidPassword = isDriverPassword || isOfficePassword || isGeodisPassword;

  const canSubmit = isValidPassword && (isOfficePassword || isGeodisPassword || selectedDriver.length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let email = '';

      if (isOfficePassword) {
        email = `office-admin@meiborg.local`;
      } else if (isGeodisPassword) {
        email = `geodis@meiborg.local`;
      } else if (isDriverPassword) {
        if (!selectedDriver) throw new Error('Please select your name');
        email = nameToEmail(selectedDriver);
      } else {
        throw new Error('Invalid password');
      }

      const paddedPassword = password.padEnd(6, '0');

      // Try sign in first; if no account exists, create one
      const { error: signInErr } = await signIn(email, paddedPassword);
      if (signInErr) {
        const { error: signUpErr } = await signUp(email, paddedPassword);
        if (signUpErr) {
          const msg = signUpErr.message?.toLowerCase() ?? '';
          // Only treat "already registered" as a password error — database errors
          // are real failures (trigger issues etc.) and should surface as-is.
          if (msg.includes('already registered') || msg.includes('user already exists')) {
            throw new Error('Invalid password. Please try again.');
          }
          throw signUpErr;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 card">
            <img src="/logo.png" alt="Meiborg Shuttles" className="w-12 h-12 object-contain" />
          </div>
          <h1 className="text-3xl font-light text-mist mb-2 tracking-tight">
            Meiborg <span className="font-semibold">Shuttles</span>
          </h1>
          <p className="text-faint">Fleet Management System</p>
        </div>

        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-dim mb-2">
                Access Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setSelectedDriver(''); setError(null); }}
                required
                className="ginput w-full px-4 py-3 text-center text-lg tracking-widest"
                placeholder="Enter password"
                maxLength={5}
              />
            </div>

            {/* Driver name dropdown — only when driver password entered */}
            {isDriverPassword && (
              <div>
                <label className="block text-sm font-medium text-dim mb-2">
                  Select Your Name
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="ginput w-full px-4 py-3 text-left flex items-center justify-between"
                  >
                    <span className={selectedDriver ? 'text-mist font-medium' : 'text-faint'}>
                      {selectedDriver || 'Choose your name...'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-faint transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {dropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden max-h-64 overflow-y-auto border border-edge2 bg-[#1b1f27] shadow-2xl">
                      {drivers.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => { setSelectedDriver(name); setDropdownOpen(false); }}
                          className={`w-full px-4 py-3 text-left text-sm transition-colors border-b border-edge last:border-0 ${
                            selectedDriver === name
                              ? 'text-[#1a1205] bg-signal font-medium'
                              : 'text-dim hover:bg-glass2'
                          }`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-lg text-sm text-bad border border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.1)]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="gbtn w-full py-3 px-4"
            >
              {loading ? 'Accessing...' : 'Enter System'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-edge">
            <p className="text-xs text-faint text-center">
              <span className="block mb-1">Office Staff: Enter 2210</span>
              <span className="block">Drivers: Enter 3814 then select your name</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
