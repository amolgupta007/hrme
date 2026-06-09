import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface LeadAssignedEmailProps {
  assigneeName: string;
  assignerName: string;
  leadName: string;
  leadCompany: string | null;
  leadContact: string | null;
  leadAddress: string | null;
  leadValueInr: number | null;
  deepLinkUrl: string;
  orgName: string;
}

export default function LeadAssignedEmail(props: LeadAssignedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {props.assignerName} assigned you a new lead: {props.leadName}
      </Preview>
      <Body style={{ fontFamily: "Inter, system-ui, sans-serif", backgroundColor: "#f7fafc" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "32px", maxWidth: 560, borderRadius: 8 }}>
          <Heading as="h2" style={{ marginTop: 0, color: "#0f172a" }}>
            New lead assigned to you
          </Heading>
          <Text style={{ color: "#475569" }}>
            Hi {props.assigneeName}, {props.assignerName} just assigned you a new lead at{" "}
            <strong>{props.orgName}</strong>.
          </Text>

          <Section style={{ backgroundColor: "#f8fafc", padding: 16, borderRadius: 6, marginTop: 16 }}>
            <Text style={{ margin: 0, fontWeight: 600, color: "#0f172a" }}>
              {props.leadName}
            </Text>
            {props.leadCompany && (
              <Text style={{ margin: "4px 0 0", color: "#475569" }}>
                {props.leadCompany}
              </Text>
            )}
            {props.leadContact && (
              <Text style={{ margin: "4px 0 0", color: "#475569" }}>
                {props.leadContact}
              </Text>
            )}
            {props.leadAddress && (
              <Text style={{ margin: "4px 0 0", color: "#475569" }}>
                {props.leadAddress}
              </Text>
            )}
            {props.leadValueInr !== null && (
              <Text style={{ margin: "8px 0 0", color: "#0f172a", fontWeight: 600 }}>
                Estimated value: {"₹"}{props.leadValueInr.toLocaleString("en-IN")}
              </Text>
            )}
          </Section>

          <Section style={{ marginTop: 24 }}>
            <Link
              href={props.deepLinkUrl}
              style={{
                backgroundColor: "#0d8b78",
                color: "#ffffff",
                padding: "10px 20px",
                borderRadius: 6,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Open lead in JambaGeo &rarr;
            </Link>
          </Section>

          <Hr style={{ marginTop: 24, borderColor: "#e2e8f0" }} />
          <Text style={{ fontSize: 12, color: "#94a3b8" }}>
            JambaHR &middot; JambaGeo &middot; This is an automated message &mdash; please don&apos;t reply.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
