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

interface AssistantBudgetAlertEmailProps {
  orgName: string;
  usedInr: number;
  capInr: number;
  kind: "soft" | "hard";
}

export function AssistantBudgetAlertEmail({
  orgName = "Your Company",
  usedInr = 0,
  capInr = 0,
  kind = "soft",
}: AssistantBudgetAlertEmailProps) {
  const isSoft = kind === "soft";

  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={brandStyle}>
            Jamba<span style={{ color: "#0d9488" }}>HR</span>
          </Text>

          <Text style={isSoft ? softBadgeStyle : hardBadgeStyle}>
            {isSoft ? "AI Usage Alert" : "AI Assistant Paused"}
          </Text>

          <Text style={headingStyle}>
            {isSoft
              ? "You've used 80% of this month's AI assistant budget"
              : "Your AI assistant is paused for this month"}
          </Text>

          <Text style={textStyle}>
            {isSoft ? (
              <>
                <strong>{orgName}</strong> has used{" "}
                <strong>₹{usedInr.toLocaleString("en-IN")}</strong> of your{" "}
                <strong>₹{capInr.toLocaleString("en-IN")}</strong> monthly AI
                assistant budget. The assistant keeps working until 100% is
                reached — no action needed right now.
              </>
            ) : (
              <>
                <strong>{orgName}</strong> has reached its monthly AI assistant
                budget of{" "}
                <strong>₹{capInr.toLocaleString("en-IN")}</strong>. The
                assistant is paused for the rest of this month to prevent
                unexpected charges.
              </>
            )}
          </Text>

          <Section style={usageBoxStyle}>
            <Text style={usageLabelStyle}>Monthly usage</Text>
            <Text style={usageAmountStyle}>
              ₹{usedInr.toLocaleString("en-IN")}{" "}
              <span style={usageCapStyle}>
                / ₹{capInr.toLocaleString("en-IN")}
              </span>
            </Text>
          </Section>

          {isSoft ? (
            <Text style={textStyle}>
              If you anticipate heavy usage, you can raise the monthly cap from{" "}
              <strong>Settings → AI Assistant</strong> in your JambaHR
              dashboard.
            </Text>
          ) : (
            <Text style={textStyle}>
              The budget resets at the start of next month. To restore access
              sooner, raise or remove the monthly cap from{" "}
              <strong>Settings → AI Assistant</strong>.
            </Text>
          )}

          <Button
            style={buttonStyle}
            href="https://jambahr.com/dashboard/settings#ai-assistant"
          >
            {isSoft ? "Review AI Settings →" : "Raise the cap →"}
          </Button>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            This is an automated budget notification from JambaHR.{"\n"}
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

const softBadgeStyle = {
  display: "inline-block",
  backgroundColor: "#fef3c7",
  color: "#92400e",
  fontSize: "11px",
  fontWeight: "600" as const,
  padding: "3px 10px",
  borderRadius: "9999px",
  marginBottom: "16px",
};

const hardBadgeStyle = {
  display: "inline-block",
  backgroundColor: "#fee2e2",
  color: "#991b1b",
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

const usageBoxStyle = {
  backgroundColor: "#ffffff",
  borderRadius: "10px",
  border: "1px solid #e5e7eb",
  padding: "16px 24px",
  margin: "0 0 24px 0",
};

const usageLabelStyle = {
  fontSize: "11px",
  fontWeight: "700" as const,
  color: "#0d9488",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  margin: "0 0 6px 0",
};

const usageAmountStyle = {
  fontSize: "24px",
  fontWeight: "700" as const,
  color: "#1a1a2e",
  margin: "0",
};

const usageCapStyle = {
  fontSize: "16px",
  fontWeight: "400",
  color: "#6b7280",
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

export default AssistantBudgetAlertEmail;
