import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import authConfig from "@/auth.config";

const { auth } = NextAuth(authConfig);

// noclulabs.com is the IdP. Unauthenticated visitors to protected routes get
// bounced here. After successful sign-in, noclulabs's sanitizer (extended in
// noclulabs PR #143) accepts cal.noclulabs.com as a trusted redirect target,
// and noclulabs's signin form does a window.location.assign back to us.
const SIGNIN_URL = "https://noclulabs.com/signin";

export default auth((req) => {
  if (!req.auth) {
    const selfOrigin = req.nextUrl.origin;
    const pathWithQuery = req.nextUrl.pathname + req.nextUrl.search;
    const target = `${SIGNIN_URL}?redirect=${encodeURIComponent(
      `${selfOrigin}${pathWithQuery}`,
    )}`;
    return NextResponse.redirect(target);
  }
});

// Add new protected paths to this matcher as phases land. Phase 1d ships /me
// as the only protected route (the SSO proof-of-life test page).
export const config = {
  matcher: ["/me"],
};
