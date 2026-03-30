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

interface PendingDoc {
  name: string;
  category: string;
}

interface DocReminderEmailProps {
  employeeName: string;
  pendingDocs: PendingDoc[];
  dashboardUrl: string;
}

export function DocReminderEmail({
  employeeName = "Team Member",
  pendingDocs = [{ name: "Employee Handbook", category: "Policy" }],
  dashboardUrl = "https://jambahr.com/dashboard/documents",
}: DocReminderEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={headingStyle}>Documents Awaiting Your Acknowledgment</Text>
          <Text style={textStyle}>
            Hi <strong>{employeeName}</strong>, you have{" "}
            <strong>{pendingDocs.length}</strong>{" "}
            {pendingDocs.length === 1 ? "document" : "documents"} that require
            your acknowledgment.
          </Text>

          <Section style={detailsStyle}>
            {pendingDocs.map((doc, i) => (
              <Text key={i} style={docRowStyle}>
                📄 <strong>{doc.name}</strong>
                {doc.category && (
                  <span style={categoryStyle}> · {doc.category}</span>
                )}
              </Text>
            ))}
          </Section>

          <Text style={textStyle}>
            Please review and acknowledge these documents at your earliest
            convenience.
          </Text>

          <Button style={buttonStyle} href={dashboardUrl}>
            View Documents
          </Button>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            This is an automated reminder from JambaHR. You are receiving this
            because acknowledgment of these documents is required.
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

const docRowStyle = {
  fontSize: "14px",
  color: "#1a1a2e",
  margin: "6px 0",
};

const categoryStyle = {
  color: "#6b7280",
  fontSize: "13px",
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

export default DocReminderEmail;
