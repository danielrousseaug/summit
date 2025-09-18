import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Summit",
  description: "AI-Powered Learning Management Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
