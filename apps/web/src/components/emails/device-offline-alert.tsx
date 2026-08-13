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

export interface OfflineDeviceLine {
  serial: string;
  label: string | null;
  /** Human phrase: "6 days", "14 hours", "never connected". */
  silenceFor: string;
  neverConnected: boolean;
}

interface DeviceOfflineAlertEmailProps {
  orgName: string;
  devices: OfflineDeviceLine[];
  dashboardUrl: string;
}

/**
 * Sent when a registered biometric device stops reaching JambaHR.
 *
 * The tone is deliberately urgent and concrete: the recipient's attendance data
 * is being lost *right now*, and every hour they don't act is another day of
 * punches nobody can reconstruct. It leads with the consequence rather than the
 * symptom, because "device offline" alone reads as an IT nuisance rather than
 * missing payroll input.
 */
export function DeviceOfflineAlertEmail({
  orgName = "Your organisation",
  devices = [],
  dashboardUrl = "https://jambahr.com/dashboard/settings",
}: DeviceOfflineAlertEmailProps) {
  const multiple = devices.length > 1;

  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: "#f6f6f4", fontFamily: "Arial, sans-serif", margin: 0 }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "32px", maxWidth: "560px" }}>
          <Text style={{ fontSize: "20px", fontWeight: "bold", color: "#B91C1C", margin: "0 0 8px" }}>
            Attendance is not being recorded
          </Text>

          <Text style={{ fontSize: "15px", color: "#333", lineHeight: "24px", margin: "0 0 16px" }}>
            {multiple
              ? `${devices.length} attendance devices at ${orgName} have stopped sending punches to JambaHR.`
              : `An attendance device at ${orgName} has stopped sending punches to JambaHR.`}{" "}
            Any fingerprint punches made since then are sitting on the device and are
            <strong> not in your attendance records</strong>.
          </Text>

          <Section
            style={{
              backgroundColor: "#FDE8E8",
              borderRadius: "8px",
              padding: "16px",
              margin: "0 0 20px",
            }}
          >
            {devices.map((d) => (
              <Text
                key={d.serial}
                style={{ fontSize: "14px", color: "#7f1d1d", margin: "0 0 6px", lineHeight: "20px" }}
              >
                <strong>{d.label || d.serial}</strong>
                {d.label ? ` (${d.serial})` : ""} —{" "}
                {d.neverConnected
                  ? "has never connected since it was registered"
                  : `silent for ${d.silenceFor}`}
              </Text>
            ))}
          </Section>

          <Text style={{ fontSize: "15px", color: "#333", lineHeight: "24px", margin: "0 0 8px" }}>
            <strong>What to check, in order:</strong>
          </Text>
          <Text style={{ fontSize: "14px", color: "#444", lineHeight: "22px", margin: "0 0 16px" }}>
            1. Is the device powered on and showing its normal home screen?
            <br />
            2. If your site uses a relay PC, is that computer switched on, awake, and running
            the relay? A sleeping or restarted PC is the most common cause.
            <br />
            3. Is the network cable connected, and does the device still show the right server
            address?
          </Text>

          <Text style={{ fontSize: "14px", color: "#444", lineHeight: "22px", margin: "0 0 20px" }}>
            Good news: once the device reconnects it sends everything it stored while it was
            offline, and JambaHR removes any duplicates. Nothing needs to be typed in by hand —
            but the punches only arrive once the connection is restored.
          </Text>

          <Button
            href={dashboardUrl}
            style={{
              backgroundColor: "#17806D",
              color: "#ffffff",
              padding: "12px 20px",
              borderRadius: "8px",
              fontSize: "15px",
              fontWeight: "bold",
              textDecoration: "none",
            }}
          >
            Check device status
          </Button>

          <Hr style={{ borderColor: "#e7e9ec", margin: "28px 0 16px" }} />
          <Text style={{ fontSize: "12px", color: "#888", lineHeight: "18px", margin: 0 }}>
            You are receiving this because you administer {orgName} on JambaHR. We check device
            connectivity once a day and will remind you daily until it reconnects. Reply to this
            email if you need help.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default DeviceOfflineAlertEmail;
