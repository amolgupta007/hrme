"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { MapPin, Briefcase, Clock, ChevronDown, ChevronUp, Send, X, Linkedin, Paperclip, Plus, Trash2 } from "lucide-react";
import { submitApplication, uploadApplicationFile } from "@/actions/hire";
import type { Job } from "@/actions/hire";

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  intern: "Internship",
};

const LOCATION_LABELS: Record<string, string> = {
  on_site: "On-site",
  remote: "Remote",
  hybrid: "Hybrid",
};

interface Props {
  org: { name: string; slug: string };
  jobs: Job[];
  defaultSource?: string;
}

export function CareersPageClient({ org, jobs, defaultSource }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const applyingJob = jobs.find((j) => j.id === applyingId) ?? null;

  return (
    <div className="min-h-screen bg-[#f5f4ff] dark:bg-[#0e0c1a]">
      {/* Header */}
      <div className="bg-white dark:bg-[#100e1f] border-b border-indigo-100 dark:border-indigo-900/40">
        <div className="mx-auto max-w-3xl px-6 py-10 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 dark:bg-indigo-950 px-3 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-4">
            We&apos;re hiring
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{org.name}</h1>
          <p className="mt-2 text-muted-foreground">
            {jobs.length > 0
              ? `${jobs.length} open position${jobs.length > 1 ? "s" : ""}`
              : "No open positions at the moment — check back soon."}
          </p>
        </div>
      </div>

      {/* Jobs list */}
      <div className="mx-auto max-w-3xl px-6 py-8 space-y-3">
        {jobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-indigo-200 dark:border-indigo-900/40 p-16 text-center">
            <p className="text-muted-foreground text-sm">No open roles right now.</p>
          </div>
        ) : (
          jobs.map((job) => {
            const isExpanded = expandedId === job.id;
            return (
              <div
                key={job.id}
                className="rounded-xl border border-indigo-100 bg-white dark:border-indigo-900/40 dark:bg-[#150e2b] overflow-hidden"
              >
                {/* Job header — clickable to expand */}
                <button
                  className="w-full text-left px-6 py-5 flex items-start justify-between gap-4"
                  onClick={() => setExpandedId(isExpanded ? null : job.id)}
                >
                  <div>
                    <p className="font-semibold text-base">{job.title}</p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-muted-foreground">
                      {job.department_name && (
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3" /> {job.department_name}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {LOCATION_LABELS[job.location_type]}
                        {job.location ? ` · ${job.location}` : ""}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {EMPLOYMENT_LABELS[job.employment_type]}
                      </span>
                      {job.show_salary && job.salary_min && (
                        <span>
                          ₹{(job.salary_min / 100000).toFixed(1)}L
                          {job.salary_max ? ` – ₹${(job.salary_max / 100000).toFixed(1)}L` : "+"}
                        </span>
                      )}
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                  )}
                </button>

                {/* Expanded description + apply */}
                {isExpanded && (
                  <div className="border-t border-indigo-100 dark:border-indigo-900/40 px-6 py-5 space-y-4">
                    <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed text-foreground/90">
                      {job.description}
                    </pre>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setApplyingId(job.id)}
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
                      >
                        Apply for this role
                      </button>
                      <a
                        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`https://jambahr.com/careers/${org.slug}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border border-[#0A66C2] px-4 py-2 text-sm font-semibold text-[#0A66C2] hover:bg-[#0A66C2]/5 transition-colors"
                      >
                        <Linkedin className="h-4 w-4" />
                        Share
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Apply modal */}
      {applyingJob && (
        <ApplyModal
          job={applyingJob}
          onClose={() => setApplyingId(null)}
        />
      )}
    </div>
  );
}

function ApplyModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [coverNote, setCoverNote] = useState("");
  const [answers, setAnswers] = useState<string[]>(job.custom_questions.map(() => ""));

  // Resume
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const resumeRef = useRef<HTMLInputElement>(null);

  // Work samples
  const [workFile, setWorkFile] = useState<File | null>(null);
  const workFileRef = useRef<HTMLInputElement>(null);
  const [workLinks, setWorkLinks] = useState<string[]>([""]);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name is required");
    if (!email.trim()) return toast.error("Email is required");

    setSubmitting(true);
    try {
      // Upload resume if provided
      let resumeUrl: string | undefined;
      if (resumeFile) {
        const fd = new FormData();
        fd.append("file", resumeFile);
        const res = await uploadApplicationFile(fd);
        if (!res.success) { toast.error(res.error); setSubmitting(false); return; }
        resumeUrl = res.data.url;
      }

      // Upload work file if provided
      const workSamples: string[] = workLinks.map((l) => l.trim()).filter(Boolean);
      if (workFile) {
        const fd = new FormData();
        fd.append("file", workFile);
        const res = await uploadApplicationFile(fd);
        if (!res.success) { toast.error(res.error); setSubmitting(false); return; }
        workSamples.unshift(res.data.url);
      }

      const result = await submitApplication(job.id, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        linkedin_url: linkedin.trim() || undefined,
        resume_url: resumeUrl,
        work_samples: workSamples.length > 0 ? workSamples : undefined,
        cover_note: coverNote.trim() || undefined,
        source: defaultSource,
        answers: job.custom_questions.map((q, i) => ({
          question: q.question,
          answer: answers[i] ?? "",
        })),
      });

      if (result.success) {
        setSubmitted(true);
      } else {
        toast.error(result.error);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-indigo-100 bg-white dark:border-indigo-900/40 dark:bg-[#150e2b] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-indigo-100 dark:border-indigo-900/40">
          <div>
            <p className="font-semibold">Apply — {job.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{LOCATION_LABELS[job.location_type]}{job.location ? ` · ${job.location}` : ""}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {submitted ? (
          <div className="px-6 py-12 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
              <Send className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="font-semibold text-lg">Application submitted!</p>
            <p className="text-sm text-muted-foreground">
              Thank you for applying. The hiring team will be in touch if there&apos;s a good fit.
            </p>
            <button
              onClick={onClose}
              className="mt-2 inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Full Name *</label>
                <input className={inputCls} placeholder="Priya Sharma" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label className="text-sm font-medium">Email *</label>
                <input type="email" className={inputCls} placeholder="priya@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Phone</label>
                <input className={inputCls} placeholder="+91 9876543210" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">LinkedIn URL</label>
                <input className={inputCls} placeholder="linkedin.com/in/…" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Cover Note</label>
              <textarea
                className={`${inputCls} min-h-[80px] resize-y`}
                placeholder="Tell us why you&apos;re a great fit for this role…"
                value={coverNote}
                onChange={(e) => setCoverNote(e.target.value)}
              />
            </div>

            {/* Resume upload */}
            <div>
              <label className="text-sm font-medium">Resume / CV</label>
              <div
                className="mt-1 flex items-center gap-3 rounded-lg border border-dashed border-input bg-background px-3 py-2.5 cursor-pointer hover:border-indigo-400 transition-colors"
                onClick={() => resumeRef.current?.click()}
              >
                <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground truncate">
                  {resumeFile ? resumeFile.name : "Upload PDF, DOC, or DOCX (max 5 MB)"}
                </span>
                {resumeFile && (
                  <button
                    type="button"
                    className="ml-auto text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); setResumeFile(null); if (resumeRef.current) resumeRef.current.value = ""; }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <input
                ref={resumeRef}
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {/* Work samples */}
            <div>
              <label className="text-sm font-medium">Work Samples <span className="text-muted-foreground font-normal">(optional)</span></label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">Share a portfolio, GitHub, Behance, case study, or any file that shows your work.</p>

              {/* File upload */}
              <div
                className="flex items-center gap-3 rounded-lg border border-dashed border-input bg-background px-3 py-2.5 cursor-pointer hover:border-indigo-400 transition-colors mb-2"
                onClick={() => workFileRef.current?.click()}
              >
                <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground truncate">
                  {workFile ? workFile.name : "Upload a file (PDF, ZIP, image — max 5 MB)"}
                </span>
                {workFile && (
                  <button
                    type="button"
                    className="ml-auto text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); setWorkFile(null); if (workFileRef.current) workFileRef.current.value = ""; }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <input
                ref={workFileRef}
                type="file"
                accept=".pdf,.zip,.png,.jpg,.jpeg,.gif,.mp4,.pptx,.key"
                className="hidden"
                onChange={(e) => setWorkFile(e.target.files?.[0] ?? null)}
              />

              {/* Links */}
              <div className="space-y-2">
                {workLinks.map((link, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className={`${inputCls} mt-0 flex-1`}
                      placeholder="https://github.com/you, portfolio.com, etc."
                      value={link}
                      onChange={(e) => {
                        const updated = [...workLinks];
                        updated[i] = e.target.value;
                        setWorkLinks(updated);
                      }}
                    />
                    {workLinks.length > 1 && (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setWorkLinks(workLinks.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  onClick={() => setWorkLinks([...workLinks, ""])}
                >
                  <Plus className="h-3 w-3" /> Add another link
                </button>
              </div>
            </div>

            {/* Custom questions */}
            {job.custom_questions.map((q, i) => (
              <div key={i}>
                <label className="text-sm font-medium">
                  {q.question} {q.required && <span className="text-destructive">*</span>}
                </label>
                <textarea
                  className={`${inputCls} min-h-[60px] resize-y`}
                  required={q.required}
                  value={answers[i] ?? ""}
                  onChange={(e) => {
                    const updated = [...answers];
                    updated[i] = e.target.value;
                    setAnswers(updated);
                  }}
                />
              </div>
            ))}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                <Send className="h-3.5 w-3.5" />
                {submitting ? "Submitting…" : "Submit Application"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
