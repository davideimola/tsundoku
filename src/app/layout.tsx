import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "tsundoku",
  description:
    "A single-owner library: what has been read, what it was worth, what is on the shelf.",
};

// Used phone-in-hand in a shop and at a desk (user stories 31), so mobile-first and
// the width of the device. User zoom stays on.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// shadcn ships a full set of dark tokens but hangs them off a `.dark` class, so
// without this line they are dead code. Following the operating system is therefore
// using what shadcn supplies rather than adding to it. It runs before first paint,
// which is what keeps a white flash out of a dark room.
const theme =
  "try{document.documentElement.classList.toggle('dark',matchMedia('(prefers-color-scheme: dark)').matches)}catch(e){}";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: the no-flash theme setter */}
        <script dangerouslySetInnerHTML={{ __html: theme }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
