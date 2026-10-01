// One-off sender for the "Three ways to sign in" email (SignInOptionsEmail).
//
//   npx tsx --env-file=.env.local scripts/send-sign-in-options.tsx <recipients.json> <outDir>          # preview only
//   npx tsx --env-file=.env.local scripts/send-sign-in-options.tsx <recipients.json> <outDir> --send   # actually send
//
// recipients.json: { orgName, recipients: [{ firstName, email }] }
// exported from the DB by hand (no service-role key needed here — only RESEND_API_KEY).
// Preview mode writes one sample HTML file into <outDir> and sends nothing.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { render } from "@react-email/render";
import { Resend } from "resend";
import React from "react";

type Recipient = { firstName: string; email: string };

async function main() {
  // The app's tsconfig uses jsx:"preserve" (Next compiles JSX), so tsx falls back
  // to the classic runtime and needs React in scope when the template renders.
  (globalThis as { React?: typeof React }).React = React;
  const { SignInOptionsEmail } = await import("../src/components/emails/sign-in-options");
  const [file, outDir, flag] = process.argv.slice(2);
  if (!file || !outDir) throw new Error("usage: send-sign-in-options.tsx <recipients.json> <outDir> [--send]");
  const send = flag === "--send";
  const { orgName, recipients } = JSON.parse(readFileSync(file, "utf8")) as {
    orgName: string;
    recipients: Recipient[];
  };
  mkdirSync(outDir, { recursive: true });

  const resend = send ? new Resend(process.env.RESEND_API_KEY) : null;
  if (send && !process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY missing");

  let previewed = false;
  let ok = 0;
  const failed: string[] = [];

  for (const r of recipients) {
    const html = await render(
      SignInOptionsEmail({
        firstName: r.firstName,
        orgName: orgName.trim(),
        email: r.email,
        signInUrl: "https://jambahr.com/sign-in",
      })
    );
    if (!send) {
      if (!previewed) writeFileSync(join(outDir, "preview.html"), html);
      previewed = true;
      console.log(`[preview] ${r.firstName}`);
      continue;
    }

    try {
      const { error } = await resend!.emails.send({
        from: "JambaHR <noreply@jambahr.com>",
        reply_to: "support@jambahr.com",
        to: r.email,
        subject: "How to sign in to JambaHR — 3 ways",
        html,
      });
      if (error) throw new Error(error.message);
      ok++;
      console.log(`[sent] ${r.firstName}`);
    } catch (e) {
      failed.push(r.firstName);
      console.log(`[FAILED] ${r.firstName}: ${(e as Error).message}`);
    }
    await new Promise((res) => setTimeout(res, 600)); // stay under Resend's rate limit
  }

  if (send) console.log(`\nSent ${ok}/${recipients.length}${failed.length ? ` · failed: ${failed.join(", ")}` : ""}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
