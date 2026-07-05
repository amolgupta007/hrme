---
id: geo_keyboard_shortcuts
title: Lead detail keyboard shortcuts
summary: j/k walks siblings; e edits; v logs a visit; Esc goes back; ? shows the overlay.
route_key: geo_keyboard_shortcuts
allowed_roles: [owner, admin, manager, employee]
plan_tier: business
keywords: [keyboard, shortcuts, hotkeys, j, k, esc, vim, navigation, power user, accelerator]
---

The lead detail page (`/geo/leads/[id]`) is wired for keyboard navigation so reviewing many leads in one sitting doesn't require clicking through everything.

**Active shortcuts:**

1. `k` — go to the **previous** lead in the list (the same order the kanban and list use).
2. `j` — go to the **next** lead.
3. `e` — open the **Edit** dialog for the current lead.
4. `v` — open the **Log visit** dialog.
5. `Esc` — go back to the Leads list (or to Reports / My Leads if you came from one of those — the back-target tracks where you opened the lead from).
6. `?` — show a small overlay listing all bindings. Press `?` or `Esc` again to dismiss.

**When shortcuts pause:**

Shortcuts pause while focus is inside an input, textarea, or select — so typing in the Edit dialog or in the visit-notes field doesn't accidentally navigate to the next lead. Modifier-key combos (Cmd/Ctrl/Alt) also pass through to the browser, so the usual save / undo / refresh shortcuts work normally.

Prev/Next walk the same scope as the kanban and list — admins see all leads, managers see their department plus unassigned, and employees see only their own assignments. You can't accidentally `j`/`k` into a lead you wouldn't otherwise be able to read.
