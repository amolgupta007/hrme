import { Html, Head, Body, Container, Text, Button, Hr } from "@react-email/components";

interface ManagerShortlistNotifyEmailProps {
  managerName: string;
  candidateName: string;
  roleTitle: string;
  orgName: string;
  pipelineUrl: string;     // deep link to /hire/pipeline (filtered to the job if possible)
}

export function ManagerShortlistNotifyEmail({
  managerName = "there",
  candidateName = "Candidate",
  roleTitle = "the role",
  orgName = "Company",
  pipelineUrl = "https://jambahr.com/hire/pipeline",
}: ManagerShortlistNotifyEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={headingStyle}>Candidate accepted — ready to schedule</Text>

          <Text style={textStyle}>
            Hi <strong>{managerName}</strong>,
          </Text>
          <Text style={textStyle}>
            <strong>{candidateName}</strong> has accepted the Letter of Interest for{" "}
            <strong>{roleTitle}</strong> and is now confirmed as a shortlisted candidate. They&rsquo;re
            ready for the first interview round.
          </Text>

          <Button style={ctaStyle} href={pipelineUrl}>
            Open pipeline
          </Button>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            Sent from {orgName} via JambaHire.
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
const ctaStyle = { display: "inline-block", backgroundColor: "#4f46e5", color: "#ffffff", padding: "10px 18px", borderRadius: "6px", textDecoration: "none", fontWeight: 600, fontSize: "13px", marginTop: "8px" };
const footerStyle = { fontSize: "12px", color: "#94a3b8", margin: "0" };
const hrStyle = { borderColor: "#e2e8f0", margin: "24px 0 12px" };
