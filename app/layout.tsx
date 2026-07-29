import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "What's On, Columbia",
  description:
    "A source-transparent calendar of upcoming events in Columbia, Missouri.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
