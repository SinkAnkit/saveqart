/**
 * Generic adapter fallback — returns null to indicate no real data is available.
 *
 * This exists as a structural placeholder for providers that may gain real
 * integrations later. It does NOT generate simulated data — the project's
 * philosophy is to never fabricate prices or availability.
 */
async function fetchFirstResult(_providerName, _query, _location) {
  return null;
}

module.exports = { fetchFirstResult };
