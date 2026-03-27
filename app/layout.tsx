import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Montserrat } from "next/font/google";
import { buildPageMetadata, getSiteUrl } from "@/lib/metadata";
import { getCurrentDistrict } from "@/lib/districtServer";

const montserrat = Montserrat({ subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata();
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const district = getCurrentDistrict();
  const siteUrl = getSiteUrl(district.key);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: district.metadata.siteName,
        url: siteUrl.toString(),
        telephone: district.footer.phone,
        address: {
          "@type": "PostalAddress",
          streetAddress: district.footer.addressLine,
        },
      },
      {
        "@type": "WebSite",
        name: district.metadata.siteName,
        url: siteUrl.toString(),
        description: district.metadata.defaultDescription,
      },
    ],
  };

  return (
    <html lang="en">
      <body className={montserrat.className}>
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
