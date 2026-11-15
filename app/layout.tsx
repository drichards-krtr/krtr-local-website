import "./globals.css";
import Script from "next/script";
import type { ReactNode } from "react";
import { Montserrat } from "next/font/google";

const montserrat = Montserrat({ subsets: ["latin"] });

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={montserrat.className}>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-3VFXEP17CS"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-3VFXEP17CS');
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
