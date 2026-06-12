import { createElement } from "react";
import { render } from "@react-email/render";

import {
  BookingConfirmationEmail,
  type BookingConfirmationEmailProps,
} from "@/emails/booking-confirmation";
import { getResendClient, requireEmailFrom } from "./client";

export interface SendConfirmationEmailInput
  extends BookingConfirmationEmailProps {
  /** The invitee address the confirmation is sent to. */
  to: string;
}

/**
 * Renders the branded confirmation template and sends it through Resend, with
 * both an HTML body and a plain-text body for deliverability.
 *
 * Wired in Phase 5c: the worker calls this for each `send-confirmation` job
 * enqueued by `confirmBooking`. The best-effort policy (mirroring the Google
 * write-back) belongs to the callers, not here: this function returns the
 * Resend send result as-is and lets errors propagate. Note Resend reports
 * API-level failures via `result.error` rather than throwing; only
 * transport-level failures reject. Server-side by convention, like the DB and
 * crypto modules (no `server-only` marker; the tsx worker imports this path).
 */
export async function sendConfirmationEmail(input: SendConfirmationEmailInput) {
  const { to, ...props } = input;
  const element = createElement(BookingConfirmationEmail, props);
  const html = await render(element);
  const text = await render(element, { plainText: true });
  return getResendClient().emails.send({
    from: requireEmailFrom(),
    to,
    subject: `Confirmed: ${props.eventTypeName} with ${props.hostName}`,
    html,
    text,
  });
}
