"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadCvs } from "@/actions/screening";

export function CvUploadDialog({ jobId }: { jobId: string }) {
  const [files, setFiles] = useState<FileList | null>(null);
  const [pending, start] = useTransition();

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
      if (res.success) toast.success(`Uploaded ${res.data.created}, skipped ${res.data.skipped}`);
      else toast.error(res.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="file"
        multiple
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => setFiles(e.target.files)}
        className="text-sm"
      />
      <Button onClick={submit} disabled={pending}>
        {pending ? "Uploading…" : "Upload CVs"}
      </Button>
    </div>
  );
}
