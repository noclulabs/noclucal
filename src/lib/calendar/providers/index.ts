import type { CalendarProvider, CalendarProviderId } from "../types";

/**
 * Calendar provider registry. Concrete providers are registered at
 * server startup via a side-effecting `register-all.ts` module (ships
 * in Phase 2b). Server entry points import that module for its side
 * effect before any code path that calls `getProvider`.
 */
const providers = new Map<CalendarProviderId, CalendarProvider>();

/**
 * Register a calendar provider. Replaces any previously registered
 * provider with the same id (this is what makes the registry
 * test-friendly).
 */
export function registerProvider(provider: CalendarProvider): void {
  providers.set(provider.id, provider);
}

/**
 * Look up a calendar provider by id. Throws if no provider is
 * registered for the given id; callers should ensure `register-all`
 * has run before this is called.
 */
export function getProvider(id: CalendarProviderId): CalendarProvider {
  const provider = providers.get(id);
  if (!provider) {
    throw new Error(`Calendar provider not registered: ${id}`);
  }
  return provider;
}

/** List every registered provider. Order is registration order. */
export function listProviders(): CalendarProvider[] {
  return Array.from(providers.values());
}

/**
 * Test helper: drop every registered provider. Production code
 * MUST NOT call this. Exposed so unit tests can isolate registry
 * state between cases.
 */
export function _resetRegistryForTests(): void {
  providers.clear();
}
