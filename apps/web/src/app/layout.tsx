import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ayvalık Çamlık Tenis | Rezervasyon",
  description: "Ayvalık Çamlık Tenis Kulübü kort rezervasyon uygulaması",
  applicationName: "Çamlık Tenis",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Çamlık Tenis",
  },
  icons: {
    icon: [
      { url: "/tenis-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/tenis-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/tenis-apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#237000" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1512" },
  ],
  userScalable: false,
  viewportFit: "cover",
  width: "device-width",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
