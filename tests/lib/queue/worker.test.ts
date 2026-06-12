import type { Job } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the send path so the processor is exercised without Resend, a real
// key, or a network call; the queue substrate itself is not involved (the
// processor is called directly, so no Redis either).
const mockSendConfirmationEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email/send-confirmation", () => ({
  sendConfirmationEmail: mockSendConfirmationEmail,
}));

import { JOB_NAMES, type SendConfirmationJobPayload } from "@/lib/queue/constants";
import { defaultProcessor } from "@/lib/queue/worker";

const PAYLOAD: SendConfirmationJobPayload = {
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

/** A minimal Job stand-in; the processor reads only `name` and `data`. */
function makeJob(name: string, data: unknown): Job {
  return { name, data } as Job;
}

describe("defaultProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("send-confirmation: calls sendConfirmationEmail with job.data and returns the data", async () => {
    const sent = { data: { id: "email_123" }, error: null };
    mockSendConfirmationEmail.mockResolvedValue(sent);

    const result = await defaultProcessor(
      makeJob(JOB_NAMES.SEND_CONFIRMATION, PAYLOAD),
    );

    expect(mockSendConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(mockSendConfirmationEmail).toHaveBeenCalledWith(PAYLOAD);
    expect(result).toBe(sent.data);
  });

  it("send-confirmation: a Resend API-level error throws so BullMQ retries", async () => {
    // Resend reports API failures via `result.error`, not by throwing; the
    // processor must raise them or the job would complete without a send.
    mockSendConfirmationEmail.mockResolvedValue({
      data: null,
      error: { message: "domain is not verified", name: "validation_error" },
    });

    await expect(
      defaultProcessor(makeJob(JOB_NAMES.SEND_CONFIRMATION, PAYLOAD)),
    ).rejects.toThrow("domain is not verified");
  });

  it("send-confirmation: a send rejection propagates so BullMQ retries", async () => {
    mockSendConfirmationEmail.mockRejectedValue(
      new Error("resend transport down"),
    );

    await expect(
      defaultProcessor(makeJob(JOB_NAMES.SEND_CONFIRMATION, PAYLOAD)),
    ).rejects.toThrow("resend transport down");
  });

  it("health: still returns the job data and does not send", async () => {
    const payload = { ping: "pong" };

    const result = await defaultProcessor(makeJob(JOB_NAMES.HEALTH, payload));

    expect(result).toEqual(payload);
    expect(mockSendConfirmationEmail).not.toHaveBeenCalled();
  });

  it("an unknown job resolves with no side effect", async () => {
    const result = await defaultProcessor(makeJob("unknown", {}));

    expect(result).toBeUndefined();
    expect(mockSendConfirmationEmail).not.toHaveBeenCalled();
  });
});
