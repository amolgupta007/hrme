import { Html, Head, Body, Container, Section, Text, Button, Hr } from "@react-email/components";

interface SignInOptionsEmailProps {
  firstName: string;
  orgName: string;
  email: string;
  signInUrl: string;
}

/**
 * One-off "here are all the ways you can sign in" email. Accounts are created
 * for employees up front without a password, so most staff only ever saw the
 * emailed code. Copy mirrors the live jambahr.com/sign-in card exactly:
 * Email address (+ "Use phone" link), Password (+ "Forgot password?"), Continue.
 */
export function SignInOptionsEmail({
  firstName = "there",
  orgName = "your company",
  email = "you@company.com",
  signInUrl = "https://jambahr.com/sign-in",
}: SignInOptionsEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={brandStyle}>
            Jamba<span style={{ color: "#0d9488" }}>HR</span>
          </Text>

          <Text style={headingStyle}>Three ways to sign in to JambaHR</Text>
          <Text style={textStyle}>
            Hi {firstName}, {orgName} uses JambaHR for attendance, leave and payslips. You
            don&apos;t have to wait for an email code every time — here are all the ways to
            sign in at <strong>jambahr.com/sign-in</strong>.
          </Text>

          {/* 1 — email code */}
          <Section style={cardStyle}>
            <Text style={cardHeadingStyle}>1 · Email + one-time code</Text>
            <Text style={stepStyle}>1. Go to jambahr.com/sign-in.</Text>
            <Text style={stepStyle}>
              2. In <strong>Email address</strong>, type <strong>{email}</strong>.
            </Text>
            <Text style={stepStyle}>
              3. Leave <strong>Password</strong> empty and click <strong>Continue</strong>.
            </Text>
            <Text style={stepStyle}>4. Enter the 6-digit code we email you.</Text>
          </Section>

          {/* 2 — phone code */}
          <Section style={cardStyle}>
            <Text style={cardHeadingStyle}>2 · Mobile number + SMS code</Text>
            <Text style={stepStyle}>1. Go to jambahr.com/sign-in.</Text>
            <Text style={stepStyle}>
              2. Click <strong>Use phone</strong> (top right of the Email address box).
            </Text>
            <Text style={stepStyle}>
              3. Enter the mobile number registered with your HR admin and click{" "}
              <strong>Continue</strong>.
            </Text>
            <Text style={stepStyle}>4. Enter the 6-digit code we text you.</Text>
          </Section>

          {/* 3 — password */}
          <Section style={cardStyle}>
            <Text style={cardHeadingStyle}>3 · Email + password (after you set one)</Text>
            <Text style={stepStyle}>
              Your account doesn&apos;t have a password yet. Setting one takes a minute:
            </Text>
            <Text style={stepStyle}>1. Sign in once with option 1 or 2.</Text>
            <Text style={stepStyle}>
              2. Click <strong>Set password</strong> in the bar at the top of the page.
              (Or click your photo at the bottom-left → <strong>Set or change password</strong>.)
            </Text>
            <Text style={stepStyle}>
              3. Under <strong>Password</strong>, click <strong>Set password</strong>, type it
              twice and click <strong>Save</strong>.
            </Text>
            <Text style={stepStyle}>
              From then on: type your email and password on the sign-in page and click{" "}
              <strong>Continue</strong> — no code needed.
            </Text>
            <Text style={noteStyle}>
              Forgot it later? Click <strong>Forgot password?</strong> on the sign-in page and
              we&apos;ll send you a code to reset it.
            </Text>
          </Section>

          <Button style={buttonStyle} href={signInUrl}>
            Go to sign-in →
          </Button>

          <Text style={textStyle}>
            Your password is private — nobody at {orgName} or JambaHR can see it, and
            we&apos;ll never ask you for it or for a sign-in code.
          </Text>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            Wrong email or mobile number? Tell your HR admin.{"\n"}
            JambaHR · jambahr.com
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
const containerStyle = { margin: "0 auto", padding: "32px 24px", maxWidth: "560px" };
const brandStyle = {
  fontSize: "22px",
  fontWeight: "800" as const,
  color: "#1a1a2e",
  marginBottom: "24px",
};
const headingStyle = {
  fontSize: "22px",
  fontWeight: "700" as const,
  color: "#1a1a2e",
  marginBottom: "12px",
};
const textStyle = { fontSize: "14px", color: "#4a4a5a", lineHeight: "1.6", marginBottom: "16px" };
const cardStyle = {
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  border: "1px solid #e5e7eb",
  padding: "14px 20px",
  margin: "0 0 14px 0",
};
const cardHeadingStyle = {
  fontSize: "14px",
  fontWeight: "700" as const,
  color: "#0f766e",
  margin: "0 0 8px 0",
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

export default SignInOptionsEmail;
