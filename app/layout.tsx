import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "meetfind",
  description: "Find a time everyone's free, from real calendars.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
