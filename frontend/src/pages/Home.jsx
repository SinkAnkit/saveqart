import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Apple,
  Cookie,
  CupSoda,
  Loader2,
  MapPin,
  Milk,
  Search,
  SprayCan,
  Star,
  Wheat,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import ProductCard from '../components/ProductCard.jsx';
import LocationModal from '../components/LocationModal.jsx';

const SUGGESTIONS = [
  'Amul Milk',
  'Maggi Masala',
  'Coca Cola',
  'Nutella',
  'Aashirvaad Atta',
  'Parle-G',
];

const CATEGORIES = [
  { label: 'Milk & Dairy', query: 'milk', icon: Milk, tint: 'card-primary' },
  { label: 'Fruits & Veg', query: 'banana', icon: Apple, tint: 'card-secondary' },
  { label: 'Snacks', query: 'chips', icon: Cookie, tint: 'card-accent' },
  { label: 'Beverages', query: 'coca cola', icon: CupSoda, tint: 'card-primary' },
  { label: 'Staples', query: 'atta', icon: Wheat, tint: 'card-secondary' },
  { label: 'Personal Care', query: 'shampoo', icon: SprayCan, tint: 'card-accent' },
];


function locationLabel(info) {
  if (!info) return null;
  const kind = info.settlementType || info.addresstype || info.type;
  if (!kind && !info.classification) return null;
  const parts = [];
  if (info.classification && info.classification !== 'unknown') parts.push(info.classification);
  if (kind) parts.push(kind.replace(/_/g, ' '));
  if (info.placeRank != null) parts.push(`place rank ${info.placeRank}`);
  return parts.join(' · ');
}

