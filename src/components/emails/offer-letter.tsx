import { Html, Head, Body, Container, Section, Text, Button, Hr } from "@react-email/components";

interface OfferLetterEmailProps {
  candidateName: string;
  orgName: string;
  roleTitle: string;
  ctc: number;
  joiningDate: string;
  additionalTerms?: string;
  offerUrl: string;
}

export function OfferLetterEmail({
  candidateName = "Candidate",
  orgName = "Company",
  roleTitle = "Software Engineer",
  ctc = 1000000,
  joiningDate = "2026-04-15",
  additionalTerms,
  offerUrl = "https://jambahr.com/offers/token",
}: OfferLetterEmailProps) {
  const ctcInLakh = (ctc / 100000).toFixed(2);
  const formattedDate = new Date(joiningDate).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={headingStyle}>Offer of Employment</Text>
          <Text style={orgStyle}>{orgName}</Text>

          <Text style={textStyle}>
            Dear <strong>{candidateName}</strong>,
          </Text>
          <Text style={textStyle}>
            We are pleased to extend this offer of employment for the position of{" "}
            <strong>{roleTitle}</strong> at {orgName}.
          </Text>

          <Section style={detailsStyle}>
            <Text style={detailRowStyle}>
              <strong>Role:</strong> {roleTitle}
            </Text>
            <Text style={detailRowStyle}>
              <strong>Annual CTC:</strong> ₹{ctcInLakh} LPA
            </Text>
            <Text style={detailRowStyle}>
              <strong>Joining Date:</strong> {formattedDate}
            </Text>
            {additionalTerms && (
              <Text style={detailRowStyle}>
                <strong>Additional Terms:</strong> {additionalTerms}
              </Text>
            )}
          </Section>

          <Text style={textStyle}>
            Please review the offer details and respond by clicking one of the buttons below.
            This offer is valid for 7 days from the date of this email.
          </Text>

          <Button style={acceptButtonStyle} href={`${offerUrl}?response=accepted`}>
            Accept Offer
          </Button>
          <Button style={declineButtonStyle} href={`${offerUrl}?response=declined`}>
            Decline Offer
          </Button>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            This offer letter was sent via JambaHire. If you have any questions, please contact
            your HR team directly.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle = { backgroundColor: "#f8f9fa", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" };
const containerStyle = { margin: "0 auto", padding: "32px 24px", maxWidth: "560px" };
const headingStyle = { fontSize: "22px", fontWeight: "700" as const, color: "#1a1a2e", marginBottom: "4px" };
const orgStyle = { fontSize: "14px", color: "#6366f1", fontWeight: "600" as const, marginTop: "0", marginBottom: "24px" };
const textStyle = { fontSize: "14px", color: "#4a4a5a", lineHeight: "1.6" };
const detailsStyle = { backgroundColor: "#ffffff", borderRadius: "8px", border: "1px solid #e5e7eb", padding: "16px 20px", margin: "20px 0" };
const detailRowStyle = { fontSize: "14px", color: "#1a1a2e", margin: "6px 0" };
const acceptButtonStyle = { backgroundColor: "#16a34a", borderRadius: "8px", color: "#ffffff", fontSize: "14px", fontWeight: "600" as const, textDecoration: "none", textAlign: "center" as const, display: "inline-block", padding: "12px 24px", marginRight: "12px" };
const declineButtonStyle = { backgroundColor: "#6b7280", borderRadius: "8px", color: "#ffffff", fontSize: "14px", fontWeight: "600" as const, textDecoration: "none", textAlign: "center" as const, display: "inline-block", padding: "12px 24px" };
const hrStyle = { borderColor: "#e5e7eb", marginTop: "32px" };
const footerStyle = { fontSize: "12px", color: "#9ca3af", marginTop: "16px" };

export default OfferLetterEmail;
