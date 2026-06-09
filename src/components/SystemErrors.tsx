import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, RefreshCw, ChevronDown, ChevronUp, Bot, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

type SystemError = {
  id: string;
  created_at: string;
  error_type: 'auto' | 'manual';
  source: string | null;
  message: string;
  context: Record<string, unknown>;
  reporter_name: string | null;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by_name: string | null;
};

type Tab = 'open' | 'resolved';

export function SystemErrors() {
  const { user } = useAuth();
  const [errors, setErrors] = useState<SystemError[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('open');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchErrors = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('system_errors')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setErrors((data ?? []) as SystemError[]);
    setLoading(false);
  };

  useEffect(() => { fetchErrors(); }, []);

  const resolve = async (id: string) => {
    if (!user) return;
    setResolving(id);
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    const resolverName = user.email ?? 'Office';
    await supabase.from('system_errors').update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
      resolved_by_name: resolverName,
    }).eq('id', id);
    setErrors(prev => prev.map(e => e.id === id
      ? { ...e, resolved: true, resolved_at: new Date().toISOString(), resolved_by_name: resolverName }
      : e
    ));
    setResolving(null);
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const open = errors.filter(e => !e.resolved);
  const resolved = errors.filter(e => e.resolved);
  const displayed = tab === 'open' ? open : resolved;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 font-serif">System Errors</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {open.length} open &middot; {resolved.length} resolved
          </p>
        </div>
        <button
          onClick={fetchErrors}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(['open', 'resolved'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'open' ? `Open (${open.length})` : `Resolved (${resolved.length})`}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">{tab === 'open' ? 'No open errors' : 'No resolved errors yet'}</p>
          {tab === 'open' && <p className="text-sm mt-1">The system will log errors here automatically</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map(err => {
            const isExpanded = expanded.has(err.id);
            const hasContext = Object.keys(err.context ?? {}).length > 0;
            const time = new Date(err.created_at);
            const timeLabel = time.toLocaleString('en-US', {
              month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
            });

            return (
              <div
                key={err.id}
                className={`bg-white rounded-xl border transition-all ${
                  err.resolved ? 'border-gray-100 opacity-70' : 'border-red-100 shadow-sm'
                }`}
              >
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      err.resolved ? 'bg-green-50' : err.error_type === 'manual' ? 'bg-amber-50' : 'bg-red-50'
                    }`}>
                      {err.resolved
                        ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                        : err.error_type === 'manual'
                          ? <User className="w-4 h-4 text-amber-600" />
                          : <Bot className="w-4 h-4 text-red-600" />
                      }
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          err.error_type === 'manual'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-red-50 text-red-700'
                        }`}>
                          {err.error_type === 'manual' ? 'Reported' : 'Auto-detected'}
                        </span>
                        {err.source && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-mono">
                            {err.source}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {timeLabel}
                        </span>
                      </div>

                      <p className="text-sm text-gray-900 font-medium mt-1.5 leading-snug">{err.message}</p>

                      {err.reporter_name && (
                        <p className="text-xs text-gray-500 mt-1">
                          Reported by <span className="font-medium">{err.reporter_name}</span>
                        </p>
                      )}

                      {err.resolved && err.resolved_by_name && (
                        <p className="text-xs text-green-600 mt-1">
                          Resolved by <span className="font-medium">{err.resolved_by_name}</span>
                          {err.resolved_at && ` · ${new Date(err.resolved_at).toLocaleString('en-US', {
                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
                          })}`}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {hasContext && (
                        <button
                          onClick={() => toggleExpand(err.id)}
                          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
                          title="View details"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      )}
                      {!err.resolved && (
                        <button
                          onClick={() => resolve(err.id)}
                          disabled={resolving === err.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-all"
                        >
                          {resolving === err.id
                            ? <RefreshCw className="w-3 h-3 animate-spin" />
                            : <CheckCircle2 className="w-3 h-3" />
                          }
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded context */}
                  {isExpanded && hasContext && (
                    <div className="mt-3 ml-11 bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Details</p>
                      <pre className="text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">
                        {JSON.stringify(err.context, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
