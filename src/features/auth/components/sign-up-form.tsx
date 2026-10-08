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
import { signUpSchema } from "@/features/auth/core/credentials";
import {
  AUTH_NOTICES,
  messageForAuthError,
} from "@/features/auth/core/messages";
import {
  AUTH_PATHS,
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/features/auth/core/policy";
import { authClient } from "@/lib/auth/client";

export function SignUpForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<
    FieldErrors<"name" | "email" | "password">
  >({});
  const [serverError, setServerError] = useState<string | undefined>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const parsed = signUpSchema.safeParse({
      name: readText(data, "name"),
      email: readText(data, "email"),
      password: readText(data, "password"),
    });
    setServerError(undefined);
    if (!parsed.success) {
      const found = fieldErrors<"name" | "email" | "password">(parsed.error);
      setErrors(found);
      focusFirstInvalid(form, found);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const { error } = await authClient.signUp.email({
        ...parsed.data,
        callbackURL: AUTH_PATHS.afterSignIn,
      });
      if (error) setServerError(messageForAuthError(error));
      else setSent(true);
    } catch {
      setServerError(messageForAuthError({}));
    } finally {
      setPending(false);
    }
  }

  // Même message que l'adresse soit libre ou déjà prise : aucune énumération de comptes.
  if (sent) {
    return (
      <p
        role="status"
        className="rounded-md border border-border bg-card p-4 text-body text-foreground"
      >
        {AUTH_NOTICES.signUpSent}
      </p>
    );
  }

  return (
    <form
      aria-label="Création de compte"
      noValidate
      onSubmit={onSubmit}
      className="flex flex-col gap-4"
    >
      <Field
        id="inscription-nom"
        name="name"
        label="Nom"
        type="text"
        autoComplete="name"
        maxLength={NAME_MAX_LENGTH}
        required
        error={errors.name}
      />
      <Field
        id="inscription-email"
        name="email"
        label="Adresse email"
        type="email"
        autoComplete="email"
        maxLength={EMAIL_MAX_LENGTH}
        required
        error={errors.email}
      />
      <Field
        id="inscription-mot-de-passe"
        name="password"
        label="Mot de passe"
        type="password"
        autoComplete="new-password"
        maxLength={PASSWORD_MAX_LENGTH}
        required
        hint={`${PASSWORD_MIN_LENGTH} caractères minimum`}
        error={errors.password}
      />
      <FormAlert message={serverError} />
      <Button type="submit" size="lg" disabled={pending}>
        Créer mon compte
      </Button>
    </form>
  );
}
