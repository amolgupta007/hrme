# JambaHR — All-in-One HR Portal

HR management platform for small and medium businesses (10–500 employees) who don't want to hire a dedicated HR professional.

## Tech Stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Framework | Next.js 14 (App Router) | Full-stack React with RSC |
| Language | TypeScript | Type safety |
| Styling | Tailwind CSS | Utility-first CSS |
| Auth | Clerk | Multi-tenant auth with organizations |
| Database | Supabase (Postgres) | Data + RLS for multi-tenancy |
| Payments | Stripe | Subscription billing |
| Email | Resend + React Email | Transactional emails |
| Analytics | PostHog | Product analytics |
| Errors | Sentry | Error tracking |
| Hosting | Vercel | Deployment + edge functions |
| DNS | Cloudflare | DNS + DDoS protection |
| Monitoring | UptimeRobot | Uptime checks |
| Version Control | GitHub | Source code |

## Project Structure

```
hr-portal/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (auth)/             # Sign-in, sign-up (public)
│   │   ├── (marketing)/        # Landing pages (public)
│   │   ├── api/webhooks/       # Clerk + Stripe webhooks
│   │   ├── dashboard/          # Protected app shell
│   │   │   ├── employees/      # Employee directory
│   │   │   ├── leaves/         # Leave management
│   │   │   ├── documents/      # Document hub
│   │   │   ├── reviews/        # Performance reviews
│   │   │   ├── training/       # Training & compliance
│   │   │   ├── payroll/        # Payroll (Phase 3)
│   │   │   └── settings/       # Org settings & billing
│   │   └── onboarding/         # First-time org setup
│   ├── actions/                # Server actions (mutations)
│   ├── components/
│   │   ├── ui/                 # Reusable primitives (Button, Card, Badge)
│   │   ├── layout/             # Sidebar, Header, Providers
│   │   ├── dashboard/          # Dashboard-specific components
│   │   ├── forms/              # Form components
│   │   └── emails/             # React Email templates
│   ├── config/                 # Navigation, constants
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utilities & SDK clients
│   │   └── supabase/           # Browser + Server clients
│   └── types/                  # TypeScript types & DB types
├── supabase/
│   └── migrations/             # SQL migration files
├── public/                     # Static assets
└── scripts/                    # Seed data, utilities
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- Accounts: [Supabase](https://supabase.com), [Clerk](https://clerk.com), [Stripe](https://stripe.com)

### 1. Clone and Install

```bash
git clone https://github.com/your-username/hr-portal.git
cd hr-portal
npm install
```

### 2. Environment Variables

```bash
cp .env.example .env.local
```

Fill in all values in `.env.local`. See `.env.example` for descriptions.

### 3. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Copy the Project URL and anon key to `.env.local`
3. Run the migration:

```bash
# Option A: Via Supabase CLI
npx supabase db push

# Option B: Copy-paste the SQL from supabase/migrations/001_initial_schema.sql
#           into the Supabase SQL Editor
```

### 4. Set Up Clerk

1. Create a Clerk application at [clerk.com](https://clerk.com)
2. Enable **Organizations** in the Clerk dashboard
3. Copy keys to `.env.local`
4. Set up a webhook endpoint:
   - URL: `https://your-domain.com/api/webhooks/clerk`
   - Events: `organization.created`, `organization.updated`, `user.created`, `user.updated`

### 5. Set Up Stripe

1. Create products and prices in the [Stripe Dashboard](https://dashboard.stripe.com)
2. Copy price IDs to `.env.local`
3. Set up webhook:
   - URL: `https://your-domain.com/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`

### 6. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 7. Deploy to Vercel

```bash
npx vercel
```

Or connect the GitHub repo to Vercel for auto-deploys on push.

## Modules Roadmap

- [x] **Phase 1**: Employee Directory, Leave Management, Documents, Auth, Billing
- [ ] **Phase 2**: Performance Reviews, Training & Compliance, Announcements
- [ ] **Phase 3**: Payroll & Compensation, Attendance
- [ ] **Phase 4**: AI Features (smart search, review summaries, attrition risk)

## Key Design Decisions

- **Multi-tenancy via RLS**: Every table has `org_id` with Row Level Security policies. The Clerk JWT contains the `org_id` claim, and Supabase RLS reads it to isolate data per organization.
- **Clerk Organizations**: Maps 1:1 to JambaHR organizations. Handles invitations, role management, and SSO.
- **Server Actions**: All mutations use Next.js Server Actions with Zod validation. No raw API routes for data mutation.
- **Per-employee pricing**: Stripe metered billing based on active employee count per organization.

## License

Private — All rights reserved.
