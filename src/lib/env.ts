import { z } from "zod";

import { effectiveSslMode, isLoopbackUrl } from "./db/target";
import { LOG_THRESHOLDS } from "./logger/logger";

/**
 * Seul point d'accès aux variables d'environnement (CLAUDE.md §5).
 *
 * Toutes les variables prévues sont déclarées ici, groupées par domaine. Un domaine n'est
 * exigé au démarrage que lorsque sa fonctionnalité est en service (STARTUP_DOMAINS) ; les
 * autres sont validés au premier accès via getEnv(). Les erreurs ne citent que des noms de
 * variables, jamais leurs valeurs.
 */

export type EnvSource = Readonly<Record<string, string | undefined>>;
export type Runtime = "web" | "job";
export type EnvIssue = {
  readonly name: string;
  readonly reason: "manquante" | "invalide" | "interdite";
};

const DEFAULT_APP_URL = "http://localhost:3000";
const DEFAULT_SCORING_MODEL = "claude-haiku-4-5-20251001";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
// Base Docker locale de db/local/compose.yaml (ADR 0012) : identifiants jetables, boucle locale.
const DEFAULT_TEST_DATABASE_URL =
  "postgres://trouvio:trouvio@127.0.0.1:54329/postgres";
// verify-full seulement : require ne vérifie le certificat qu'en pg 8 (avec un avertissement), plus
// du tout avec uselibpqcompat ni à partir de pg 9 ; verify-ca ne vérifie pas le nom d'hôte.
const TLS_SSLMODES = new Set(["verify-full"]);
const OUTBOX_DIR = "AUTH_EMAIL_OUTBOX_DIR";

const httpUrl = () => z.url({ protocol: /^https?$/ });
const required = () => z.string().min(1);
const secret = () => z.string().min(32);
const postgresUrl = () => z.url({ protocol: /^postgres(ql)?$/ });
// Hors de la boucle locale, TLS exigé : identifiants et données ne circulent jamais en clair.
const databaseUrl = () =>
  // Zod 4 exécute le refine même si la vérification d'URL a échoué : ces deux lectures ne lèvent pas.
  postgresUrl().refine(
    (value) =>
      isLoopbackUrl(value) || TLS_SSLMODES.has(effectiveSslMode(value) ?? ""),
  );
// Base des tests d'intégration : boucle locale seulement, pour qu'aucun test ne vise Neon.
const testDatabaseUrl = () =>
  postgresUrl().refine(isLoopbackUrl).default(DEFAULT_TEST_DATABASE_URL);
// Hôte d'ingestion d'une organisation Sentry en région UE (ADR 0010) ; l'URL le met en minuscules.
export const SENTRY_EU_INGEST_HOST = /^o\d+\.ingest\.de\.sentry\.io$/;
// DSN Sentry : https, clé publique seule (une clé secrète partirait dans le bundle navigateur),
// hôte d'ingestion UE, chemin = identifiant numérique du projet, ni port, ni query, ni fragment.
/** Vrai si l'application est servie en boucle locale (APP_URL absente : défaut local hors production). */
function isLocalAppUrl(appUrl: string | undefined): boolean {
  if (appUrl === undefined) return true;
  try {
    return LOCAL_HOSTS.has(new URL(appUrl).hostname);
  } catch {
    return false;
  }
}
const sentryDsn = () =>
  z.url({ protocol: /^https$/ }).refine((value) => {
    // Zod 4 exécute le refine même si la vérification d'URL a échoué : ne jamais lever ici.
    try {
      const url = new URL(value);
      return (
        url.username !== "" &&
        url.password === "" &&
        SENTRY_EU_INGEST_HOST.test(url.hostname) &&
        url.port === "" &&
        url.search === "" &&
        url.hash === "" &&
        /^\/\d+$/.test(url.pathname)
      );
    } catch {
      return false;
    }
  });

const shapes = {
  core: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    APP_URL: httpUrl().optional(),
    LOG_LEVEL: z.enum(LOG_THRESHOLDS).default("info"),
  },
  // Rôle applicatif (DML seulement) : application, job, seed.
  database: { DATABASE_URL: databaseUrl() },
  // Rôle propriétaire du schéma (DDL) : lu par db:migrate seulement.
  databaseMigration: { DATABASE_MIGRATION_URL: databaseUrl() },
  testDatabase: { TEST_DATABASE_URL: testDatabaseUrl() },
  auth: { BETTER_AUTH_SECRET: secret() },
  // Boîte d'envoi sur disque des emails d'authentification (dev, E2E) : voir authEmail plus bas.
  authEmail: { AUTH_EMAIL_OUTBOX_DIR: required().optional() },
  anthropic: {
    ANTHROPIC_API_KEY: required(),
    ANTHROPIC_MODEL_SCORING: z
      .string()
      .regex(/^claude-[a-z0-9-]+$/)
      .default(DEFAULT_SCORING_MODEL),
  },
  franceTravail: {
    FRANCE_TRAVAIL_CLIENT_ID: required(),
    FRANCE_TRAVAIL_CLIENT_SECRET: required(),
  },
  adzuna: { ADZUNA_APP_ID: required(), ADZUNA_APP_KEY: required() },
  telegram: {
    TELEGRAM_BOT_TOKEN: required(),
    TELEGRAM_WEBHOOK_SECRET: secret(),
  },
  email: { RESEND_API_KEY: required(), EMAIL_FROM: required() },
  sentry: { SENTRY_DSN: sentryDsn().optional() },
  cron: { CRON_SECRET: secret() },
};

