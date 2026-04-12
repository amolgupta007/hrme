# Employee Directory & Org Hierarchy Redesign — Design Spec
**Date:** 2026-04-12  
**Scope:** `/dashboard/employees` (admin table) + `/dashboard/directory` (card + org hierarchy views)  
**Status:** Approved by user

---

## Goals

1. Make both views cleaner, denser, and more scannable
2. Add department/role/status filtering throughout
3. Fix the org hierarchy — make it read as a real tree with proper connectors
4. Replace primitive patterns (browser `confirm`, emoji icons) with polished components

---

## 1. Employees Admin Table (`employees-client.tsx`, `employee-table.tsx`)

### Toolbar
- Search input (existing) + filter row below it
- Filter chips/dropdowns: **Department** (select), **Role** (select), **Status** (select with options: All / Active / On Leave / Inactive / Terminated)
- Count moved inline into toolbar: `"Employees · 15"` or shown as muted text on right side of toolbar
- "Add Employee" button stays top-right

### Table
- **Sortable columns**: Name, Department, Joined — clicking header toggles asc/desc with a sort icon
- **Table header** styling: `bg-muted/60` with a stronger bottom border for clear separation
- **Employment type** shown as a small colored tag instead of plain muted text: full-time = teal, part-time = blue, contract = amber, intern = purple
- **Role + Status badges** — keep both but reduce visual weight: role badge moves inside the Employee cell below the name (replaces separate Role column), freeing up a column slot for Type+Joined on more breakpoints
- **Actions dropdown**: replace `window.confirm()` with a Radix `AlertDialog` for terminate — shows employee name, warns about the action, has "Terminate" destructive button

### No new files needed — modify existing `employees-client.tsx` and `employee-table.tsx`

---

## 2. Directory Card View (`directory-client.tsx`)

### Toolbar
- Same search (existing)
- Add **Department filter** — horizontal scrollable tab row (All | Engineering | Marketing | ...) built from the unique department names in the employee list. Selected tab highlights in primary color.
- View toggle stays (Cards / Hierarchy)
- Count stays in toolbar

### Cards
- **Avatar**: increase to `h-16 w-16`, add a 2px colored ring per department (cycle through 6 preset colors based on department name hash)
- **Status dot**: small circle overlaid bottom-right of avatar — green (active), yellow (on_leave), gray (inactive)
- **Remove email** from card face — saves a row of space
- **Replace `🏢` emoji** with `Building2` lucide icon
- **Tighten padding**: `p-4` instead of `p-5`, `space-y-3` instead of `space-y-4`
- **Role badge** moves to be inline with the name (same row, right side), smaller — `text-[10px]`
- Cards now show: Avatar (large, with status dot) | Name + Role badge | Designation | Department | Reports-to

### No new files — modify `directory-client.tsx`

---

## 3. Org Hierarchy View (`org-tree.tsx`)

### Visual tree redesign
Replace the simple `border-left` indentation with proper CSS tree connectors:

```
┌─ CEO
├─── Engineering VP
│    ├─── Senior Engineer
│    │    └─── Engineer
│    └─── Senior Engineer
└─── Marketing VP
     └─── Marketing Manager
```

Implementation approach using CSS pseudo-elements / explicit border divs:
- Each non-root node sits inside a wrapper that draws:
  - A **vertical left border** connecting siblings
  - A **horizontal branch line** connecting to the card
- The last child's wrapper does NOT continue the vertical line below the horizontal branch
- Uses `relative`/`absolute` positioning with `before:` and `after:` pseudo-element equivalents (Tailwind `before:` classes or explicit `<span>` connectors)

### Node cards — visual hierarchy
- **Root nodes** (depth 0): larger card, slightly elevated (`shadow-sm`), avatar `h-12 w-12`, name in `font-bold text-base`
- **Depth 1+**: normal card style, avatar `h-9 w-9`, name in `font-medium text-sm`
- All depths still show role badge, designation, department

### Collapse/expand
- Replace the small pill button with a clear circular icon button (`+` / `−`) on the right side of each expandable card
- Add **Expand All / Collapse All** buttons above the tree

### Indentation cap
- Max visual indentation depth: 4 levels. Beyond depth 4, indent resets with a visual marker to prevent layout overflow.

### Search highlight
- When search is active, matching nodes get a `ring-2 ring-primary` highlight. Non-matching nodes shown at reduced opacity (`opacity-50`).

### Modify `org-tree.tsx` in place — no new files

---

## Files Changed (summary)

| File | Change |
|------|--------|
| `src/components/dashboard/employees-client.tsx` | Add filter state (dept/role/status), filter UI, sort state |
| `src/components/dashboard/employee-table.tsx` | Sortable headers, employment type tags, role badge moved into Employee cell, AlertDialog for terminate |
| `src/components/directory/directory-client.tsx` | Department tab filter, card avatar/layout tweaks, remove email, replace emoji |
| `src/components/directory/org-tree.tsx` | Proper CSS tree connectors, visual depth hierarchy, expand-all/collapse-all, search highlight |

No new files. No schema changes. No server action changes.

---

## Out of Scope
- Pagination / virtual scroll (future)
- Bulk actions / multi-select (future)
- Click-to-view employee profile modal (future)
- Real avatar photos (requires storage integration — future)
