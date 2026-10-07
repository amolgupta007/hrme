import { Html, Head, Preview, Body, Container, Section, Text, Button, Hr } from "@react-email/components";

interface AnnouncementPublishedEmailProps {
  employeeName: string;
  orgName: string;
  announcementTitle: string;
  /** Plain-text excerpt of the body; empty to omit. */
  preview: string;
  ackRequired: boolean;
  /** Formatted for display, e.g. "5 Oct 2026". Null when there is no due date. */
  dueDateLabel: string | null;
  announcementUrl: string;
}

export function AnnouncementPublishedEmail({
  employeeName = "Team Member",
  orgName = "Your company",
  announcementTitle = "Office closed for Diwali",
  preview = "The office will be closed from 20 to 24 October.",
  ackRequired = false,
  dueDateLabel = null,
  announcementUrl = "https://jambahr.com/dashboard/announcements",
}: AnnouncementPublishedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`New announcement from ${orgName}: ${announcementTitle}`}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={headingStyle}>You have a new announcement</Text>
          <Text style={textStyle}>
            Hi <strong>{employeeName}</strong>, {orgName} has posted a new announcement.
          </Text>

          <Section style={detailsStyle}>
            <Text style={titleRowStyle}>
              📣 <strong>{announcementTitle}</strong>
            </Text>
            {preview && <Text style={previewStyle}>{preview}</Text>}
            {ackRequired && (
              <Text style={ackStyle}>
                {dueDateLabel
                  ? `Your acknowledgement is required by ${dueDateLabel}.`
                  : "Your acknowledgement is required."}
              </Text>
            )}
          </Section>

          <Button style={buttonStyle} href={announcementUrl}>
            Read now
          </Button>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            Sent from JambaHR on behalf of {orgName}. You are receiving this because the
            announcement was shared with you.
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

const headingStyle = {
  fontSize: "20px",
  fontWeight: "700" as const,
  color: "#1a1a2e",
  marginBottom: "16px",
};

const textStyle = {
  fontSize: "14px",
  color: "#4a4a5a",
  lineHeight: "1.6",
};

const detailsStyle = {
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  border: "1px solid #e5e7eb",
  padding: "16px 20px",
  margin: "20px 0",
};

const titleRowStyle = {
  fontSize: "15px",
  color: "#1a1a2e",
  margin: "0",
};

const previewStyle = {
  fontSize: "14px",
  color: "#4a4a5a",
  lineHeight: "1.6",
  margin: "10px 0 0",
};

const ackStyle = {
  fontSize: "13px",
  color: "#b45309",
  fontWeight: "600" as const,
  margin: "10px 0 0",
};

const buttonStyle = {
  backgroundColor: "#2a9d8f",
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

export default AnnouncementPublishedEmail;
