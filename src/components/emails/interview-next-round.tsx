import { Html, Head, Body, Container, Text, Hr } from "@react-email/components";

interface InterviewNextRoundEmailProps {
  candidateName: string;
  orgName: string;
  roleTitle: string;
  roundLabel: string; // e.g. "Round 2", "Final round"
}

export function InterviewNextRoundEmail({
  candidateName = "Candidate",
  orgName = "Company",
  roleTitle = "the role",
  roundLabel = "the next round",
}: InterviewNextRoundEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={headingStyle}>You&rsquo;re advancing to {roundLabel}</Text>

          <Text style={textStyle}>
            Hi <strong>{candidateName}</strong>,
          </Text>
          <Text style={textStyle}>
            Great news — the team enjoyed your last conversation and we&rsquo;d like to move you
            forward to <strong>{roundLabel}</strong> for the <strong>{roleTitle}</strong> role at{" "}
            <strong>{orgName}</strong>.
          </Text>
          <Text style={textStyle}>
            We&rsquo;ll send a separate calendar invite with the interviewer details and timing
            shortly. Reply here if you have scheduling constraints.
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
