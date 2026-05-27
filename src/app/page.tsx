import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "noCluCal",
  description: "Booking platform in the noClu suite. In development.",
};

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-xl text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-foreground-muted mb-6">
          noClu suite
        </p>
        <h1 className="text-4xl md:text-5xl font-medium mb-6 text-foreground">
          noCluCal
        </h1>
        <p className="text-base md:text-lg text-foreground-muted leading-relaxed">
          Booking platform in active development. Phase 1 of the build is in flight.
        </p>
        <p className="mt-6 text-sm text-foreground-muted/70">
          Part of the{" "}
          <a
            href="https://noclulabs.com"
            className="text-primary hover:underline"
          >
            noClu
          </a>{" "}
          digital estate.
        </p>
      </div>
    </main>
  );
}
