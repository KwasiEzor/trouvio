import type { Metadata } from "next";
import Link from "next/link";

import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { AUTH_PATHS } from "@/features/auth/core/policy";

export const metadata: Metadata = { title: "Inscription · Trouvio" };

export default function InscriptionPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-h1">Crée ton compte</h1>
        <p className="text-body text-muted-foreground">
          Elle trie. Tu décides.
        </p>
      </header>
      <SignUpForm />
      <p className="text-body-sm text-muted-foreground">
        Déjà un compte ?{" "}
        <Link
          href={AUTH_PATHS.signIn}
          className="rounded-sm text-primary underline underline-offset-4 outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
        >
          Se connecter
        </Link>
      </p>
    </main>
  );
}
