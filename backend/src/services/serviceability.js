/**
 * Per-platform serviceability model.
 *
 * WHY THIS EXISTS
 * ---------------
 * Quick-commerce sites only reveal true serviceability after completing their
 * protected "set delivery address" flow, which anonymous scrapers cannot do
 * reliably. Their public search pages serve a national catalog regardless of
 * whether they actually deliver to a location (the Rajgir bug: results showed
 * even though Blinkit/BigBasket do not deliver there).
 *
 * Instead of a fabricated live signal, we maintain an explicit, editable
 * coverage model per platform and check the user's location BEFORE scraping.
 *
 * TWO CHECK PATHS (a map pin often has NO pincode, only lat/lng):
 *   1. Pincode path — first 3 digits (postal sorting district ≈ city/region).
 *   2. Coordinate path — haversine distance to the nearest served city center.
 *      Used whenever coordinates are available (always true for a map pin),
 *      so serviceability works even when reverse geocoding lacks a postcode.
 *
 * Result:
 *   true  = within coverage (pincode prefix match OR within a served city radius)
 *   false = valid location clearly outside coverage -> "not available"
 *   null  = cannot determine at all (no pincode AND no coordinates) -> do not block
 */

// City -> { center [lat,lng], pincode 3-digit prefixes, radiusKm }.
// radiusKm approximates the metro delivery footprint around the center.
const CITIES = {
  delhi: { center: [28.6139, 77.209], prefixes: ['110', '201', '122', '121', '124', '203'], radiusKm: 45 },
  mumbai: { center: [19.076, 72.8777], prefixes: ['400', '410', '421'], radiusKm: 45 },
  pune: { center: [18.5204, 73.8567], prefixes: ['411', '412'], radiusKm: 35 },
  bengaluru: { center: [12.9716, 77.5946], prefixes: ['560', '561', '562'], radiusKm: 40 },
  hyderabad: { center: [17.385, 78.4867], prefixes: ['500', '501', '502'], radiusKm: 40 },
  chennai: { center: [13.0827, 80.2707], prefixes: ['600', '601', '602', '603'], radiusKm: 40 },
  kolkata: { center: [22.5726, 88.3639], prefixes: ['700', '711', '712'], radiusKm: 40 },
  ahmedabad: { center: [23.0225, 72.5714], prefixes: ['380', '382'], radiusKm: 35 },
  jaipur: { center: [26.9124, 75.7873], prefixes: ['302', '303'], radiusKm: 30 },
  lucknow: { center: [26.8467, 80.9462], prefixes: ['226', '227'], radiusKm: 30 },
  chandigarh: { center: [30.7333, 76.7794], prefixes: ['160', '140'], radiusKm: 30 },
  kochi: { center: [9.9312, 76.2673], prefixes: ['682', '683'], radiusKm: 30 },
  coimbatore: { center: [11.0168, 76.9558], prefixes: ['641'], radiusKm: 25 },
  indore: { center: [22.7196, 75.8577], prefixes: ['452', '453'], radiusKm: 25 },
  nagpur: { center: [21.1458, 79.0882], prefixes: ['440', '441'], radiusKm: 25 },
  surat: { center: [21.1702, 72.8311], prefixes: ['394', '395'], radiusKm: 25 },
  vadodara: { center: [22.3072, 73.1812], prefixes: ['390', '391'], radiusKm: 25 },
  bhopal: { center: [23.2599, 77.4126], prefixes: ['462', '463'], radiusKm: 25 },
  visakhapatnam: { center: [17.6868, 83.2185], prefixes: ['530', '531'], radiusKm: 25 },
  mysuru: { center: [12.2958, 76.6394], prefixes: ['570'], radiusKm: 20 },
  nashik: { center: [19.9975, 73.7898], prefixes: ['422'], radiusKm: 20 },
};

// Per-platform list of served cities (edit to refine coverage).
const PLATFORM_CITIES = {
  bbnow: [
    'delhi', 'mumbai', 'pune', 'bengaluru', 'hyderabad', 'chennai', 'kolkata',
    'ahmedabad', 'jaipur', 'lucknow', 'chandigarh', 'kochi', 'coimbatore',
    'indore', 'nagpur', 'surat', 'vadodara', 'bhopal', 'visakhapatnam',
    'mysuru', 'nashik',
  ],
  blinkit: [
    'delhi', 'mumbai', 'pune', 'bengaluru', 'hyderabad', 'chennai', 'kolkata',
    'ahmedabad', 'jaipur', 'lucknow', 'chandigarh', 'kochi', 'coimbatore',
    'indore', 'nagpur', 'surat', 'vadodara', 'bhopal', 'visakhapatnam',
    'mysuru', 'nashik',
  ],
  zepto: [
    'delhi', 'mumbai', 'pune', 'bengaluru', 'hyderabad', 'chennai', 'kolkata',
    'ahmedabad', 'jaipur', 'lucknow', 'chandigarh', 'kochi', 'coimbatore',
    'indore', 'nagpur', 'surat', 'vadodara',
  ],
  flipkart_minutes: [
    'delhi', 'mumbai', 'pune', 'bengaluru', 'hyderabad', 'chennai', 'kolkata', 'ahmedabad',
  ],
  amazon_fresh: [
    'delhi', 'mumbai', 'pune', 'bengaluru', 'hyderabad', 'chennai', 'kolkata',
    'ahmedabad', 'jaipur', 'lucknow', 'coimbatore',
  ],
  starquik: ['mumbai', 'pune', 'bengaluru', 'hyderabad'],
};

function normalizePincode(pincode) {
  const digits = String(pincode || '').replace(/\D/g, '');
  return digits.length === 6 ? digits : null;
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// Great-circle distance in km.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function isFiniteCoord(v) {
  return Number.isFinite(Number(v));
}

/**
 * checkServiceability(providerId, location)
 *  -> { serviceable: true | false | null, reason: string|null }
 */
function checkServiceability(providerId, location = {}) {
  const cityKeys = PLATFORM_CITIES[providerId];
  if (!cityKeys) return { serviceable: null, reason: null };

  const notServiceable = {
    serviceable: false,
    reason: 'This platform does not deliver to your location yet.',
  };

  // ── Path 1: pincode prefix (most precise when present) ──
  const pincode = normalizePincode(location.pincode);
  if (pincode) {
    const prefix = pincode.slice(0, 3);
    const covered = cityKeys.some((k) => (CITIES[k]?.prefixes || []).includes(prefix));
    if (covered) return { serviceable: true, reason: null };
    // pincode present but not covered -> fall through to coordinate check,
    // then decide. If coords also say out-of-range, it's not serviceable.
  }

  // ── Path 2: coordinate proximity to a served city center ──
  const lat = Number(location.lat);
  const lng = Number(location.lng);
  if (isFiniteCoord(lat) && isFiniteCoord(lng)) {
    let nearestKm = Infinity;
    for (const key of cityKeys) {
      const city = CITIES[key];
      if (!city) continue;
      const d = haversineKm(lat, lng, city.center[0], city.center[1]);
      if (d < nearestKm) nearestKm = d;
      if (d <= city.radiusKm) {
        return { serviceable: true, reason: null };
      }
    }
    // Coordinates available but not within any served city radius.
    return notServiceable;
  }

  // ── Path 3: pincode present but uncovered, and no usable coordinates ──
  if (pincode) return notServiceable;

  // Nothing to go on -> unknown, do not block.
  return { serviceable: null, reason: null };
}

module.exports = {
  checkServiceability,
  CITIES,
  PLATFORM_CITIES,
  haversineKm,
};
