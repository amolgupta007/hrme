import { Html, Head, Body, Container, Text, Button, Hr, Section } from "@react-email/components";

interface LoiInviteEmailProps {
  candidateName: string;
  orgName: string;
  roleTitle: string;
  loiUrl: string;     // /loi/[token]
  expiresInDays?: number;
}

export function LoiInviteEmail({
  candidateName = "Candidate",
  orgName = "Company",
  roleTitle = "the role",
  loiUrl = "https://jambahr.com/loi/token",
  expiresInDays = 7,
}: LoiInviteEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={headingStyle}>You&rsquo;ve been shortlisted</Text>

          <Text style={textStyle}>
            Hi <strong>{candidateName}</strong>,
          </Text>
          <Text style={textStyle}>
            Good news — the team at <strong>{orgName}</strong> reviewed your application for{" "}
            <strong>{roleTitle}</strong> and would like to invite you to the interview process.
          </Text>
          <Text style={textStyle}>
            Before we schedule anything, please let us know whether you&rsquo;re still interested
            in moving forward. This link expires in <strong>{expiresInDays} days</strong>.
          </Text>

          <Section style={buttonRowStyle}>
            <Button style={acceptButtonStyle} href={`${loiUrl}?response=accept`}>
              Yes, I&rsquo;m interested
            </Button>
            <Button style={declineButtonStyle} href={`${loiUrl}?response=decline`}>
              No, not at this time
            </Button>
          </Section>

          <Text style={smallTextStyle}>
            If the buttons don&rsquo;t work, copy this link into your browser: <br />
            <a href={loiUrl} style={linkStyle}>{loiUrl}</a>
          </Text>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            Sent by {orgName} via JambaHire. Reply directly with questions.
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
const smallTextStyle = { fontSize: "12px", lineHeight: "18px", color: "#64748b", margin: "16px 0 0" };
const linkStyle = { color: "#4f46e5", textDecoration: "underline", wordBreak: "break-all" as const };
const buttonRowStyle = { textAlign: "center" as const, margin: "20px 0 8px" };
const acceptButtonStyle = { backgroundColor: "#16a34a", color: "#fff", padding: "10px 18px", borderRadius: "6px", textDecoration: "none", fontWeight: 600, fontSize: "13px", marginRight: "10px" };
const declineButtonStyle = { backgroundColor: "#ffffff", color: "#334155", border: "1px solid #cbd5e1", padding: "10px 18px", borderRadius: "6px", textDecoration: "none", fontWeight: 600, fontSize: "13px" };
const footerStyle = { fontSize: "12px", color: "#94a3b8", margin: "0" };
const hrStyle = { borderColor: "#e2e8f0", margin: "24px 0 12px" };
