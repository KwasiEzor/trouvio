import type { Metadata } from "next";
import Link from "next/link";

import { MagicLinkForm } from "@/features/auth/components/magic-link-form";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { noticeForQuery } from "@/features/auth/core/messages";
import { AUTH_PATHS } from "@/features/auth/core/policy";

export const metadata: Metadata = { title: "Connexion · Trouvio" };

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string | string[] }>;
}) {
  // Liste fermée : seul un texte du code s'affiche, jamais la valeur de l'URL.
  const notice = noticeForQuery((await searchParams).erreur);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-h1">Content de te revoir</h1>
        <p className="text-body text-muted-foreground">
          Connecte-toi pour retrouver ton fil d&apos;offres.
        </p>
      </header>
      {notice === undefined ? null : (
        <p
          role="alert"
          className="rounded-md border border-foreground bg-card p-3 text-body-sm text-foreground"
        >
          {notice}
        </p>
      )}
      <SignInForm />
      <div className="flex items-center gap-3 text-body-sm text-muted-foreground">
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
        ou
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>
      <MagicLinkForm />
      <p className="text-body-sm text-muted-foreground">
        Pas encore de compte ?{" "}
        <Link
          href={AUTH_PATHS.signUp}
          className="rounded-sm text-primary underline underline-offset-4 outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
        >
          Créer un compte
        </Link>
      </p>
    </main>
  );
}
