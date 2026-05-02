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

export interface GracePeriodEndingEmailProps {
  orgName: string;
  daysRemaining: number;
  dashboardUrl: string;
}

export function SubscriptionGracePeriodEndingEmail({
  orgName,
  daysRemaining,
  dashboardUrl,
}: GracePeriodEndingEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`Your subscription access ends in ${daysRemaining} days`}</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", background: "#f5f5f5", padding: "40px 0" }}>
        <Container style={{ background: "#fff", borderRadius: 8, padding: 32, maxWidth: 560, margin: "0 auto" }}>
          <Heading as="h1" style={{ fontSize: 22, color: "#b45309" }}>
            Action needed: access ending soon
          </Heading>
          <Text>Hello {orgName} team,</Text>
          <Text>
            Your JambaHR subscription has been on hold for several days. In <strong>{daysRemaining} days</strong>,
            your account will be downgraded to the free Starter plan and paid features will be disabled.
          </Text>
          <Text>
            To restore your subscription, update your payment method now:
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
              Restore subscription
            </Link>
          </Section>
          <Text style={{ fontSize: 13, color: "#666" }}>
            Once downgraded, your data is preserved — re-subscribing restores all paid features.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default SubscriptionGracePeriodEndingEmail;