export type EnvDomain = keyof typeof shapes;

const core = z
  .object(shapes.core)
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== "production") return;
    if (value.APP_URL === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message: "requise en production",
      });
      return;
    }
    // En production : HTTPS obligatoire (cookies Secure, liens magiques, liens des digests),
    // sauf pour un serveur local lancé avec `next start`.
    const { protocol, hostname } = new URL(value.APP_URL);
    if (protocol !== "https:" && !LOCAL_HOSTS.has(hostname)) {
      ctx.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message: "HTTPS requis en production",
      });
    }
  })
  .transform(({ NODE_ENV, APP_URL, LOG_LEVEL }) => ({
    NODE_ENV,
    APP_URL: new URL(APP_URL ?? DEFAULT_APP_URL).origin,
    LOG_LEVEL,
  }));

// Les liens d'authentification sont écrits en clair dans la boîte d'envoi : jamais hors boucle locale.
const authEmail = z
  .object({ ...shapes.authEmail, APP_URL: z.string().optional() })
  .refine(
    (value) =>
      value.AUTH_EMAIL_OUTBOX_DIR === undefined || isLocalAppUrl(value.APP_URL),
    { path: [OUTBOX_DIR] },
  )
  .transform(({ AUTH_EMAIL_OUTBOX_DIR }) => ({ AUTH_EMAIL_OUTBOX_DIR }));

export const envSchemas = {
  core,
  database: z.object(shapes.database),
  databaseMigration: z.object(shapes.databaseMigration),
  testDatabase: z.object(shapes.testDatabase),
  auth: z.object(shapes.auth),
  authEmail,
  anthropic: z.object(shapes.anthropic),
  franceTravail: z.object(shapes.franceTravail),
  adzuna: z.object(shapes.adzuna),
  telegram: z.object(shapes.telegram),
  email: z.object(shapes.email),
  sentry: z.object(shapes.sentry),
  cron: z.object(shapes.cron),
} satisfies Record<EnvDomain, z.ZodType>;

export type Env<D extends EnvDomain> = z.output<(typeof envSchemas)[D]>;

/** Noms des variables de chaque domaine. */
export const envVariables: Record<EnvDomain, readonly string[]> = {
  core: Object.keys(shapes.core),
  database: Object.keys(shapes.database),
  databaseMigration: Object.keys(shapes.databaseMigration),
  testDatabase: Object.keys(shapes.testDatabase),
  auth: Object.keys(shapes.auth),
  authEmail: Object.keys(shapes.authEmail),
  anthropic: Object.keys(shapes.anthropic),
  franceTravail: Object.keys(shapes.franceTravail),
  adzuna: Object.keys(shapes.adzuna),
  telegram: Object.keys(shapes.telegram),
  email: Object.keys(shapes.email),
  sentry: Object.keys(shapes.sentry),
  cron: Object.keys(shapes.cron),
};

/** Domaines exigés au démarrage. Chaque tâche qui met un domaine en service l'ajoute ici. */
export const STARTUP_DOMAINS = {
  web: ["core", "sentry", "database", "auth"],
  job: ["core", "sentry"],
} as const satisfies Record<Runtime, readonly EnvDomain[]>;

export class EnvValidationError extends Error {
  override readonly name = "EnvValidationError";
  readonly issues: readonly EnvIssue[];

  constructor(context: string, issues: readonly EnvIssue[]) {
    super(formatMessage(context, issues));
    this.issues = issues;
  }
}

function formatMessage(context: string, issues: readonly EnvIssue[]): string {
  const list = (reason: EnvIssue["reason"]) =>
    issues
      .filter((issue) => issue.reason === reason)
      .map((issue) => issue.name);
  const parts = [
    ["manquantes", list("manquante")],
    ["invalides", list("invalide")],
    ["interdites", list("interdite")],
  ] as const;
  const details = parts
    .filter(([, names]) => names.length > 0)
    .map(([label, names]) => `${label} : ${names.join(", ")}`)
    .join(" ; ");
  return `Configuration invalide (${context}) — ${details}`;
}

/** Retire les espaces ; une valeur vide vaut « absente ». */
function clean(source: EnvSource): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    const trimmed = value?.trim();
    if (trimmed) result[name] = trimmed;
  }
  return result;
}

type Checked = { ok: true; data: unknown } | { ok: false; issues: EnvIssue[] };

function check(domain: EnvDomain, cleaned: Record<string, string>): Checked {
  const schema: z.ZodType = envSchemas[domain];
  const result = schema.safeParse(cleaned);
  if (result.success) return { ok: true, data: result.data };
  // Seul le nom est conservé : ni la valeur saisie ni le message de Zod ne sortent d'ici.
  const issues = result.error.issues.flatMap((issue): EnvIssue[] => {
    const name = issue.path[0];
    if (typeof name !== "string") return [];
    return [{ name, reason: name in cleaned ? "invalide" : "manquante" }];
  });
  return { ok: false, issues };
}

