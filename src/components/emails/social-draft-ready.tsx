import {
  Html,
  Head,
  Body,
  Container,
  Text,
  Button,
  Hr,
} from "@react-email/components";

interface SocialDraftReadyEmailProps {
  captionPreview: string;
  reviewUrl: string;
}

export function SocialDraftReadyEmail({
  captionPreview = "",
  reviewUrl = "https://jambahr.com/superadmin/social",
}: SocialDraftReadyEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={brandStyle}>
            Jamba<span style={{ color: "#0d9488" }}>HR</span> · Social Agent
          </Text>

          <Text style={badgeStyle}>New draft ready</Text>

          <Text style={headingStyle}>One LinkedIn draft is waiting for review</Text>

          <Text style={textStyle}>
            The agent generated a draft. Open it to review the caption, edit anything, regenerate
            the image if needed, then approve to push it to Buffer's queue.
          </Text>

          <Text style={previewStyle}>{captionPreview}…</Text>

          <Button style={buttonStyle} href={reviewUrl}>
            Review draft →
          </Button>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            Sent from the JambaHR social agent. Approve, edit, or reject from the superadmin queue.
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
  backgroundColor: "#dbeafe",
  color: "#1e40af",
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
  borderLeft: "3px solid #0d9488",
  padding: "12px 16px",
  margin: "16px 0 24px",
  whiteSpace: "pre-wrap" as const,
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
  fontSize: "11px",
  color: "#9ca3af",
  marginTop: "16px",
  lineHeight: "1.6",
};

export default SocialDraftReadyEmail;
