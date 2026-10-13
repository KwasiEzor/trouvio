import { SENTRY_EU_INGEST_HOST } from "../env";

/**
 * En-têtes de sécurité (P1-05, ADR 0016, SECURITY §3). Pur : aucune lecture d'environnement.
 *
 * Deux sources, sans chevauchement :
 * - next.config.ts headers() (securityHeaderRules) : en-têtes communs sur toutes les routes
 *   (pages, API, fichiers statiques), et CSP stricte des réponses JSON de /api/ ;
 * - src/proxy.ts (buildPageCsp) : CSP à nonce des pages, un nonce par requête.
 */

/** Base64 (standard ou URL) : jeu de caractères du motif de Next pour un nonce. */
export const NONCE_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/;

const NONCE_BYTES = 16;

/** 16 octets aléatoires en base64 (24 caractères), un par requête. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  return btoa(String.fromCharCode(...bytes));
}

export type PageCspInput = {
  nonce: string;
  /** Développement : unsafe-eval (React) et styles en ligne (overlay de Next). */
  dev: boolean;
  /** APP_URL en https : upgrade-insecure-requests (Safari le suivrait sur http://localhost). */
  https: boolean;
  /** DSN de build, celui du bundle navigateur ; son origine seule rejoint connect-src. */
  sentryDsn: string | undefined;
};

/**
 * Origine d'ingestion d'une organisation Sentry UE (https://o<id>.ingest.de.sentry.io), sans clé ni
 * chemin. Jamais de joker : il ouvrirait l'exfiltration vers n'importe quelle organisation.
 */
export function sentryIngestOrigin(
  dsn: string | undefined,
): string | undefined {
  if (dsn === undefined || dsn === "") return undefined;
  try {
    const url = new URL(dsn);
    if (url.protocol !== "https:" || !SENTRY_EU_INGEST_HOST.test(url.hostname))
      return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

/**
 * CSP des pages. Aucun script n'est autorisé par unsafe-inline, même en repli : les scripts de Next
 * portent le nonce, ceux qu'ils chargent héritent de la confiance (strict-dynamic). Les éléments
 * <style> restent sous nonce ; les attributs style (next/image, Magic UI) sont admis (ADR 0016).
 */
export function buildPageCsp({
  nonce,
  dev,
  https,
  sentryDsn,
}: PageCspInput): string {
  // Défense contre l'injection de directives : un nonce hors motif ne doit jamais atteindre l'en-tête.
  if (!NONCE_PATTERN.test(nonce)) throw new Error("nonce CSP invalide");
  const sentry = sentryIngestOrigin(sentryDsn);
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    dev
      ? "style-src 'self' 'unsafe-inline'"
      : `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${sentry === undefined ? "" : ` ${sentry}`}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (https) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** Réponses JSON de l'API : rien ne doit s'y exécuter ni s'y afficher en cadre. */
export const API_CSP =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

// HSTS sans preload (quasi irréversible) : à décider avec le domaine (P10-02). Ignoré en HTTP.
const COMMON_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // Fonctionnalités établies seulement : un nom inconnu produit une erreur console.
    key: "Permissions-Policy",
    value:
      "accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), serial=(), usb=()",
  },
  // Complément historique de frame-ancestors, pour les navigateurs sans CSP de niveau 2.
  { key: "X-Frame-Options", value: "DENY" },
];

/** Règles de next.config.ts headers(). */
export function securityHeaderRules(): {
  source: string;
  headers: { key: string; value: string }[];
}[] {
  return [
    { source: "/:path*", headers: COMMON_HEADERS },
    {
      source: "/api/:path*",
      headers: [{ key: "Content-Security-Policy", value: API_CSP }],
    },
  ];
}
