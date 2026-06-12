import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The `server-only` marker throws outside a React Server environment; stub it
// the way the provider tests stub `googleapis`.
vi.mock("server-only", () => ({}));

// Mock the Resend SDK so no network call can happen. The mock function is
// declared first so tests can configure it; a regular function expression
// backs the constructor so `new Resend(...)` works.
const mockSend = vi.fn();
vi.mock("resend", () => {
  const Resend = vi.fn().mockImplementation(function () {
    return { emails: { send: mockSend } };
  });
  return { Resend };
});

import { Resend } from "resend";

import { _resetResendClientForTests } from "@/lib/email/client";
import {
  sendConfirmationEmail,
  type SendConfirmationEmailInput,
} from "@/lib/email/send-confirmation";

const ENV_KEYS = ["RESEND_API_KEY", "EMAIL_FROM"] as const;

const INPUT: SendConfirmationEmailInput = {
  to: "ada@example.com",
  inviteeName: "Ada Lovelace",
  hostName: "Robert",
  eventTypeName: "30 minute intro",
  startIso: "2026-06-18T21:30:00.000Z",
  endIso: "2026-06-18T22:00:00.000Z",
  inviteeTimezone: "America/Los_Angeles",
  durationMinutes: 30,
  meetLink: "https://meet.google.com/abc-defg-hij",
};

describe("sendConfirmationEmail", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
    }
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "noCluCal <bookings@cal.noclulabs.com>";
    _resetResendClientForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
    _resetResendClientForTests();
  });

  it("constructs the client with the API key from the environment", async () => {
    mockSend.mockResolvedValue({ data: { id: "email_123" }, error: null });
    await sendConfirmationEmail(INPUT);
    expect(Resend).toHaveBeenCalledWith("re_test_key");
  });

  it("sends with the expected from, to, subject, and rendered html", async () => {
    mockSend.mockResolvedValue({ data: { id: "email_123" }, error: null });
    await sendConfirmationEmail(INPUT);
    expect(mockSend).toHaveBeenCalledTimes(1);
    const payload = mockSend.mock.calls[0][0];
    expect(payload.from).toBe("noCluCal <bookings@cal.noclulabs.com>");
    expect(payload.to).toBe("ada@example.com");
    expect(payload.subject).toBe("Confirmed: 30 minute intro with Robert");
    expect(payload.html).toContain("Booking confirmed");
    expect(payload.html).toContain("Ada Lovelace");
    expect(payload.html).toContain("Thursday, June 18, 2026 at 2:30 PM PDT");
    expect(payload.html).toContain("https://meet.google.com/abc-defg-hij");
  });

  it("returns the Resend send result as-is", async () => {
    const result = { data: { id: "email_456" }, error: null };
    mockSend.mockResolvedValue(result);
    await expect(sendConfirmationEmail(INPUT)).resolves.toBe(result);
  });

  it("propagates an error when the send rejects", async () => {
    mockSend.mockRejectedValue(new Error("resend transport down"));
    await expect(sendConfirmationEmail(INPUT)).rejects.toThrow(
      "resend transport down",
    );
  });

  it("throws before sending when EMAIL_FROM is missing", async () => {
    delete process.env.EMAIL_FROM;
    await expect(sendConfirmationEmail(INPUT)).rejects.toThrow(
      "EMAIL_FROM is not set",
    );
    expect(mockSend).not.toHaveBeenCalled();
  });
});
