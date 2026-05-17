// IMPORTANT: This template MUST NOT include the internal revoke reason.
// The reason stays in the audit log for hiring debriefs only — see
// memory/feedback_rejection_email_internal_reason.md.

import { Html, Head, Body, Container, Text, Hr } from "@react-email/components";

interface OfferRevokedEmailProps {
  candidateName: string;
  orgName: string;
  roleTitle: string;
}

export function OfferRevokedEmail({
  candidateName = "Candidate",
  orgName = "Company",
  roleTitle = "the role",
}: OfferRevokedEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={headingStyle}>An update on your offer</Text>

          <Text style={textStyle}>
            Hi <strong>{candidateName}</strong>,
          </Text>
          <Text style={textStyle}>
            We&rsquo;re reaching out about the offer we extended for{" "}
            <strong>{roleTitle}</strong> at <strong>{orgName}</strong>. Unfortunately, we have to
            withdraw the offer at this time.
          </Text>
          <Text style={textStyle}>
            We know this is disappointing news and we apologise for any inconvenience caused.
            We genuinely appreciated the time you invested in our process and we wish you the
            very best in your next role.
          </Text>
          <Text style={textStyle}>
            If you have any questions, please reply to this email.
          </Text>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            Sent by {orgName} via JambaHire.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle = { backgroundColor: "#f5f5f7", fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif", padding: "24px 0" };
const containerStyle = { maxWidth: "560px", margin: "0 auto", backgroundColor: "#ffffff", padding: "32px", borderRadius: "12px" };
const headingStyle = { fontSize: "20px", fontWeight: 700, color: "#0f172a", margin: "0 0 16px" };
const textStyle = { fontSize: "14px", lineHeight: "22px", color: "#334155", margin: "0 0 12px" };
const footerStyle = { fontSize: "12px", color: "#94a3b8", margin: "0" };
const hrStyle = { borderColor: "#e2e8f0", margin: "24px 0 12px" };
