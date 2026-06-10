---
id: geo_kanban_drag
title: Move a lead through the kanban
summary: Drag a lead card between pipeline stages or use the stage dropdown.
route_key: geo_kanban_drag
allowed_roles: [owner, admin, manager, employee]
plan_tier: business
keywords: [kanban, drag, stage, pipeline, move lead, column, stepper, change stage]
---

There are two ways to change a lead's stage. Both save immediately and let you move a lead in any direction — there are no forced forward-only rules.

**On the kanban board** (admin and manager only):

1. Go to **JambaGeo → Leads**.
2. The board shows six columns: **New → Contacted → Visited → Negotiation → Converted → Lost**. On smaller screens the board scrolls horizontally; swipe or use the scrollbar to reach later columns.
3. **Drag and drop** a lead card to a different column. The card snaps into the new column when you release.
4. If the move fails (lost connection, permission issue), the card returns to its previous column and a toast names the lead and the column it went back to.

**On the lead detail page** (admin, manager, and any employee assigned to the lead):

1. Open a lead from the board or list.
2. Use the **Stage** dropdown on the info card to pick a new stage.

Employees see read-only cards on the kanban (no drag). They can still change stage from the detail page for leads assigned to them. Admins and managers can change stage on any lead.
