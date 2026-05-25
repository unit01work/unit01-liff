import type { Metadata, Viewport } from "next";
import { UserProvider } from "@/lib/user-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "UNIT-01 SHOP",
  description: "UNIT-01 Official LIFF Shop",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
          <UserProvider>{children}</UserProvider>
      </body>
    </html>
  );
}
