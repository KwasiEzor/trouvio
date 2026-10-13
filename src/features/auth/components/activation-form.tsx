"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FormAlert,
  focusFirstInvalid,
  readText,
} from "@/features/auth/components/field";
import {
  ACCOUNT_LOCKED_CODE,
  AUTH_NOTICES,
  FIELD_MESSAGES,
  messageForAuthError,
  messageForLinkError,
} from "@/features/auth/core/messages";
import { AUTH_PATHS, PASSWORD_MAX_LENGTH } from "@/features/auth/core/policy";
import { authClient } from "@/lib/auth/client";

const INVALID_PASSWORD_CODE = "INVALID_PASSWORD";

/**
 * Activation du compte (ADR 0017) : le lien d'email ne suffit pas, il faut le mot de passe choisi à
 * l'inscription. Sans lui, le compte reste non vérifié ; le lien de connexion sert de secours à qui
 * n'a pas créé le compte.
 */
export function ActivationForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | undefined>();
  const [rescue, setRescue] = useState(false);
  const [rescueSent, setRescueSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const password = readText(new FormData(form), "password");
    setServerError(undefined);
    if (password === "") {
      setPasswordError(FIELD_MESSAGES.passwordRequired);
      focusFirstInvalid(form, { password: FIELD_MESSAGES.passwordRequired });
      return;
    }
    setPasswordError(undefined);
    setPending(true);
    try {
      const { error } = await authClient.$fetch("/verify-email/confirm", {
        method: "POST",
        body: { token, password },
      });
      if (error) {
        const code =
          "code" in error && typeof error.code === "string"
            ? error.code
            : undefined;
        setServerError(messageForLinkError({ code, status: error.status }));
        // Verrou par compte compris : un tiers peut l'épuiser, le lien de connexion reste ouvert.
        if (code === INVALID_PASSWORD_CODE || code === ACCOUNT_LOCKED_CODE) {
          setRescue(true);
        }
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

  async function sendLoginLink() {
    if (pending) return;
    setServerError(undefined);
    setPending(true);
    try {
      // Sans callbackURL : le lien mène à /connexion/lien, qui affiche le compte visé.
      const { error } = await authClient.signIn.magicLink({ email });
      if (error) setServerError(messageForAuthError(error));
      else setRescueSent(true);
    } catch {
      setServerError(messageForAuthError({}));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        // Envoi avant l'hydratation : le mot de passe part dans le corps, jamais dans l'URL.
        method="post"
        aria-label="Activation de ton compte"
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
      >
        <p className="text-body text-muted-foreground">
          Pour activer le compte{" "}
          <strong className="font-semibold text-foreground">{email}</strong>,
          saisis le mot de passe choisi à l&apos;inscription.
        </p>
        <Field
          id="activation-mot-de-passe"
          name="password"
          label="Mot de passe"
          type="password"
          autoComplete="current-password"
          maxLength={PASSWORD_MAX_LENGTH}
          required
          error={passwordError}
        />
        <FormAlert message={serverError} />
        <Button type="submit" size="lg" disabled={pending}>
          Activer mon compte
        </Button>
      </form>
      {rescueSent ? (
        <p
          role="status"
          className="rounded-md border border-border bg-card p-4 text-body text-foreground"
        >
          {AUTH_NOTICES.magicLinkSent}
        </p>
      ) : rescue ? (
        <div className="flex flex-col gap-3">
          <p className="text-body-sm text-muted-foreground">
            Ce n&apos;est pas toi qui as créé ce compte, ou tu as oublié ton mot
            de passe ?
          </p>
          <Button
            type="button"
            size="lg"
            variant="outline"
            disabled={pending}
            onClick={sendLoginLink}
          >
            M&apos;envoyer un lien de connexion
          </Button>
        </div>
      ) : null}
    </div>
  );
}
