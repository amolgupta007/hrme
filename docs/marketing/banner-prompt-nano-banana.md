# JambaHR Banner — Nano Banana (Gemini 2.5 Flash Image) Prompts

Four prompt variants for client-outreach banners. Run all four in parallel, pick the best, iterate with the editing feature.

---

## Primary prompt — LinkedIn/email banner (1200×630)

```
Design a modern SaaS marketing banner for JambaHR, an all-in-one HR platform
built for Indian SMBs (10–500 employees). Aspect ratio 1200x630.

LEFT SIDE — composition:
A clean isometric mockup of a laptop showing the JambaHR dashboard.
Around the laptop, six floating glassmorphic feature cards arranged in a soft
arc, each with a small icon and a one-word label. The cards read:
"Hiring", "Payroll", "Leave", "Reviews", "Training", "AI Assistant".
Each card has a subtle drop shadow and a teal-to-orange gradient border.

RIGHT SIDE — typography:
Headline (bold, large, sans-serif like Inter or Geist):
"Run your entire HR from one place."

Subhead (medium weight, smaller):
"Hiring, payroll, leave, reviews, training and AI help —
built for SMBs across India."

CTA button (rounded, warm orange #F59B22 fill, white text):
"Book a 20-min demo →"

Below CTA, tiny supporting line in muted grey:
"No setup fees · ₹500/employee/month onwards · jambahr.com"

COLOURS:
- Primary teal: HSL(172, 50%, 36%) — used in laptop screen UI accents, headline
  accent letters, and card icons.
- Warm orange: HSL(32, 95%, 52%) — used ONLY on the CTA button and one tiny
  highlight badge on the AI Assistant card ("New").
- Background: very light off-white (#FAFAF5) with a soft diagonal gradient
  tinted faint teal in the corners.

STYLE:
Crisp, modern, premium B2B SaaS aesthetic. Think Linear, Notion, Stripe.
No stock photography. No people. No flags. No clutter. Plenty of whitespace.
Subtle dot-grid pattern in the far background, very low contrast.
Logo treatment: small "JambaHR" wordmark in the top-left corner in primary teal,
modern geometric sans, slightly bold.

The text rendering must be sharp and legible — Inter or Geist sans, kerned
tightly, no decorative fonts. Spell every word exactly as written above.
```

---

## Variation A — Product-led, dashboard hero

```
Same banner concept but with the dashboard mockup centered and enlarged,
filling 60% of the canvas. Use a clean three-quarter perspective view of a
laptop screen showing a real-looking dashboard with: a header bar, a left
sidebar with module icons (employees, leave, payroll, hiring, training, AI
assistant), and a main panel with two stat cards ("28 employees", "3 pending
leave requests") and a chart. Floating above the laptop on the top-right
corner: a small chat bubble UI showing "How do I add an employee?" being
answered by the AI assistant. Beside the laptop on the right: stacked headline
"Run your entire HR from one place." + same CTA button as primary prompt.
Same colour palette and font discipline.
```

---

## Variation B — Story-led, founder-of-SMB framing

```
A horizontal banner (1200x630) split 50/50. LEFT half: a flat-design
illustration of a confident woman in business-casual Indian wear standing in
front of a laptop, with thought bubbles around her saying "leaves sorted",
"payroll done", "hiring on track", "team happy" — illustrated in a minimal
two-tone style using JambaHR's teal and warm-orange palette only. RIGHT half:
clean typography reading "HR you'd hire — without hiring HR." Subhead:
"JambaHR runs your people operations end-to-end. One subscription. One login."
CTA button in warm orange: "Book a 20-min demo →". Modern sans-serif, generous
whitespace, off-white background.
```

---

## Variation C — Stat-led / proof-driven

```
Banner 1200x630, dark mode aesthetic. Background deep teal (#1B5454).
Foreground typography in soft white. Large headline at top-left: "All your
people ops. One platform." Below, three large stat cards in a row, glassmorphic
with thin teal borders, each showing a number + label in warm-orange accent:
"6 modules", "500 employees", "₹500/employee/month". Below the stats, a single
warm-orange pill button "Book a 20-min demo →". Bottom right corner: a tiny
JambaHR wordmark + URL "jambahr.com". Subtle floating module icons (briefcase,
calendar, wallet, chart, graduation-cap, chat bubble) drifting in the
background at very low opacity. No people. Premium, confident, restrained.
```

---

## Tips for the actual run

- **Run all four prompts.** Nano Banana is cheap and the variance is high — generate them in parallel and pick the best.
- **If text renders garbled** (Nano Banana's main weakness), regenerate 2–3 times — the same prompt re-rolls differently. If still bad, shorten the on-canvas copy and add the rest via a quick Figma overlay.
- **Use the editing feature** — once you get a strong base, you can ask Nano Banana to "swap the CTA button colour to orange" or "make the laptop screen show the leave page instead". Iterative refinement is its real strength.
- **Aspect ratios to try** if you want platform-specific versions:
  - `1200×630` — LinkedIn / Twitter / email header
  - `1080×1080` — Instagram / WhatsApp status
  - `1080×1920` — Instagram Stories / Reels
  - `1200×300` — slim email banner
- **For brand consistency** across multiple banners, generate the first one, then use "use this image as a style reference" for follow-ups.

## Brand reference (for the model)

- **Primary teal:** HSL(172, 50%, 36%) — also rendered as `#2E8C82` (approx)
- **Warm orange:** HSL(32, 95%, 52%) — also rendered as `#F59B22` (approx)
- **Background tint:** `#FAFAF5` (off-white) for light banners, `#1B5454` (deep teal) for dark
- **Typeface:** Geist or Inter (modern geometric sans)
- **Logo wordmark:** "JambaHR" — modern geometric sans, slightly bold, primary teal

## Subject lines that pair well with the banner (if used in email)

- `HR for your team — without hiring HR`
- `One app for leave, payroll, hiring (Indian SMB)`
- `Saw {{Company}} is hiring — running HR on Excel?`
- `JambaHR — all-in-one HR for {{Company}}`
