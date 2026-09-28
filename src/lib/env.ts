import { z } from "zod";

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
  readonly reason: "manquante" | "invalide";
};

const DEFAULT_APP_URL = "http://localhost:3000";
const DEFAULT_SCORING_MODEL = "claude-haiku-4-5-20251001";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

const httpUrl = () => z.url({ protocol: /^https?$/ });
const required = () => z.string().min(1);
const secret = () => z.string().min(32);
// DSN Sentry : https, clé publique en nom d'utilisateur, chemin = identifiant numérique du projet.
const sentryDsn = () =>
  z.url({ protocol: /^https$/ }).refine((value) => {
    // Zod 4 exécute le refine même si la vérification d'URL a échoué : ne jamais lever ici.
    try {
      const { username, pathname } = new URL(value);
      return username !== "" && /^\/\d+$/.test(pathname);
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
  database: { DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }) },
  auth: { BETTER_AUTH_SECRET: secret() },
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

export const envSchemas = {
  core,
  database: z.object(shapes.database),
  auth: z.object(shapes.auth),
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
  auth: Object.keys(shapes.auth),
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
  web: ["core", "sentry"],
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
  const cleaned = clean(source);
  const issues = domains.flatMap((domain) => {
    const result = check(domain, cleaned);
    return result.ok ? [] : result.issues;
  });
  if (issues.length > 0)
    throw new EnvValidationError(context, normalize(issues));
}

/** Refuse le démarrage si un domaine requis pour ce runtime est invalide. */
export function assertStartupEnv(
  runtime: Runtime,
  source: EnvSource = process.env,
): void {
  parseEnvDomains(STARTUP_DOMAINS[runtime], source, runtime);
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
