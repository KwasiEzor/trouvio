import "./globals.css";

import type { Metadata } from "next";
import { connection } from "next/server";

import { poppins, workSans } from "./fonts";

export const metadata: Metadata = {
  title: "Trouvio",
  description: "Elle trie. Tu décides.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // CSP à nonce (ADR 0016) : une page prérendue n'aurait pas de nonce et ses scripts seraient
  // bloqués. Toutes les pages sont donc rendues à la requête, depuis ce seul point.
  await connection();
  return (
    <html lang="fr" className={`${poppins.variable} ${workSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
