import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { AUTH_PATHS } from "@/features/auth/core/policy";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Ton fil · Trouvio" };

// Page provisoire de P1-02 : remplacée par le vrai fil en P6-02. Le contrôle de session ci-dessous
// est remplacé par `requireUser` en P1-03.
export default async function FilPage() {
  const session = await getSession();
  if (!session) redirect(AUTH_PATHS.signIn);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="font-display text-h1">Ton fil</h1>
      <p className="text-body text-muted-foreground">
        Connexion ouverte avec {session.user.email}.
      </p>
      <SignOutButton />
    </main>
  );
}
