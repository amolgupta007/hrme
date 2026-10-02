// Sends scripts/emails/medialoop-update-2026-10.tsx.
//   npx tsx --env-file=.env.local scripts/emails/send-medialoop-update.tsx <recipients.json> <outDir>          # preview only
//   npx tsx --env-file=.env.local scripts/emails/send-medialoop-update.tsx <recipients.json> <outDir> --send   # send
// recipients.json: [{ firstName, email }]. Needs only RESEND_API_KEY.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { render } from "@react-email/render";
import { Resend } from "resend";

const SUBJECT = "You asked, we built it: what's new in JambaHR";

async function main() {
  const [file, outDir, flag] = process.argv.slice(2);
  if (!file || !outDir) throw new Error("usage: send-medialoop-update.tsx <recipients.json> <outDir> [--send]");
  // App tsconfig is jsx:"preserve" → tsx uses the classic runtime; React must be global.
  (globalThis as { React?: typeof React }).React = React;
  const { MedialoopUpdateEmail } = await import("./medialoop-update-2026-10");
  const recipients = JSON.parse(readFileSync(file, "utf8")) as { firstName: string; email: string }[];
  mkdirSync(outDir, { recursive: true });

  if (flag !== "--send") {
    writeFileSync(join(outDir, "preview.html"), await render(MedialoopUpdateEmail({ firstName: recipients[0]?.firstName ?? "there" })));
    console.log(`[preview] ${recipients.length} recipients; wrote ${join(outDir, "preview.html")}`);
    return;
  }

  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY missing");
  const resend = new Resend(process.env.RESEND_API_KEY);
  let ok = 0;
  const failed: string[] = [];
  for (const r of recipients) {
    try {
      const html = await render(MedialoopUpdateEmail({ firstName: r.firstName }));
      const { error } = await resend.emails.send({
        from: "JambaHR <noreply@jambahr.com>",
        reply_to: "support@jambahr.com",
        to: r.email,
        subject: SUBJECT,
        html,
      });
      if (error) throw new Error(error.message);
      ok++;
      console.log(`[sent] ${r.firstName}`);
    } catch (e) {
      failed.push(r.firstName);
      console.log(`[FAILED] ${r.firstName}: ${(e as Error).message}`);
    }
    await new Promise((res) => setTimeout(res, 600));
  }
  console.log(`\nSent ${ok}/${recipients.length}${failed.length ? ` · failed: ${failed.join(", ")}` : ""}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
