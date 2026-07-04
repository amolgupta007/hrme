"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Trash2,
  Plus,
  Sparkles,
  BookOpen,
  Eye,
  EyeOff,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownView } from "@/components/documents/markdown-view";
import {
  createTemplate,
  updateTemplate,
  setTemplateStatus,
  type LibraryClause,
} from "@/actions/documents-templating";
import type { ClauseCategory, DocumentType } from "@/lib/documents/types";
import { AiDraftDialog } from "@/components/documents/ai-draft-dialog";
import { LibraryPickerDialog } from "@/components/documents/library-picker-dialog";

interface EditableClause {
  key: string;
  title: string;
  body_markdown: string;
  is_mandatory: boolean;
  category: ClauseCategory;
}

const CATEGORIES: ClauseCategory[] = ["behavior", "compliance", "confidentiality", "comp", "custom"];
const DOC_TYPES: { value: DocumentType; label: string }[] = [
  { value: "offer_letter", label: "Offer letter" },
  { value: "nda", label: "NDA" },
  { value: "policy", label: "Policy" },
];

// Sample values for the live preview.
const SAMPLE: Record<string, string> = {
  employee_name: "Priya Sharma",
  designation: "Senior Software Engineer",
  department: "Engineering",
  employment_type: "Full Time",
  joining_date: "Aug 1, 2026",
  employee_email: "priya@example.com",
  ctc: "₹18,00,000",
  issuing_entity_name: "Acme Technologies Pvt Ltd",
  issuing_entity_address: "4th Floor, Tech Park, Pune 411001",
  group_name: "Acme Group",
  today: "Jul 4, 2026",
};

function applySample(md: string): string {
  return md.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_f, k: string) => SAMPLE[k] ?? `[${k}]`);
}

