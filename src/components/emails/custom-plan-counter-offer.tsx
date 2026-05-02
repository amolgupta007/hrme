import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface CustomPlanCounterOfferEmailProps {
  orgName: string;
  features: string[];
  employees: number;
  cycle: "monthly" | "annual";
  platformFee: number;
  perFeatureRate: number;
  maxEmployees: number;
  notes: string;
  dashboardUrl: string;
}

function fmt(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

export function CustomPlanCounterOfferEmail({
  orgName,
  features,
  employees,
  cycle,
  platformFee,
  perFeatureRate,
  maxEmployees,
  notes,
  dashboardUrl,
}: CustomPlanCounterOfferEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`We've proposed adjusted terms for your custom plan`}</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", background: "#f5f5f5", padding: "40px 0" }}>
        <Container style={{ background: "#fff", borderRadius: 8, padding: 32, maxWidth: 560, margin: "0 auto" }}>
          <Heading as="h1" style={{ fontSize: 22, color: "#0f7068" }}>Counter-offer ready</Heading>
          <Text>Hello {orgName} team,</Text>
          <Text>
            We&apos;ve reviewed your custom plan request and proposed adjusted terms. Review and accept (or decline) from your billing dashboard.
          </Text>

          <Section style={{ background: "#fafafa", padding: 16, borderRadius: 6, margin: "16px 0" }}>
            <Text style={{ margin: "4px 0" }}><strong>Features:</strong> {features.join(", ")}</Text>
            <Text style={{ margin: "4px 0" }}><strong>Employees:</strong> up to {maxEmployees}</Text>
            <Text style={{ margin: "4px 0" }}><strong>Cycle:</strong> {cycle === "annual" ? "Annual" : "Monthly"}</Text>
            <Text style={{ margin: "4px 0" }}><strong>Platform fee:</strong> {fmt(platformFee)} (one-time)</Text>
            <Text style={{ margin: "4px 0" }}><strong>Per-feature rate:</strong> {fmt(perFeatureRate)} / employee / month</Text>
          </Section>

          {notes && (
            <Section style={{ background: "#fef3c7", padding: 12, borderRadius: 6, margin: "16px 0" }}>
              <Text style={{ margin: 0, fontSize: 13, color: "#78350f" }}><strong>Notes from JambaHR:</strong> {notes}</Text>
            </Section>
          )}

          <Section style={{ textAlign: "center", margin: "24px 0" }}>
            <Link
              href={dashboardUrl}
              style={{ background: "#0f7068", color: "#fff", padding: "10px 20px", borderRadius: 6, textDecoration: "none", fontWeight: 600 }}
            >
              Review counter-offer
            </Link>
          </Section>

          <Text style={{ fontSize: 13, color: "#666" }}>
            All amounts exclude 18% GST. If you have questions, reply to this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default CustomPlanCounterOfferEmail;
