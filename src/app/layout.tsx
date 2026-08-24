import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lurk — AI Vibe Coding",
  description:
    "Describe an idea in plain language. Lurk builds a complete working web app, website, or browser game.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-[#0A0A0A] text-[#E8E8E8]">
        {children}
      </body>
    </html>
  );
}
