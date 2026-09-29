"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

import { poppins, workSans } from "./fonts";
import "./globals.css";

// Remplace le layout racine quand son rendu échoue : il porte donc lui-même <html> et <body>.
// Aucun détail technique affiché ; une erreur née dans le navigateur part vers Sentry (nettoyée
// par beforeSend).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Avec un digest, l'erreur vient du serveur et onRequestError l'a déjà signalée (quota).
    if (!error.digest) Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr" className={`${poppins.variable} ${workSans.variable}`}>
      <body>
        <main className="mx-auto flex max-w-5xl flex-col items-start gap-4 p-8">
          <h1 className="text-h1">Quelque chose a coincé.</h1>
          <p className="text-body text-muted-foreground">
            Une erreur inattendue est survenue et elle a été signalée. Tu peux
            réessayer.
          </p>
          <Button onClick={reset}>Réessayer</Button>
        </main>
      </body>
    </html>
  );
}
