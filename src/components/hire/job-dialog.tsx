"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createJob, updateJob } from "@/actions/hire";
import type { Job } from "@/actions/hire";
import type { Department } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  departments: Department[];
  existing?: Job | null;
}

export function JobDialog({ open, onClose, departments, existing }: Props) {
  const isEdit = !!existing;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [departmentId, setDepartmentId] = useState(existing?.department_id ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [employmentType, setEmploymentType] = useState(existing?.employment_type ?? "full_time");
  const [locationType, setLocationType] = useState(existing?.location_type ?? "on_site");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [salaryMin, setSalaryMin] = useState(existing?.salary_min ? String(existing.salary_min) : "");
  const [salaryMax, setSalaryMax] = useState(existing?.salary_max ? String(existing.salary_max) : "");
  const [showSalary, setShowSalary] = useState(existing?.show_salary ?? false);
  const [status, setStatus] = useState(existing?.status ?? "draft");
  const [questions, setQuestions] = useState<{ question: string; required: boolean }[]>(
    existing?.custom_questions ?? []
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(existing?.title ?? "");
      setDepartmentId(existing?.department_id ?? "");
      setDescription(existing?.description ?? "");
      setEmploymentType(existing?.employment_type ?? "full_time");
      setLocationType(existing?.location_type ?? "on_site");
      setLocation(existing?.location ?? "");
      setSalaryMin(existing?.salary_min ? String(existing.salary_min) : "");
      setSalaryMax(existing?.salary_max ? String(existing.salary_max) : "");
      setShowSalary(existing?.show_salary ?? false);
      setStatus(existing?.status ?? "draft");
      setQuestions(existing?.custom_questions ?? []);
    }
  }, [open, existing]);

  function addQuestion() {
    setQuestions((q) => [...q, { question: "", required: false }]);
  }

  function removeQuestion(i: number) {
    setQuestions((q) => q.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!title.trim()) return toast.error("Title is required");
    if (!description.trim()) return toast.error("Description is required");

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        department_id: departmentId || "",
        description: description.trim(),
        employment_type: employmentType as any,
        location_type: locationType as any,
        location: location.trim() || undefined,
        salary_min: salaryMin ? parseInt(salaryMin) : undefined,
        salary_max: salaryMax ? parseInt(salaryMax) : undefined,
        show_salary: showSalary,
        status: status as any,
        custom_questions: questions.filter((q) => q.question.trim()),
      };

      const result = isEdit
        ? await updateJob(existing!.id, payload)
        : await createJob(payload);

      if (result.success) {
        toast.success(isEdit ? "Job updated" : "Job created");
        onClose();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400";
  const labelCls = "text-sm font-medium text-foreground";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Job" : "Create New Job"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Title + Status */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Job Title *</label>
              <input className={inputCls} placeholder="e.g. Senior Backend Engineer" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          {/* Department + Employment Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Department</label>
              <select className={inputCls} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">No department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Employment Type</label>
              <select className={inputCls} value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
                <option value="full_time">Full-time</option>
                <option value="part_time">Part-time</option>
                <option value="contract">Contract</option>
                <option value="intern">Intern</option>
              </select>
            </div>
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Location Type</label>
              <select className={inputCls} value={locationType} onChange={(e) => setLocationType(e.target.value)}>
                <option value="on_site">On-site</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>City / Region</label>
              <input className={inputCls} placeholder="e.g. Bengaluru, India" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          </div>

          {/* Salary */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Min CTC (₹/year)</label>
              <input type="number" className={inputCls} placeholder="e.g. 800000" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Max CTC (₹/year)</label>
              <input type="number" className={inputCls} placeholder="e.g. 1500000" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={showSalary} onChange={(e) => setShowSalary(e.target.checked)} className="h-4 w-4 rounded" />
                Show on posting
              </label>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Job Description *</label>
            <textarea
              className={`${inputCls} min-h-[140px] resize-y font-mono text-xs`}
              placeholder="Describe the role, responsibilities, requirements, and what you're looking for..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Custom Questions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls}>Application Questions</label>
              <button onClick={addQuestion} className="flex items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400">
                <Plus className="h-3 w-3" /> Add question
              </button>
            </div>
            {questions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No custom questions — only name, email, and resume will be asked.</p>
            ) : (
              <div className="space-y-2">
                {questions.map((q, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className={`${inputCls} mt-0 flex-1`}
                      placeholder={`Question ${i + 1}`}
                      value={q.question}
                      onChange={(e) => {
                        const updated = [...questions];
                        updated[i] = { ...updated[i], question: e.target.value };
                        setQuestions(updated);
                      }}
                    />
                    <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) => {
                          const updated = [...questions];
                          updated[i] = { ...updated[i], required: e.target.checked };
                          setQuestions(updated);
                        }}
                        className="h-3.5 w-3.5"
                      />
                      Required
                    </label>
                    <button onClick={() => removeQuestion(i)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {saving ? "Saving…" : isEdit ? "Update Job" : "Create Job"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
