import { Html, Head, Body, Container, Text, Hr } from "@react-email/components";

interface CandidateAckEmailProps {
  candidateName: string;
  orgName: string;
  roleTitle: string;
}

export function CandidateAckEmail({
  candidateName = "Candidate",
  orgName = "Company",
  roleTitle = "the role",
}: CandidateAckEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={headingStyle}>Thanks for applying</Text>

          <Text style={textStyle}>
            Hi <strong>{candidateName}</strong>,
          </Text>
          <Text style={textStyle}>
            Thanks for applying to <strong>{roleTitle}</strong> at <strong>{orgName}</strong>.
            We&rsquo;ve received your application and our team has started reviewing it.
          </Text>
          <Text style={textStyle}>
            We&rsquo;ll be in touch within the next few days with next steps. If you have any
            questions in the meantime, just reply to this email.
          </Text>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            Sent by {orgName} via JambaHire. Reply directly to reach the hiring team.
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
