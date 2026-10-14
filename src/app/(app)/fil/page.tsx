import type { Metadata } from "next";

import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { AUTH_PATHS } from "@/features/auth/core/policy";
import { requireUser } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Ton fil · Trouvio" };

// Page provisoire de P1-02 : remplacée par le vrai fil en P6-02.
export default async function FilPage() {
  const user = await requireUser({ signInPath: AUTH_PATHS.signIn });

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
