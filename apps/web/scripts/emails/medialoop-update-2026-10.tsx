// Sample names in the UI previews are fictional on purpose — never real staff.
// One-off product-update email to Medialoop staff (Oct 2026): the features
// built on their request. The "screenshots" are HTML replicas of the real UI —
// no images to be blocked, and they render in every mail client. Tables +
// inline styles only (Outlook ignores flexbox).
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Row,
  Column,
  Text,
  Button,
  Img,
  Hr,
} from "@react-email/components";

const LOGO_URL = "https://jambahr.com/Jamba-s.png";

export function MedialoopUpdateEmail({ firstName = "there" }: { firstName?: string }) {
  return (
    <Html>
      <Head />
      <Preview>You asked, we built it: clock in again, work from home requests and more.</Preview>
      <Body style={body}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Row>
              <Column style={{ width: "44px", verticalAlign: "middle" }}>
                <Img src={LOGO_URL} width="36" height="36" alt="JambaHR" />
              </Column>
              <Column style={{ verticalAlign: "middle" }}>
                <Text style={brand}>
                  Jamba<span style={{ color: "#0d9488" }}>HR</span>
                </Text>
              </Column>
              <Column align="right" style={{ verticalAlign: "middle" }}>
                <Text style={pill}>What&apos;s new · October</Text>
              </Column>
            </Row>
          </Section>

          {/* Hero */}
          <Section style={hero}>
            <Text style={eyebrow}>You asked. We built it.</Text>
            <Text style={h1}>New in JambaHR for Medialoop</Text>
            <Text style={lead}>
              Hi {firstName}, over the last few days your team shared what would make JambaHR work
              better day to day. We listened, built it, and it&apos;s live now. Here&apos;s what
              changed and where to find it.
            </Text>
          </Section>

          {/* 1. Clock in again */}
          <Feature
            n="1"
            title="Step out? Clock in again"
            body={
              <>
                Heading out for lunch, an errand or a client meeting? Clock out and clock back in as
                many times as you need, right up to the end of the day. Only the time you&apos;re
                clocked in counts towards your hours, and your first clock-in is still your arrival
                time.
              </>
            }
            where="Attendance → Today's Status"
          >
            <Mock>
              <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
                <tbody>
                  <tr>
                    <td>
                      <div style={mockLabel}>Today&apos;s Status</div>
                      <div style={timer}>05:42:18</div>
                      <div style={mockMuted}>Back in at 2:15 pm · first in at 9:58 am</div>
                    </td>
                    <td align="right" style={{ verticalAlign: "top" }}>
                      <span style={btnRed}>Clock Out</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div style={divider} />
              <div style={mockLabel}>Today&apos;s sessions</div>
              <SessionRow label="Session 1" range="9:58 am → 1:30 pm" right="3h 32m" />
              <SessionRow label="Session 2" range="2:15 pm → now" right="Active" active />
            </Mock>
          </Feature>

          {/* 2. Work from home */}
          <Feature
            n="2"
            title="Work from home, approved in advance"
            body={
              <>
                Need a day at home? Request it on JambaHR. Office colleagues get{" "}
                <strong>2 work-from-home days a month</strong>, approved by your reporting manager.
                You can request the same day, and you&apos;ll see how many you have left. Need more?
                You can still ask, and an admin will review it. On a WFH day, just clock in as
                usual. Colleagues who work remotely full time don&apos;t need to request anything.
              </>
            }
            where="Leaves → Work from home → Request WFH"
          >
            <Mock>
              <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
                <tbody>
                  <tr>
                    <td>
                      <div style={mockTitle}>🏠 Work from home</div>
                      <div style={mockMuted}>
                        <strong style={{ color: "#111827" }}>1 of 2</strong> used this month
                      </div>
                    </td>
                    <td align="right" style={{ verticalAlign: "top" }}>
                      <span style={btnOutline}>+ Request WFH</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div style={divider} />
              <ListRow left="Fri, 3 Oct" chip="Approved" chipStyle={chipGreen} />
              <ListRow left="Thu, 9 Oct" chip="Pending" chipStyle={chipAmber} />
            </Mock>
          </Feature>

          {/* 3. Dashboard */}
          <Feature
            n="3"
            title="See who's home and what's coming up"
            body={
              <>
                Your dashboard now shows who&apos;s working from home over the next week, so
                you&apos;ll know before you plan that in-person meeting. Right next to it:
                upcoming birthdays and work anniversaries, so no one&apos;s big day slips by.
              </>
            }
            where="Dashboard"
          >
            <Mock>
              <div style={mockTitle}>Working from home · next 7 days</div>
              <ListRow left="Tomorrow" right="Rohan, Neha" />
              <ListRow left="Mon, 6 Oct" right="Kabir" />
              <div style={{ height: "14px" }} />
              <div style={mockTitle}>Birthdays &amp; work anniversaries</div>
              <ListRow left="🎂 Birthday" right="Aisha" chip="Today" chipStyle={chipAmber} />
              <ListRow left="🎉 5 years" right="Vikram" chip="Thu, 9 Oct" chipStyle={chipGrey} />
            </Mock>
          </Feature>

          {/* 4. Remote */}
          <Feature
            n="4"
            title="Know who's remote"
            body={
              <>
                Colleagues who work remotely full time now carry a <strong>Remote</strong> badge in
                the Directory and on attendance, so it&apos;s clear who&apos;s in the office and
                who isn&apos;t.
              </>
            }
            where="Directory · Attendance"
          >
            <Mock>
              <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
                <tbody>
                  <tr>
                    <td style={{ width: "40px" }}>
                      <span style={avatar}>MK</span>
                    </td>
                    <td>
                      <span style={{ fontSize: "14px", fontWeight: 600, color: "#111827" }}>Meera Kapoor</span>
                      &nbsp;&nbsp;<span style={chipViolet}>⌂ Remote</span>
                      <div style={mockMuted}>Content Strategist</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </Mock>
          </Feature>

          {/* Closing */}
          <Section style={closing}>
            <Text style={h2}>Built around how you work</Text>
            <Text style={text}>
              Every one of these started as a request from your team. Keep them coming: if something
              in JambaHR could work better for you, tell your admin or use{" "}
              <strong>Send feedback</strong> from your profile menu. We read every one.
            </Text>
            <Button style={cta} href="https://jambahr.com/dashboard">
              Open JambaHR →
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            Questions about these features? Please reach out to your admins.{"\n"}
            JambaHR · jambahr.com
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// ---- Building blocks -------------------------------------------------------

function Feature({
  n,
  title,
  body: copy,
  where,
  children,
}: {
  n: string;
  title: string;
  body: React.ReactNode;
  where: string;
  children: React.ReactNode;
}) {
  return (
    <Section style={feature}>
      <Row>
        <Column style={{ width: "40px", verticalAlign: "top" }}>
          <span style={badgeNum}>{n}</span>
        </Column>
        <Column style={{ verticalAlign: "top" }}>
          <Text style={h3}>{title}</Text>
          <Text style={text}>{copy}</Text>
        </Column>
      </Row>
      {children}
      <Text style={whereStyle}>📍 Find it in: {where}</Text>
    </Section>
  );
}

function Mock({ children }: { children: React.ReactNode }) {
  return (
    <div style={mockFrame}>
      <div style={mockBar}>
        <span style={dot("#f87171")} />
        <span style={dot("#fbbf24")} />
        <span style={dot("#34d399")} />
        <span style={{ fontSize: "11px", color: "#9ca3af", marginLeft: "8px" }}>jambahr.com</span>
      </div>
      <div style={mockBody}>{children}</div>
    </div>
  );
}

function SessionRow({ label, range, right, active }: { label: string; range: string; right: string; active?: boolean }) {
  return (
    <table width="100%" cellPadding={0} cellSpacing={0} role="presentation" style={{ marginTop: "6px" }}>
      <tbody>
        <tr>
          <td style={{ fontSize: "13px", color: "#6b7280", width: "30%" }}>{label}</td>
          <td style={{ fontSize: "13px", color: "#111827", fontFamily: "ui-monospace, Menlo, monospace" }}>{range}</td>
          <td align="right" style={{ fontSize: "13px", fontWeight: 600, color: active ? "#0d9488" : "#111827" }}>
            {right}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function ListRow({
  left,
  right,
  chip,
  chipStyle,
}: {
  left: string;
  right?: string;
  chip?: string;
  chipStyle?: React.CSSProperties;
}) {
  return (
    <table width="100%" cellPadding={0} cellSpacing={0} role="presentation" style={{ borderTop: "1px solid #f1f5f9", marginTop: "6px" }}>
      <tbody>
        <tr>
          <td style={{ fontSize: "13px", color: "#6b7280", padding: "7px 0", width: "34%" }}>{left}</td>
          <td style={{ fontSize: "13px", color: "#111827", padding: "7px 0" }}>{right ?? ""}</td>
          <td align="right" style={{ padding: "7px 0" }}>
            {chip && <span style={chipStyle}>{chip}</span>}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// ---- Styles ----------------------------------------------------------------

const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const body = { backgroundColor: "#f3f4f6", fontFamily: font, margin: 0, padding: "24px 0" };
const container = { maxWidth: "600px", margin: "0 auto", backgroundColor: "#ffffff", borderRadius: "14px", overflow: "hidden" as const };
const header = { padding: "20px 28px", borderBottom: "1px solid #f1f5f9" };
const brand = { fontSize: "20px", fontWeight: 800, color: "#1a1a2e", margin: 0 };
const pill = {
  display: "inline-block",
  margin: 0,
  fontSize: "11px",
  fontWeight: 600,
  color: "#0f766e",
  backgroundColor: "#ccfbf1",
  borderRadius: "999px",
  padding: "4px 10px",
};
const hero = {
  padding: "32px 28px 24px",
  background: "linear-gradient(135deg, #f0fdfa 0%, #fff7ed 100%)",
  backgroundColor: "#f0fdfa",
};
const eyebrow = { fontSize: "13px", fontWeight: 700, color: "#ea580c", letterSpacing: "0.04em", textTransform: "uppercase" as const, margin: "0 0 6px" };
const h1 = { fontSize: "26px", lineHeight: "1.25", fontWeight: 800, color: "#111827", margin: "0 0 12px" };
const lead = { fontSize: "15px", lineHeight: "1.65", color: "#374151", margin: 0 };
const feature = { padding: "26px 28px 8px" };
const badgeNum = {
  display: "inline-block",
  width: "28px",
  height: "28px",
  lineHeight: "28px",
  textAlign: "center" as const,
  borderRadius: "999px",
  backgroundColor: "#0d9488",
  color: "#ffffff",
  fontSize: "13px",
  fontWeight: 700,
};
const h3 = { fontSize: "17px", fontWeight: 700, color: "#111827", margin: "2px 0 6px" };
const h2 = { fontSize: "19px", fontWeight: 800, color: "#111827", margin: "0 0 8px" };
const text = { fontSize: "14px", lineHeight: "1.65", color: "#4b5563", margin: "0 0 12px" };
const whereStyle = { fontSize: "12px", color: "#0f766e", fontWeight: 600, margin: "10px 0 0" };
const mockFrame = {
  border: "1px solid #e5e7eb",
  borderRadius: "10px",
  overflow: "hidden" as const,
  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.08)",
  marginTop: "6px",
};
const mockBar = { backgroundColor: "#f8fafc", borderBottom: "1px solid #e5e7eb", padding: "7px 10px" };
const dot = (c: string) => ({
  display: "inline-block",
  width: "8px",
  height: "8px",
  borderRadius: "999px",
  backgroundColor: c,
  marginRight: "4px",
});
const mockBody = { padding: "14px 16px", backgroundColor: "#ffffff" };
const mockLabel = { fontSize: "12px", color: "#6b7280", fontWeight: 500, marginBottom: "2px" };
const mockTitle = { fontSize: "14px", color: "#111827", fontWeight: 600, marginBottom: "2px" };
const mockMuted = { fontSize: "12px", color: "#6b7280", marginTop: "2px" };
const timer = { fontSize: "24px", fontWeight: 700, color: "#0d9488", fontFamily: "ui-monospace, Menlo, monospace" };
const divider = { borderTop: "1px solid #f1f5f9", margin: "12px 0 8px" };
const btnRed = {
  display: "inline-block",
  backgroundColor: "#dc2626",
  color: "#ffffff",
  fontSize: "13px",
  fontWeight: 600,
  padding: "8px 14px",
  borderRadius: "8px",
};
const btnOutline = {
  display: "inline-block",
  border: "1px solid #e5e7eb",
  color: "#111827",
  fontSize: "13px",
  fontWeight: 600,
  padding: "7px 12px",
  borderRadius: "8px",
};
const chipBase = { display: "inline-block", fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "999px" };
const chipGreen = { ...chipBase, backgroundColor: "#d1fae5", color: "#047857" };
const chipAmber = { ...chipBase, backgroundColor: "#fef3c7", color: "#92400e" };
const chipGrey = { ...chipBase, backgroundColor: "#f3f4f6", color: "#4b5563" };
const chipViolet = { ...chipBase, backgroundColor: "#ede9fe", color: "#6d28d9" };
const avatar = {
  display: "inline-block",
  width: "32px",
  height: "32px",
  lineHeight: "32px",
  textAlign: "center" as const,
  borderRadius: "999px",
  backgroundColor: "#ccfbf1",
  color: "#0f766e",
  fontSize: "12px",
  fontWeight: 700,
};
const closing = { padding: "28px 28px 8px" };
const cta = {
  backgroundColor: "#0d9488",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 700,
  textDecoration: "none",
  padding: "13px 22px",
  borderRadius: "10px",
  display: "inline-block",
  margin: "6px 0 18px",
};
const hr = { borderColor: "#f1f5f9", margin: "8px 28px" };
const footer = { fontSize: "12px", color: "#9ca3af", lineHeight: "1.6", padding: "0 28px 24px", margin: 0, whiteSpace: "pre-line" as const };

export default MedialoopUpdateEmail;
