"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  GraduationCap, Plus, MoreHorizontal, Edit2, Trash2, UserPlus,
  Users, ExternalLink, Award, AlertTriangle, CheckCircle2, Clock,
  ChevronDown, ChevronRight, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { deleteCourse, unenrollEmployee, listCourseEnrollments } from "@/actions/training";
import { CourseDialog } from "./course-dialog";
import { EnrollDialog } from "./enroll-dialog";
import { ProgressDialog } from "./progress-dialog";
import type { Course, Enrollment } from "@/actions/training";
import type { Employee } from "@/types";

type Tab = "mine" | "courses" | "compliance";

const CATEGORY_STYLES: Record<string, string> = {
  ethics: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  compliance: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  safety: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  skills: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  onboarding: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  custom: "bg-muted text-muted-foreground",
};

const STATUS_STYLES: Record<string, string> = {
  assigned: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  overdue: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const STATUS_LABELS: Record<string, string> = {
  assigned: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  overdue: "Overdue",
};

// ---- My Training (employee view) ----

function MyEnrollmentCard({
  enrollment,
  onUpdate,
}: {
  enrollment: Enrollment;
  onUpdate: (e: Enrollment) => void;
}) {
  const isOverdue =
    enrollment.course_due_date &&
    enrollment.status !== "completed" &&
    new Date(enrollment.course_due_date) < new Date();

  return (
    <div className={cn(
      "rounded-xl border bg-card p-4 space-y-3",
      isOverdue ? "border-red-300 dark:border-red-700" : "border-border"
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm truncate">{enrollment.course_title}</p>
            {enrollment.course_is_mandatory && (
              <span className="text-xs rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 px-2 py-0.5 font-medium shrink-0">
                Mandatory
              </span>
            )}
          </div>
          {enrollment.course_description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {enrollment.course_description}
            </p>
          )}
        </div>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0", STATUS_STYLES[enrollment.status])}>
          {STATUS_LABELS[enrollment.status]}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        <span className={cn("rounded-full px-2 py-0.5 font-medium capitalize", CATEGORY_STYLES[enrollment.course_category])}>
          {enrollment.course_category}
        </span>
        {enrollment.course_duration_minutes && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />{enrollment.course_duration_minutes} min
          </span>
        )}
        {enrollment.course_due_date && (
          <span className={cn("flex items-center gap-1", isOverdue && "text-red-600 dark:text-red-400 font-medium")}>
            {isOverdue && <AlertTriangle className="h-3 w-3" />}
            Due {formatDate(enrollment.course_due_date)}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Progress</span>
          <span className="font-medium">{enrollment.progress_percent}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all",
              enrollment.status === "completed" ? "bg-green-500" : "bg-primary"
            )}
            style={{ width: `${enrollment.progress_percent}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        {enrollment.certificate_url ? (
          <a
            href={enrollment.certificate_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Award className="h-3.5 w-3.5" /> View Certificate
          </a>
        ) : <span />}
        <div className="flex items-center gap-2">
          {enrollment.course_content_url && (
            <a
              href={enrollment.course_content_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm" className="h-7 text-xs">
                <ExternalLink className="mr-1.5 h-3 w-3" />Open Course
              </Button>
            </a>
          )}
          {enrollment.status !== "completed" && (
            <Button size="sm" className="h-7 text-xs" onClick={() => onUpdate(enrollment)}>
              {enrollment.status === "assigned" ? "Start" : "Update / Complete"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Course card (admin) ----

function CourseCard({
  course,
  employees,
  onEdit,
}: {
  course: Course;
  employees: Employee[];
  onEdit: (c: Course) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [enrollOpen, setEnrollOpen] = React.useState(false);
  const [enrollments, setEnrollments] = React.useState<Enrollment[]>([]);
  const [loadingEnrollments, setLoadingEnrollments] = React.useState(false);

  const completionPct =
    course.total_enrolled > 0
      ? Math.round((course.completed_count / course.total_enrolled) * 100)
      : 0;

  const isOverdue =
    course.due_date &&
    new Date(course.due_date) < new Date();

  async function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && enrollments.length === 0) {
      setLoadingEnrollments(true);
      const result = await listCourseEnrollments(course.id);
      if (result.success) setEnrollments(result.data);
      setLoadingEnrollments(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${course.title}"? All enrollment records will be removed.`)) return;
    const result = await deleteCourse(course.id);
    if (result.success) toast.success("Course deleted");
    else toast.error(result.error);
  }

  async function handleUnenroll(enrollmentId: string) {
    const result = await unenrollEmployee(enrollmentId);
    if (result.success) {
      toast.success("Removed from course");
      setEnrollments((prev) => prev.filter((e) => e.id !== enrollmentId));
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={handleExpand}
      >
        <button type="button" className="text-muted-foreground shrink-0">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm">{course.title}</p>
            {course.is_mandatory && (
              <span className="text-xs rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 px-2 py-0.5 font-medium">
                Mandatory
              </span>
            )}
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize", CATEGORY_STYLES[course.category])}>
              {course.category}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
            {course.duration_minutes && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />{course.duration_minutes} min
              </span>
            )}
            {course.due_date && (
              <span className={cn(isOverdue && "text-red-600 dark:text-red-400")}>
                Due {formatDate(course.due_date)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />{course.total_enrolled} enrolled
            </span>
            {course.total_enrolled > 0 && (
              <span className="text-green-600 dark:text-green-400">
                · {course.completed_count} completed ({completionPct}%)
              </span>
            )}
            {course.overdue_count > 0 && (
              <span className="text-red-600 dark:text-red-400">
                · {course.overdue_count} overdue
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEnrollOpen(true)}>
            <UserPlus className="mr-1.5 h-3 w-3" />Assign
          </Button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="z-50 min-w-[140px] rounded-lg border bg-popover p-1 shadow-md">
                <DropdownMenu.Item
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent outline-none"
                  onClick={() => onEdit(course)}
                >
                  <Edit2 className="h-4 w-4" />Edit
                </DropdownMenu.Item>
                {course.content_url && (
                  <DropdownMenu.Item
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent outline-none"
                    onClick={() => window.open(course.content_url!, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4" />Open URL
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Item
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent outline-none text-destructive"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-4 w-4" />Delete
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      {/* Completion bar */}
      {course.total_enrolled > 0 && (
        <div className="px-4 pb-2">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${completionPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Enrollments list */}
      {expanded && (
        <div className="border-t border-border">
          {loadingEnrollments ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Loading...</p>
          ) : enrollments.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No employees assigned yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {enrollments.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{e.employee_name}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", e.status === "completed" ? "bg-green-500" : "bg-primary")}
                        style={{ width: `${e.progress_percent}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-7 text-right">{e.progress_percent}%</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLES[e.status])}>
                      {STATUS_LABELS[e.status]}
                    </span>
                    {e.certificate_url && (
                      <a href={e.certificate_url} target="_blank" rel="noopener noreferrer">
                        <Award className="h-4 w-4 text-amber-500" />
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground"
                      onClick={() => handleUnenroll(e.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {enrollOpen && (
        <EnrollDialog
          open
          onOpenChange={setEnrollOpen}
          course={course}
          employees={employees}
          existingEnrollments={enrollments}
        />
      )}
    </div>
  );
}

// ---- Compliance summary ----

function ComplianceView({ courses }: { courses: Course[] }) {
  const mandatory = courses.filter((c) => c.is_mandatory);
  const overdueCourses = courses.filter(
    (c) => c.due_date && new Date(c.due_date) < new Date() && c.overdue_count > 0
  );
  const totalOverdue = courses.reduce((s, c) => s + c.overdue_count, 0);
  const totalEnrolled = courses.reduce((s, c) => s + c.total_enrolled, 0);
  const totalCompleted = courses.reduce((s, c) => s + c.completed_count, 0);
  const overallPct = totalEnrolled > 0 ? Math.round((totalCompleted / totalEnrolled) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Courses", value: courses.length, icon: GraduationCap, color: "text-primary" },
          { label: "Mandatory", value: mandatory.length, icon: AlertTriangle, color: "text-red-500" },
          { label: "Completion Rate", value: `${overallPct}%`, icon: CheckCircle2, color: "text-green-500" },
          { label: "Overdue", value: totalOverdue, icon: Clock, color: "text-amber-500" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className={cn("h-4 w-4", stat.color)} />
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Overdue alerts */}
      {overdueCourses.length > 0 && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-4 space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">Overdue Courses</p>
          </div>
          {overdueCourses.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-sm">
              <span className="font-medium">{c.title}</span>
              <span className="text-red-600 dark:text-red-400 text-xs">
                {c.overdue_count} employee{c.overdue_count > 1 ? "s" : ""} overdue · due {formatDate(c.due_date!)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Per-course completion */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold">Course Completion</p>
        </div>
        <div className="divide-y divide-border">
          {courses.map((c) => {
            const pct = c.total_enrolled > 0
              ? Math.round((c.completed_count / c.total_enrolled) * 100)
              : 0;
            return (
              <div key={c.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{c.title}</p>
                    {c.is_mandatory && (
                      <span className="text-xs rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 px-1.5 py-0.5">M</span>
                    )}
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-green-500" : "bg-primary")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">{pct}%</p>
                  <p className="text-xs text-muted-foreground">{c.completed_count}/{c.total_enrolled}</p>
                </div>
              </div>
            );
          })}
          {courses.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">No courses yet.</p>
          )}
        </div>
      </div>

      {/* Coming Soon: LMS Integration */}
      <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 shrink-0">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">LMS Auto-Sync</p>
              <span className="rounded-full bg-primary/20 text-primary text-xs px-2 py-0.5 font-medium">
                Coming Soon
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Automatic completion tracking via LMS webhooks — no more manual updates. When an employee finishes a course on platforms like{" "}
              <span className="font-medium text-foreground">Coursera, LinkedIn Learning, TalentLMS, Docebo, or Google Classroom</span>,
              their progress and completion status will sync directly to JambaHR in real time.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Until then, employees self-report progress and confirm completion with an attestation. Certificate URLs serve as proof for mandatory courses.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Main client ----

interface TrainingClientProps {
  courses: Course[];
  myEnrollments: Enrollment[];
  employees: Employee[];
  isAdmin: boolean;
}

export function TrainingClient({ courses, myEnrollments, employees, isAdmin }: TrainingClientProps) {
  const [tab, setTab] = React.useState<Tab>("mine");
  const [courseDialogOpen, setCourseDialogOpen] = React.useState(false);
  const [editingCourse, setEditingCourse] = React.useState<Course | undefined>();
  const [progressEnrollment, setProgressEnrollment] = React.useState<Enrollment | undefined>();

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "mine", label: "My Training", count: myEnrollments.filter(e => e.status !== "completed").length || undefined },
    ...(isAdmin ? [
      { key: "courses" as Tab, label: "Course Library" },
      { key: "compliance" as Tab, label: "Compliance" },
    ] : []),
  ];

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Training & Compliance</h1>
          <p className="mt-1 text-muted-foreground">Manage courses, track progress, and ensure compliance.</p>
        </div>
        {tab === "courses" && isAdmin && (
          <Button onClick={() => { setEditingCourse(undefined); setCourseDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />New Course
          </Button>
        )}
      </div>

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="flex gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="rounded-full bg-primary/20 text-primary text-xs px-1.5 py-0.5 font-semibold leading-none">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* My Training */}
      {tab === "mine" && (
        myEnrollments.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
            <GraduationCap className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-medium text-sm">No courses assigned yet</p>
              <p className="text-sm text-muted-foreground mt-0.5">Your manager will assign training courses here.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {myEnrollments.map((e) => (
              <MyEnrollmentCard key={e.id} enrollment={e} onUpdate={setProgressEnrollment} />
            ))}
          </div>
        )
      )}

      {/* Course library */}
      {tab === "courses" && (
        courses.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
            <GraduationCap className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-medium text-sm">No courses yet</p>
              <p className="text-sm text-muted-foreground mt-0.5">Create your first training course.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setEditingCourse(undefined); setCourseDialogOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />New Course
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {courses.map((c) => (
              <CourseCard
                key={c.id}
                course={c}
                employees={employees}
                onEdit={(course) => { setEditingCourse(course); setCourseDialogOpen(true); }}
              />
            ))}
          </div>
        )
      )}

      {/* Compliance */}
      {tab === "compliance" && <ComplianceView courses={courses} />}

      <CourseDialog
        open={courseDialogOpen}
        onOpenChange={(v) => { setCourseDialogOpen(v); if (!v) setEditingCourse(undefined); }}
        editing={editingCourse}
      />

      {progressEnrollment && (
        <ProgressDialog
          open
          onOpenChange={(v) => { if (!v) setProgressEnrollment(undefined); }}
          enrollment={progressEnrollment}
        />
      )}
    </>
  );
}
