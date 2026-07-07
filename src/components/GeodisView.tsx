import { useAuth } from '../hooks/useAuth';
import { GeodisPreBilling } from './GeodisPreBilling';
import { LogOut } from 'lucide-react';

export function GeodisView() {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-700 rounded-lg flex items-center justify-center">
            <img src="/image copy.png" alt="Logo" className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-white font-semibold font-serif">Meiborg Shuttles</h1>
            <p className="text-gray-400 text-xs">Geodis Billing Portal</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </header>
      <main className="max-w-7xl mx-auto">
        <GeodisPreBilling />
      </main>
    </div>
  );
}
