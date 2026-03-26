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

interface LeaveRequestEmailProps {
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  approvalUrl: string;
}

export function LeaveRequestEmail({
  employeeName = "John Doe",
  leaveType = "Paid Leave",
  startDate = "Mar 20, 2026",
  endDate = "Mar 22, 2026",
  days = 3,
  reason = "Family vacation",
  approvalUrl = "https://jambahr.com/dashboard/leaves",
}: LeaveRequestEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={headingStyle}>New Leave Request</Text>
          <Text style={textStyle}>
            <strong>{employeeName}</strong> has submitted a leave request that
            requires your approval.
          </Text>

          <Section style={detailsStyle}>
            <Text style={detailRowStyle}>
              <strong>Type:</strong> {leaveType}
            </Text>
            <Text style={detailRowStyle}>
              <strong>Dates:</strong> {startDate} — {endDate} ({days} day
              {days > 1 ? "s" : ""})
            </Text>
            <Text style={detailRowStyle}>
              <strong>Reason:</strong> {reason}
            </Text>
          </Section>

          <Button style={buttonStyle} href={approvalUrl}>
            Review Request
          </Button>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            This is an automated notification from JambaHR.
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

const detailRowStyle = {
  fontSize: "14px",
  color: "#4a4a5a",
  margin: "4px 0",
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

export default LeaveRequestEmail;
