// Honest placeholder behind the "soon" nav item. The public booking page and
// the bookings it produces land in Phase 4; this gives the nav item a real
// destination without implying functionality that does not exist yet.
export default function BookingsPage() {
  return (
    <>
      <h1 className="text-3xl font-medium text-foreground md:text-4xl">
        Bookings
      </h1>
      <p className="mt-4 text-sm text-foreground-muted">
        Your bookings will appear here once the public booking page is live.
      </p>
    </>
  );
}
