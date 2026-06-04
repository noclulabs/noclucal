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
    <>
      <h1 className="text-3xl md:text-4xl font-medium mb-8 text-foreground">
        New event type
      </h1>
      <EventTypeForm action={createEventTypeAction} submitLabel="Create event type" />
    </>
  );
}
