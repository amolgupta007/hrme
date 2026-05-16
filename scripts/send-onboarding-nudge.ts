// One-off sender for onboarding nudge emails (Day 1 / 3 / 5).
// Mirrors the content in src/app/api/cron/onboarding-nudges/route.ts so we can
// manually fire a single nudge at an org that the cron skipped (e.g. paid plan).
//
// Usage (PowerShell):
//   npx tsx scripts/send-onboarding-nudge.ts --day 1 --to vinay@medialoop.in --name Vinay --org "Medialoop Communications"
// Add --dry-run to render + log without calling Resend.

import fs from "node:fs";
import path from "node:path";
import { render } from "@react-email/render";
import { Resend } from "resend";
import { OnboardingNudgeEmail } from "../src/components/emails/onboarding-nudge";

// Minimal env loader (no extra deps; avoids tsx/node flag plumbing on Windows).
// Defaults to .env.local; override with --env-file <path>.
const envFileArgIdx = process.argv.findIndex((a) => a === "--env-file");
const envFile = envFileArgIdx >= 0 ? process.argv[envFileArgIdx + 1] : ".env.local";
const envPath = path.resolve(process.cwd(), envFile);
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (!m) continue;
    const [, k, v] = m;
    if (!process.env[k]) process.env[k] = v.replace(/^"(.*)"$/, "$1");
  }
}

const NUDGE_CONTENT = {
  1: {
    subject: "One quick thing before you forget…",
    heading: "add your first employee",
    body: "Your JambaHR workspace is set up, but it's empty. Adding employees takes 2 minutes — just their name, email, role, and department. Once they're in, you can manage leave, track performance, and keep everyone on the same page.",
    ctaLabel: "Add employees",
    ctaUrl: "https://jambahr.com/dashboard/employees",
  },
  3: {
    subject: "Your leave policy is set up — take a look",
    heading: "your leave policies are ready",
    body: "We've pre-filled standard Indian leave policies for you: 8 days Casual, 8 days Sick, 18 days Earned Leave, and Leave Without Pay. Review them and adjust the day counts to match what your company actually offers. It takes 2 minutes and saves confusion later.",
    ctaLabel: "Review leave policies",
    ctaUrl: "https://jambahr.com/dashboard/settings",
  },
  5: {
    subject: "Your team can't use JambaHR yet",
    heading: "invite your managers and team",
    body: "Right now only you can see your JambaHR dashboard. Invite your managers so they can approve leave requests, and invite employees so they can submit leave, view company announcements, and manage their own profile. Use the Invite button in the Employees section.",
    ctaLabel: "Invite your team",
    ctaUrl: "https://jambahr.com/dashboard/employees",
  },
} as const;

function getArg(name: string): string | undefined {
  const i = process.argv.findIndex((a) => a === `--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const day = Number(getArg("day")) as 1 | 3 | 5;
  const to = getArg("to");
  const ownerFirstName = getArg("name") ?? "there";
  const orgName = getArg("org") ?? "your company";
  const dryRun = process.argv.includes("--dry-run");

  if (!to || !(day === 1 || day === 3 || day === 5)) {
    console.error("Required: --day {1|3|5} --to <email> [--name <first>] [--org <name>] [--dry-run]");
    process.exit(2);
  }

  const c = NUDGE_CONTENT[day];
  const html = await render(
    OnboardingNudgeEmail({
      orgName,
      ownerFirstName,
      day,
      subject: c.subject,
      heading: c.heading,
      body: c.body,
      ctaLabel: c.ctaLabel,
      ctaUrl: c.ctaUrl,
    })
  );

  if (dryRun) {
    console.log(`[dry-run] Day ${day} → ${to} (${orgName})`);
    console.log(`Subject: ${c.subject}`);
    console.log(`Heading: ${ownerFirstName}, ${c.heading}`);
    console.log(`HTML length: ${html.length}`);
    return;
  }

  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY missing in env");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: "amol@jambahr.com",
    to,
    subject: c.subject,
    html,
  });
  console.log(`Day ${day} sent to ${to}:`, JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("send-onboarding-nudge failed:", err);
  process.exit(1);
});
