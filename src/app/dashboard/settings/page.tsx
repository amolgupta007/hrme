export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your organization, billing, leave policies, and integrations.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {[
          {
            title: "Organization",
            description: "Company name, logo, and basic info",
          },
          {
            title: "Billing & Plan",
            description: "Manage subscription and payment methods",
          },
          {
            title: "Leave Policies",
            description: "Configure leave types, accrual, and carry-forward rules",
          },
          {
            title: "Departments",
            description: "Add and manage team departments",
          },
          {
            title: "Roles & Permissions",
            description: "Control who can access what",
          },
          {
            title: "Notifications",
            description: "Email alerts and reminder preferences",
          },
        ].map((section) => (
          <div
            key={section.title}
            className="rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:shadow-sm cursor-pointer"
          >
            <h3 className="font-semibold">{section.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {section.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
