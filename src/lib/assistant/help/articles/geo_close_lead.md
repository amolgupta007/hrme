---
id: geo_close_lead
title: Mark a lead as Converted or Lost
summary: Capture closing context (final value or loss reason) when a lead exits the funnel.
route_key: geo_close_lead
allowed_roles: [owner, admin, manager, employee]
plan_tier: business
keywords: [close lead, converted, lost, closed-won, closed-lost, mark as converted, mark as lost, deal closed, deal lost, terminal stage]
---

A lead becomes Converted when the deal closes-won, or Lost when it closes-lost. Both end the lead's life in the funnel. JambaGeo asks for a little closing context so the audit trail captures the why.

**From the lead detail page:**

1. Open a lead from the kanban or list.
2. On the **Lead details** card, use the **Stage** dropdown.
3. Pick **Converted** or **Lost** — a capture dialog opens before the stage flips.
4. For **Converted**: optionally enter the final deal value (pre-filled with the lead's existing estimated value) and any closing notes, then click **Mark as Converted**.
5. For **Lost**: pick a reason from the dropdown — Price, Competitor, Timing, Not a fit, No response, or Other — and optionally add a note, then click **Mark as Lost**.

**From the kanban board:**

1. Go to **JambaGeo → Leads**.
2. Drag the lead's card into the **Converted** or **Lost** column.
3. The same capture dialog appears — fill it in and click the primary button.

If you cancel the dialog, the stage change is rolled back and the card returns to its previous column. The capture is saved as a system-authored visit row in the lead's timeline, so the closing reason or final value is part of the lead's history.

The Reports funnel reflects the new Converted / Lost counts on the next refresh.
