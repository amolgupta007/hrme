import { Html, Head, Body, Container, Text, Button, Hr, Section } from "@react-email/components";

interface DocumentIssuedEmailProps {
  employeeName: string;
  entityName: string;
  documentTitle: string;
  ackUrl: string; // /documents/ack/[token]
}

export function DocumentIssuedEmail({
  employeeName = "there",
  entityName = "your employer",
  documentTitle = "Letter of Appointment",
  ackUrl = "https://jambahr.com/documents/ack/token",
}: DocumentIssuedEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={headingStyle}>{documentTitle}</Text>

          <Text style={textStyle}>
            Hi <strong>{employeeName}</strong>,
          </Text>
          <Text style={textStyle}>
            <strong>{entityName}</strong> has issued you a <strong>{documentTitle}</strong>. Please
            review it and confirm your acknowledgement using the button below.
          </Text>

          <Section style={buttonRowStyle}>
            <Button style={buttonStyle} href={ackUrl}>
              Review &amp; acknowledge
            </Button>
          </Section>

          <Text style={smallTextStyle}>
            If the button doesn&rsquo;t work, copy this link into your browser: <br />
            <a href={ackUrl} style={linkStyle}>{ackUrl}</a>
          </Text>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            Sent by {entityName} via JambaHR. This acknowledgement records receipt and agreement — it
            is not a digitally certified signature.
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
const buttonStyle = { backgroundColor: "#0d9488", color: "#fff", padding: "11px 22px", borderRadius: "6px", textDecoration: "none", fontWeight: 600, fontSize: "13px" };
const footerStyle = { fontSize: "12px", color: "#94a3b8", margin: "0" };
const hrStyle = { borderColor: "#e2e8f0", margin: "24px 0 12px" };
