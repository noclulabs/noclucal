import "server-only";

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
 * Renders the branded confirmation template and sends it through Resend.
 *
 * Unwired in Phase 5b: nothing in the booking flow or the worker calls this
 * yet. Phase 5c wires it through a queued job, and the best-effort policy
 * (mirroring the Google write-back) belongs to that caller, not here: this
 * function returns the Resend send result as-is and lets errors propagate.
 * Note Resend reports API-level failures via `result.error` rather than
 * throwing; only transport-level failures reject.
 */
export async function sendConfirmationEmail(input: SendConfirmationEmailInput) {
  const { to, ...props } = input;
  const html = await render(createElement(BookingConfirmationEmail, props));
  return getResendClient().emails.send({
    from: requireEmailFrom(),
    to,
    subject: `Confirmed: ${props.eventTypeName} with ${props.hostName}`,
    html,
  });
}
