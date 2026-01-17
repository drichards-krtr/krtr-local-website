import "./globals.css";
import type { ReactNode } from "react";
import { Montserrat } from "next/font/google";

const montserrat = Montserrat({ subsets: ["latin"] });

export const metadata = {
  title: "KRTR Local",
  description:
    "Local news, sports, and community stories from Dysart, La Porte City and Union CSD.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={montserrat.className}>
        {children}
      </body>
    </html>
  );
}
