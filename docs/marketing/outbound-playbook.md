# JambaHR Outbound Playbook

Email + WhatsApp + LinkedIn messages tuned for Indian SMB owners (10–500 employees). Banner attaches to the email, becomes the image preview for WhatsApp/LinkedIn. Goal: book a 20-min demo.

---

## 1. Cold email — short version (best for outbound)

**Subject lines (A/B test these):**
- `HR for your team — without hiring HR`
- `One app for leave, payroll, hiring (Indian SMB)`
- `Saw {{Company}} is hiring — running HR on Excel?`

**Body:**

> Hi {{First name}},
>
> Quick one — most SMBs your size run HR across 4–5 tools: leave on WhatsApp, payroll on Excel, hiring on Gmail, reviews on Google Forms. Then someone leaves and you lose half the context.
>
> **JambaHR** is a single app that handles it end-to-end:
> leave, payroll (TDS + PF + PT auto-calc), hiring with offer letters, performance reviews, training, attendance, an AI assistant your team can chat with for any "how do I…?" question.
>
> Built specifically for Indian SMBs. ₹500/employee/month, no setup fees, you're live in a day.
>
> **20 mins, I'll walk you through it on your actual team data.**
> [Book a slot →](https://cal.com/your-link) or just reply with a time that works.
>
> Amol
> Founder, JambaHR
> jambahr.com

---

## 2. Cold email — longer version with feature breakout (for warm leads)

**Subject:** `JambaHR — all-in-one HR for {{Company}}`

**Body:**

> Hi {{First name}},
>
> {{Company}} is at a size where HR starts to break informally — too many WhatsApp groups, payroll done by your CA, hiring scattered across email threads. Hiring a full-time HR person costs ₹8–15 lakh/year. JambaHR is the alternative.
>
> **What we do:**
>
> - **Hiring** — job postings, candidate pipeline, interview scheduling, offer letters with accept/decline links. No more lost CVs.
> - **Payroll** — monthly runs with TDS, PF, PT, gratuity. Both old + new regime. Mid-FY joiner projections. Paysips in one click.
> - **Leave** — policies, balances, requests, manager approvals, team calendar. Replaces the WhatsApp group.
> - **Reviews & Objectives** — quarterly cycles, self + manager assessments, OKR tracking.
> - **Training & Compliance** — assign courses, track completion, certificates.
> - **Attendance** — clock in/out from web, auto-close at end of day.
> - **Grievances** — anonymous channel for employees to raise issues. Compliance-friendly.
> - **AI Assistant** *(new)* — your team chats with it to find any feature. "How do I download my payslip?" → done.
>
> **Pricing:** ₹500/employee/month (Growth) or ₹800 (Business with payroll + hiring). No setup fees.
>
> **20 mins on Zoom, I'll show it on actual team data.** Reply with a time, or pick a slot here: [calendar link]
>
> Cheers,
> Amol
> Founder, JambaHR

---

## 3. WhatsApp message (paste banner as image preview)

> Hi {{First name}}! 👋
>
> Saw {{Company}} on LinkedIn — quick context, I run JambaHR. It's an all-in-one HR app built for Indian SMBs (10–500 ppl).
>
> Leave, payroll, hiring, reviews, training, AI assistant — one login. ₹500/employee/month.
>
> Worth a 20-min demo? I'll show it on real team data, not slides.
>
> jambahr.com

---

## 4. LinkedIn DM (after a connection request accepted)

> Thanks for connecting, {{First name}}!
>
> Saw you're heading {{Role}} at {{Company}}. I built JambaHR — one app for everything HR (leave, payroll, hiring, reviews, training, attendance). Built specifically for Indian SMBs in the 10–500 range.
>
> Not a pitch, just curious — how does your team handle this stuff today? Excel + WhatsApp like most folks, or have you already moved to a tool?
>
> If you want a 20-min walkthrough on actual team data, happy to set up. No slides.

---

## 5. Follow-up email — 5 days after no reply

**Subject:** `re: HR for {{Company}}` *(replying to your original thread)*

> Hi {{First name}} — popping this back up.
>
> Quick context if my last note got buried: JambaHR replaces 4–5 HR tools your team is probably stitched across. ₹500/employee/month, you're live the same day, 20-min demo all I'm asking for.
>
> If now isn't the right time, totally OK — just hit reply with a "later" and I'll circle back in a quarter.
>
> Amol

---

## 6. Re-engagement email (lead took demo, didn't convert in 30+ days)

**Subject:** `What's holding up the JambaHR decision?`

> Hi {{First name}},
>
> Three options — pick whichever fits:
>
> 1. **You're sold but it's not the right month** → reply "park me Q2" and I'll stop pestering.
> 2. **You need one more thing we haven't built yet** → tell me what, I'll either confirm we have it or put it on the roadmap.
> 3. **You went with someone else** → fair, but tell me who and why — helps me figure out what we're getting wrong.
>
> Either way, thanks for the time you've already given us.
>
> Amol

---

## Practical send-tips for India SMB outbound

| Channel | Best time | Notes |
|---|---|---|
| Email | Tues–Thurs, 10am–12pm IST | Subject lines under 50 chars; preview the CTA in first 60 chars of body so it's visible in Gmail collapsed view |
| WhatsApp Business | Mon–Sat, 11am–7pm IST | Banner as media + 3-line message. Avoid Sundays. Always introduce yourself in the first message — random pitches feel like spam |
| LinkedIn | Tues–Thurs, 9am–11am IST | Connection request first with a 1-liner reason. DM only after they accept. Don't auto-DM. |

## Small polishes to do once the banner lands

- **Personalize the email subject** with `{{Company}}` or a fact you can scrape (e.g. "Saw {{Company}} hiring 4 engineers — running it on Gmail?"). Personalized subjects double open rates over generic ones in B2B.
- **Use the banner once per thread.** First email = banner attached. Follow-ups = text only. Repeating the banner reduces its impact.
- **Add a Calendly/Cal.com link** with 2–3 pre-set 20-min slots — fewer reply-to-coordinate emails, more demos booked.
- **Track which subject + body combo converts.** Send 20–30 emails per variant before deciding.

## Variables to fill in before sending

| Token | Source |
|---|---|
| `{{First name}}` | LinkedIn / website |
| `{{Company}}` | LinkedIn / website |
| `{{Role}}` | LinkedIn |
| Calendar link | `cal.com/your-link` (replace with your real Cal.com URL) |

## See also

- `banner-prompt-nano-banana.md` — the four Nano Banana banner prompts to generate the image that attaches to these messages.
