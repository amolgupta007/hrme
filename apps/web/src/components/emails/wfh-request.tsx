import { Html, Head, Body, Container, Section, Text, Button, Hr } from "@react-email/components";

/**
 * Two uses, one template:
 *  - kind "request"  → to approvers: someone asked to work from home.
 *  - kind "decision" → to the employee: approved / rejected.
 */
interface WfhEmailProps {
  kind: "request" | "decision";
  employeeName: string;
  /** Pre-formatted, e.g. "Mon 6 Oct, Tue 7 Oct". */
  datesLabel: string;
  reason?: string | null;
  /** request: at least one day is beyond the monthly allowance (admin approval). */
  overQuota?: boolean;
  allowance?: number;
  /** decision only */
  approved?: boolean;
  note?: string | null;
  url: string;
}

export function WfhEmail({
  kind = "request",
  employeeName = "Priya Sharma",
  datesLabel = "Mon 6 Oct",
  reason = null,
  overQuota = false,
  allowance = 2,
  approved = true,
  note = null,
  url = "https://jambahr.com/dashboard/leaves",
}: WfhEmailProps) {
  const isRequest = kind === "request";
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={headingStyle}>
            {isRequest
              ? "Work-from-home request"
              : `Work from home ${approved ? "approved" : "not approved"}`}
          </Text>
          <Text style={textStyle}>
            {isRequest ? (
              <>
                <strong>{employeeName}</strong> has asked to work from home and needs your
                approval.
              </>
            ) : (
              <>
                Hi <strong>{employeeName}</strong>, your work-from-home request was{" "}
                <strong style={{ color: approved ? "#2a9d8f" : "#ef4444" }}>
                  {approved ? "approved" : "not approved"}
                </strong>
                .
              </>
            )}
          </Text>

          <Section style={detailsStyle}>
            <Text style={detailRowStyle}>
              <strong>Day(s):</strong> {datesLabel}
            </Text>
            {isRequest && reason && (
              <Text style={detailRowStyle}>
                <strong>Reason:</strong> {reason}
              </Text>
            )}
            {!isRequest && note && (
              <Text style={detailRowStyle}>
                <strong>Note:</strong> {note}
              </Text>
            )}
          </Section>

          {isRequest && overQuota && (
            <Text style={warnStyle}>
              This goes beyond the {allowance} work-from-home days allowed per month, so it
              needs an admin&apos;s approval.
            </Text>
          )}
          {!isRequest && approved && (
            <Text style={textStyle}>
              Please clock in on JambaHR as usual on {datesLabel.includes(",") ? "those days" : "that day"}.
            </Text>
          )}

          <Button style={buttonStyle} href={url}>
            {isRequest ? "Review request" : "Open JambaHR"}
          </Button>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>Sent by JambaHR on behalf of your organisation.</Text>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle = { backgroundColor: "#f6f9fc", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" };
const containerStyle = { margin: "0 auto", padding: "32px 24px", maxWidth: "560px", backgroundColor: "#ffffff", borderRadius: "8px" };
const headingStyle = { fontSize: "20px", fontWeight: "700" as const, color: "#1a1a2e", marginBottom: "12px" };
const textStyle = { fontSize: "14px", color: "#4a4a5a", lineHeight: "1.6" };
const detailsStyle = { backgroundColor: "#f8fafc", borderRadius: "8px", padding: "12px 16px", margin: "16px 0" };
const detailRowStyle = { fontSize: "14px", color: "#374151", margin: "4px 0" };
const warnStyle = { fontSize: "13px", color: "#92400e", backgroundColor: "#fffbeb", borderRadius: "6px", padding: "10px 12px" };
const buttonStyle = {
  backgroundColor: "#2a9d8f",
  borderRadius: "8px",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "600" as const,
  textDecoration: "none",
  display: "inline-block",
  padding: "10px 20px",
  marginTop: "8px",
};
const hrStyle = { borderColor: "#e5e7eb", marginTop: "24px" };
const footerStyle = { fontSize: "12px", color: "#9ca3af" };

export default WfhEmail;
