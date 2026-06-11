import type { Metadata } from "next";
import {
  Atkinson_Hyperlegible,
  IBM_Plex_Mono,
  Instrument_Serif,
} from "next/font/google";
import "./globals.css";

const display = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-display",
});

const body = Atkinson_Hyperlegible({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-body",
});

const mono = IBM_Plex_Mono({
  weight: ["400", "600"],
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "engram",
  description: "Turn anything you read into memories that stick.",
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
