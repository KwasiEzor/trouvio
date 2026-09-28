import "./globals.css";

import type { Metadata } from "next";

import { poppins, workSans } from "./fonts";

export const metadata: Metadata = {
  title: "Trouvio",
  description: "Elle trie. Tu décides.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${poppins.variable} ${workSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
