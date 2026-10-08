"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FormAlert,
  type FieldErrors,
  fieldErrors,
  focusFirstInvalid,
  readText,
} from "@/features/auth/components/field";
import { magicLinkSchema } from "@/features/auth/core/credentials";
import {
  AUTH_NOTICES,
  messageForAuthError,
} from "@/features/auth/core/messages";
import {
  AUTH_PATHS,
  EMAIL_MAX_LENGTH,
  MAGIC_LINK_TTL_SECONDS,
} from "@/features/auth/core/policy";
import { authClient } from "@/lib/auth/client";

export function MagicLinkForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<"email">>({});
  const [serverError, setServerError] = useState<string | undefined>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const parsed = magicLinkSchema.safeParse({
      email: readText(new FormData(form), "email"),
    });
    setServerError(undefined);
    if (!parsed.success) {
      const found = fieldErrors<"email">(parsed.error);
      setErrors(found);
      focusFirstInvalid(form, found);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const { error } = await authClient.signIn.magicLink({
        ...parsed.data,
        callbackURL: AUTH_PATHS.afterSignIn,
        errorCallbackURL: AUTH_PATHS.invalidLink,
      });
      if (error) setServerError(messageForAuthError(error));
      else setSent(true);
    } catch {
      setServerError(messageForAuthError({}));
    } finally {
      setPending(false);
    }
  }

  // Même message que l'adresse ait un compte ou non : aucune énumération de comptes.
  if (sent) {
    return (
      <p
        role="status"
        className="rounded-md border border-border bg-card p-4 text-body text-foreground"
      >
        {AUTH_NOTICES.magicLinkSent}
      </p>
    );
  }

  return (
    <form
      aria-label="Connexion par lien"
      noValidate
      onSubmit={onSubmit}
      className="flex flex-col gap-4"
    >
      <p className="text-body-sm text-muted-foreground">
        Pas de mot de passe sous la main ? On t&apos;envoie un lien valable{" "}
        {MAGIC_LINK_TTL_SECONDS / 60} minutes.
      </p>
      <Field
        id="lien-email"
        name="email"
        label="Adresse email"
        type="email"
        autoComplete="email"
        maxLength={EMAIL_MAX_LENGTH}
        required
        error={errors.email}
      />
      <FormAlert message={serverError} />
      <Button type="submit" size="lg" variant="outline" disabled={pending}>
        Recevoir un lien de connexion
      </Button>
    </form>
  );
}
