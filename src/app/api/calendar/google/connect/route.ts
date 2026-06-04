import "@/lib/calendar/providers/register-all";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { googleCalendarProvider } from "@/lib/calendar/providers/google";
import {
  generateOAuthState,
  getOAuthStateCookieName,
  getOAuthStateCookieOptions,
} from "@/lib/calendar/oauth-state";

const REDIRECT_URI_PROD =
  "https://cal.noclulabs.com/api/calendar/google/callback";
const REDIRECT_URI_DEV = "http://localhost:3000/api/calendar/google/callback";

function getRedirectUri(): string {
  return process.env.AUTH_URL?.startsWith("https://")
    ? REDIRECT_URI_PROD
    : REDIRECT_URI_DEV;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    // Bounce through noclulabs signin, then back to /settings/calendars.
    // The proxy.ts matcher protects /settings/* but does not protect
    // /api/calendar/google/connect; we handle this case inline.
    return NextResponse.redirect(
      "https://noclulabs.com/signin?redirect=https://cal.noclulabs.com/settings/calendars",
    );
  }

  const state = generateOAuthState();
  const authorizationUrl = googleCalendarProvider.buildAuthorizationUrl({
    state,
    redirectUri: getRedirectUri(),
  });

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(
    getOAuthStateCookieName(),
    state,
    getOAuthStateCookieOptions(),
  );
  return response;
}
