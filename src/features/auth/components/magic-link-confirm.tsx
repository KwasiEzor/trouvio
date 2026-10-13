"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { FormAlert } from "@/features/auth/components/field";
import { messageForLinkError } from "@/features/auth/core/messages";
import { AUTH_PATHS } from "@/features/auth/core/policy";
import { authClient } from "@/lib/auth/client";

/**
 * Confirmation du lien de connexion (ADR 0017) : la page est en lecture seule, seul ce clic (POST)
 * consomme le lien. L'adresse affichée annonce le compte dans lequel on entre.
 */
export function MagicLinkConfirm({
  email,
  token,
}: {
  email: string;
  token: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | undefined>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setServerError(undefined);
    setPending(true);
    try {
      const { error } = await authClient.$fetch("/magic-link/confirm", {
        method: "POST",
        body: { token },
      });
      if (error) {
        const code =
          "code" in error && typeof error.code === "string"
            ? error.code
            : undefined;
        setServerError(messageForLinkError({ code, status: error.status }));
        setPending(false);
        return;
      }
      // Le bouton reste désactivé jusqu'au changement de page.
      router.push(AUTH_PATHS.afterSignIn);
      router.refresh();
    } catch {
      setServerError(messageForLinkError({}));
      setPending(false);
    }
  }

  return (
    <form
      aria-label="Confirmation de la connexion"
      onSubmit={onSubmit}
      className="flex flex-col gap-4"
    >
      <p className="text-body text-foreground">
        Tu vas te connecter à Trouvio en tant que{" "}
        <strong className="font-semibold">{email}</strong>
      </p>
      <FormAlert message={serverError} />
      <Button type="submit" size="lg" disabled={pending}>
        Me connecter
      </Button>
    </form>
  );
}
