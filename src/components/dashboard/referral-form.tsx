"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { submitReferral } from "@/actions/referrals";

export function ReferralForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [resume, setResume] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const ready = name.trim().length > 0 && /^.+@.+\..+$/.test(email);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    startTransition(async () => {
      const res = await submitReferral({
        jobId,
        candidate_name: name.trim(),
        candidate_email: email.trim(),
        candidate_phone: phone.trim() || undefined,
        linkedin_url: linkedin.trim() || undefined,
        resume_url: resume.trim() || undefined,
        note_to_recruiter: note.trim() || undefined,
      });
      if (res.success) {
        toast.success("Referral submitted — we'll email them the apply link");
        router.push("/dashboard/refer/my-referrals");
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
      <Field label="Candidate name" required>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
        />
      </Field>

      <Field label="Candidate email" required>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
        />
      </Field>

      <Field label="Candidate phone">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
        />
      </Field>

      <Field label="LinkedIn URL">
        <input
          type="url"
          placeholder="https://linkedin.com/in/…"
          value={linkedin}
          onChange={(e) => setLinkedin(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
        />
      </Field>

      <Field label="Resume URL" hint="Public link to a PDF (optional)">
        <input
          type="url"
          placeholder="https://…"
          value={resume}
          onChange={(e) => setResume(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
        />
      </Field>

      <Field label="Note to the team" hint="Why is this candidate a good fit?">
        <textarea
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
        />
      </Field>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={!ready || pending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "Submitting…" : "Submit referral"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-foreground">
        {label}
        {required && <span className="text-red-600"> *</span>}
        {hint && <span className="ml-2 font-normal text-muted-foreground">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
