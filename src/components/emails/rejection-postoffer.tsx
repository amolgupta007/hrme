// IMPORTANT: This template MUST NOT include the internal rejection_reason.
// The reason stays in the audit log for hiring debriefs only — see
// memory/feedback_rejection_email_internal_reason.md.
//
// Used for the rare case where the application is rejected directly from
// the Offer stage (admin rescinding before offer accept/decline). For a
// distinct "we sent it, now we're pulling it back" tone, see offer-revoked.tsx.

import { Html, Head, Body, Container, Text, Hr } from "@react-email/components";

interface RejectionPostOfferEmailProps {
  candidateName: string;
  orgName: string;
  roleTitle: string;
}

export function RejectionPostOfferEmail({
  candidateName = "Candidate",
  orgName = "Company",
  roleTitle = "the role",
}: RejectionPostOfferEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={headingStyle}>Update on the {roleTitle} role</Text>

          <Text style={textStyle}>
            Hi <strong>{candidateName}</strong>,
          </Text>
          <Text style={textStyle}>
            Thank you for the time you spent with us throughout the process for{" "}
            <strong>{roleTitle}</strong> at <strong>{orgName}</strong>. After a final round of
            internal discussions, we&rsquo;ve made the difficult decision not to move forward.
          </Text>
          <Text style={textStyle}>
            We know how much went into your application and we&rsquo;re grateful you trusted us
            with it. We&rsquo;d genuinely welcome the chance to consider you for future roles, so
            please feel free to stay in touch.
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
