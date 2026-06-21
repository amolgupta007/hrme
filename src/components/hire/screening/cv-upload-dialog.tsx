"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadCvs } from "@/actions/screening";

export function CvUploadDialog({ jobId, onUploaded }: { jobId: string; onUploaded?: () => void }) {
  const [files, setFiles] = useState<FileList | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const count = files?.length ?? 0;

  function submit() {
    if (!files || files.length === 0) {
      toast.error("Select one or more PDF/DOCX files");
      return;
    }
    const fd = new FormData();
    fd.set("jobId", jobId);
    Array.from(files).forEach((f) => fd.append("files", f));
    start(async () => {
      const res = await uploadCvs(fd);
      if (res.success) {
        toast.success(
          `Uploaded ${res.data.created}${res.data.skipped ? `, skipped ${res.data.skipped}` : ""} — parsing in the background`,
        );
        setFiles(null);
        if (inputRef.current) inputRef.current.value = "";
        onUploaded?.();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        id="cv-files"
        type="file"
        multiple
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => setFiles(e.target.files)}
        className="sr-only"
      />
      <label
        htmlFor="cv-files"
        className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-input bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-indigo-400 hover:text-foreground"
      >
        <Upload className="h-4 w-4" />
        {count > 0 ? `${count} file${count > 1 ? "s" : ""} selected` : "Choose CVs (PDF / DOCX)"}
      </label>
      <Button
        onClick={submit}
        disabled={pending || count === 0}
        className="bg-indigo-600 hover:bg-indigo-700 text-white"
      >
        {pending ? "Uploading…" : "Upload CVs"}
      </Button>
    </div>
  );
}
