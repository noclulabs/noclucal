import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";

import {
  BookingConfirmationEmail,
  type BookingConfirmationEmailProps,
} from "@/emails/booking-confirmation";

// String-render assertions only: @react-email/render produces an HTML string,
// so no DOM is needed. 2026-06-18T21:30Z is 2:30 PM PDT (UTC-7) on a Thursday.
const SAMPLE: BookingConfirmationEmailProps = {
  inviteeName: "Ada Lovelace",
  hostName: "Robert",
  eventTypeName: "30 minute intro",
  startIso: "2026-06-18T21:30:00.000Z",
  endIso: "2026-06-18T22:00:00.000Z",
  inviteeTimezone: "America/Los_Angeles",
  durationMinutes: 30,
  meetLink: "https://meet.google.com/abc-defg-hij",
  inviteeNote: "Looking forward to it",
};

describe("BookingConfirmationEmail", () => {
  it("renders the invitee, host, event type, and confirmation heading", async () => {
    const html = await render(<BookingConfirmationEmail {...SAMPLE} />);
    expect(html).toContain("Booking confirmed");
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("Robert");
    expect(html).toContain("30 minute intro");
  });

  it("renders the start instant in the invitee timezone", async () => {
    const html = await render(<BookingConfirmationEmail {...SAMPLE} />);
    expect(html).toContain("Thursday, June 18, 2026 at 2:30 PM PDT");
  });

  it("renders the same instant in another timezone", async () => {
    const html = await render(
      <BookingConfirmationEmail {...SAMPLE} inviteeTimezone="UTC" />,
    );
    expect(html).toContain("Thursday, June 18, 2026 at 9:30 PM UTC");
  });

  it("falls back to the raw ISO string for an unknown timezone", async () => {
    const html = await render(
      <BookingConfirmationEmail {...SAMPLE} inviteeTimezone="Not/AZone" />,
    );
    expect(html).toContain("2026-06-18T21:30:00.000Z");
  });

  it("renders the duration", async () => {
    const html = await render(<BookingConfirmationEmail {...SAMPLE} />);
    expect(html).toContain("30 minutes");
  });

  it("renders the Meet link as a button when present", async () => {
    const html = await render(<BookingConfirmationEmail {...SAMPLE} />);
    expect(html).toContain("https://meet.google.com/abc-defg-hij");
    expect(html).toContain("Join with Google Meet");
  });

  it("omits the Meet button when there is no Meet link", async () => {
    const html = await render(
      <BookingConfirmationEmail {...SAMPLE} meetLink={undefined} />,
    );
    expect(html).not.toContain("Join with Google Meet");
  });

  it("renders the invitee note when present", async () => {
    const html = await render(<BookingConfirmationEmail {...SAMPLE} />);
    expect(html).toContain("Your note");
    expect(html).toContain("Looking forward to it");
  });

  it("omits the note section when there is no note", async () => {
    const html = await render(
      <BookingConfirmationEmail {...SAMPLE} inviteeNote={undefined} />,
    );
    expect(html).not.toContain("Your note");
  });

  it("notes that a calendar invitation was also sent", async () => {
    const html = await render(<BookingConfirmationEmail {...SAMPLE} />);
    expect(html).toContain("A calendar invitation has also been sent");
  });
});
