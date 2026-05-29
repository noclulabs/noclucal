import { beforeEach, describe, expect, it } from "vitest";

import type { CalendarProvider } from "@/lib/calendar/types";
import {
  _resetRegistryForTests,
  getProvider,
  listProviders,
  registerProvider,
} from "@/lib/calendar/providers";

// Minimal provider that type-checks as a CalendarProvider. The registry
// tests only need identity and ordering; no method is invoked, so each
// method throws if it is ever called by mistake.
function makeProvider(id: CalendarProvider["id"]): CalendarProvider {
  const notUsed = () => {
    throw new Error("not used in this test");
  };
  return {
    id,
    buildAuthorizationUrl: notUsed,
    exchangeCode: notUsed,
    refreshAccessToken: notUsed,
    revoke: notUsed,
    listCalendars: notUsed,
    getFreeBusy: notUsed,
    createEvent: notUsed,
    updateEvent: notUsed,
    deleteEvent: notUsed,
  };
}

describe("calendar provider registry", () => {
  beforeEach(() => {
    _resetRegistryForTests();
  });

  it("throws when no provider is registered for the id", () => {
    expect(() => getProvider("google")).toThrow(
      "Calendar provider not registered: google",
    );
  });

  it("returns the registered instance after registerProvider", () => {
    const provider = makeProvider("google");
    registerProvider(provider);

    expect(getProvider("google")).toBe(provider);
  });

  it("lists registered providers in registration order", () => {
    const google = makeProvider("google");
    registerProvider(google);

    expect(listProviders()).toEqual([google]);
  });
});