export default function Home() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showLocation, setShowLocation] = useState(false);
  const [locationRequired, setLocationRequired] = useState(false);
  const [sortBy, setSortBy] = useState('relevance');
  const abortRef = useRef(null);

  const hasLocation = !!user?.location;

  useEffect(() => {
    if (user && !user.location) {
      setShowLocation(true);
      setLocationRequired(true);
    }
  }, [user]);

  useEffect(() => {
    const q = params.get('q');
    if (!q) {
      // Navigated back to bare "/" (e.g. clicked the logo) — reset to home.
      if (results || error) {
        setResults(null);
        setError('');
      }
      setQuery('');
      return;
    }
    if (q && user?.location && !loading && (!results || results.query !== q)) {
      runSearch(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, user]);

  const runSearch = async (q) => {
    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError('');
    setResults(null);
    try {
      const data = await api.search(q.trim(), { signal: controller.signal });
      if (controller.signal.aborted) return;
      setResults(data);
    } catch (e) {
      if (e.name === 'AbortError') return; // stale request — ignore
      if (e.code === 'LOCATION_REQUIRED' || e.status === 412) {
        setShowLocation(true);
        setLocationRequired(true);
      } else {
        setError(e.message || 'Search failed');
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const submit = async (e, overrideQuery) => {
    e?.preventDefault?.();
    const q = (overrideQuery || query).trim();
    if (!q || loading) return;
    if (!user?.location) {
      setShowLocation(true);
      setLocationRequired(true);
      return;
    }
    setParams({ q }, { replace: true });
    await runSearch(q);
  };

  const searchLinks = results?.results || [];
  const matchedCards = searchLinks.filter((item) => item.status === 'matched').length;
  const notFoundCards = searchLinks.filter(
    (item) => item.status === 'not_found' || item.status === 'not_serviceable'
  ).length;
  const locationMeta = locationLabel(results?.locationInfo);

  // Recommendation is computed on the backend with transparent scoring
  // (relevance → delivery ETA → normalized price). Fall back to null.
  const recommendedId = results?.recommendedProviderId || null;
  const recommendationReason = results?.recommendationReason || null;

  // Sort the cards: matched cards ordered by the chosen key, then the rest.
  const sortedLinks = (() => {
    if (!searchLinks.length) return searchLinks;
    const matched = searchLinks.filter((r) => r.status === 'matched' && r.preview);
    const rest = searchLinks.filter((r) => !(r.status === 'matched' && r.preview));
    const val = {
      price: (r) => r.preview.price?.amount ?? Infinity,
      'unit-price': (r) => r.preview.unitPrice ?? Infinity,
      eta: (r) => r.preview.etaMinutes ?? Infinity,
    };
    if (sortBy !== 'relevance' && val[sortBy]) {
      matched.sort((a, b) => val[sortBy](a) - val[sortBy](b));
    }
    return [...matched, ...rest];
  })();

  const SORT_OPTIONS = [
    { id: 'relevance', label: 'Recommended' },
    { id: 'price', label: 'Lowest price' },
    { id: 'unit-price', label: 'Best per-unit' },
    { id: 'eta', label: 'Fastest' },
  ];

  return (
    <div>
      {/* ── Hero: brand color block, grounded headline, no eyebrow chip ── */}
      <section className="relative overflow-hidden bg-primary text-primary-foreground">
        {/* decorative flat shapes (no depth, just color blocks) */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-white/5" />

        <div className="relative max-w-7xl mx-auto px-4 md:px-8 py-14 md:py-20">
          <h1 className="font-display font-bold tracking-tight leading-[1.05]
            text-4xl sm:text-5xl max-w-3xl">
            One search. Six apps. The cheapest cart wins.
          </h1>
          <p className="mt-5 text-lg text-white/90 max-w-2xl leading-relaxed">
            Check Blinkit, Zepto, BigBasket, Flipkart Minutes, Amazon Fresh and StarQuik at once.
            We show the lowest price and fastest delivery for what you actually search.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 md:py-12">
        {/* ── Flat search bar ── */}
        <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              size={20}
              strokeWidth={2.5}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              className="input h-14 pl-12 text-base sm:text-lg"
              placeholder={hasLocation ? 'Amul Milk, Nutella, Maggi Masala…' : 'Set your location first to start searching…'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={!hasLocation}
              autoFocus={hasLocation}
              aria-label="Search for a product"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setLocationRequired(false);
                setShowLocation(true);
              }}
              className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 h-14 px-4
                rounded-md bg-muted text-sm font-medium text-foreground sm:max-w-[240px]
                transition-colors duration-200 hover:bg-border
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="Change delivery location"
              title="Change location"
            >
              <MapPin size={16} strokeWidth={2.5} className="text-primary shrink-0" />
              <span className="truncate">{user?.location?.label || 'Set location'}</span>
            </button>
            <button
              className="btn-primary h-14 px-6 sm:px-8 text-base shrink-0"
              disabled={loading || !hasLocation}
              aria-label="Search"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={18} strokeWidth={2.5} />
                  <span className="sm:hidden">Searching…</span>
                </>
              ) : (
                'Search'
              )}
            </button>
          </div>
        </form>

        {!results && !loading && (
          <>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="label mr-1">Try</span>
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setQuery(suggestion);
                    submit(null, suggestion);
                  }}
                  className="rounded-full bg-muted px-4 py-2 text-sm font-medium text-foreground
                    transition-colors duration-200 hover:bg-tint-primary hover:text-[var(--on-tint-primary)]
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                    focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            {/* How it works */}
            <section className="mt-14">
              <h2 className="font-display text-2xl font-bold tracking-tight mb-6">
                How it works
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { n: 1, icon: MapPin, title: 'Set your location', body: 'Drop a pin or search your address. We only show apps that actually deliver to you.' },
                  { n: 2, icon: Search, title: 'Search a product', body: 'Type any item. We check all six quick-commerce apps at once, live.' },
                  { n: 3, icon: Star, title: 'Get the best pick', body: 'See the cheapest and fastest option, with per-unit prices so you compare fairly.' },
                ].map((step) => (
                  <div key={step.n} className="card-muted p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <step.icon size={20} strokeWidth={2.5} className="text-primary shrink-0" />
                      <h3 className="font-display text-lg font-bold tracking-tight">
                        {step.title}
                      </h3>
                      <span className="ml-auto text-xs font-semibold text-muted-foreground">
                        Step {step.n}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                      {step.body}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Popular categories */}
            <section className="mt-12">
              <h2 className="font-display text-2xl font-bold tracking-tight mb-6">
                Popular categories
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.label}
                    onClick={() => {
                      setQuery(cat.query);
                      submit(null, cat.query);
                    }}
                    disabled={!hasLocation}
                    className={`${cat.tint} rounded-lg p-4 text-left transition-colors duration-200
                      hover:ring-2 hover:ring-primary disabled:opacity-50 disabled:cursor-not-allowed
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                      focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
                  >
                    <cat.icon size={22} strokeWidth={2.5} className="mb-2 text-primary" />
                    <div className="font-display font-bold tracking-tight text-sm">{cat.label}</div>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {error && (
          <div className="mt-8 card-accent p-4 flex items-start gap-3">
            <AlertCircle className="mt-0.5 shrink-0 text-accent-hover" size={20} strokeWidth={2.5} />
            <div className="font-medium">{error}</div>
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-10">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="card-muted h-52 animate-pulse" />
            ))}
          </div>
        )}

        {results && !loading && (
          <section className="mt-12">
            {/* Results header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-8">
              <div>
                <p className="label mb-2">Results</p>
                <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight leading-tight">
                  “{results.query}”
                </h2>
                <p className="mt-3 text-sm font-medium text-muted-foreground">
                  Delivering to {results.location.label}
                  {locationMeta && <span> · {locationMeta}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="badge-primary">{matchedCards} matched</span>
                <span className="badge-muted">{notFoundCards} unavailable</span>
              </div>
            </div>

            {results.warnings?.map((warning) => (
              <div key={warning} className="card-accent p-4 flex items-start gap-3 mb-4">
                <AlertCircle className="mt-0.5 shrink-0 text-accent-hover" size={20} strokeWidth={2.5} />
                <div className="font-medium text-sm">{warning}</div>
              </div>
            ))}

            {results.message && (
              <div className="card-muted p-4 flex items-start gap-3 mb-6">
                <AlertCircle className="mt-0.5 shrink-0 text-muted-foreground" size={20} strokeWidth={2.5} />
                <div className="text-sm font-medium text-muted-foreground">{results.message}</div>
              </div>
            )}

            {/* Recommendation as a bold emerald color block */}
            {recommendedId && recommendationReason && (
              <div className="rounded-lg bg-primary text-primary-foreground p-6 mb-8
                flex items-start gap-4">
                <div className="h-12 w-12 shrink-0 rounded-full bg-white/20 flex items-center justify-center">
                  <Star size={22} strokeWidth={2.5} fill="currentColor" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80 mb-1">
                    Recommended
                  </p>
                  <p className="font-display text-2xl md:text-3xl font-bold tracking-tight leading-tight">
                    {searchLinks.find((r) => r.providerId === recommendedId)?.providerName}
                  </p>
                  <p className="mt-1 font-medium opacity-95">{recommendationReason}</p>
                </div>
              </div>
            )}

            {/* Sort control */}
            {matchedCards > 1 && (
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="label mr-1">Sort by</span>
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setSortBy(opt.id)}
                    aria-pressed={sortBy === opt.id}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-200
                      focus-visible:outline-none focus-visible:ring-2
                      focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
                      ${sortBy === opt.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground hover:bg-border'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
              {sortedLinks.map((item, i) => (
                <div
                  key={item.providerId}
                  className="h-full animate-[fadeInUp_0.4s_ease-out_both]"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <ProductCard
                    result={item}
                    query={results.query}
                    isRecommended={item.providerId === recommendedId}
                  />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <LocationModal
        open={showLocation}
        required={locationRequired && !user?.location}
        onClose={() => {
          setShowLocation(false);
          setLocationRequired(false);
        }}
      />
    </div>
  );
}
