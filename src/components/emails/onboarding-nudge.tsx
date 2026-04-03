import {
  Html,
  Head,
  Body,
  Container,
  Text,
  Button,
  Hr,
} from "@react-email/components";

interface OnboardingNudgeEmailProps {
  orgName: string;
  ownerFirstName: string;
  day: 1 | 3 | 5;
  subject: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
}

const DAY_CONFIG = {
  1: {
    badge: "Day 1",
    badgeColor: "#dbeafe",
    badgeText: "#1e40af",
  },
  3: {
    badge: "Day 3",
    badgeColor: "#ede9fe",
    badgeText: "#5b21b6",
  },
  5: {
    badge: "Day 5",
    badgeColor: "#fef3c7",
    badgeText: "#92400e",
  },
};

export function OnboardingNudgeEmail({
  orgName = "your company",
  ownerFirstName = "there",
  day = 1,
  heading = "One quick thing",
  body = "",
  ctaLabel = "Open JambaHR",
  ctaUrl = "https://jambahr.com/dashboard",
}: OnboardingNudgeEmailProps) {
  const config = DAY_CONFIG[day];

  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={brandStyle}>
            Jamba<span style={{ color: "#0d9488" }}>HR</span>
          </Text>

          <Text style={{ ...badgeStyle, backgroundColor: config.badgeColor, color: config.badgeText }}>
            {config.badge} check-in
          </Text>

          <Text style={headingStyle}>
            {ownerFirstName}, {heading}
          </Text>

          <Text style={textStyle}>{body}</Text>

          <Button style={buttonStyle} href={ctaUrl}>
            {ctaLabel} →
          </Button>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            You&apos;re receiving this because you signed up for JambaHR with {orgName}.{"\n"}
            Questions? Reply to this email.
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
  textTransform: "capitalize" as const,
};

const textStyle = {
  fontSize: "14px",
  color: "#4a4a5a",
  lineHeight: "1.7",
  marginBottom: "24px",
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

export default OnboardingNudgeEmail;
