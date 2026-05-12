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

interface FeedbackReceivedEmailProps {
  type: "bug" | "feature_request" | "feedback" | "other";
  severity?: "low" | "medium" | "high" | "critical" | null;
  title: string;
  descriptionPreview: string;
  reporterName: string;
  reporterEmail: string;
  reporterRole: string;
  orgName: string;
  orgSlug: string;
  pageUrl: string | null;
  reviewUrl: string;
  submittedAt: string;
}

const TYPE_LABEL: Record<FeedbackReceivedEmailProps["type"], string> = {
  bug: "🐛 Bug report",
  feature_request: "✨ Feature request",
  feedback: "💬 Feedback",
  other: "📝 Other",
};

export function FeedbackReceivedEmail(props: FeedbackReceivedEmailProps) {
  const {
    type,
    severity,
    title,
    descriptionPreview,
    reporterName,
    reporterEmail,
    reporterRole,
    orgName,
    orgSlug,
    pageUrl,
    reviewUrl,
    submittedAt,
  } = props;

  const formattedTime = new Date(submittedAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const isCritical = type === "bug" && severity === "critical";

  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={isCritical ? badgeCriticalStyle : badgeStyle}>
            {TYPE_LABEL[type]}
            {severity ? ` · ${severity.toUpperCase()}` : ""}
          </Text>
          <Text style={headingStyle}>{title}</Text>

          <Section style={detailsStyle}>
            <Text style={detailRowStyle}>
              <strong>From:</strong> {reporterName} ({reporterEmail}) — {reporterRole}
            </Text>
            <Text style={detailRowStyle}>
              <strong>Org:</strong> {orgName} ({orgSlug})
            </Text>
            {pageUrl ? (
              <Text style={detailRowStyle}>
                <strong>Page:</strong> {pageUrl}
              </Text>
            ) : null}
            <Text style={detailRowStyle}>
              <strong>Submitted:</strong> {formattedTime} IST
            </Text>
          </Section>

          <Section style={detailsStyle}>
            <Text style={descriptionLabelStyle}>Description</Text>
            <Text style={descriptionStyle}>{descriptionPreview}</Text>
          </Section>

          <Button style={buttonStyle} href={reviewUrl}>
            Open in superadmin
          </Button>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            Automated alert from JambaHR feedback module.
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
  maxWidth: "600px",
  backgroundColor: "#ffffff",
  borderRadius: "8px",
};

const badgeStyle = {
  display: "inline-block" as const,
  padding: "4px 10px",
  borderRadius: "999px",
  backgroundColor: "#e6f4ef",
  color: "#0d5d4a",
  fontSize: "12px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  margin: 0,
};

const badgeCriticalStyle = {
  ...badgeStyle,
  backgroundColor: "#fee2e2",
  color: "#991b1b",
};

const headingStyle = {
  fontSize: "20px",
  fontWeight: 600,
  color: "#1a1a1a",
  margin: "12px 0 16px",
};

const detailsStyle = {
  backgroundColor: "#f8f9fa",
  padding: "16px",
  borderRadius: "6px",
  margin: "16px 0",
};

const detailRowStyle = {
  fontSize: "14px",
  color: "#374151",
  margin: "4px 0",
};

const descriptionLabelStyle = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#6b7280",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  margin: "0 0 6px",
};

const descriptionStyle = {
  fontSize: "14px",
  color: "#1a1a1a",
  margin: 0,
  whiteSpace: "pre-wrap" as const,
};

const buttonStyle = {
  display: "inline-block" as const,
  padding: "10px 18px",
  backgroundColor: "#0d9488",
  color: "#ffffff",
  borderRadius: "6px",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: "14px",
  marginTop: "8px",
};

const hrStyle = { borderColor: "#e5e7eb", margin: "24px 0" };
const footerStyle = { fontSize: "12px", color: "#9ca3af", margin: 0 };

export default FeedbackReceivedEmail;
