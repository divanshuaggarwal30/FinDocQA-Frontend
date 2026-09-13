import type { Metadata } from "next";
import "./globals.css";


export const metadata: Metadata = {
  title: "FinDocQA",
  description:
    "Source-grounded financial document question answering.",
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}