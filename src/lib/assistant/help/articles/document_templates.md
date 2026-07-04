---
id: document_templates
title: Build an offer letter or document template
summary: How an admin creates a clause-based offer letter, NDA, or policy template with reusable variables.
route_key: document_templates
allowed_roles: [owner, admin]
plan_tier: business
keywords: [offer letter, template, document, clause, appointment letter, nda, generate offer, ai draft]
---
Offer Letters lets you build clause-based document templates once and issue them to many employees, swapping only per-person variables like name, designation, and CTC. Templates are shared across every entity in your company group.

1. Open **Offer Letters** from the left sidebar, then the **Templates** tab.
2. Click **New template** and give it a name and a type (offer letter, NDA, or policy).
3. Add clauses — click **Add clause** for a blank one, **From library** to pull ready-made Indian-context clauses, or **Generate with AI** for a first draft.
4. Edit each clause's text. Use `{{variables}}` such as `{{employee_name}}`, `{{designation}}`, `{{ctc}}`, and `{{joining_date}}` where per-employee data should appear.
5. Drag the handle to reorder clauses, and tick **Mandatory** on any clause that must always be included.
6. Use **Preview** to see the document rendered with sample data.
7. Click **Save & activate** when you're ready — only active templates can be issued.

AI output always lands as an editable draft — nothing is activated automatically, so review every clause first. On activation, the template checks that every `{{variable}}` you used is a recognised placeholder.
