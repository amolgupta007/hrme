import {
  Html,
  Head,
  Body,
  Container,
  Text,
  Button,
  Hr,
} from "@react-email/components";

interface ReferralInviteEmailProps {
  candidateName: string;
  referrerFirstName: string;
  orgName: string;
  jobTitle: string;
  applyUrl: string;
}

export function ReferralInviteEmail({
  candidateName = "there",
  referrerFirstName = "Someone",
  orgName = "us",
  jobTitle = "an open role",
  applyUrl = "https://jambahr.com",
}: ReferralInviteEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={brandStyle}>
            Jamba<span style={{ color: "#0d9488" }}>HR</span>
          </Text>

          <Text style={headingStyle}>
            Hi {candidateName.split(" ")[0] ?? candidateName},
          </Text>

          <Text style={textStyle}>
            {referrerFirstName} thinks you&apos;d be a great fit for the{" "}
            <strong>{jobTitle}</strong> role at <strong>{orgName}</strong> and referred you in.
          </Text>

          <Text style={textStyle}>
            We&apos;ve pre-filled your details on the apply page below — it should take a couple of minutes.
          </Text>

          <Button style={buttonStyle} href={applyUrl}>
            Apply now →
          </Button>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            If the button doesn&apos;t work, copy this link into your browser:{"\n"}
            {applyUrl}
            {"\n\n"}You can ignore this email if you&apos;re not interested.
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

const headingStyle = {
  fontSize: "18px",
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
  marginTop: "12px",
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
  whiteSpace: "pre-line" as const,
};

export default ReferralInviteEmail;
