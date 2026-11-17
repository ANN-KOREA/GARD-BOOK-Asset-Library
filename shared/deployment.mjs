/**
 * Netlify's CONTEXT is a build-only read-only environment variable; it is not
 * present in Functions at runtime. Netlify does expose URL (the main site's
 * public address) to Functions. Only the main HTTPS origin may access the
 * production subscriber database and protected PDF store.
 *
 * Fail closed if URL is missing or malformed. A Deploy Preview has its own
 * request origin and must not gain access to production data merely by being
 * associated with the same Netlify site.
 */
export function isProductionRequest(request, env = process.env) {
  if (typeof env.URL !== 'string' || !env.URL.trim()) return false;
  try {
    const expected = new URL(env.URL);
    const actual = new URL(request.url);
    return expected.protocol === 'https:' && actual.protocol === 'https:' &&
      expected.origin === actual.origin;
  } catch {
    return false;
  }
}
