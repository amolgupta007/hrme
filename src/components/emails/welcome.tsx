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

interface WelcomeEmailProps {
  orgName: string;
  ownerFirstName: string;
  dashboardUrl: string;
}

export function WelcomeEmail({
  orgName = "your company",
  ownerFirstName = "there",
  dashboardUrl = "https://jambahr.com/dashboard",
}: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* Logo / Brand */}
          <Text style={brandStyle}>Jamba<span style={{ color: "#0d9488" }}>HR</span></Text>

          <Text style={headingStyle}>Welcome to JambaHR, {ownerFirstName}! 👋</Text>
          <Text style={textStyle}>
            Your workspace for <strong>{orgName}</strong> is ready. You're now on the
            Starter plan — free for up to 10 employees, no credit card needed.
          </Text>

          {/* Checklist */}
          <Text style={sectionHeadingStyle}>Get started in 3 steps:</Text>
          <Section style={checklistStyle}>
            <Text style={checkItemStyle}>① Add your employees → Employee Directory</Text>
            <Text style={checkItemStyle}>② Set up departments → Settings → Departments</Text>
            <Text style={checkItemStyle}>③ Invite your managers → Settings → Team</Text>
          </Section>

          <Button style={buttonStyle} href={dashboardUrl}>
            Open my dashboard →
          </Button>

          {/* What's included */}
          <Text style={sectionHeadingStyle}>What's included on the free plan:</Text>
          <Section style={featuresStyle}>
            <Text style={featureItemStyle}>✓ Employee directory (up to 10 employees)</Text>
            <Text style={featureItemStyle}>✓ Leave management — requests, approvals, balances</Text>
            <Text style={featureItemStyle}>✓ Company announcements</Text>
            <Text style={featureItemStyle}>✓ Org chart</Text>
          </Section>

          <Text style={textStyle}>
            Need more? Upgrade to Growth (₹500/employee/month) for documents,
            performance reviews, OKRs, training compliance, and JambaHire — our
            built-in hiring suite.
          </Text>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            Questions? Reply to this email — we read every one.{"\n"}
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

const sectionHeadingStyle = {
  fontSize: "13px",
  fontWeight: "600" as const,
  color: "#374151",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  marginTop: "24px",
  marginBottom: "8px",
};

const checklistStyle = {
  backgroundColor: "#f0fdf4",
  borderRadius: "8px",
  border: "1px solid #bbf7d0",
  padding: "16px 20px",
  margin: "0 0 20px 0",
};

const checkItemStyle = {
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

const featuresStyle = {
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  border: "1px solid #e5e7eb",
  padding: "16px 20px",
  margin: "0 0 20px 0",
};

const featureItemStyle = {
  fontSize: "14px",
  color: "#4a4a5a",
  margin: "5px 0",
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

export default WelcomeEmail;
