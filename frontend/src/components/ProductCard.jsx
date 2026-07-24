import { AlertCircle, ExternalLink, Link2, Star } from 'lucide-react';

function formatMoney(amount, currency = 'INR') {
  if (amount == null) return null;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}

// unitPrice is per gram/ml (from backend). Present it per kg / per litre.
function formatUnitPrice(unitPrice, unitBasis) {
  if (unitPrice == null || !unitBasis) return null;
  const perBig = unitPrice * 1000; // per kg or per litre
  const unitLabel = unitBasis === 'mass' ? '/kg' : '/L';
  const rounded = perBig >= 100 ? Math.round(perBig) : Math.round(perBig * 10) / 10;
  return `₹${rounded.toLocaleString('en-IN')}${unitLabel}`;
}

function statusBadgeClass(status) {
  if (status === 'matched') return 'badge-secondary';
  if (status === 'not_found') return 'badge-accent';
  if (status === 'not_serviceable') return 'badge-accent';
  if (status === 'error') return 'badge-accent';
  return 'badge-muted';
}

function statusLabel(status) {
  if (status === 'matched') return 'Matched';
  if (status === 'not_found') return 'Not available';
  if (status === 'not_serviceable') return 'Not serviceable here';
  if (status === 'error') return 'Integration error';
  return 'Not integrated';
}

const PROVIDER_LOGOS = {
  blinkit: '/logos/blinkit.png',
  zepto: '/logos/zepto.png',
  bbnow: '/logos/bigbasket.svg',
  flipkart_minutes: '/logos/flipkart.jpg',
  amazon_fresh: '/logos/amazon_fresh.png',
  starquik: '/logos/starquik.png',
};

export default function ProductCard({ result, query, isRecommended = false }) {
  const { providerId, providerName, status, statusMessage, preview, url } = result;
  const logoSrc = PROVIDER_LOGOS[providerId];

  // Recommended = brand color block; others = surface block with border-accent hover.
  const shellClass = isRecommended
    ? 'h-full rounded-lg bg-tint-primary p-5 flex flex-col gap-4 relative group'
    : 'h-full card-muted p-5 flex flex-col gap-4 relative transition-colors duration-200 hover:bg-[var(--tint-primary)] group';

  return (
    <div className={shellClass}>
      {isRecommended && (
        <div className="absolute top-4 right-4">
          <span className="badge-primary">
            <Star size={11} strokeWidth={2.5} fill="currentColor" /> Top pick
          </span>
        </div>
      )}

      {/* Provider header — logo/icon in a flat circle */}
      <div className="flex items-center gap-3">
        {logoSrc ? (
          <div className="h-12 w-12 rounded-full bg-card flex items-center justify-center
            overflow-hidden shrink-0">
            <img src={logoSrc} alt={providerName} className="h-9 w-9 object-contain" />
          </div>
        ) : (
          <div className="h-12 w-12 rounded-full bg-primary text-primary-foreground
            flex items-center justify-center font-bold text-lg shrink-0">
            {providerName.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-bold tracking-tight leading-none truncate">
            {providerName}
          </div>
          <div className={`mt-1.5 ${statusBadgeClass(status)}`}>{statusLabel(status)}</div>
        </div>
      </div>

      {status === 'matched' && preview ? (
        <a
          href={preview.url && preview.url !== url ? preview.url : url}
          target="_blank"
          rel="noreferrer noopener"
          className="block rounded-md bg-card p-3 transition-colors duration-200
            hover:bg-tint-primary no-underline text-inherit
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
            focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <div className="flex gap-3">
            {preview.imageUrl && (
              <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center
                overflow-hidden shrink-0">
                <img
                  src={preview.imageUrl}
                  alt={preview.title}
                  className="h-full w-full object-contain p-1"
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold leading-snug line-clamp-2">{preview.title}</div>
              {preview.quantity && (
                <div className="mt-0.5 text-xs font-medium text-muted-foreground">
                  {preview.quantity}
                </div>
              )}
              <div className="mt-2 flex items-end gap-2 flex-wrap">
                <div className="font-display text-2xl font-extrabold tracking-tight leading-none">
                  {formatMoney(preview.price?.amount, preview.price?.currency)}
                </div>
                {preview.price?.mrp > preview.price?.amount && (
                  <div className="text-xs font-medium text-muted-foreground line-through">
                    {formatMoney(preview.price.mrp, preview.price.currency)}
                  </div>
                )}
                {preview.etaMinutes != null && (
                  <span className="ml-auto badge-secondary">~{preview.etaMinutes} min</span>
                )}
              </div>
              {formatUnitPrice(preview.unitPrice, preview.unitBasis) && (
                <div className="mt-1.5 text-xs font-semibold text-primary">
                  {formatUnitPrice(preview.unitPrice, preview.unitBasis)}
                  <span className="text-muted-foreground font-medium"> · per-unit price</span>
                </div>
              )}
              {preview.matchLabel === 'low' && (
                <div className="mt-1.5 text-xs font-medium text-muted-foreground italic">
                  May not be an exact match for your search
                </div>
              )}
            </div>
          </div>
        </a>
      ) : (
        <div className="rounded-md bg-card p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {status === 'not_integrated' ? (
              <Link2 size={16} strokeWidth={2.5} className="text-muted-foreground" />
            ) : (
              <AlertCircle size={16} strokeWidth={2.5} className="text-accent-hover" />
            )}
            Search “{query}”
          </div>
          <p className="mt-2 text-sm font-medium text-muted-foreground leading-relaxed">
            {statusMessage || 'No provider preview available for this query.'}
          </p>
        </div>
      )}

      {/* Bottom action — always links to the provider search page */}
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-auto btn-secondary w-full no-underline"
      >
        Open {providerName} <ExternalLink size={15} strokeWidth={2.5} />
      </a>
    </div>
  );
}