function newKey() {
  return `c_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export function TemplateBuilder({
  templateId,
  initialName,
  initialType,
  initialClauses,
  library,
  variables,
}: {
  templateId?: string;
  initialName: string;
  initialType: DocumentType;
  initialClauses: EditableClause[];
  library: LibraryClause[];
  variables: { key: string; label: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<DocumentType>(initialType);
  const [clauses, setClauses] = useState<EditableClause[]>(initialClauses);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setClauses((cs) => {
      const oldIdx = cs.findIndex((c) => c.key === active.id);
      const newIdx = cs.findIndex((c) => c.key === over.id);
      return arrayMove(cs, oldIdx, newIdx);
    });
  }

  function update(key: string, patch: Partial<EditableClause>) {
    setClauses((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }
  function remove(key: string) {
    setClauses((cs) => cs.filter((c) => c.key !== key));
  }
  function addBlank() {
    setClauses((cs) => [...cs, { key: newKey(), title: "New clause", body_markdown: "", is_mandatory: false, category: "custom" }]);
  }
  function addFromLibrary(items: LibraryClause[]) {
    setClauses((cs) => [
      ...cs,
      ...items.map((i) => ({ key: newKey(), title: i.title, body_markdown: i.body_markdown, is_mandatory: false, category: i.category })),
    ]);
  }
  function addFromAi(gen: { title: string; body_markdown: string; is_mandatory: boolean; category: ClauseCategory }[]) {
    setClauses((cs) => [...cs, ...gen.map((g) => ({ key: newKey(), ...g }))]);
  }

  const payloadClauses = useMemo(
    () => clauses.map((c) => ({ title: c.title, body_markdown: c.body_markdown, is_mandatory: c.is_mandatory, category: c.category })),
    [clauses]
  );

  async function save(activate: boolean): Promise<void> {
    if (!name.trim()) { toast.error("Template name is required"); return; }
    if (!clauses.length) { toast.error("Add at least one clause"); return; }
    setSaving(true);
    let id = templateId;
    const res = id
      ? await updateTemplate(id, { name, type, clauses: payloadClauses })
      : await createTemplate({ name, type, clauses: payloadClauses });
    if (!res.success) {
      setSaving(false);
      toast.error(res.error);
      return;
    }
    if (!id && "data" in res) id = (res.data as { id: string }).id;

    if (activate && id) {
      const act = await setTemplateStatus(id, "active");
      if (!act.success) {
        setSaving(false);
        toast.error(act.error);
        router.push(`/dashboard/documents/templates/${id}`);
        return;
      }
      toast.success("Saved & activated");
    } else {
      toast.success("Saved");
    }
    setSaving(false);
    router.push("/dashboard/documents/templates");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* Meta */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name (e.g. Standard Offer Letter)"
          className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as DocumentType)}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
        >
          {DOC_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={addBlank}>
          <Plus className="h-4 w-4 mr-1.5" /> Add clause
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowLibrary(true)}>
          <BookOpen className="h-4 w-4 mr-1.5" /> From library
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowAi(true)}>
          <Sparkles className="h-4 w-4 mr-1.5" /> Generate with AI
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
          {preview ? <EyeOff className="h-4 w-4 mr-1.5" /> : <Eye className="h-4 w-4 mr-1.5" />}
          {preview ? "Edit" : "Preview"}
        </Button>
      </div>

      {/* Variable reference */}
      {!preview && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="text-muted-foreground mr-1">Insert variables:</span>
          {variables.map((v) => (
            <code key={v.key} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground" title={v.label}>
              {`{{${v.key}}}`}
            </code>
          ))}
        </div>
      )}

      {preview ? (
        <PreviewPane name={name} clauses={clauses} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={clauses.map((c) => c.key)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {clauses.map((c) => (
                <SortableClause key={c.key} clause={c} onChange={update} onRemove={remove} categories={CATEGORIES} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {clauses.length === 0 && !preview && (
        <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No clauses yet. Add one, pull from the library, or generate a first draft with AI.
        </div>
      )}

      {/* Save bar */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button variant="outline" onClick={() => save(false)} disabled={saving}>
          <Save className="h-4 w-4 mr-1.5" /> Save draft
        </Button>
        <Button onClick={() => save(true)} disabled={saving}>
          Save &amp; activate
        </Button>
      </div>

      {showAi && (
        <AiDraftDialog
          open={showAi}
          onClose={() => setShowAi(false)}
          onGenerated={(gen) => { addFromAi(gen); setShowAi(false); }}
        />
      )}
      {showLibrary && (
        <LibraryPickerDialog
          open={showLibrary}
          library={library}
          onClose={() => setShowLibrary(false)}
          onPick={(items) => { addFromLibrary(items); setShowLibrary(false); }}
        />
      )}
    </div>
  );
}

function SortableClause({
  clause,
  onChange,
  onRemove,
  categories,
}: {
  clause: EditableClause;
  onChange: (key: string, patch: Partial<EditableClause>) => void;
  onRemove: (key: string) => void;
  categories: ClauseCategory[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: clause.key });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        <button className="mt-2 cursor-grab text-muted-foreground touch-none" {...attributes} {...listeners} aria-label="Reorder">
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <input
              value={clause.title}
              onChange={(e) => onChange(clause.key, { title: e.target.value })}
              placeholder="Clause title"
              className="flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40"
            />
            <select
              value={clause.category}
              onChange={(e) => onChange(clause.key, { category: e.target.value as ClauseCategory })}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <textarea
            value={clause.body_markdown}
            onChange={(e) => onChange(clause.key, { body_markdown: e.target.value })}
            placeholder="Clause text. Use **bold**, lists, and {{variables}}."
            rows={4}
            className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40 font-mono"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={clause.is_mandatory}
              onChange={(e) => onChange(clause.key, { is_mandatory: e.target.checked })}
            />
            Mandatory clause
          </label>
        </div>
        <button onClick={() => onRemove(clause.key)} className="mt-1 text-destructive/70 hover:text-destructive" aria-label="Remove clause">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function PreviewPane({ name, clauses }: { name: string; clauses: EditableClause[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 md:p-8">
      <p className="text-xs text-muted-foreground mb-1">Preview with sample data</p>
      <h2 className="text-lg font-bold mb-4">{name || "Untitled template"}</h2>
      <div className="space-y-4">
        {clauses.map((c) => (
          <section key={c.key}>
            <h3 className="text-sm font-bold mb-1">{c.title}</h3>
            <MarkdownView markdown={applySample(c.body_markdown)} />
          </section>
        ))}
      </div>
    </div>
  );
}
