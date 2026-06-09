# Product

## Register

product

## Users

Two user types share the same codebase under different access models.

- **Admins** (org owners and HR managers at small-to-mid businesses, 10–500 employees, India-first). Context: at a desk, browser, doing weekly HR ops between meetings. They run payroll, approve leave, configure shifts, hire, file compliance, and now track field staff. They are not full-time HR professionals; many are founders or office managers wearing the HR hat. They came from a stack of email + Excel + WhatsApp + a half-implemented Zoho.
- **Employees** (rank-and-file at those orgs). Context: short, mostly task-driven visits. Clock in, view a payslip, request leave, acknowledge a document, log a customer visit. Many will eventually use a mobile app for this; today they use the same web portal.

The admin path is the dominant design surface. The employee path is a constrained sub-set that re-uses the admin chrome.

## Product Purpose

JambaHR is the single HR system of record for SMBs in India that currently run HR through email, spreadsheets, and chat. The product compresses what used to be three or four tools (HRMS + payroll bureau + attendance device vendor + recruiting CRM) into one admin surface, priced per employee, billed in INR. Success looks like a 50-person company replacing three separate tools and stopping the monthly "send me the payslip CSVs" email to their CA.

The bar is operational completeness, not feature volume. The product earns its place when a non-HR-trained owner can run an actual payroll, with TDS, PF, professional tax, and bank disbursement via RazorpayX, on the first of the month, in under 30 minutes, without calling support.

The current module surface:
- **Core**: directory, leave, documents, reviews, training, announcements, grievances
- **Attendance** (Phase 1+2 shipped): shifts, roster, week-off, overtime
- **Payroll** (Phase 1+2 shipped): TDS regimes, configurable salary structure, RazorpayX disbursement
- **JambaHire** (Business tier): jobs, candidates, kanban pipeline, interviews, offers, referrals, public careers + offer-accept pages
- **JambaGeo** (Business tier, Phase 1 just shipped): lead CRM, geofences, visit log, live-map (mobile app future)
- **AI Assistant**: read-only how-to help + tenant document Q&A, gated per plan, INR budget capped

## Brand Personality

**Practical. Direct. India-aware.**

Voice is the friendly senior operator, not a startup pitch. Buttons say what they do: `Run payroll`, `Mark leave approved`, `Push to RazorpayX`. Empty states explain what data goes there, not generic "nothing to show". Currency renders ₹ with `en-IN` lakh/crore formatting. Compliance fields are named in their Indian terms (PF cap, TDS regime, PT slab, gratuity %, LOP) rather than localized into Western SaaS abstractions.

Emotional goal: confidence. The admin should feel they understand what is happening at every step, especially in payroll and disbursement. The product earns trust by being precise and explicit, not by being delightful.

## Anti-references

- **Generic blue SaaS template.** Bootstrap-era dashboard chrome, candy-colored stat cards, pastel illustrations of people high-fiving. Reads as "we don't know our customer."
- **Enterprise HRMS suites** (Workday, SAP SuccessFactors). Three-level mega-menus, modal-stacked modals, IT-implementation aesthetic. The owner cannot onboard themselves into those.
- **Indian low-code HR builders** (Zoho People, Keka before recent redesigns). Tab-heavy density without hierarchy. Everything looks equally important, so nothing is.
- **Linear-style minimalism applied without thought.** JambaHR has more data per screen than Linear. Importing Linear's airy density to a roster grid or a payroll run leaves a screen with three useful rows.
- **Gradient-heavy "AI product" decoration.** Soft purple-to-cyan gradients on cards and buttons; "AI sparkle" iconography. The AI Assistant earns one accent treatment in one place; it does not bleed into payroll.

## Design Principles

1. **Speak the operator's language.** PF, TDS, RazorpayX, MIDC, EL, LOP, festival leave, gratuity. The Indian HR vocabulary belongs in the UI. Don't sanitize it into Western SaaS labels.
2. **Show the numbers.** Payroll, attendance hours, leave balances, lead values. The admin's job is verifying numbers. Put them inline, in tables, in payslips, in confirmations. Hidden behind drill-ins is hidden from approval.
3. **Modules are destinations, not tabs.** When a flow has its own role model, its own multi-page surface, and its own access gate (JambaHire today; JambaGeo next), it earns a top-level destination with its own chrome. Settings, Profile, Leave, Directory stay inside the shared dashboard.
4. **Inline before modal.** Edit in place when the field is one-shot (inline rename, toggle, single-field update). Modal only when the operation has multiple required fields or carries irreversible consequence (delete, run payroll, push disbursement, revoke offer).
5. **Confirmation is part of the design, not a banner.** Destructive or financial actions show what will happen, to whom, for how much, in the confirmation itself. After-the-fact toasts are the wrong moment to surface that the admin just paid 23 people the wrong number.
6. **Same vocabulary across screens.** A "save" button looks the same in payroll settings as in lead detail. A stage chip looks the same in JambaHire pipeline as in JambaGeo kanban. Consistency is the brand here; delight is reserved for moments (a successful payroll run, a hired candidate), not screens.

## Accessibility & Inclusion

- **Target: WCAG 2.1 AA.** No formal audit shipped yet; the bar applies to all new and meaningfully-refactored surfaces. Legacy pages are improved opportunistically.
- **Body text contrast ≥ 4.5:1.** No light-gray-on-tinted-white. The current Tailwind `text-muted-foreground` on `bg-muted/30` combinations are known close-call failures; new surfaces aim above the floor instead of matching the legacy bar.
- **Keyboard paths for every common admin task.** Approve leave, mark payroll paid, drag a kanban card, log a visit. Drag-drop has a keyboard-equivalent (the dnd-kit KeyboardSensor pattern from JambaHire pipeline; mirror it in JambaGeo).
- **`prefers-reduced-motion: reduce` honored** on every transition longer than ~150ms.
- **Color is not the only signal.** State chips, stage chips, and outcome chips carry both color and a label. No status communicated by hue alone.
- **Indian language support is future scope** (Hindi + regional). Phase 1 is en-IN. Don't bake English deep into component logic; keep strings in templates so a future i18n pass is mechanical.
