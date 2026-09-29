import { Body, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";

export type BonusIneligibleAlertProps = {
  employeeName: string;
  orgName: string;
  month: string;
  lateDaysThisMonth: number;
  thresholdDays: number;
  /** What reaching the limit means under this org's policy (defaults to the bonus block). */
  consequence?: "block_bonus" | "salary_deduction" | "both" | "none" | "leave_deduction";
};

/** Heading/subject line for the threshold email, worded by the policy's consequence. */
export function thresholdEmailTitle(consequence: BonusIneligibleAlertProps["consequence"] = "block_bonus"): string {
  switch (consequence) {
    case "salary_deduction":
      return "Late arrivals: salary deduction";
    case "both":
      return "Late arrivals: bonus and salary update";
    case "none":
    case "leave_deduction":
      return "Late arrival limit reached";
    default:
      return "Bonus eligibility update";
  }
}

export function BonusIneligibleAlert({
  employeeName,
  orgName,
  month,
  lateDaysThisMonth,
  thresholdDays,
  consequence = "block_bonus",
}: BonusIneligibleAlertProps) {
  const title = thresholdEmailTitle(consequence);
  const blocksBonus = consequence === "block_bonus" || consequence === "both";
  const deductsSalary = consequence === "salary_deduction" || consequence === "both";
  return (
    <Html>
      <Head />
      <Preview>{title} — {month}</Preview>
      <Body style={{ fontFamily: "Arial, sans-serif", background: "#f6f9fc" }}>
        <Container style={{ background: "#fff", padding: 24, borderRadius: 8, maxWidth: 480 }}>
          <Heading style={{ fontSize: 18 }}>{title}</Heading>
          <Section>
            <Text>Hi {employeeName},</Text>
            <Text>
              You have reached <strong>{lateDaysThisMonth}</strong> late punch-ins in {month}, which
              meets the {thresholdDays}-day limit set by {orgName}.
            </Text>
            {blocksBonus && <Text>As a result, you are not eligible for this month&apos;s incentive/bonus.</Text>}
            {deductsSalary && (
              <Text>
                As per company policy, a deduction for late arrivals will be applied to this month&apos;s salary.
              </Text>
            )}
            {!blocksBonus && !deductsSalary && <Text>Please make sure you arrive on time for the rest of the month.</Text>}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default BonusIneligibleAlert;
