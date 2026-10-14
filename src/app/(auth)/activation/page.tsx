import type { Metadata } from "next";
import Link from "next/link";

import { ActivationForm } from "@/features/auth/components/activation-form";
import { verificationTokenSchema } from "@/features/auth/core/links";
import { AUTH_PATHS } from "@/features/auth/core/policy";
import { getAuth } from "@/lib/auth";
import { previewVerificationLink } from "@/lib/auth/links";

// Le jeton ne doit ni fuir par le Referer ni être indexé (ADR 0017).
export const metadata: Metadata = {
  title: "Activation · Trouvio",
  referrer: "no-referrer",
  robots: { index: false },
};

const LINK_CLASSES =
  "rounded-sm text-primary underline underline-offset-4 outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring";

// Lecture seule : aucun jeton consommé, aucune session ouverte au GET. Dynamique (lecture en base à
// chaque requête) : searchParams et le layout racine (connection) l'imposent.
export default async function ActivationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const parsed = verificationTokenSchema.safeParse((await searchParams).token);
  const preview = parsed.success
    ? await previewVerificationLink(getAuth(), parsed.data)
    : ({ status: "invalid" } as const);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-6">
      {preview.status === "pending" && parsed.success ? (
        <>
          <header className="flex flex-col gap-2">
            <h1 className="font-display text-h1">Active ton compte</h1>
          </header>
          <ActivationForm token={parsed.data} email={preview.email} />
        </>
      ) : preview.status === "verified" ? (
        <>
          <header className="flex flex-col gap-2">
            <h1 className="font-display text-h1">Ton compte est déjà actif</h1>
            <p className="text-body text-muted-foreground">
              Il n&apos;y a rien à activer de plus.
            </p>
          </header>
          <p className="text-body">
            <Link href={AUTH_PATHS.signIn} className={LINK_CLASSES}>
              Se connecter
            </Link>
          </p>
        </>
      ) : (
        <>
          <header className="flex flex-col gap-2">
            <h1 className="font-display text-h1">
              Ce lien n&apos;est plus valable
            </h1>
            <p className="text-body text-muted-foreground">
              Il a expiré ou il a déjà servi. Connecte-toi pour recevoir un
              nouveau lien.
            </p>
          </header>
          <p className="text-body">
            <Link href={AUTH_PATHS.signIn} className={LINK_CLASSES}>
              Aller à la connexion
            </Link>
          </p>
        </>
      )}
    </main>
  );
}
