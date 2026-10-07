// One-off sender for the "You have a new announcement" email, for an
// announcement published before the email existed (AnnouncementPublishedEmail).
//
//   npx tsx --env-file=.env.local scripts/send-announcement-email.tsx <data.json> <outDir>          # preview only
//   npx tsx --env-file=.env.local scripts/send-announcement-email.tsx <data.json> <outDir> --send   # actually send
//
// data.json: { orgName, announcementId, title, body, ackRequired, ackDueDate,
//              recipients: [{ firstName, email }] }
// exported from the DB by hand (only RESEND_API_KEY is needed here).
// Preview mode writes one sample HTML file into <outDir> and sends nothing.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { render } from "@react-email/render";
import { Resend } from "resend";
import React from "react";

type Recipient = { firstName: string; email: string };

async function main() {
  // Classic JSX runtime under tsx (see send-sign-in-options.tsx).
  (globalThis as { React?: typeof React }).React = React;
  const { AnnouncementPublishedEmail } = await import("../src/components/emails/announcement-published");
  const { announcementExcerpt } = await import("../src/lib/announcements/excerpt");
  const [file, outDir, flag] = process.argv.slice(2);
  if (!file || !outDir) throw new Error("usage: send-announcement-email.tsx <data.json> <outDir> [--send]");
  const send = flag === "--send";
  const data = JSON.parse(readFileSync(file, "utf8")) as {
    orgName: string;
    announcementId: string;
    title: string;
    body: string;
    ackRequired: boolean;
    ackDueDate: string | null;
    recipients: Recipient[];
  };
  mkdirSync(outDir, { recursive: true });

  const resend = send ? new Resend(process.env.RESEND_API_KEY) : null;
  if (send && !process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY missing");

  const dueDateLabel = data.ackDueDate
    ? new Date(`${data.ackDueDate}T00:00:00+05:30`).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      })
    : null;

  let previewed = false;
  let ok = 0;
  const failed: string[] = [];

  for (const r of data.recipients) {
    const html = await render(
      AnnouncementPublishedEmail({
        employeeName: r.firstName.trim() || "there",
        orgName: data.orgName.trim(),
        announcementTitle: data.title,
        preview: announcementExcerpt(data.body),
        ackRequired: data.ackRequired,
        dueDateLabel,
        announcementUrl: `https://jambahr.com/dashboard/announcements#announcement-${data.announcementId}`,
      })
    );
    if (!send) {
      if (!previewed) writeFileSync(join(outDir, "preview.html"), html);
      previewed = true;
      console.log(`[preview] ${r.firstName.trim()}`);
      continue;
    }

    try {
      const { error } = await resend!.emails.send({
        from: "support@jambahr.com",
        to: r.email,
        subject: `New announcement: ${data.title}`,
        html,
      });
      if (error) throw new Error(error.message);
      ok++;
      console.log(`[sent] ${r.firstName.trim()}`);
    } catch (e) {
      failed.push(r.firstName.trim());
      console.log(`[FAILED] ${r.firstName.trim()}: ${(e as Error).message}`);
    }
    await new Promise((res) => setTimeout(res, 600)); // stay under Resend's rate limit
  }

  if (send) console.log(`\nSent ${ok}/${data.recipients.length}${failed.length ? ` · failed: ${failed.join(", ")}` : ""}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
