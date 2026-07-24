import { useState, useEffect } from 'react';
import { api } from '../api';
import { Plus, X, Loader2, ShoppingBasket, Trophy, Split, AlertCircle, Save, Link2, Trash2, Copy } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import LocationModal from '../components/LocationModal.jsx';

function inr(n) {
  return n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`;
}

export default function Basket() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showLocation, setShowLocation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedBaskets, setSavedBaskets] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(true);

  const hasLocation = !!user?.location;

  useEffect(() => {
    loadSavedBaskets();
  }, []);

  const loadSavedBaskets = async () => {
    setLoadingSaved(true);
    try {
      const { baskets } = await api.basketSaved();
      setSavedBaskets(baskets);
    } catch (_e) {
      // ignore
    } finally {
      setLoadingSaved(false);
    }
  };

  const addItem = () => {
    const v = draft.trim();
    if (!v) return;
    if (items.length >= 15) {
      toast('Basket is full (15 items max)', { type: 'error' });
      return;
    }
    if (items.some((i) => i.toLowerCase() === v.toLowerCase())) {
      setDraft('');
      return;
    }
    setItems((cur) => [...cur, v]);
    setDraft('');
  };

  const removeItem = (i) => setItems((cur) => cur.filter((_, idx) => idx !== i));

  const compare = async () => {
    if (items.length === 0) return;
    if (!hasLocation) {
      setShowLocation(true);
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await api.basketCompare(items);
      setResult(data);
    } catch (e) {
      if (e.code === 'LOCATION_REQUIRED' || e.status === 412) {
        setShowLocation(true);
      } else {
        setError(e.message || 'Comparison failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const saveBasket = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const { shareId } = await api.basketSave({ items, result });
      toast('Basket saved! Share link copied.');
      const shareUrl = `${window.location.origin}/basket?share=${shareId}`;
      navigator.clipboard.writeText(shareUrl).catch(() => {});
      loadSavedBaskets();
    } catch (e) {
      toast(e.message || 'Failed to save basket', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const deleteBasket = async (id) => {
    try {
      await api.basketDelete(id);
      setSavedBaskets((cur) => cur.filter((b) => b.id !== id));
      toast('Basket deleted');
    } catch (_e) {
      toast('Failed to delete', { type: 'error' });
    }
  };

  const copyShareLink = (shareId) => {
    const url = `${window.location.origin}/basket?share=${shareId}`;
    navigator.clipboard.writeText(url).then(() => toast('Share link copied!'));
  };

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-10 md:py-14">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-12 w-12 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
          <ShoppingBasket size={24} strokeWidth={2.5} />
        </div>
        <h1 className="font-display text-4xl font-extrabold tracking-tight leading-none">
          Basket compare
        </h1>
      </div>
      <p className="text-muted-foreground font-medium mb-8">
        Add multiple items and we'll find the cheapest app for the whole cart, or the cheapest split across apps.
      </p>

      {/* Item entry */}
      <div className="flex gap-3 mb-4">
        <input
          className="input h-12 flex-1"
          placeholder="Add an item e.g. Amul Milk"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addItem();
            }
          }}
          aria-label="Add basket item"
        />
        <button onClick={addItem} className="btn-secondary h-12 px-5" aria-label="Add item">
          <Plus size={18} strokeWidth={2.5} /> Add
        </button>
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {items.map((item, i) => (
            <span
              key={`${item}-${i}`}
              className="inline-flex items-center gap-2 rounded-full bg-muted pl-4 pr-2 py-1.5
                text-sm font-medium"
            >
              {item}
              <button
                onClick={() => removeItem(i)}
                aria-label={`Remove ${item}`}
                className="h-6 w-6 rounded-full flex items-center justify-center
                  hover:bg-accent hover:text-accent-foreground transition-colors duration-200"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}

      <button
        onClick={compare}
        disabled={loading || items.length === 0}
        className="btn-primary h-12 px-8 mb-8"
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" size={18} strokeWidth={2.5} /> Comparing {items.length} items…
          </>
        ) : (
          `Compare ${items.length || ''} item${items.length === 1 ? '' : 's'}`.trim()
        )}
      </button>

      {error && (
        <div className="card-accent p-4 flex items-start gap-3 mb-6">
          <AlertCircle className="mt-0.5 shrink-0 text-accent-hover" size={20} strokeWidth={2.5} />
          <div className="font-medium">{error}</div>
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Save basket action */}
          <button
            onClick={saveBasket}
            disabled={saving}
            className="btn-secondary"
          >
            <Save size={16} strokeWidth={2.5} />
            {saving ? 'Saving…' : 'Save & get share link'}
          </button>

          {/* Headline: cheapest options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg bg-secondary text-secondary-foreground p-6">
              <div className="flex items-center gap-2 mb-2">
                <Trophy size={20} strokeWidth={2.5} />
                <span className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
                  Cheapest single app
                </span>
              </div>
              {result.cheapestSingleApp ? (
                <>
                  <p className="font-display text-2xl font-extrabold tracking-tight">
                    {result.cheapestSingleApp.providerName}
                  </p>
                  <p className="font-display text-3xl font-extrabold mt-1">
                    {inr(result.cheapestSingleApp.total)}
                  </p>
                  <p className="text-sm font-medium opacity-90 mt-1">
                    All {result.items.length} items in one order
                  </p>
                </>
              ) : (
                <p className="font-medium opacity-90">No single app carries every item.</p>
              )}
            </div>

            <div className="rounded-lg bg-primary text-primary-foreground p-6">
              <div className="flex items-center gap-2 mb-2">
                <Split size={20} strokeWidth={2.5} />
                <span className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
                  Cheapest split
                </span>
              </div>
              <p className="font-display text-3xl font-extrabold mt-1">
                {inr(result.cheapestSplit.total)}
              </p>
              <p className="text-sm font-medium opacity-90 mt-1">
                Best price per item across apps
                {result.cheapestSplit.itemsMissing > 0 &&
                  ` · ${result.cheapestSplit.itemsMissing} unavailable`}
              </p>
              {result.savingsVsSingle > 0 && (
                <p className="text-sm font-semibold mt-2 bg-white/15 rounded-md px-2 py-1 inline-block">
                  Save {inr(result.savingsVsSingle)} vs single app
                </p>
              )}
            </div>
          </div>

          {/* Split breakdown */}
          <div className="card-muted p-6">
            <h2 className="font-display text-xl font-bold tracking-tight mb-4">Cheapest split breakdown</h2>
            <ul className="divide-y divide-border">
              {result.cheapestSplit.lines.map((line, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-3">
                  <span className="font-medium">{line.query}</span>
                  {line.best ? (
                    <span className="flex items-center gap-3">
                      <span className="badge-primary">
                        {result.perApp.find((a) => a.providerId === line.best.providerId)?.providerName ||
                          line.best.providerId}
                      </span>
                      <span className="font-display font-extrabold">{inr(line.best.price)}</span>
                    </span>
                  ) : (
                    <span className="badge-accent">Unavailable</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Per-app totals */}
          <div className="card-muted p-6">
            <h2 className="font-display text-xl font-bold tracking-tight mb-4">Per-app totals</h2>
            <ul className="divide-y divide-border">
              {result.perApp.map((app) => (
                <li
                  key={app.providerId}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div>
                    <span className="font-semibold">{app.providerName}</span>
                    <span className="ml-2 text-sm text-muted-foreground">
                      {app.itemsFound}/{result.items.length} items
                      {app.itemsMissing > 0 && `. Missing: ${app.missing.join(', ')}`}
                    </span>
                  </div>
                  <span className="font-display font-extrabold text-lg">
                    {app.total != null ? inr(app.total) : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Saved baskets */}
      {savedBaskets.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold tracking-tight mb-4">Saved baskets</h2>
          <ul className="space-y-3">
            {savedBaskets.map((b) => (
              <li key={b.id} className="card-muted p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-tint-primary text-primary flex items-center justify-center shrink-0">
                  <ShoppingBasket size={17} strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{b.name}</div>
                  <div className="text-xs font-medium text-muted-foreground">
                    {b.items.length} items · {b.locationLabel || 'Unknown location'}
                  </div>
                </div>
                <button
                  onClick={() => copyShareLink(b.shareId)}
                  className="btn-ghost text-sm px-3 shrink-0"
                  title="Copy share link"
                >
                  <Copy size={15} strokeWidth={2.5} />
                </button>
                <button
                  onClick={() => {
                    setItems(b.items);
                    setResult(null);
                  }}
                  className="btn-primary text-sm px-4 shrink-0"
                >
                  Load
                </button>
                <button
                  onClick={() => deleteBasket(b.id)}
                  className="h-10 w-10 rounded-md flex items-center justify-center text-muted-foreground
                    hover:bg-tint-accent hover:text-accent-hover transition-colors shrink-0"
                  title="Delete"
                  aria-label={`Delete ${b.name}`}
                >
                  <Trash2 size={17} strokeWidth={2.5} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <LocationModal open={showLocation} onClose={() => setShowLocation(false)} />
    </div>
  );
}
