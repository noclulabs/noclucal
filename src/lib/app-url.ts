/**
 * Returns the public-facing origin of the noCluCal app, with any
 * trailing slashes stripped. Used for constructing redirect URLs in
 * route handlers that run behind a reverse proxy (Docker + Caddy),
 * where `request.url` would resolve to the internal bind address
 * (`http://0.0.0.0:3000`) rather than the public host.
 *
 * Sourced from `AUTH_URL`, which is set per-environment:
 * - Production: `https://cal.noclulabs.com`
 * - Dev: `http://localhost:3000`
 *
 * Falls back to `http://localhost:3000` if `AUTH_URL` is unset or
 * empty, so tests and local dev work without explicit env
 * configuration. Treats empty string as unset because that is the
 * conventional dotenv representation of an absent value.
 */
export function getAppOrigin(): string {
  const raw = process.env.AUTH_URL || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}
