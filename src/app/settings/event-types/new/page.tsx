import { auth } from "@/auth";
import { createEventTypeAction } from "../actions";
import { EventTypeForm } from "../event-type-form";

// Depends on the session cookie, so it must never be statically prerendered.
export const dynamic = "force-dynamic";

export default async function NewEventTypePage() {
  const session = await auth();
  // proxy.ts protects this route; session is non-null here, but TS does
  // not know that without a runtime check.
  if (!session?.user?.id) {
    return null;
  }

  return (
    <main className="min-h-screen flex items-start justify-center px-6 py-16">
      <div className="max-w-2xl w-full">
        <p className="text-xs uppercase tracking-[0.2em] text-foreground-muted mb-6">
          Settings
        </p>
        <h1 className="text-3xl md:text-4xl font-medium mb-8 text-foreground">
          New event type
        </h1>
        <EventTypeForm action={createEventTypeAction} submitLabel="Create event type" />
      </div>
    </main>
  );
}
