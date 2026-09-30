import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  fauxCleAnthropic,
  fauxCleResend,
  fauxJetonTelegram,
  fauxJwt,
} from "./secrets-factices";

const RACINE = new URL("../../", import.meta.url);

/** Fichiers suivis par git uniquement : jamais de parcours du disque (les .env ignorés restent hors d'atteinte). */
function fichiersSuivis(): string[] {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: RACINE,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
}

function lire(fichier: string): string | undefined {
  try {
    return readFileSync(new URL(fichier, RACINE), "utf8");
  } catch {
    return undefined; // suivi mais supprimé de l'arbre de travail
  }
}

const BINAIRES = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|mp4|zip)$/i;
const FICHIER_ENV_SECRET = /(^|\/)\.env(\..+)?$/;

// Formats réels (règles de gitleaks et du secret scanning de GitHub). Aucun motif ne se reconnaît
// lui-même dans ce fichier : ses crochets et accolades ne sont pas des caractères de jeton.
const FORMATS: readonly (readonly [string, RegExp])[] = [
  // 30 caractères et plus : l'exemple de la doc Telegram (34) a été signalé par GitHub.
  ["jeton de bot Telegram", /(?<!\d)\d{8,10}:[\w-]{30,}/],
  ["JWT", /\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}/],
  ["clé Anthropic", /\bsk-ant-(?:api|admin)\d\d-[\w-]{80,}/],
  ["jeton GitHub", /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_\w{50,})/],
  ["clé AWS", /\bAKIA[0-9A-Z]{16}\b/],
  ["jeton Slack", /\bxox[abprs]-[\w-]{10,}/],
  ["clé Stripe", /\b(?:(?:sk|rk)_live|whsec)_[A-Za-z0-9]{16,}/],
  ["clé Resend", /\bre_[A-Za-z0-9]{8}_[A-Za-z0-9]{24}\b/],
  ["DSN Sentry réel", /https:\/\/[0-9a-f]{32}@o\d+\.ingest\./],
  [
    "clé privée",
    new RegExp(["-----BEGIN", "[A-Z ]*PRIVATE KEY-----"].join(" ")),
  ],
];

const EMAIL = /[\w.%+-]+(?:@|%40)([\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,})/g;
// RFC 2606 et 6761 ; sentry.io = hôte d'un DSN d'essai (« cle@o1.ingest.de.sentry.io »).
const DOMAINE_RESERVE =
  /(?:^|\.)(?:example\.(?:com|org|net)|example|test|invalid|localhost|sentry\.io)$/i;
const FICHIER_DE_TEST = /\.test\.tsx?$|^tests\//;

/** Formats reconnus dans un texte : leurs noms seulement, jamais la valeur trouvée. */
function formatsReconnus(texte: string): string[] {
  return FORMATS.filter(([, motif]) => motif.test(texte)).map(([nom]) => nom);
}

/** Constats « fichier:ligne quoi », sans la valeur (les journaux de la CI sont publics). */
function constats(
  fichiers: readonly string[],
  examiner: (ligne: string) => string[],
): string[] {
  return fichiers.flatMap((fichier) => {
    if (BINAIRES.test(fichier)) return [];
    const texte = lire(fichier);
    if (texte === undefined) return [];
    return texte
      .split("\n")
      .flatMap((ligne, i) =>
        examiner(ligne).map((quoi) => `${fichier}:${i + 1} ${quoi}`),
      );
  });
}

describe("littéraux de secrets dans le dépôt", () => {
  const fichiers = fichiersSuivis();

  it("ne suit aucun fichier d'environnement hors .env.example", () => {
    expect(
      fichiers.filter(
        (f) => FICHIER_ENV_SECRET.test(f) && !f.endsWith(".env.example"),
      ),
    ).toEqual([]);
  });

  it("ne contient aucun secret au format réel d'un fournisseur", () => {
    expect(constats(fichiers, formatsReconnus)).toEqual([]);
  });

  it("n'utilise que des domaines réservés dans les emails des tests", () => {
    const tests = fichiers.filter((f) => FICHIER_DE_TEST.test(f));
    const horsReserve = (ligne: string) =>
      [...ligne.matchAll(EMAIL)]
        .map(([, domaine]) => domaine ?? "")
        .filter((domaine) => !DOMAINE_RESERVE.test(domaine))
        .map((domaine) => `email sur ${domaine}`);
    expect(constats(tests, horsReserve)).toEqual([]);
  });

  it("reconnaît chaque faux secret fabriqué (autotest des motifs)", () => {
    expect(formatsReconnus(fauxJetonTelegram())).toEqual([
      "jeton de bot Telegram",
    ]);
    expect(formatsReconnus(fauxJwt())).toEqual(["JWT"]);
    expect(formatsReconnus(fauxCleAnthropic())).toEqual(["clé Anthropic"]);
    expect(formatsReconnus(fauxCleResend())).toEqual(["clé Resend"]);
    expect(
      formatsReconnus("aucun secret ici, cle@o1.ingest.de.sentry.io"),
    ).toEqual([]);
  });
});
