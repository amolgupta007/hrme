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

export interface SubscriptionPausedEmailProps {
  orgName: string;
  dashboardUrl: string;
}

export function SubscriptionPausedEmail({ orgName, dashboardUrl }: SubscriptionPausedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your JambaHR subscription is paused — action needed</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", background: "#f5f5f5", padding: "40px 0" }}>
        <Container style={{ background: "#fff", borderRadius: 8, padding: 32, maxWidth: 560, margin: "0 auto" }}>
          <Heading as="h1" style={{ fontSize: 22, color: "#0f7068" }}>Subscription paused</Heading>
          <Text>Hello {orgName} team,</Text>
          <Text>
            Your JambaHR subscription has been paused. This usually happens when a recent payment couldn&apos;t
            be processed. You&apos;ll keep full access for the next 7 days while we attempt to recover.
          </Text>
          <Text>
            Please update your payment method or resolve the issue from your billing dashboard:
          </Text>
          <Section style={{ textAlign: "center", margin: "24px 0" }}>
            <Link
              href={dashboardUrl}
              style={{
                background: "#0f7068",
                color: "#fff",
                padding: "10px 20px",
                borderRadius: 6,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Manage billing
            </Link>
          </Section>
          <Text style={{ fontSize: 13, color: "#666" }}>
            If the issue isn&apos;t resolved within 7 days, your account will be moved to the free Starter plan
            and paid features will be temporarily disabled. Re-activating later restores everything.
          </Text>
          <Text style={{ fontSize: 13, color: "#666" }}>
            Questions? Reply to this email or write to support@jambahr.com.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default SubscriptionPausedEmail;
