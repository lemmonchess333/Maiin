/**
 * The report alert (lib/reportAlert.js): what the email says, where it
 * goes, and that it can never fail the report it announces.
 *
 * Resend is mocked at the network: the real transport
 * (email/accountEmails.js sendViaResend) runs against a stubbed `fetch`,
 * so the request it would send is what gets checked.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "tropos-unit-test";

const {
  DEFAULT_ALERT_EMAIL,
  alertRecipient,
  moderationQueueUrl,
  buildReportAlertEmail,
  sendReportAlert,
} = require("../lib/reportAlert");
const { sendViaResend } = require("../email/accountEmails");

const QUEUE = "https://troposfit.com/admin/moderation";
const REPORT = {
  reportId: "rep-1",
  targetType: "space_post_comment",
  category: "harassment",
  subReason: "Targeted insults or threats",
  freeformNote: "Third time this week.",
};

const quiet = () => ({ warn: vi.fn() });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("where the alert goes", () => {
  it("defaults to the support inbox", () => {
    expect(DEFAULT_ALERT_EMAIL).toBe("support@troposfit.com");
    expect(alertRecipient({})).toBe("support@troposfit.com");
    expect(alertRecipient({ MODERATION_ALERT_EMAIL: "   " })).toBe(
      "support@troposfit.com"
    );
  });

  it("follows MODERATION_ALERT_EMAIL when it is set", () => {
    expect(
      alertRecipient({ MODERATION_ALERT_EMAIL: " mod@troposfit.com " })
    ).toBe("mod@troposfit.com");
  });

  it("links to the queue on the app's origin, with or without a slash", () => {
    expect(moderationQueueUrl("https://troposfit.com/")).toBe(QUEUE);
    expect(moderationQueueUrl("https://lemmonchess333.github.io/Maiin")).toBe(
      "https://lemmonchess333.github.io/Maiin/admin/moderation"
    );
  });
});

describe("what the alert says", () => {
  const { subject, html } = buildReportAlertEmail({
    ...REPORT,
    queueUrl: QUEUE,
  });

  it("names the reason and what was reported in the subject", () => {
    expect(subject).toBe(
      "New report: Harassment or bullying (a comment on a space post)"
    );
  });

  it("carries the reason, the kind of target, the note and the link", () => {
    expect(html).toContain(
      "Harassment or bullying: Targeted insults or threats"
    );
    expect(html).toContain("A comment on a space post");
    expect(html).toContain("Third time this week.");
    expect(html).toContain(`href="${QUEUE}"`);
    expect(html).toContain("rep-1");
    expect(html).toContain("reviewed within 24 hours");
  });

  it("escapes the note: it is user input in an HTML email", () => {
    const { html: hostile } = buildReportAlertEmail({
      ...REPORT,
      freeformNote: '<img src=x onerror="alert(1)"> & more',
      queueUrl: QUEUE,
    });
    expect(hostile).not.toContain("<img src=x");
    expect(hostile).toContain(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; more"
    );
  });

  it('says "None" when the reporter left no note', () => {
    const { html: bare } = buildReportAlertEmail({
      ...REPORT,
      freeformNote: undefined,
      subReason: undefined,
      queueUrl: QUEUE,
    });
    expect(bare).toMatch(/Note<\/td>\s*<td[^>]*>None</);
    expect(bare).toContain(">Harassment or bullying<");
  });

  it("names every report target type the server accepts", () => {
    const { TARGET_TYPES } = require("../lib/reportTargets");
    for (const targetType of TARGET_TYPES) {
      const { subject: s } = buildReportAlertEmail({
        ...REPORT,
        targetType,
        queueUrl: QUEUE,
      });
      expect(s).not.toContain("something");
    }
  });

  it("carries no exclamation marks (house voice)", () => {
    expect(subject).not.toContain("!");
    expect(html.replace(/<!doctype html>/i, "")).not.toContain("!");
  });
});

describe("sendReportAlert", () => {
  it("sends one email to the recipient", async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined);
    const result = await sendReportAlert({
      sendEmail,
      to: "mod@troposfit.com",
      queueUrl: QUEUE,
      report: REPORT,
      logger: quiet(),
    });
    expect(result).toEqual({ sent: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [message] = sendEmail.mock.calls[0];
    expect(message.to).toBe("mod@troposfit.com");
    expect(message.subject).toContain("Harassment or bullying");
    expect(message.html).toContain(QUEUE);
  });

  it("never throws when the send fails, and logs it", async () => {
    const logger = quiet();
    const result = await sendReportAlert({
      sendEmail: vi.fn().mockRejectedValue(new Error("Resend down")),
      to: "mod@troposfit.com",
      queueUrl: QUEUE,
      report: REPORT,
      logger,
    });
    expect(result).toEqual({ sent: false });
    expect(logger.warn).toHaveBeenCalledWith("createReport.alert_failed", {
      reportId: "rep-1",
      error: "Resend down",
    });
  });

  it("gives up on a provider that never answers", async () => {
    vi.useFakeTimers();
    const logger = quiet();
    const pending = sendReportAlert({
      sendEmail: () => new Promise(() => {}),
      to: "mod@troposfit.com",
      queueUrl: QUEUE,
      report: REPORT,
      logger,
      timeoutMs: 5000,
    });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toEqual({ sent: false });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe("sendReportAlert over the Resend transport (fetch mocked)", () => {
  it("posts the alert to Resend with the API key and the sender", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "Tropos <no-reply@troposfit.com>");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendReportAlert({
      sendEmail: sendViaResend,
      to: "support@troposfit.com",
      queueUrl: QUEUE,
      report: REPORT,
      logger: quiet(),
    });

    expect(result).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(init.body);
    expect(body.from).toBe("Tropos <no-reply@troposfit.com>");
    expect(body.to).toBe("support@troposfit.com");
    expect(body.subject).toContain("Harassment or bullying");
    expect(body.html).toContain(QUEUE);
  });

  it("reports a Resend error as not sent, without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "server error",
      })
    );
    const logger = quiet();
    const result = await sendReportAlert({
      sendEmail: sendViaResend,
      to: "support@troposfit.com",
      queueUrl: QUEUE,
      report: REPORT,
      logger,
    });
    expect(result).toEqual({ sent: false });
    expect(logger.warn.mock.calls[0][1].error).toContain("500");
  });
});
