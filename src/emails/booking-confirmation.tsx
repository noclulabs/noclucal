import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import { formatInstantForEmail } from "@/lib/email/format";

/**
 * The branded booking-confirmation email, sent to the invitee after a booking
 * is confirmed. It complements Google's own calendar invitation (which already
 * carries the Meet link); this is the human-facing confirmation in noCluCal's
 * voice. No reschedule or cancel actions yet, those are Phase 6.
 *
 * Styling is inline and email-client-safe: a single column, the Indigo Signal
 * tokens duplicated from `globals.css` (email clients cannot read CSS custom
 * properties), and a system-font fallback behind Space Grotesk.
 */
export interface BookingConfirmationEmailProps {
  inviteeName: string;
  hostName: string;
  eventTypeName: string;
  /** Slot start, ISO UTC instant; rendered in the invitee timezone. */
  startIso: string;
  /** Slot end, ISO UTC instant. Accepted for parity with the booking payload. */
  endIso: string;
  /** IANA timezone the invitee booked in; every time below renders in it. */
  inviteeTimezone: string;
  durationMinutes: number;
  /** Present only if the Google event (and its Meet link) was created. */
  meetLink?: string;
  /** The optional note the invitee left on the booking form. */
  inviteeNote?: string;
}

// Indigo Signal palette, duplicated from src/app/globals.css. Kept in lockstep
// manually, the same rule as the globals.css duplication from noclulabs.
const canvas = "#0e1117";
const surface = "#161b22";
const surfaceElevated = "#1f2532";
const primary = "#818cf8";
const foreground = "#f5f7ff";
const foregroundMuted = "#a8b0c0";
const border = "rgba(255, 255, 255, 0.08)";

const fontFamily =
  '"Space Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif';

const bodyStyle = {
  backgroundColor: canvas,
  fontFamily,
  margin: 0,
  padding: "32px 16px",
};

const containerStyle = {
  backgroundColor: surface,
  borderRadius: "20px",
  margin: "0 auto",
  maxWidth: "520px",
  padding: "40px",
};

const wordmarkStyle = {
  color: foregroundMuted,
  fontSize: "14px",
  fontWeight: 600,
  letterSpacing: "0.02em",
  margin: "0 0 24px",
};

const headingStyle = {
  color: foreground,
  fontSize: "24px",
  fontWeight: 600,
  margin: "0 0 16px",
};

const textStyle = {
  color: foreground,
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 12px",
};

const mutedTextStyle = {
  color: foregroundMuted,
  fontSize: "13px",
  lineHeight: "20px",
  margin: "0 0 8px",
};

const detailCardStyle = {
  backgroundColor: surfaceElevated,
  borderRadius: "12px",
  margin: "20px 0",
  padding: "20px 24px",
};

const detailLabelStyle = {
  color: foregroundMuted,
  fontSize: "12px",
  letterSpacing: "0.04em",
  margin: "0 0 4px",
  textTransform: "uppercase" as const,
};

const detailValueStyle = {
  color: foreground,
  fontSize: "15px",
  lineHeight: "22px",
  margin: "0 0 16px",
};

const buttonStyle = {
  backgroundColor: primary,
  borderRadius: "999px",
  color: canvas,
  display: "inline-block",
  fontSize: "15px",
  fontWeight: 600,
  padding: "12px 28px",
  textDecoration: "none",
};

const hrStyle = {
  borderColor: border,
  margin: "28px 0 20px",
};

export function BookingConfirmationEmail({
  inviteeName,
  hostName,
  eventTypeName,
  startIso,
  inviteeTimezone,
  durationMinutes,
  meetLink,
  inviteeNote,
}: BookingConfirmationEmailProps) {
  const when = formatInstantForEmail(startIso, inviteeTimezone);

  return (
    <Html lang="en">
      <Head />
      <Preview>
        Your {eventTypeName} with {hostName} is confirmed
      </Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={wordmarkStyle}>noCluCal</Text>
          <Heading as="h1" style={headingStyle}>
            Booking confirmed
          </Heading>
          <Text style={textStyle}>Hi {inviteeName},</Text>
          <Text style={textStyle}>
            Your {eventTypeName} with {hostName} is confirmed.
          </Text>

          <Section style={detailCardStyle}>
            <Text style={detailLabelStyle}>When</Text>
            <Text style={detailValueStyle}>{when}</Text>
            <Text style={detailLabelStyle}>Duration</Text>
            <Text style={{ ...detailValueStyle, margin: 0 }}>
              {`${durationMinutes} ${durationMinutes === 1 ? "minute" : "minutes"}`}
            </Text>
          </Section>

          {meetLink ? (
            <Section style={{ margin: "0 0 8px" }}>
              <Button href={meetLink} style={buttonStyle}>
                Join with Google Meet
              </Button>
            </Section>
          ) : null}

          {inviteeNote ? (
            <Section style={{ margin: "12px 0 0" }}>
              <Text style={detailLabelStyle}>Your note</Text>
              <Text style={textStyle}>{inviteeNote}</Text>
            </Section>
          ) : null}

          <Hr style={hrStyle} />
          <Text style={mutedTextStyle}>
            A calendar invitation has also been sent to your email.
          </Text>
          <Text style={{ ...mutedTextStyle, margin: 0 }}>noCluCal</Text>
        </Container>
      </Body>
    </Html>
  );
}
