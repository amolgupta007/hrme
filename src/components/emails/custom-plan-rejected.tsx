import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface CustomPlanRejectedEmailProps {
  orgName: string;
  reason: string;
}

export function CustomPlanRejectedEmail({ orgName, reason }: CustomPlanRejectedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Update on your custom plan request</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", background: "#f5f5f5", padding: "40px 0" }}>
        <Container style={{ background: "#fff", borderRadius: 8, padding: 32, maxWidth: 560, margin: "0 auto" }}>
          <Heading as="h1" style={{ fontSize: 22, color: "#b45309" }}>Request not approved</Heading>
          <Text>Hello {orgName} team,</Text>
          <Text>
            Thanks for your custom plan request. Unfortunately we&apos;re not able to approve it as submitted.
          </Text>

          <Section style={{ background: "#fef3c7", padding: 16, borderRadius: 6, margin: "16px 0" }}>
            <Text style={{ margin: 0 }}><strong>Reason:</strong> {reason}</Text>
          </Section>

          <Text>
            You&apos;re welcome to submit a different request, or pick one of our standard tiers (Growth or Business) which work for most teams.
          </Text>

          <Text style={{ fontSize: 13, color: "#666" }}>
            Questions? Reply to this email or write to support@jambahr.com.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default CustomPlanRejectedEmail;
