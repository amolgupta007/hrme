import {
  Html,
  Head,
  Body,
  Container,
  Text,
  Button,
  Hr,
} from "@react-email/components";

interface SocialPublishFailedEmailProps {
  postId: string;
  captionPreview: string;
  errorMessage: string;
  reviewUrl: string;
}

export function SocialPublishFailedEmail({
  postId = "",
  captionPreview = "",
  errorMessage = "Buffer reported an error",
  reviewUrl = "https://jambahr.com/superadmin/social",
}: SocialPublishFailedEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={brandStyle}>
            Jamba<span style={{ color: "#0d9488" }}>HR</span> · Social Agent
          </Text>

          <Text style={badgeStyle}>Publish failed</Text>

          <Text style={headingStyle}>A LinkedIn post failed to publish</Text>

          <Text style={textStyle}>
            Buffer reported an error when publishing one of your scheduled posts. The post status
            has been marked as failed. Review and decide whether to fix and re-schedule.
          </Text>

          <Text style={errorStyle}>{errorMessage}</Text>

          <Text style={previewStyle}>{captionPreview}…</Text>

          <Button style={buttonStyle} href={reviewUrl}>
            Open post →
          </Button>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            Post ID: {postId}
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
  backgroundColor: "#fee2e2",
  color: "#991b1b",
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

const errorStyle = {
  fontSize: "13px",
  color: "#991b1b",
  backgroundColor: "#fef2f2",
  borderLeft: "3px solid #dc2626",
  padding: "12px 16px",
  margin: "16px 0",
  fontFamily: "ui-monospace, 'SF Mono', monospace",
};

const previewStyle = {
  fontSize: "13px",
  color: "#1a1a2e",
  backgroundColor: "#f3f4f6",
  borderLeft: "3px solid #6b7280",
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

export default SocialPublishFailedEmail;
