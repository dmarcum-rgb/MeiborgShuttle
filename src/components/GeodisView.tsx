import { useAuth } from '../hooks/useAuth';
import { GeodisPreBilling } from './GeodisPreBilling';
import { LogOut } from 'lucide-react';

export function GeodisView() {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="card rounded-none border-x-0 border-t-0 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-glass2 rounded-lg flex items-center justify-center">
            <img src="/logo.png" alt="Logo" className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-mist font-semibold">Meiborg Shuttles</h1>
            <p className="text-faint text-xs">Geodis Billing Portal</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="gbtn-ghost flex items-center gap-2 px-3 py-2 text-sm"
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
