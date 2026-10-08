"use client";

import { useRouter } from "next/navigation";
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
import { signInSchema } from "@/features/auth/core/credentials";
import { messageForAuthError } from "@/features/auth/core/messages";
import {
  AUTH_PATHS,
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "@/features/auth/core/policy";
import { authClient } from "@/lib/auth/client";

export function SignInForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<"email" | "password">>({});
  const [serverError, setServerError] = useState<string | undefined>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const parsed = signInSchema.safeParse({
      email: readText(data, "email"),
      password: readText(data, "password"),
    });
    setServerError(undefined);
    if (!parsed.success) {
      const found = fieldErrors<"email" | "password">(parsed.error);
      setErrors(found);
      focusFirstInvalid(form, found);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const { error } = await authClient.signIn.email({
        ...parsed.data,
        callbackURL: AUTH_PATHS.afterSignIn,
      });
      if (error) {
        setServerError(messageForAuthError(error));
        setPending(false);
        return;
      }
      // Le bouton reste désactivé jusqu'au changement de page.
      router.push(AUTH_PATHS.afterSignIn);
      router.refresh();
    } catch {
      setServerError(messageForAuthError({}));
      setPending(false);
    }
  }

  return (
    <form
      aria-label="Connexion avec ton mot de passe"
      noValidate
      onSubmit={onSubmit}
      className="flex flex-col gap-4"
    >
      <Field
        id="connexion-email"
        name="email"
        label="Adresse email"
        type="email"
        autoComplete="email"
        maxLength={EMAIL_MAX_LENGTH}
        required
        error={errors.email}
      />
      <Field
        id="connexion-mot-de-passe"
        name="password"
        label="Mot de passe"
        type="password"
        autoComplete="current-password"
        maxLength={PASSWORD_MAX_LENGTH}
        required
        error={errors.password}
      />
      <FormAlert message={serverError} />
      <Button type="submit" size="lg" disabled={pending}>
        Se connecter
      </Button>
    </form>
  );
}
