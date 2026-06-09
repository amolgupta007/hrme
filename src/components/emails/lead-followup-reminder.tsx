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

interface Props {
  recipientName: string;
  leads: Array<{ name: string; company: string | null; url: string }>;
  orgName: string;
}

export default function LeadFollowupReminderEmail(props: Props) {
  const { recipientName, leads, orgName } = props;
  return (
    <Html>
      <Head />
      <Preview>Follow-ups due today — {leads.length} lead{leads.length === 1 ? "" : "s"}</Preview>
      <Body style={{ fontFamily: "Inter, system-ui, sans-serif", backgroundColor: "#f7fafc" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            padding: "32px",
            maxWidth: "560px",
            borderRadius: "8px",
            margin: "40px auto",
          }}
        >
          <Heading as="h2" style={{ marginTop: 0, color: "#0f172a", fontSize: "20px" }}>
            Follow-ups due today
          </Heading>
          <Text style={{ color: "#475569", margin: "0 0 16px" }}>
            Hi {recipientName}, you have{" "}
            <strong>{leads.length}</strong> lead{leads.length === 1 ? "" : "s"} scheduled
            for follow-up today at {orgName}.
          </Text>
          <Section style={{ marginTop: "8px" }}>
            {leads.map((l, i) => (
              <Text key={i} style={{ margin: "8px 0", color: "#0f172a" }}>
                •{" "}
                <Link href={l.url} style={{ color: "#0d8b78", textDecoration: "none" }}>
                  {l.name}
                </Link>
                {l.company ? (
                  <span style={{ color: "#94a3b8" }}> ({l.company})</span>
                ) : null}
              </Text>
            ))}
          </Section>
          <Hr style={{ marginTop: "24px", borderColor: "#e2e8f0" }} />
          <Text style={{ fontSize: "12px", color: "#94a3b8", margin: "12px 0 0" }}>
            JambaHR · JambaGeo · Automated reminder — please don&apos;t reply.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
