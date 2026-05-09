"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { submitApplicationForReferral } from "@/actions/referrals";

interface Props {
  token: string;
  defaults: {
    name: string;
    email: string;
    phone: string;
    linkedin: string;
    resume: string;
  };
}

export function ApplyForm({ token, defaults }: Props) {
  const [name, setName] = useState(defaults.name);
  const [email, setEmail] = useState(defaults.email);
  const [phone, setPhone] = useState(defaults.phone);
  const [linkedin, setLinkedin] = useState(defaults.linkedin);
  const [resume, setResume] = useState(defaults.resume);
  const [coverLetter, setCoverLetter] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  const ready = name.trim().length > 0 && /^.+@.+\..+$/.test(email);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    startTransition(async () => {
      const res = await submitApplicationForReferral({
        token,
        candidate_name: name.trim(),
        candidate_email: email.trim(),
        candidate_phone: phone.trim() || undefined,
        linkedin_url: linkedin.trim() || undefined,
        resume_url: resume.trim() || undefined,
        cover_letter: coverLetter.trim() || undefined,
      });
      if (res.success) {
        setSubmitted(true);
        toast.success("Application submitted");
      } else {
        toast.error(res.error);
      }
    });
  };

  if (submitted) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-5 py-6 text-sm text-emerald-900">
        <p className="font-semibold">You&apos;re in.</p>
        <p className="mt-1">
          We&apos;ve received your application. The hiring team will review it and get back to
          you over email if it moves forward.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Full name" required>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
        />
      </Field>
      <Field label="Email" required>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
        />
      </Field>
      <Field label="Phone">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
        />
      </Field>
      <Field label="LinkedIn URL">
        <input
          type="url"
          value={linkedin}
          onChange={(e) => setLinkedin(e.target.value)}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
        />
      </Field>
      <Field label="Resume URL" hint="Public link to PDF">
        <input
          type="url"
          value={resume}
          onChange={(e) => setResume(e.target.value)}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
        />
      </Field>
      <Field label="Cover letter" hint="Optional — anything you'd like the team to know">
        <textarea
          rows={5}
          value={coverLetter}
          onChange={(e) => setCoverLetter(e.target.value)}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
        />
      </Field>

      <div className="pt-2">
        <button
          type="submit"
          disabled={!ready || pending}
          className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "Submitting…" : "Apply"}
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
      <label className="mb-1.5 block text-xs font-semibold text-gray-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
        {hint && <span className="ml-2 font-normal text-gray-400">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
