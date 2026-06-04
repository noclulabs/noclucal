"use server";

import { redirect } from "next/navigation";

import { signOut } from "@/auth";

// Auth lives at noclulabs.com, so sign-out lands the user back on the suite
// sign-in page. signOut clears the Auth.js session cookie; because that cookie
// is scoped to the shared .noclulabs.com parent domain in production, clearing
// it signs the user out across the whole noClu suite. We pass redirect: false
// and redirect ourselves so the external target is not subject to Auth.js's
// same-origin redirect handling (this is relying-party mode, with no providers).
const SIGNIN_URL = "https://noclulabs.com/signin";

export async function signOutAction(): Promise<void> {
  await signOut({ redirect: false });
  redirect(SIGNIN_URL);
}
