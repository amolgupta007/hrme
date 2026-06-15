import { Body, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";

export type LatePunchAlertProps = {
  employeeName: string;
  orgName: string;
  clockInTime: string;
  lateMinutes: number;
  lateDaysThisMonth: number;
  thresholdDays: number;
};

export function LatePunchAlert({
  employeeName,
  orgName,
  clockInTime,
  lateMinutes,
  lateDaysThisMonth,
  thresholdDays,
}: LatePunchAlertProps) {
  return (
    <Html>
      <Head />
      <Preview>Late punch-in recorded — {clockInTime}</Preview>
      <Body style={{ fontFamily: "Arial, sans-serif", background: "#f6f9fc" }}>
        <Container style={{ background: "#fff", padding: 24, borderRadius: 8, maxWidth: 480 }}>
          <Heading style={{ fontSize: 18 }}>Late punch-in recorded</Heading>
          <Section>
            <Text>Hi {employeeName},</Text>
            <Text>
              Your clock-in at <strong>{clockInTime}</strong> was {lateMinutes} minute(s) late.
            </Text>
            <Text>
              This is late day <strong>{lateDaysThisMonth}</strong> of {thresholdDays} allowed this
              month at {orgName}. Reaching {thresholdDays} late days makes you ineligible for this
              month&apos;s incentive/bonus.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default LatePunchAlert;
