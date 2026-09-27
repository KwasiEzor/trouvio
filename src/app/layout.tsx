import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trouvio",
  description: "Elle trie. Tu décides.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
