import { Html, Head, Body, Container, Text, Button, Hr, Section } from "@react-email/components";

interface ContractorAgreementEmailProps {
  contractorName: string;
  orgName: string;
  title: string;
  agreementUrl: string;
}

export function ContractorAgreementEmail({
  contractorName = "Contractor",
  orgName = "Company",
  title = "Agreement",
  agreementUrl = "https://jambahr.com/agreements/token",
}: ContractorAgreementEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={headingStyle}>Action required: Please sign your agreement</Text>

          <Text style={textStyle}>
            Hi <strong>{contractorName}</strong>,
          </Text>
          <Text style={textStyle}>
            <strong>{orgName}</strong> has sent you <strong>{title}</strong> to review and sign.
            Please read the agreement carefully before signing.
          </Text>
          <Text style={textStyle}>
            Click the button below to review the full agreement and add your signature.
          </Text>

          <Section style={buttonRowStyle}>
            <Button style={primaryButtonStyle} href={agreementUrl}>
              Review &amp; Sign Agreement
            </Button>
          </Section>

          <Text style={smallTextStyle}>
            Or use this one-click sign link (by clicking you confirm you have read and agree to the terms):{" "}
            <a href={`${agreementUrl}?response=sign`} style={linkStyle}>
              Sign directly
            </a>
          </Text>

          <Text style={smallTextStyle}>
            If the buttons don&rsquo;t work, copy this link into your browser: <br />
            <a href={agreementUrl} style={linkStyle}>{agreementUrl}</a>
          </Text>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            Sent by {orgName} via JambaHR. Reply directly with questions.
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
const linkStyle = { color: "#0d9488", textDecoration: "underline", wordBreak: "break-all" as const };
const buttonRowStyle = { textAlign: "center" as const, margin: "20px 0 8px" };
const primaryButtonStyle = { backgroundColor: "#0d9488", color: "#fff", padding: "10px 24px", borderRadius: "6px", textDecoration: "none", fontWeight: 600, fontSize: "13px" };
const footerStyle = { fontSize: "12px", color: "#94a3b8", margin: "0" };
const hrStyle = { borderColor: "#e2e8f0", margin: "24px 0 12px" };
