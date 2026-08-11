import {
  Html,
  Head,
  Body,
  Container,
  Text,
  Button,
  Hr,
} from "@react-email/components";

interface AccountDeletionRequestEmailProps {
  employeeName: string;
  orgName: string;
  dashboardUrl?: string;
}

/**
 * Sent to an org's owners/admins when an employee taps "Delete my account" on
 * mobile. JambaHR is B2B — this is a REQUEST, not a destructive action. The
 * admin decides whether to offboard the person via the existing terminate
 * flow; the employee/attendance/payroll data is retained per policy until then.
 */
export function AccountDeletionRequestEmail({
  employeeName = "An employee",
  orgName = "your organisation",
  dashboardUrl = "https://jambahr.com/dashboard/employees",
}: AccountDeletionRequestEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={brandStyle}>
            Jamba<span style={{ color: "#0d9488" }}>HR</span>
          </Text>

          <Text style={badgeStyle}>Account deletion requested</Text>

          <Text style={headingStyle}>{employeeName} requested account deletion</Text>

          <Text style={textStyle}>
            <strong>{employeeName}</strong> asked to have their JambaHR account removed from{" "}
            <strong>{orgName}</strong> via the mobile app.
          </Text>

          <Text style={textStyle}>
            No data has been changed. Their attendance and payroll records are retained per your
            organisation&apos;s policy. To complete the removal, offboard them from the employee
            directory (Terminate) when you&apos;re ready.
          </Text>

          <Button style={buttonStyle} href={dashboardUrl}>
            Review in the dashboard →
          </Button>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            This request satisfies the App Store requirement that an employee can initiate account
            deletion from within the app. You remain in control of when and how the account is
            offboarded.
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

export default AccountDeletionRequestEmail;
