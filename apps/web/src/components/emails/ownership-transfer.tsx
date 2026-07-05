import { Html, Head, Body, Container, Section, Heading, Text, Button } from "@react-email/components";

export function OwnershipTransferEmail({
  orgName,
  inviterName,
  claimUrl,
}: {
  orgName: string;
  inviterName: string;
  claimUrl: string;
}) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: "#f6f9fc", fontFamily: "sans-serif" }}>
        <Container style={{ padding: "24px", maxWidth: "520px" }}>
          <Section>
            <Heading as="h2">You've been invited to own {orgName}</Heading>
            <Text>
              {inviterName} has invited you to take ownership of <strong>{orgName}</strong> on JambaHR.
              Sign in with this email address, then review and accept to become the owner.
            </Text>
            <Button
              href={claimUrl}
              style={{ background: "#1f8a70", color: "#fff", padding: "12px 20px", borderRadius: "8px" }}
            >
              Review &amp; accept ownership
            </Button>
            <Text style={{ color: "#8898aa", fontSize: "12px", marginTop: "16px" }}>
              This invitation expires in 14 days. If you weren't expecting this, you can ignore this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
