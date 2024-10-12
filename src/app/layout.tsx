import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import Modal from "../components/Modal";

export const metadata: Metadata = {
  title: "Open Browser Wallet",
  description: "A free, open-source browser wallet for Ethereum.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="w-full max-w-[400px] mx-auto min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
