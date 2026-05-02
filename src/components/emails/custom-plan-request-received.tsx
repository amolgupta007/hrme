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

export interface CustomPlanRequestReceivedEmailProps {
  orgName: string;
  features: string[];
  employeeCount: number;
  billingCycle: "monthly" | "annual";
  superadminUrl: string;
}

export function CustomPlanRequestReceivedEmail({
  orgName,
  features,
  employeeCount,
  billingCycle,
  superadminUrl,
}: CustomPlanRequestReceivedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`New custom plan request from ${orgName}`}</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", background: "#f5f5f5", padding: "40px 0" }}>
        <Container style={{ background: "#fff", borderRadius: 8, padding: 32, maxWidth: 560, margin: "0 auto" }}>
          <Heading as="h1" style={{ fontSize: 22, color: "#0f7068" }}>New custom plan request</Heading>
          <Text>{orgName} just submitted a custom plan request.</Text>

          <Section style={{ background: "#fafafa", padding: 16, borderRadius: 6, margin: "16px 0" }}>
            <Text style={{ margin: "4px 0" }}><strong>Features:</strong> {features.join(", ")}</Text>
            <Text style={{ margin: "4px 0" }}><strong>Employees:</strong> {employeeCount}</Text>
            <Text style={{ margin: "4px 0" }}><strong>Cycle:</strong> {billingCycle === "annual" ? "Annual" : "Monthly"}</Text>
          </Section>

          <Section style={{ textAlign: "center", margin: "24px 0" }}>
            <Link
              href={superadminUrl}
              style={{ background: "#0f7068", color: "#fff", padding: "10px 20px", borderRadius: 6, textDecoration: "none", fontWeight: 600 }}
            >
              Review in superadmin
            </Link>
          </Section>

          <Text style={{ fontSize: 13, color: "#666" }}>
            Respond within 1 business day per the SLA on the pricing page.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default CustomPlanRequestReceivedEmail;
