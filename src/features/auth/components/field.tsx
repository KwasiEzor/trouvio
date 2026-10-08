import type { ComponentProps } from "react";
import type { ZodError } from "zod";

import { cn } from "@/lib/utils";

type FieldProps = Omit<
  ComponentProps<"input">,
  "id" | "className" | "aria-invalid" | "aria-describedby"
> & {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
};

/**
 * Champ de formulaire d'authentification : `<label>` + `<input>` natifs, aide et erreur reliées au
 * champ (aria-describedby). Pas de composant shadcn input/label avant P7-02.
 */
export function Field({ id, label, hint, error, ...input }: FieldProps) {
  const hintId = `${id}-aide`;
  const errorId = `${id}-erreur`;
  const describedBy =
    [hint ? hintId : undefined, error ? errorId : undefined]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-label text-foreground">
        {label}
      </label>
      <input
        {...input}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "h-10 w-full rounded-md border border-muted-foreground bg-card px-3 text-body text-foreground outline-hidden placeholder:text-muted-foreground",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring",
          "aria-invalid:border-foreground aria-invalid:bg-muted",
        )}
      />
      {hint ? (
        <p id={hintId} className="text-body-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-body-sm font-semibold text-foreground">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Zone d'erreur du serveur : annoncée par les lecteurs d'écran. */
export function FormAlert({ message }: { message: string | undefined }) {
  if (message === undefined) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-foreground bg-card p-3 text-body-sm text-foreground"
    >
      {message}
    </p>
  );
}

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** Première erreur de chaque champ, par nom de champ. */
export function fieldErrors<K extends string>(error: ZodError): FieldErrors<K> {
  const errors: Partial<Record<string, string>> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key !== "" && errors[key] === undefined) errors[key] = issue.message;
  }
  return errors as FieldErrors<K>;
}

/** Valeur texte d'un champ du formulaire (chaîne vide si absent). */
export function readText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

/** Place le focus sur le premier champ en erreur, dans l'ordre du formulaire. */
export function focusFirstInvalid(
  form: HTMLFormElement,
  errors: Partial<Record<string, string>>,
) {
  for (const element of Array.from(form.elements)) {
    if (
      element instanceof HTMLInputElement &&
      errors[element.name] !== undefined
    ) {
      element.focus();
      return;
    }
  }
}
