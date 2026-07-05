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

export interface CustomPlanApprovedEmailProps {
  orgName: string;
  features: string[];
  employees: number;
  cycle: "monthly" | "annual";
  platformFee: number;
  perFeatureRate: number;
  checkoutUrl: string;
}

function fmt(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

export function CustomPlanApprovedEmail({
  orgName,
  features,
  employees,
  cycle,
  platformFee,
  perFeatureRate,
  checkoutUrl,
}: CustomPlanApprovedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your custom plan is approved — complete checkout</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", background: "#f5f5f5", padding: "40px 0" }}>
        <Container style={{ background: "#fff", borderRadius: 8, padding: 32, maxWidth: 560, margin: "0 auto" }}>
          <Heading as="h1" style={{ fontSize: 22, color: "#0f7068" }}>Custom plan approved</Heading>
          <Text>Hello {orgName} team,</Text>
          <Text>
            Your custom JambaHR plan is approved and ready to activate. Complete checkout below to start using your features.
          </Text>

          <Section style={{ background: "#fafafa", padding: 16, borderRadius: 6, margin: "16px 0" }}>
            <Text style={{ margin: "4px 0" }}><strong>Features:</strong> {features.join(", ")}</Text>
            <Text style={{ margin: "4px 0" }}><strong>Employees:</strong> up to {employees}</Text>
            <Text style={{ margin: "4px 0" }}><strong>Cycle:</strong> {cycle === "annual" ? "Annual" : "Monthly"}</Text>
            <Text style={{ margin: "4px 0" }}><strong>Platform fee (one-time):</strong> {fmt(platformFee)}</Text>
            <Text style={{ margin: "4px 0" }}><strong>Per-feature rate:</strong> {fmt(perFeatureRate)} / employee / month</Text>
          </Section>

          <Section style={{ textAlign: "center", margin: "24px 0" }}>
            <Link
              href={checkoutUrl}
              style={{ background: "#0f7068", color: "#fff", padding: "12px 24px", borderRadius: 6, textDecoration: "none", fontWeight: 600 }}
            >
              Complete checkout
            </Link>
          </Section>

          <Text style={{ fontSize: 13, color: "#666" }}>
            All amounts exclude 18% GST. Your subscription activates the moment payment confirms — no manual step needed afterward.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default CustomPlanApprovedEmail;
