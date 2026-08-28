import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Two faces and no more. Inter sets the prose; JetBrains Mono sets the identifiers —
// a Type's `id` is what an external assistant reads over MCP (ADR-0002), and a
// monospace face is what makes it look like the value it is rather than a word.
// Visual design beyond what shadcn supplies is out of scope, and this is the whole of
// what the app adds to it.
const inter = Inter({ variable: "--font-sans", subsets: ["latin"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "tsundoku",
  description:
    "A single-owner library: what has been read, what it was worth, what is on the shelf.",
};

// Used phone-in-hand in a shop and at a desk, so mobile-first and the width of the
// device. User zoom stays on.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// shadcn's dark tokens hang off a `.dark` class rather than a media query, so
// following the operating system takes this one line. It runs before first paint,
// which is what keeps a light flash out of a dark room.
const theme =
  "try{document.documentElement.classList.toggle('dark',matchMedia('(prefers-color-scheme: dark)').matches)}catch(e){}";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: the no-flash theme setter */}
        <script dangerouslySetInnerHTML={{ __html: theme }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
