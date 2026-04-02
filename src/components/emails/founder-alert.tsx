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

interface FounderAlertEmailProps {
  orgName: string;
  industry: string;
  companySize: string;
  ownerEmail: string;
  signupTime: string;
}

export function FounderAlertEmail({
  orgName = "Acme Inc.",
  industry = "Technology",
  companySize = "11-50",
  ownerEmail = "user@example.com",
  signupTime = new Date().toISOString(),
}: FounderAlertEmailProps) {
  const formattedTime = new Date(signupTime).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={badgeStyle}>🎉 New Signup</Text>
          <Text style={headingStyle}>New client just registered on JambaHR</Text>

          <Section style={detailsStyle}>
            <Text style={detailRowStyle}>
              <strong>Company:</strong> {orgName}
            </Text>
            <Text style={detailRowStyle}>
              <strong>Industry:</strong> {industry}
            </Text>
            <Text style={detailRowStyle}>
              <strong>Team size:</strong> {companySize} employees
            </Text>
            <Text style={detailRowStyle}>
              <strong>Owner email:</strong> {ownerEmail}
            </Text>
            <Text style={detailRowStyle}>
              <strong>Signed up at:</strong> {formattedTime} IST
            </Text>
          </Section>

          <Button style={buttonStyle} href="https://jambahr.com/dashboard">
            View Dashboard
          </Button>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            This is an automated founder alert from JambaHR.
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

const badgeStyle = {
  display: "inline-block",
  backgroundColor: "#d1fae5",
  color: "#065f46",
  fontSize: "12px",
  fontWeight: "600" as const,
  padding: "4px 10px",
  borderRadius: "9999px",
  marginBottom: "12px",
};

const headingStyle = {
  fontSize: "20px",
  fontWeight: "700" as const,
  color: "#1a1a2e",
  marginBottom: "12px",
};

const detailsStyle = {
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  border: "1px solid #d1fae5",
  padding: "16px 20px",
  margin: "20px 0",
};

const detailRowStyle = {
  fontSize: "14px",
  color: "#4a4a5a",
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
};

const hrStyle = {
  borderColor: "#e5e7eb",
  marginTop: "32px",
};

const footerStyle = {
  fontSize: "12px",
  color: "#9ca3af",
  marginTop: "16px",
};

export default FounderAlertEmail;
