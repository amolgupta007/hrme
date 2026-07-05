import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
} from "@react-email/components";

interface AccountSetupEmailProps {
  orgName: string;
  firstName: string;
  signInUrl: string;
}

export function AccountSetupEmail({
  orgName = "your team",
  firstName = "there",
  signInUrl = "https://jambahr.com/sign-in",
}: AccountSetupEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* Logo / Brand */}
          <Text style={brandStyle}>Jamba<span style={{ color: "#0d9488" }}>HR</span></Text>

          <Text style={headingStyle}>You&apos;ve been added to {orgName} 👋</Text>
          <Text style={textStyle}>
            Hi {firstName}, your HR admin has added you to <strong>{orgName}</strong> on
            JambaHR. Set up your account to sign in — use the email address this
            invite was sent to.
          </Text>

          <Section style={cardStyle}>
            <Text style={cardHeadingStyle}>What you can do in JambaHR</Text>
            <Text style={cardItemStyle}>✓ Request leave and track your balances</Text>
            <Text style={cardItemStyle}>✓ View company announcements and holidays</Text>
            <Text style={cardItemStyle}>✓ Access your documents, payslips, and profile</Text>
          </Section>

          <Button style={buttonStyle} href={signInUrl}>
            Set up my account →
          </Button>

          <Text style={textStyle}>
            If the button doesn&apos;t work, copy and paste this link into your browser:
            <br />
            {signInUrl}
          </Text>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            Didn&apos;t expect this? You can safely ignore this email.{"\n"}
            JambaHR · jambahr.com
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle = {
  backgroundColor: "#f8f9fa",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const containerStyle = {
  margin: "0 auto",
  padding: "32px 24px",
  maxWidth: "560px",
};

const brandStyle = {
  fontSize: "22px",
  fontWeight: "800" as const,
  color: "#1a1a2e",
  marginBottom: "24px",
};

const headingStyle = {
  fontSize: "22px",
  fontWeight: "700" as const,
  color: "#1a1a2e",
  marginBottom: "12px",
};

const textStyle = {
  fontSize: "14px",
  color: "#4a4a5a",
  lineHeight: "1.6",
  marginBottom: "16px",
};

const cardStyle = {
  backgroundColor: "#f0fdf4",
  borderRadius: "8px",
  border: "1px solid #bbf7d0",
  padding: "16px 20px",
  margin: "0 0 20px 0",
};

const cardHeadingStyle = {
  fontSize: "13px",
  fontWeight: "600" as const,
  color: "#166534",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  marginBottom: "8px",
};

const cardItemStyle = {
  fontSize: "14px",
  color: "#166534",
  margin: "6px 0",
};

const buttonStyle = {
  backgroundColor: "#0d9488",
  borderRadius: "8px",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "600" as const,
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "12px 24px",
  marginBottom: "24px",
};

const hrStyle = {
  borderColor: "#e5e7eb",
  marginTop: "32px",
};

const footerStyle = {
  fontSize: "12px",
  color: "#9ca3af",
  marginTop: "16px",
  lineHeight: "1.6",
};

export default AccountSetupEmail;
