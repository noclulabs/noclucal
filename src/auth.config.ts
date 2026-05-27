import type { DefaultSession, NextAuthConfig } from "next-auth";
// Imported so the `declare module "next-auth/jwt"` augmentation below
// resolves; the type itself is not referenced. Matches noclulabs' pattern.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { JWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      role: "user" | "admin";
    } & DefaultSession["user"];
  }

  interface User {
    username?: string;
    role?: "user" | "admin";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
    role: "user" | "admin";
    // Stamped by noclulabs at sign-in (Phase D-1 there). noCluCal reads but
    // does not write this field; the session-revocation check that consumes
    // it lives on the noclulabs side. Phase 1d deferred bringing that check
    // over to noCluCal; see ROADMAP / Deferred items.
    signedInAt?: number;
    // Per-device session id from noclulabs Phase F-1. noCluCal reads but
    // does not write. Future cross-product device management will use this.
    deviceId?: string;
  }
}

const useSecureCookies = process.env.AUTH_URL?.startsWith("https://") ?? false;
const cookiePrefix = useSecureCookies ? "__Secure-" : "";

export default {
  providers: [],
  session: { strategy: "jwt" },
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}authjs.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        // Parent-domain scope so the cookie noclulabs sets on .noclulabs.com
        // is read here. Dev (localhost) stays host-only because browsers
        // refuse parent-domain cookies on bare-host origins.
        ...(useSecureCookies ? { domain: ".noclulabs.com" } : {}),
      },
    },
  },
  callbacks: {
    // Maps the JWT (signed and populated by noclulabs) onto session.user so
    // consumers can read session.user.username, session.user.role, etc.
    // Note: this is a pass-through. noCluCal does NOT modify the JWT.
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.username = token.username;
        session.user.role = (token.role as "user" | "admin" | undefined) ?? "user";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
