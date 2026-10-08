import type { Metadata } from "next";

import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { AUTH_PATHS } from "@/features/auth/core/policy";
import { requireUser } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Ton fil · Trouvio" };

// Page provisoire de P1-02 : remplacée par le vrai fil en P6-02.
export default async function FilPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  // Lien de vérification expiré ou altéré : Better Auth renvoie ici avec ?error=…, dont la valeur
  // n'est jamais affichée (message de la liste fermée de /connexion).
  const { error } = await searchParams;
  const user = await requireUser({
    signInPath:
      error === undefined ? AUTH_PATHS.signIn : AUTH_PATHS.invalidLink,
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="font-display text-h1">Ton fil</h1>
      <p className="text-body text-muted-foreground">
        Connexion ouverte avec {user.email}.
      </p>
      <SignOutButton />
    </main>
  );
}
