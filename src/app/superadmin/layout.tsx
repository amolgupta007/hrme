export const metadata = { title: "JambaHR Admin" };

export default function SuperadminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 font-sans antialiased">
      {children}
    </div>
  );
}
