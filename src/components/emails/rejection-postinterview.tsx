// IMPORTANT: This template MUST NOT include the internal rejection_reason.
// The reason stays in the audit log for hiring debriefs only — see
// memory/feedback_rejection_email_internal_reason.md.

import { Html, Head, Body, Container, Text, Hr } from "@react-email/components";

interface RejectionPostInterviewEmailProps {
  candidateName: string;
  orgName: string;
  roleTitle: string;
}

export function RejectionPostInterviewEmail({
  candidateName = "Candidate",
  orgName = "Company",
  roleTitle = "the role",
}: RejectionPostInterviewEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={headingStyle}>Thank you for interviewing with us</Text>

          <Text style={textStyle}>
            Hi <strong>{candidateName}</strong>,
          </Text>
          <Text style={textStyle}>
            Thank you for taking the time to interview for <strong>{roleTitle}</strong> at{" "}
            <strong>{orgName}</strong>. We really appreciated getting to know you and learning
            about your work.
          </Text>
          <Text style={textStyle}>
            After careful consideration, we&rsquo;ve decided not to move forward with your
            candidacy at this time. This was a difficult decision — we had several strong
            candidates and many factors went into the final call.
          </Text>
          <Text style={textStyle}>
            We&rsquo;d genuinely like to stay in touch. If a future role looks like a fit,
            we&rsquo;ll reach out — and please feel free to apply again down the road.
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
