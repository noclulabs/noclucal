import { redirect } from "next/navigation";

// The root is the front door into the app. An authenticated host lands in
// /settings; an unauthenticated visitor follows the existing SSO bounce once
// the proxy gates /settings. A friendlier public landing page is deferred
// (Phase 4e follow-up), not part of this redirect.
export default function Home() {
  redirect("/settings");
}
