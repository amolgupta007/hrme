import { Html, Head, Preview, Body, Container, Section, Text, Button, Hr, Img, Row, Column } from "@react-email/components";

interface AttendanceReminderEmailProps {
  firstName: string;
  orgName: string;
  kind: "clock_in" | "clock_out";
  /** The org's reminder time, e.g. "10:15 AM". */
  timeLabel: string;
  attendanceUrl: string;
}

/** Clock-in / clock-out reminder. Styled like SignInOptionsEmail. */
export function AttendanceReminderEmail({
  firstName = "there",
  orgName = "your company",
  kind = "clock_in",
  timeLabel = "10:15 AM",
  attendanceUrl = "https://jambahr.com/dashboard/attendance",
}: AttendanceReminderEmailProps) {
  const isIn = kind === "clock_in";
  return (
    <Html>
      <Head />
      <Preview>{isIn ? "You haven't clocked in yet today." : "You're still clocked in — remember to clock out."}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Row style={{ marginBottom: "24px" }}>
            <Column style={{ width: "48px", verticalAlign: "middle" }}>
              <Img src={LOGO_URL} width="40" height="40" alt="JambaHR" />
            </Column>
            <Column style={{ verticalAlign: "middle" }}>
              <Text style={brandStyle}>
                Jamba<span style={{ color: "#0d9488" }}>HR</span>
              </Text>
            </Column>
          </Row>

          <Text style={headingStyle}>{isIn ? "Don't forget to clock in" : "Don't forget to clock out"}</Text>
          <Text style={textStyle}>
            Hi {firstName},{" "}
            {isIn
              ? `it's ${timeLabel} and we don't see a clock-in from you yet today.`
              : `it's ${timeLabel} and you're still clocked in.`}
          </Text>

          <Section style={cardStyle}>
            <Text style={stepStyle}>
              {isIn ? (
                <>
                  If you&apos;re working today, <strong>clock in now</strong> on jambahr.com or the
                  JambaHR app so your attendance is recorded correctly.
                </>
              ) : (
                <>
                  If you&apos;ve finished for the day, <strong>clock out now</strong>. Otherwise the
                  system closes your day automatically at midnight, which may not match the hours
                  you actually worked.
                </>
              )}
            </Text>
            <Text style={noteStyle}>
              {isIn
                ? "On leave or not working today? You can ignore this email."
                : "Still working? You can ignore this email and clock out when you're done."}
            </Text>
          </Section>

          <Button style={buttonStyle} href={attendanceUrl}>
            {isIn ? "Clock in now →" : "Clock out now →"}
          </Button>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            Sent by JambaHR on behalf of {orgName}. Your HR admin sets when these reminders go out.{"\n"}
            JambaHR · jambahr.com
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// Served from the live site; emails need an absolute URL.
const LOGO_URL = "https://jambahr.com/Jamba-s.png";

const bodyStyle = {
  backgroundColor: "#f8f9fa",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};
const containerStyle = { margin: "0 auto", padding: "32px 24px", maxWidth: "560px" };
const brandStyle = { fontSize: "22px", fontWeight: "800" as const, color: "#1a1a2e", margin: "0" };
const headingStyle = { fontSize: "22px", fontWeight: "700" as const, color: "#1a1a2e", marginBottom: "12px" };
const textStyle = { fontSize: "14px", color: "#4a4a5a", lineHeight: "1.6", marginBottom: "16px" };
const cardStyle = {
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  border: "1px solid #e5e7eb",
  padding: "14px 20px",
  margin: "0 0 14px 0",
};
const stepStyle = { fontSize: "14px", color: "#374151", lineHeight: "1.5", margin: "4px 0" };
const noteStyle = { fontSize: "13px", color: "#6b7280", lineHeight: "1.5", margin: "10px 0 0 0" };
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
  margin: "20px 0 24px 0",
};
const hrStyle = { borderColor: "#e5e7eb", marginTop: "32px" };
const footerStyle = { fontSize: "12px", color: "#9ca3af", marginTop: "16px", lineHeight: "1.6" };

export default AttendanceReminderEmail;
