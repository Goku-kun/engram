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

const description =
  "Upload a PDF, a photo of handwritten notes, or a text file. engram turns it into flashcards, a graded quiz, and a summary to study from.";

const socialTitle = "Turn your notes into flashcards, a quiz, and a summary";
const socialDescription =
  "Upload a PDF or a photo of your notes. Get flashcards, a graded quiz, and a summary to study from.";
const ogImageAlt =
  "The engram app turning a document into flashcards and a quiz.";

export const metadata: Metadata = {
  metadataBase: new URL("https://engram-delta.vercel.app"),
  title: "Turn notes into flashcards, a quiz, and a summary | engram",
  description,
  applicationName: "engram",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "engram",
    title: socialTitle,
    description: socialDescription,
    url: "/",
    images: [
      {
        url: "/screenshots/og.png",
        width: 1200,
        height: 630,
        alt: ogImageAlt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: socialTitle,
    description: socialDescription,
    images: ["/screenshots/og.png"],
  },
};

// WebApplication structured data — matches what engram actually is: a free
// browser tool that builds study material from an uploaded document.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "engram",
  url: "https://engram-delta.vercel.app",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  description,
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
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
