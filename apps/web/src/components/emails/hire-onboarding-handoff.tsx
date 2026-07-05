import { Html, Head, Body, Container, Text, Button, Hr } from "@react-email/components";

interface HireOnboardingHandoffEmailProps {
  candidateName: string;
  orgName: string;
  roleTitle: string;
  startDate: string;
  portalUrl: string;
}

export function HireOnboardingHandoffEmail({
  candidateName = "Candidate",
  orgName = "Company",
  roleTitle = "your new role",
  startDate = "your joining date",
  portalUrl = "https://jambahr.com/dashboard",
}: HireOnboardingHandoffEmailProps) {
  const formattedDate = (() => {
    try {
      return new Date(startDate).toLocaleDateString("en-IN", {
        day: "numeric", month: "long", year: "numeric",
      });
    } catch { return startDate; }
  })();

  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={headingStyle}>Welcome to {orgName} 🎉</Text>

          <Text style={textStyle}>
            Hi <strong>{candidateName}</strong>,
          </Text>
          <Text style={textStyle}>
            We&rsquo;re thrilled to officially welcome you to <strong>{orgName}</strong> as our new{" "}
            <strong>{roleTitle}</strong>. Your first day is <strong>{formattedDate}</strong>.
          </Text>
          <Text style={textStyle}>
            We&rsquo;ve sent you a separate invite to set up your account on the HR portal. Once
            you&rsquo;re in, you can view your offer, set up your profile, and access company
            documents.
          </Text>

          <Button style={ctaStyle} href={portalUrl}>
            Open the HR portal
          </Button>

          <Text style={textStyle}>
            We&rsquo;ll be in touch with onboarding details before your start date. Reply here
            with any questions — we can&rsquo;t wait to have you on the team.
          </Text>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            Sent by {orgName} via JambaHire.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle = { backgroundColor: "#f5f5f7", fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif", padding: "24px 0" };
const containerStyle = { maxWidth: "560px", margin: "0 auto", backgroundColor: "#ffffff", padding: "32px", borderRadius: "12px" };
const headingStyle = { fontSize: "22px", fontWeight: 700, color: "#0f172a", margin: "0 0 16px" };
const textStyle = { fontSize: "14px", lineHeight: "22px", color: "#334155", margin: "0 0 12px" };
const ctaStyle = { display: "inline-block", backgroundColor: "#16a34a", color: "#ffffff", padding: "12px 20px", borderRadius: "6px", textDecoration: "none", fontWeight: 600, fontSize: "14px", margin: "12px 0 18px" };
const footerStyle = { fontSize: "12px", color: "#94a3b8", margin: "0" };
const hrStyle = { borderColor: "#e2e8f0", margin: "24px 0 12px" };
