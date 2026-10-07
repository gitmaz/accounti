import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import nodemailer from "nodemailer";

import type { SmtpSettings } from "../../shared/types";

export function smtpConfigured(smtp: SmtpSettings): boolean {
  return Boolean(smtp.host.trim() && smtp.from.trim());
}

async function sendSes(message: { to: string; subject: string; text: string }): Promise<{ sent: boolean; error?: string }> {
  const from = String(process.env.SES_FROM_EMAIL || "").trim();
  if (!from || String(process.env.MAIL_DISABLE_SEND || "").toLowerCase() === "true") return { sent: false };
  try {
    const ses = new SESv2Client({});
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: from,
        Destination: { ToAddresses: [message.to] },
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: "UTF-8" },
            Body: { Text: { Data: message.text, Charset: "UTF-8" } },
          },
        },
      }),
    );
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Mail failed" };
  }
}

async function sendSmtp(smtp: SmtpSettings, message: { to: string; subject: string; text: string }): Promise<{ sent: boolean; error?: string }> {
  try {
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port || 587,
      secure: smtp.encryption === "ssl",
      auth: smtp.username ? { user: smtp.username, pass: smtp.password } : undefined,
    });
    await transport.sendMail({ from: smtp.from, to: message.to, subject: message.subject, text: message.text });
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Mail failed" };
  }
}

export async function sendMail(smtp: SmtpSettings, message: { to: string; subject: string; text: string }): Promise<{ sent: boolean; error?: string }> {
  if (smtpConfigured(smtp)) return sendSmtp(smtp, message);
  return sendSes(message);
}