function normalize(issues: readonly EnvIssue[]): EnvIssue[] {
  const byName = new Map(issues.map((issue) => [issue.name, issue]));
  return [...byName.values()].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
}

/** Valide un domaine. Fonction pure : la source est injectée. */
export function parseEnv<D extends EnvDomain>(
  domain: D,
  source: EnvSource,
): Env<D> {
  const result = check(domain, clean(source));
  if (!result.ok)
    throw new EnvValidationError(domain, normalize(result.issues));
  return result.data as Env<D>;
}

/** Valide plusieurs domaines et agrège toutes leurs erreurs en une seule. */
export function parseEnvDomains(
  domains: readonly EnvDomain[],
  source: EnvSource,
  context: string,
): void {
  const issues = domainIssues(domains, clean(source));
  if (issues.length > 0)
    throw new EnvValidationError(context, normalize(issues));
}

function domainIssues(
  domains: readonly EnvDomain[],
  cleaned: Record<string, string>,
): EnvIssue[] {
  return domains.flatMap((domain) => {
    const result = check(domain, cleaned);
    return result.ok ? [] : result.issues;
  });
}

/**
 * Lues directement par un SDK, hors de ce fichier : interdites tant qu'un ADR ne les ouvre pas.
 * SENTRY_TRACES_SAMPLE_RATE activerait les traces (ADR 0010) ; les autres variables SENTRY_* lues
 * par le SDK sont neutralisées par ses options (sentry-options.ts). BETTER_AUTH_SECRETS prendrait le
 * pas sur le secret validé ici ; les deux autres piloteraient la télémétrie de Better Auth.
 */
const FORBIDDEN_AT_STARTUP = [
  "SENTRY_TRACES_SAMPLE_RATE",
  "BETTER_AUTH_SECRETS",
  "BETTER_AUTH_TELEMETRY",
  "BETTER_AUTH_TELEMETRY_ENDPOINT",
] as const;

function forbiddenAtStartup(cleaned: Record<string, string>): EnvIssue[] {
  const names: string[] = FORBIDDEN_AT_STARTUP.filter(
    (name) => name in cleaned,
  );
  if (OUTBOX_DIR in cleaned && !isLocalAppUrl(cleaned["APP_URL"]))
    names.push(OUTBOX_DIR);
  return names.map((name) => ({ name, reason: "interdite" }));
}

/** Refuse le démarrage si un domaine requis pour ce runtime est invalide ou une variable interdite posée. */
export function assertStartupEnv(
  runtime: Runtime,
  source: EnvSource = process.env,
): void {
  const cleaned = clean(source);
  const issues = [
    ...forbiddenAtStartup(cleaned),
    ...domainIssues(STARTUP_DOMAINS[runtime], cleaned),
  ];
  if (issues.length > 0)
    throw new EnvValidationError(runtime, normalize(issues));
}

/**
 * Valeurs publiques figées dans le bundle navigateur au build (next.config.ts, compiler.define).
 * N'exige rien (le build ne doit demander aucun secret) mais refuse une valeur invalide.
 */
export function publicBuildEnv(source: EnvSource = process.env): {
  NODE_ENV: Env<"core">["NODE_ENV"];
  SENTRY_DSN: string | undefined;
} {
  const cleaned = clean(source);
  const nodeEnv = shapes.core.NODE_ENV.safeParse(cleaned["NODE_ENV"]);
  const sentry = check("sentry", cleaned);
  const issues: EnvIssue[] = [
    ...(nodeEnv.success
      ? []
      : [{ name: "NODE_ENV", reason: "invalide" } as const]),
    ...(sentry.ok ? [] : sentry.issues),
  ];
  if (!nodeEnv.success || !sentry.ok)
    throw new EnvValidationError("build", normalize(issues));
  return {
    NODE_ENV: nodeEnv.data,
    SENTRY_DSN: (sentry.data as Env<"sentry">).SENTRY_DSN,
  };
}

/** Vrai dans le runtime Node de Next (instrumentation.ts) ; faux en edge ou hors Next. */
export function isNodeRuntime(source: EnvSource = process.env): boolean {
  return source["NEXT_RUNTIME"] === "nodejs";
}

/** Lecteur paresseux et mémorisé : rien n'est lu avant le premier accès. */
export function createEnvReader(read: () => EnvSource) {
  let source: EnvSource | undefined;
  const cache = new Map<EnvDomain, unknown>();

  return function getEnv<D extends EnvDomain>(domain: D): Env<D> {
    if (typeof window !== "undefined") {
      throw new Error("src/lib/env.ts est réservé au serveur.");
    }
    if (cache.has(domain)) return cache.get(domain) as Env<D>;
    source ??= read();
    const value = parseEnv(domain, source);
    cache.set(domain, value);
    return value;
  };
}

export const getEnv = createEnvReader(() => process.env);
