import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
} from "@react-email/components";

interface UpgradePushEmailProps {
  orgName: string;
  ownerFirstName: string;
  employeeCount: number;
  upgradeUrl: string;
}

export function UpgradePushEmail({
  orgName = "your company",
  ownerFirstName = "there",
  employeeCount = 0,
  upgradeUrl = "https://jambahr.com/dashboard/settings#billing",
}: UpgradePushEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={brandStyle}>
            Jamba<span style={{ color: "#0d9488" }}>HR</span>
          </Text>

          <Text style={badgeStyle}>Week 1 complete 🎉</Text>

          <Text style={headingStyle}>
            {ownerFirstName}, you&apos;ve been on JambaHR for a week
          </Text>

          <Text style={textStyle}>
            {employeeCount > 0
              ? `You've set up ${orgName} with ${employeeCount} employee${employeeCount > 1 ? "s" : ""}. Nice start.`
              : `Your workspace for ${orgName} is ready and waiting.`}{" "}
            Here&apos;s what you&apos;re missing on the free plan:
          </Text>

          {/* Locked features */}
          <Section style={featuresBoxStyle}>
            <Text style={featuresHeadingStyle}>Unlock with Growth — ₹500/employee/month</Text>
            <Text style={featureRowStyle}>📄 <strong>Documents</strong> — store contracts, policies, offer letters with e-acknowledgment</Text>
            <Text style={featureRowStyle}>⭐ <strong>Performance Reviews</strong> — self-assessments, manager reviews, goal tracking</Text>
            <Text style={featureRowStyle}>🎯 <strong>OKRs</strong> — set objectives, track key results, link to reviews</Text>
            <Text style={featureRowStyle}>🎓 <strong>Training & Compliance</strong> — assign courses, track completion, overdue alerts</Text>
            <Text style={featureRowStyle}>🔍 <strong>JambaHire</strong> — full ATS: job postings, pipeline, interviews, offer letters</Text>
          </Section>

          <Button style={buttonStyle} href={upgradeUrl}>
            See Growth plan →
          </Button>

          <Text style={nudgeStyle}>
            Still on the fence? Reply to this email and I&apos;ll walk you through what makes sense for your team size.
          </Text>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            You&apos;re on the JambaHR Starter plan (free, up to 10 employees).{"\n"}
            {orgName} · jambahr.com
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle = {
  backgroundColor: "#f8f9fa",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const containerStyle = {
  margin: "0 auto",
  padding: "32px 24px",
  maxWidth: "520px",
};

const brandStyle = {
  fontSize: "20px",
  fontWeight: "800" as const,
  color: "#1a1a2e",
  marginBottom: "20px",
};

const badgeStyle = {
  display: "inline-block",
  backgroundColor: "#d1fae5",
  color: "#065f46",
  fontSize: "11px",
  fontWeight: "600" as const,
  padding: "3px 10px",
  borderRadius: "9999px",
  marginBottom: "16px",
};

const headingStyle = {
  fontSize: "20px",
  fontWeight: "700" as const,
  color: "#1a1a2e",
  marginBottom: "12px",
};

const textStyle = {
  fontSize: "14px",
  color: "#4a4a5a",
  lineHeight: "1.7",
  marginBottom: "20px",
};

const featuresBoxStyle = {
  backgroundColor: "#ffffff",
  borderRadius: "10px",
  border: "1px solid #e5e7eb",
  padding: "20px 24px",
  margin: "0 0 24px 0",
};

const featuresHeadingStyle = {
  fontSize: "12px",
  fontWeight: "700" as const,
  color: "#0d9488",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  marginBottom: "14px",
  marginTop: "0",
};

const featureRowStyle = {
  fontSize: "13px",
  color: "#374151",
  margin: "8px 0",
  lineHeight: "1.5",
};

const buttonStyle = {
  backgroundColor: "#0d9488",
  borderRadius: "8px",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "600" as const,
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "12px 24px",
  marginBottom: "20px",
};

const nudgeStyle = {
  fontSize: "13px",
  color: "#6b7280",
  lineHeight: "1.6",
  fontStyle: "italic" as const,
};

const hrStyle = {
  borderColor: "#e5e7eb",
  marginTop: "32px",
};

const footerStyle = {
  fontSize: "11px",
  color: "#9ca3af",
  marginTop: "16px",
  lineHeight: "1.6",
};

export default UpgradePushEmail;
