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
 * **Internal — goes to the founder, not to the customer.** It leads with the
 * consequence rather than the symptom because "device offline" reads as an IT
 * nuisance rather than missing payroll input, and the point of the alert is to
 * prompt a call to the customer, not to replace one.
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
            {orgName}: attendance is not being recorded
          </Text>

          <Text style={{ fontSize: "15px", color: "#333", lineHeight: "24px", margin: "0 0 16px" }}>
            {multiple
              ? `${devices.length} attendance devices at ${orgName} have stopped sending punches to JambaHR.`
              : `An attendance device at ${orgName} has stopped sending punches to JambaHR.`}{" "}
            Fingerprint punches made since then are sitting on the device and are
            <strong> not in their attendance records</strong>. The customer has not been
            emailed — reach out to them directly.
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
            <strong>What to check with them, in order:</strong>
          </Text>
          <Text style={{ fontSize: "14px", color: "#444", lineHeight: "22px", margin: "0 0 16px" }}>
            1. Is the relay PC on, awake, and running Caddy? A sleeping or restarted PC is the
            most common cause by far.
            <br />
            2. Is the device powered on, cable connected, gateway not <code>0.0.0.0</code>?
            <br />
            3. Has the relay PC&apos;s LAN IP changed from what the device has configured?
          </Text>

          <Text style={{ fontSize: "14px", color: "#444", lineHeight: "22px", margin: "0 0 20px" }}>
            The backlog recovers itself: on reconnect the device replays everything it stored
            and the server dedupes, so nothing needs re-keying — but only once the connection
            is restored.
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
            Open device settings
          </Button>

          <Hr style={{ borderColor: "#e7e9ec", margin: "28px 0 16px" }} />
          <Text style={{ fontSize: "12px", color: "#888", lineHeight: "18px", margin: 0 }}>
            Internal JambaHR ops alert — not sent to the customer. Device connectivity is
            checked once a day; this repeats daily until the device reconnects.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default DeviceOfflineAlertEmail;
