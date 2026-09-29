import { Html, Head, Body, Container, Section, Text, Button, Hr } from "@react-email/components";

interface AnnouncementAckReminderEmailProps {
  employeeName: string;
  orgName: string;
  announcementTitle: string;
  /** Formatted for display, e.g. "5 Oct 2026". Null when there is no due date. */
  dueDateLabel: string | null;
  overdue: boolean;
  announcementUrl: string;
}

export function AnnouncementAckReminderEmail({
  employeeName = "Team Member",
  orgName = "Your company",
  announcementTitle = "Updated leave policy",
  dueDateLabel = null,
  overdue = false,
  announcementUrl = "https://jambahr.com/dashboard/announcements",
}: AnnouncementAckReminderEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={headingStyle}>Please acknowledge an announcement</Text>
          <Text style={textStyle}>
            Hi <strong>{employeeName}</strong>, {orgName} has asked you to read and acknowledge
            this announcement.
          </Text>

          <Section style={detailsStyle}>
            <Text style={titleRowStyle}>
              📣 <strong>{announcementTitle}</strong>
            </Text>
            {dueDateLabel && (
              <Text style={overdue ? overdueStyle : dueStyle}>
                {overdue ? `Overdue — was due ${dueDateLabel}` : `Due by ${dueDateLabel}`}
              </Text>
            )}
          </Section>

          <Button style={buttonStyle} href={announcementUrl}>
            Read and acknowledge
          </Button>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            Sent from JambaHR on behalf of {orgName}. You are receiving this because your
            acknowledgement of this announcement is required.
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

const dueStyle = {
  fontSize: "13px",
  color: "#6b7280",
  margin: "6px 0 0",
};

const overdueStyle = {
  fontSize: "13px",
  color: "#b91c1c",
  fontWeight: "600" as const,
  margin: "6px 0 0",
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

export default AnnouncementAckReminderEmail;
