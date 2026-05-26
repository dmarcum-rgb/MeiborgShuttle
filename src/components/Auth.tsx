import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const OFFICE_PASSWORD = '2210';
const DRIVER_PASSWORD = '3814';

const DRIVERS = [
  'Antonio Cadena',
  'Armando Luna',
  'Brandon Hernandez',
  'Chris Nelson',
  'Chris Thomas',
  'Christopher Gober',
  'Clint Greenhouse',
  'Darryl Thrower',
  'Jaime Cuevas',
  'Mark Andrews',
  'Rigio Albarran',
  'Royce Russey',
  'Shamia Cottrell',
  'Steve Lawrence',
  'Other / Not Listed',
];

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
  const { signIn, signUp } = useAuth();

  const isDriverPassword = password === DRIVER_PASSWORD;
  const isOfficePassword = password === OFFICE_PASSWORD;
  const isValidPassword = isDriverPassword || isOfficePassword;

  const canSubmit = isValidPassword && (isOfficePassword || selectedDriver.length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let email = '';

      if (isOfficePassword) {
        email = `office-admin@meiborg.local`;
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
        if (signUpErr) throw signUpErr;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 via-gray-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-900 rounded-2xl mb-6 shadow-lg shadow-gray-800/10">
            <img src="/image copy.png" alt="Meiborg Shuttles" className="w-12 h-12" />
          </div>
          <h1 className="text-3xl font-semibold text-gray-900 mb-2 font-serif">Meiborg Shuttles</h1>
          <p className="text-gray-600">Fleet Management System</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Access Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setSelectedDriver(''); setError(null); }}
                required
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-800 focus:border-transparent transition-all text-center text-lg tracking-widest"
                placeholder="Enter password"
                maxLength={4}
              />
            </div>

            {/* Driver name dropdown — only when driver password entered */}
            {isDriverPassword && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Your Name
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-gray-800 transition-all"
                  >
                    <span className={selectedDriver ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                      {selectedDriver || 'Choose your name...'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {dropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-h-64 overflow-y-auto">
                      {DRIVERS.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => { setSelectedDriver(name); setDropdownOpen(false); }}
                          className={`w-full px-4 py-3 text-left text-sm transition-colors border-b border-gray-800 last:border-0 ${
                            selectedDriver === name
                              ? 'text-white bg-gray-700'
                              : 'text-gray-200 hover:bg-gray-800'
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
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="w-full py-3 px-4 bg-gray-800 hover:bg-gray-900 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-lg shadow-gray-800/20 transition-all"
            >
              {loading ? 'Accessing...' : 'Enter System'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              <span className="block mb-1">Office Staff: Enter 2210</span>
              <span className="block">Drivers: Enter 3814 then select your name</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
