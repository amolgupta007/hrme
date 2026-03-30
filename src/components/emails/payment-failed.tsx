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

interface PaymentFailedEmailProps {
  orgName: string;
  planName: string;
  paymentId: string;
  amount?: string;
  dashboardUrl: string;
}

export function PaymentFailedEmail({
  orgName = "Your Company",
  planName = "Growth",
  paymentId = "pay_xxx",
  amount,
  dashboardUrl = "https://jambahr.com/dashboard/settings",
}: PaymentFailedEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={alertBadgeStyle}>⚠ Payment Failed</Text>
          <Text style={headingStyle}>Action Required: Payment Failed</Text>
          <Text style={textStyle}>
            Hi, a subscription payment for <strong>{orgName}</strong> has failed.
            Your <strong>{planName}</strong> plan access may be interrupted if this
            is not resolved.
          </Text>

          <Section style={detailsStyle}>
            <Text style={detailRowStyle}>
              <strong>Plan:</strong> {planName}
            </Text>
            <Text style={detailRowStyle}>
              <strong>Payment ID:</strong> {paymentId}
            </Text>
            {amount && (
              <Text style={detailRowStyle}>
                <strong>Amount:</strong> {amount}
              </Text>
            )}
          </Section>

          <Text style={textStyle}>
            Please update your payment method or retry the payment from your
            billing settings to avoid service disruption.
          </Text>

          <Button style={buttonStyle} href={dashboardUrl}>
            Go to Billing Settings
          </Button>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            This is an automated billing notification from JambaHR. If you
            believe this is an error, please contact support.
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

const alertBadgeStyle = {
  display: "inline-block",
  backgroundColor: "#fef3c7",
  color: "#92400e",
  fontSize: "12px",
  fontWeight: "600" as const,
  padding: "4px 10px",
  borderRadius: "9999px",
  marginBottom: "12px",
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
  lineHeight: "1.6",
  marginBottom: "16px",
};

const detailsStyle = {
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  border: "1px solid #fca5a5",
  padding: "16px 20px",
  margin: "20px 0",
};

const detailRowStyle = {
  fontSize: "14px",
  color: "#4a4a5a",
  margin: "4px 0",
};

const buttonStyle = {
  backgroundColor: "#ef4444",
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

export default PaymentFailedEmail;
