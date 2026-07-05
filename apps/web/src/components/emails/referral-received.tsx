import {
  Html,
  Head,
  Body,
  Container,
  Text,
  Button,
  Hr,
} from "@react-email/components";

interface ReferralReceivedEmailProps {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  referrerName: string;
  noteToRecruiter: string | null;
  inboxUrl: string;
}

export function ReferralReceivedEmail({
  candidateName = "",
  candidateEmail = "",
  jobTitle = "",
  referrerName = "An employee",
  noteToRecruiter = null,
  inboxUrl = "https://jambahr.com/hire/referrals",
}: ReferralReceivedEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={brandStyle}>
            Jamba<span style={{ color: "#0d9488" }}>HR</span>
          </Text>

          <Text style={badgeStyle}>New referral</Text>

          <Text style={headingStyle}>
            {referrerName} just referred a candidate
          </Text>

          <Text style={textStyle}>
            <strong>{candidateName}</strong> ({candidateEmail}) was referred for the{" "}
            <strong>{jobTitle}</strong> role.
          </Text>

          {noteToRecruiter && (
            <Text style={previewStyle}>
              <strong>Note from {referrerName}:</strong>
              {"\n"}
              {noteToRecruiter}
            </Text>
          )}

          <Button style={buttonStyle} href={inboxUrl}>
            Review in inbox →
          </Button>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            We&apos;ve already emailed the candidate a tracked apply link. Once they apply,
            their application will appear in your pipeline.
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
  maxWidth: "520px",
};

const brandStyle = {
  fontSize: "20px",
  fontWeight: "800" as const,
  color: "#1a1a2e",
  marginBottom: "20px",
};

const badgeStyle = {
  display: "inline-block",
  fontSize: "11px",
  fontWeight: "600" as const,
  padding: "3px 10px",
  borderRadius: "9999px",
  backgroundColor: "#e0e7ff",
  color: "#3730a3",
  marginBottom: "16px",
};

const headingStyle = {
  fontSize: "20px",
  fontWeight: "700" as const,
  color: "#1a1a2e",
  marginBottom: "12px",
};

const textStyle = {
  fontSize: "14px",
  color: "#4a4a5a",
  lineHeight: "1.7",
  marginBottom: "16px",
};

const previewStyle = {
  fontSize: "13px",
  color: "#1a1a2e",
  backgroundColor: "#f3f4f6",
  borderLeft: "3px solid #6366f1",
  padding: "12px 16px",
  margin: "16px 0 24px",
  whiteSpace: "pre-wrap" as const,
};

const buttonStyle = {
  backgroundColor: "#4f46e5",
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
  fontSize: "11px",
  color: "#9ca3af",
  marginTop: "16px",
  lineHeight: "1.6",
};

export default ReferralReceivedEmail;
