import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page introuvable · Trouvio" };

// Remplace la 404 par défaut de Next, qui injecte un <style> en ligne sans nonce : bloqué par la
// CSP des pages (ADR 0016), il laissait une page sans style et une erreur console.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="font-display text-h1">Page introuvable</h1>
      <p className="text-body text-muted-foreground">
        Cette page n&apos;existe pas ou plus.
      </p>
      <Link
        href="/"
        className="rounded-sm text-primary underline underline-offset-4 outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
      >
        Retour à l&apos;accueil
      </Link>
    </main>
  );
}
