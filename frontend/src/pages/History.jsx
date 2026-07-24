import { useEffect, useState } from 'react';
import { api } from '../api';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, Search, History as HistoryIcon, Loader2 } from 'lucide-react';
import { useToast } from '../context/ToastContext.jsx';

function inr(n) {
  return n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`;
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso + 'Z').getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

export default function History() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const nav = useNavigate();
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const { history } = await api.history();
      setItems(history);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (id) => {
    setItems((cur) => cur.filter((x) => x.id !== id));
    try {
      await api.deleteHistoryItem(id);
      toast('Search removed from history');
    } catch {
      load();
      toast('Could not remove that entry', { type: 'error' });
    }
  };

  const clearAll = async () => {
    if (!confirm('Clear your entire search history?')) return;
    try {
      await api.clearHistory();
      setItems([]);
      toast('History cleared');
    } catch (e) {
      setErr(e.message);
      toast('Could not clear history', { type: 'error' });
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-10 md:py-14">
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight leading-none">
            Search history
          </h1>
          <p className="mt-3 text-muted-foreground font-medium">
            Re-run past searches and revisit any community price intel.
          </p>
        </div>
        {items.length > 0 && (
          <button onClick={clearAll} className="btn-secondary text-sm shrink-0">
            <Trash2 size={15} strokeWidth={2.5} /> Clear all
          </button>
        )}
      </div>

      {err && (
        <div className="card-accent p-3 mb-6 text-sm font-medium text-accent-hover">{err}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="animate-spin" strokeWidth={2.5} />
        </div>
      ) : items.length === 0 ? (
        <div className="card-muted p-12 text-center">
          <div className="h-16 w-16 rounded-full bg-tint-primary text-primary
            flex items-center justify-center mx-auto">
            <HistoryIcon size={28} strokeWidth={2.5} />
          </div>
          <h2 className="font-display text-2xl font-bold tracking-tight mt-4">No searches yet</h2>
          <p className="text-sm font-medium text-muted-foreground mt-2">
            Once you search, your history will appear here.
          </p>
          <Link to="/" className="btn-primary mt-6 inline-flex">
            Start searching
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li
              key={it.id}
              className="card-muted p-4 flex items-center gap-4 transition-colors duration-200
                hover:bg-[var(--tint-primary)]"
            >
              <div className="h-11 w-11 rounded-full bg-tint-primary text-primary
                flex items-center justify-center shrink-0">
                <Search size={17} strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display text-lg font-bold tracking-tight truncate leading-none">
                  {it.query}
                </div>
                <div className="mt-1.5 text-xs font-medium text-muted-foreground truncate">
                  {it.location_label} · {timeAgo(it.created_at)}
                  {it.result_count > 0 && (
                    <> · {it.result_count} provider{it.result_count === 1 ? '' : 's'} matched</>
                  )}
                  {it.best_price != null && <> · from {inr(it.best_price)}</>}
                </div>
              </div>
              <button
                onClick={() => nav(`/?q=${encodeURIComponent(it.query)}`)}
                className="btn-primary text-sm px-4 shrink-0"
                title="Search again"
              >
                Search
              </button>
              <button
                onClick={() => remove(it.id)}
                className="h-10 w-10 rounded-md flex items-center justify-center text-muted-foreground
                  transition-colors duration-200 hover:bg-tint-accent hover:text-accent-hover
                  shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                  focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                title="Delete"
                aria-label={`Delete search for ${it.query}`}
              >
                <Trash2 size={17} strokeWidth={2.5} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
