import "@/lib/calendar/providers/register-all";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { googleCalendarProvider } from "@/lib/calendar/providers/google";
import {
  getOAuthStateCookieName,
  validateOAuthState,
} from "@/lib/calendar/oauth-state";
import { encryptToken } from "@/lib/calendar/crypto";
import { replaceConnection } from "@/lib/calendar/connections";

const REDIRECT_URI_PROD =
  "https://cal.noclulabs.com/api/calendar/google/callback";
const REDIRECT_URI_DEV = "http://localhost:3000/api/calendar/google/callback";

function getRedirectUri(): string {
  return process.env.AUTH_URL?.startsWith("https://")
    ? REDIRECT_URI_PROD
    : REDIRECT_URI_DEV;
}

function settingsUrlWithError(origin: string, code: string): string {
  return `${origin}/settings/calendars?error=${encodeURIComponent(code)}`;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(
      settingsUrlWithError(url.origin, "session_lost"),
    );
  }

  const error = url.searchParams.get("error");
  if (error) {
    // User denied consent at Google, or Google returned an error.
    return NextResponse.redirect(settingsUrlWithError(url.origin, error));
  }

  const code = url.searchParams.get("code");
  const stateFromQuery = url.searchParams.get("state");
  if (!code || !stateFromQuery) {
    return NextResponse.redirect(
      settingsUrlWithError(url.origin, "missing_params"),
    );
  }

  const cookieName = getOAuthStateCookieName();
  const stateFromCookie = request.cookies.get(cookieName)?.value;
  if (
    !stateFromCookie ||
    !validateOAuthState(stateFromQuery, stateFromCookie)
  ) {
    const failure = NextResponse.redirect(
      settingsUrlWithError(url.origin, "state_mismatch"),
    );
    failure.cookies.delete(cookieName);
    return failure;
  }

  let result;
  try {
    result = await googleCalendarProvider.exchangeCode({
      code,
      redirectUri: getRedirectUri(),
    });
  } catch (err) {
    console.error("Google exchangeCode failed", err);
    const failure = NextResponse.redirect(
      settingsUrlWithError(url.origin, "exchange_failed"),
    );
    failure.cookies.delete(cookieName);
    return failure;
  }

  await replaceConnection({
    userId: session.user.id,
    provider: "google",
    externalAccountId: result.externalAccountId,
    externalAccountEmail: result.externalAccountEmail,
    accessTokenCiphertext: encryptToken(result.tokens.accessToken),
    refreshTokenCiphertext: encryptToken(result.tokens.refreshToken),
    tokenExpiresAt: result.tokens.expiresAt,
    scopes: result.scopes,
  });

  const success = NextResponse.redirect(`${url.origin}/settings/calendars`);
  success.cookies.delete(cookieName);
  return success;
}
