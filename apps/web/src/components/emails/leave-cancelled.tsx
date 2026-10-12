import { Html, Head, Body, Container, Section, Text, Button, Hr } from "@react-email/components";

interface LeaveCancelledEmailProps {
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  /** Who cancelled it — the employee themselves, or a manager/admin. */
  cancelledByName: string;
  /** True when this copy goes to the employee whose leave it was. */
  toEmployee: boolean;
  dashboardUrl: string;
}

export function LeaveCancelledEmail({
  employeeName = "Priya Sharma",
  leaveType = "Casual Leave",
  startDate = "2026-10-20",
  endDate = "2026-10-21",
  days = 2,
  cancelledByName = "Priya Sharma",
  toEmployee = false,
  dashboardUrl = "https://jambahr.com/dashboard/leaves",
}: LeaveCancelledEmailProps) {
  const byThemselves = cancelledByName === employeeName;
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={headingStyle}>Approved leave cancelled</Text>
          <Text style={textStyle}>
            {toEmployee ? (
              <>
                Hi <strong>{employeeName}</strong>, your approved leave was cancelled by{" "}
                <strong>{cancelledByName}</strong>. The days are back in your balance.
              </>
            ) : byThemselves ? (
              <>
                <strong>{employeeName}</strong> cancelled their approved leave. They will be working on
                these days.
              </>
            ) : (
              <>
                <strong>{cancelledByName}</strong> cancelled <strong>{employeeName}</strong>&apos;s
                approved leave.
              </>
            )}
          </Text>

          <Section style={detailsStyle}>
            <Text style={detailRowStyle}>
              <strong>Type:</strong> {leaveType}
            </Text>
            <Text style={detailRowStyle}>
              <strong>Dates:</strong> {startDate} — {endDate} ({days} day{days === 1 ? "" : "s"})
            </Text>
          </Section>

          <Button style={buttonStyle} href={dashboardUrl}>
            View leaves
          </Button>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>This is an automated notification from JambaHR.</Text>
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
  color: "#1a1a2e",
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

export default LeaveCancelledEmail;
