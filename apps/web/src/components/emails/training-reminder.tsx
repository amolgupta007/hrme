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

interface PendingCourse {
  title: string;
  category: string;
  dueDate: string | null;
  isOverdue: boolean;
}

interface TrainingReminderEmailProps {
  employeeName: string;
  pendingCourses: PendingCourse[];
  dashboardUrl: string;
}

export function TrainingReminderEmail({
  employeeName = "Team Member",
  pendingCourses = [
    { title: "Workplace Safety", category: "safety", dueDate: "2026-03-31", isOverdue: true },
  ],
  dashboardUrl = "https://jambahr.com/dashboard/training",
}: TrainingReminderEmailProps) {
  const overdueCount = pendingCourses.filter((c) => c.isOverdue).length;
  const dueSoonCount = pendingCourses.length - overdueCount;

  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={headingStyle}>Training Courses Require Your Attention</Text>
          <Text style={textStyle}>
            Hi <strong>{employeeName}</strong>,{" "}
            {overdueCount > 0 && (
              <>
                you have <strong>{overdueCount} overdue</strong>{" "}
                {overdueCount === 1 ? "course" : "courses"}
                {dueSoonCount > 0 ? " and " : ""}
              </>
            )}
            {dueSoonCount > 0 && (
              <>
                <strong>{dueSoonCount}</strong>{" "}
                {dueSoonCount === 1 ? "course" : "courses"} due within 7 days
              </>
            )}
            . Please complete{" "}
            {pendingCourses.length === 1 ? "it" : "them"} as soon as possible.
          </Text>

          <Section style={detailsStyle}>
            {pendingCourses.map((course, i) => (
              <Text key={i} style={courseRowStyle}>
                {course.isOverdue ? "🔴" : "🟡"}{" "}
                <strong>{course.title}</strong>
                <span style={metaStyle}>
                  {" "}· {formatCategory(course.category)}
                  {course.dueDate && (
                    <> · Due: {formatDate(course.dueDate)}{course.isOverdue ? " (Overdue)" : ""}</>
                  )}
                </span>
              </Text>
            ))}
          </Section>

          <Text style={textStyle}>
            Completing mandatory training on time ensures compliance and keeps your record up to date.
          </Text>

          <Button style={buttonStyle} href={dashboardUrl}>
            Go to Training
          </Button>

          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            This is an automated reminder from JambaHR. You are receiving this because you have
            mandatory training courses pending.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

function formatCategory(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const bodyStyle = {
  backgroundColor: "#f8f9fa",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const containerStyle = {
  margin: "0 auto",
  padding: "32px 24px",
  maxWidth: "560px",
};

const headingStyle = {
  fontSize: "20px",
  fontWeight: "700" as const,
  color: "#1a1a2e",
  marginBottom: "16px",
};

const textStyle = {
  fontSize: "14px",
  color: "#4a4a5a",
  lineHeight: "1.6",
};

const detailsStyle = {
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  border: "1px solid #e5e7eb",
  padding: "16px 20px",
  margin: "20px 0",
};

const courseRowStyle = {
  fontSize: "14px",
  color: "#1a1a2e",
  margin: "8px 0",
};

const metaStyle = {
  color: "#6b7280",
  fontSize: "13px",
};

const buttonStyle = {
  backgroundColor: "#2a9d8f",
  borderRadius: "8px",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "600" as const,
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "12px 24px",
};

const hrStyle = {
  borderColor: "#e5e7eb",
  marginTop: "32px",
};

const footerStyle = {
  fontSize: "12px",
  color: "#9ca3af",
  marginTop: "16px",
};

export default TrainingReminderEmail;
