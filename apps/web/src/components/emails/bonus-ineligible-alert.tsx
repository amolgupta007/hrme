import { Body, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";

export type BonusIneligibleAlertProps = {
  employeeName: string;
  orgName: string;
  month: string;
  lateDaysThisMonth: number;
  thresholdDays: number;
};

export function BonusIneligibleAlert({
  employeeName,
  orgName,
  month,
  lateDaysThisMonth,
  thresholdDays,
}: BonusIneligibleAlertProps) {
  return (
    <Html>
      <Head />
      <Preview>Bonus eligibility update — {month}</Preview>
      <Body style={{ fontFamily: "Arial, sans-serif", background: "#f6f9fc" }}>
        <Container style={{ background: "#fff", padding: 24, borderRadius: 8, maxWidth: 480 }}>
          <Heading style={{ fontSize: 18 }}>Bonus eligibility update</Heading>
          <Section>
            <Text>Hi {employeeName},</Text>
            <Text>
              You have reached <strong>{lateDaysThisMonth}</strong> late punch-ins in {month}, which
              meets the {thresholdDays}-day limit set by {orgName}.
            </Text>
            <Text>As a result, you are not eligible for this month&apos;s incentive/bonus.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default BonusIneligibleAlert;
