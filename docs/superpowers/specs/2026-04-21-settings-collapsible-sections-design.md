# Settings Collapsible Sections — Design Spec
**Date:** 2026-04-21
**Status:** Approved

---

## Overview

The settings page has grown crowded with six stacked sections below the org/billing grid. This change makes five of those sections collapsible so the page loads as a compact list of cards. Users expand only what they need.

**Scope:** Leave Policies, Departments, Products & Features, Onboarding Steps, Fingerprint Integration. The Org Profile + Billing 2-column grid at the top is unchanged.

---

## Behavior

### Default state
All five sections start **collapsed** on page load. The page loads fast and shows a clean list of card headers.

### Collapsed header
Each collapsed card shows:
- Left: icon + section title + summary line (e.g. "4 policies")
- Right: **"Manage ›"** button

### Expanded state
Clicking "Manage ›" expands the section inline with a smooth CSS height transition. The button swaps to **"Close ✕"**. The section body (existing content, unchanged) appears below the header.

### Accordion behaviour
Only one section can be open at a time. Opening a section automatically collapses whichever was previously open.

### Closing
Clicking "Close ✕" collapses the open section back to the header-only state.

---

## Summary Text (collapsed state)

| Section | Summary |
|---------|---------|
| Leave Policies | `"N policies"` (count of policies array) |
| Departments | `"N departments"` (count of departments array) |
| Products & Features | `"N modules enabled"` (count of `true` values across: `jambaHireEnabled`, `attendanceEnabled`, `grievancesEnabled`, `attendancePayrollEnabled`) |
| Onboarding Steps | `"N steps enabled"` (count of enabled steps from config) |
| Fingerprint Integration | `"Enabled"` if `fingerprintConfig.enabled`, else `"Not configured"` |

When count is 0: show `"None configured"` instead of `"0 policies"`.

---

## Architecture

### New file: `src/components/settings/collapsible-section.tsx`

A `"use client"` wrapper component that manages open/closed state and renders the header UI.

**Props:**
```typescript
{
  id: string;                    // unique key for accordion tracking
  title: string;
  icon: React.ReactNode;
  summary: string;
  openId: string | null;         // currently open section ID (lifted state)
  onToggle: (id: string) => void; // callback to parent
  children: React.ReactNode;
}
```

**Rendering:**
- Outer `<div>` with `rounded-xl border border-border bg-card` (matches existing section style)
- Header row: `flex items-center justify-between` with icon+title+summary on left, Manage/Close button on right
- Body: conditionally rendered when `openId === id`, wrapped in a div with `animate-in` or simple `overflow-hidden` transition via CSS max-height
- "Manage ›" button: `variant="outline" size="sm"` using existing Button component
- "Close ✕" button: same style

### Modified file: `src/app/dashboard/settings/page.tsx`

- Import `CollapsibleSection`
- Add `openSection` state via a small `SettingsContent` client wrapper (since the page is a server component, state must live in a client wrapper)
- Pass `openId` and `onToggle` down to each `CollapsibleSection`
- Wrap each of the five sections in `<CollapsibleSection>` with appropriate `title`, `icon`, `summary`, and `id` props
- Compute summary strings from the already-fetched data (policies.length, departments.length, etc.)

### Client wrapper pattern

Since `settings/page.tsx` is a Server Component and accordion state is client-side, introduce a thin `SettingsContent` client component (`src/components/settings/settings-content.tsx`) that:
- Receives all the already-fetched data as props
- Holds `openSection: string | null` state
- Renders the `CollapsibleSection` wrappers + existing section components

The server page fetches all data and passes it to `<SettingsContent>` — no data fetching changes.

---

## File Map

| Action | File | Change |
|--------|------|--------|
| Create | `src/components/settings/collapsible-section.tsx` | New reusable accordion wrapper |
| Create | `src/components/settings/settings-content.tsx` | Thin client wrapper holding openSection state |
| Modify | `src/app/dashboard/settings/page.tsx` | Import SettingsContent, pass all data as props |

### Icons per section (from existing components, passed as prop)

| Section | Icon (lucide-react) |
|---------|-------------------|
| Leave Policies | `<CalendarDays className="h-5 w-5 text-muted-foreground" />` |
| Departments | `<Building2 className="h-5 w-5 text-muted-foreground" />` |
| Products & Features | `<Settings className="h-5 w-5 text-muted-foreground" />` |
| Onboarding Steps | `<ClipboardList className="h-5 w-5 text-muted-foreground" />` |
| Fingerprint Integration | `<Fingerprint className="h-5 w-5 text-muted-foreground" />` |

**No changes** to any individual section component (LeavePoliciesSection, DepartmentsSection, etc.).

---

## Animation

Use Tailwind's built-in `transition-all duration-200` on the body wrapper with `max-height` toggling between `0` and a large value (e.g. `max-height: 2000px`). No new animation libraries needed.

```tsx
<div
  className={`overflow-hidden transition-all duration-200 ${
    isOpen ? "max-h-[2000px]" : "max-h-0"
  }`}
>
  {children}
</div>
```

---

## Out of Scope

- Persisting open/closed state across page reloads (sessionStorage/cookie) — not needed for v1
- Multiple sections open simultaneously — accordion only
- Animations on the Org Profile / Billing grid
