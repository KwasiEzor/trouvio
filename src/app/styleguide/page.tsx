import { Search } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  designTokens,
  type ColorTokenName,
  type RadiusTokenName,
  type SpacingTokenName,
  type TypeStyleName,
} from "@/lib/design-tokens";

export const metadata: Metadata = {
  title: "Guide de style — Trouvio",
  // Page interne de référence (P0-05) : jamais liée ni indexée ; à revoir en P7-01.
  robots: { index: false, follow: false },
};

// Tables statiques : Tailwind ne détecte que des classes écrites en entier dans le code.
const CLASSES_NUANCIERS = {
  surface: "bg-surface",
  "surface-raised": "bg-surface-raised",
  ink: "bg-ink",
  "ink-muted": "bg-ink-muted",
  brand: "bg-brand",
  "brand-strong": "bg-brand-strong",
  "brand-dim": "bg-brand-dim",
  border: "bg-border",
} satisfies Record<ColorTokenName, string>;

const CLASSES_TEXTE = {
  display: "font-display text-display",
  h1: "font-display text-h1",
  h2: "font-display text-h2",
  body: "font-sans text-body",
  "body-sm": "font-sans text-body-sm",
  label: "font-sans text-label",
} satisfies Record<TypeStyleName, string>;

const CLASSES_RAYONS = {
  "radius-sm": "rounded-sm",
  "radius-md": "rounded-md",
  "radius-lg": "rounded-lg",
} satisfies Record<RadiusTokenName, string>;

const CLASSES_ESPACEMENTS = {
  "space-2": "w-2",
  "space-4": "w-4",
  "space-6": "w-6",
  "space-8": "w-8",
} satisfies Record<SpacingTokenName, string>;

const LOGOS = [
  {
    src: "/brand/trouvio-logo-horizontal.svg",
    alt: "Logo horizontal de Trouvio",
    width: 923,
    height: 178,
    rendu: 277,
  },
  {
    src: "/brand/trouvio-wordmark.svg",
    alt: "Nom Trouvio en toutes lettres",
    width: 756,
    height: 170,
    rendu: 227,
  },
  {
    src: "/brand/trouvio-mark.svg",
    alt: "Symbole de Trouvio",
    width: 451,
    height: 448,
    rendu: 64,
  },
  {
    src: "/brand/trouvio-app-icon.svg",
    alt: "Icône d'application Trouvio",
    width: 500,
    height: 500,
    rendu: 64,
  },
] as const;

export default function StyleguidePage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1">Guide de style</h1>
        <p className="text-body text-muted-foreground">
          Référence de la charte Trouvio, générée depuis{" "}
          <code>docs/design/tokens.json</code>.
        </p>
      </header>

      <section aria-labelledby="couleurs" className="flex flex-col gap-4">
        <h2 id="couleurs" className="text-h2">
          Couleurs
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {designTokens.colors.map(({ name, value, usage }) => (
            <li
              key={name}
              data-testid="nuancier"
              className="flex flex-col gap-2 rounded-md border border-border bg-card p-4"
            >
              <span
                aria-hidden="true"
                className={`h-16 rounded-sm border border-border ${CLASSES_NUANCIERS[name]}`}
              />
              <span className="text-label">{name}</span>
              <span className="font-mono text-body-sm">{value}</span>
              <span className="text-body-sm text-muted-foreground">
                {usage}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="typographie" className="flex flex-col gap-4">
        <h2 id="typographie" className="text-h2">
          Typographie
        </h2>
        <ul className="flex flex-col gap-4">
          {designTokens.typeStyles.map(
            ({ name, fontSize, lineHeight, fontWeight }) => (
              <li
                key={name}
                className="flex flex-col gap-2 rounded-md border border-border bg-card p-4"
              >
                <p
                  data-testid="echantillon-texte"
                  className={CLASSES_TEXTE[name]}
                >
                  Elle trie. Tu décides.
                </p>
                <p className="text-body-sm text-muted-foreground">
                  {name} — {fontSize} / {lineHeight}, graisse {fontWeight}
                </p>
              </li>
            ),
          )}
        </ul>
      </section>

      <section aria-labelledby="boutons" className="flex flex-col gap-4">
        <h2 id="boutons" className="text-h2">
          Boutons
        </h2>
        <p className="text-body-sm text-muted-foreground">
          Utilise la touche Tab pour voir le focus clavier.
        </p>
        <div className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-card p-4">
          <Button>Bouton principal</Button>
          <Button variant="outline">Contour</Button>
          <Button variant="ghost">Discret</Button>
          <Button variant="link">Lien</Button>
        </div>
        <div className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-card p-4">
          <Button size="sm">Petit</Button>
          <Button size="lg">Grand</Button>
          <Button disabled>Désactivé</Button>
          <Button>
            <Search aria-hidden="true" />
            Rechercher
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label="Rechercher une offre"
          >
            <Search aria-hidden="true" />
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Retour à l&apos;accueil</Link>
          </Button>
        </div>
      </section>

      <section aria-labelledby="formes" className="flex flex-col gap-4">
        <h2 id="formes" className="text-h2">
          Rayons et espacements
        </h2>
        <ul className="flex flex-wrap gap-4">
          {designTokens.radii.map(({ name, value }) => (
            <li key={name} className="flex flex-col items-center gap-2">
              <span
                aria-hidden="true"
                className={`size-16 border border-border bg-brand-dim ${CLASSES_RAYONS[name]}`}
              />
              <span className="text-body-sm">
                {name} — {value}
              </span>
            </li>
          ))}
        </ul>
        <ul className="flex flex-col gap-2">
          {designTokens.spacing.map(({ name, value }) => (
            <li key={name} className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className={`h-4 bg-brand ${CLASSES_ESPACEMENTS[name]}`}
              />
              <span className="text-body-sm">
                {name} — {value}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="logos" className="flex flex-col gap-4">
        <h2 id="logos" className="text-h2">
          Logos
        </h2>
        <ul className="flex flex-wrap items-center gap-8 rounded-md border border-border bg-card p-4">
          {LOGOS.map(({ src, alt, width, height, rendu }) => (
            <li key={src}>
              <Image
                data-testid="logo"
                src={src}
                alt={alt}
                width={rendu}
                height={Math.round((rendu * height) / width)}
              />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
