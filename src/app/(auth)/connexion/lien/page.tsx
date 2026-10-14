import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MagicLinkConfirm } from "@/features/auth/components/magic-link-confirm";
import { magicLinkTokenSchema } from "@/features/auth/core/links";
import { AUTH_PATHS } from "@/features/auth/core/policy";
import { getAuth } from "@/lib/auth";
import { previewMagicLink } from "@/lib/auth/links";

// Le jeton ne doit ni fuir par le Referer ni être indexé (ADR 0017).
export const metadata: Metadata = {
  title: "Connexion par lien · Trouvio",
  referrer: "no-referrer",
  robots: { index: false },
};

// Lecture seule : le lien n'est consommé que par le clic (POST). Pas de redirectIfSignedIn : un clic
// peut changer de compte, l'adresse affichée l'annonce. Dynamique, comme /activation.
export default async function LienConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const parsed = magicLinkTokenSchema.safeParse((await searchParams).token);
  const preview = parsed.success
    ? await previewMagicLink(getAuth(), parsed.data)
    : ({ status: "invalid" } as const);
  if (preview.status !== "valid" || !parsed.success) {
    redirect(AUTH_PATHS.invalidLink);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-h1">Connexion par lien</h1>
      </header>
      <MagicLinkConfirm email={preview.email} token={parsed.data} />
    </main>
  );
}
