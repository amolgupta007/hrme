import { Html, Head, Body, Container, Section, Heading, Text } from "@react-email/components";

export function OwnershipTransferredEmail({
  orgName,
  newOwnerName,
}: {
  orgName: string;
  newOwnerName: string;
}) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: "#f6f9fc", fontFamily: "sans-serif" }}>
        <Container style={{ padding: "24px", maxWidth: "520px" }}>
          <Section>
            <Heading as="h2">Ownership of {orgName} transferred</Heading>
            <Text>
              {newOwnerName} has accepted ownership of <strong>{orgName}</strong>. Your role is now
              <strong> Admin</strong>. You still have admin access; the new owner can manage roles from Settings.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
