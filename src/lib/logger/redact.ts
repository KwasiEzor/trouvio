/**
 * Masquage des données sensibles avant toute sortie (journaux, Sentry). Isomorphe et sans
 * dépendance : utilisé par le logger (serveur, job) et par le beforeSend de Sentry (navigateur).
 *
 * Liste de refus sur les clés ET motifs sur les valeurs : les fuites réelles passent souvent par
 * une valeur (URL Adzuna avec app_key, URL Telegram avec le jeton du bot, email dans un message).
 */

export const REDACTED = "[REDACTED]";
export const CIRCULAR = "[Circulaire]";
const DEPTH_MARK = "[Profondeur max]";
const TRUNCATED_MARK = "…[tronqué]";

const MAX_DEPTH = 8;
const MAX_ITEMS = 50;
const MAX_STRING = 2_000;
// Borne le texte examiné par les motifs (coût linéaire garanti même sur une entrée énorme).
const MAX_SCAN = 20_000;

// Clés normalisées (minuscules, sans séparateur) : sensibles si elles CONTIENNENT l'un de ces mots…
const SENSITIVE_PARTS = [
  "password",
  "passwd",
  "secret",
  "token",
  "authorization",
  "cookie",
  "apikey",
  "appkey",
  "email",
  "phone",
  "iban",
  "session",
  "signature",
  "dsn",
  "credential",
];
// …ou si elles valent exactement l'un de ceux-ci (trop courts ou trop génériques pour « contient »).
const SENSITIVE_KEYS = new Set([
  "key",
  "pwd",
  "auth",
  "ip",
  "ipaddress",
  "address",
  "firstname",
  "lastname",
  "fullname",
  "name",
  "salary",
  "cv",
  "resume",
]);
// Compteurs de jetons d'un LLM (inputTokens, output_tokens) : des nombres, pas des secrets.
const TOKEN_COUNTERS = /tokens$|tokencount$/;

const SENSITIVE_PARAMS =
  "token|key|app_key|app_id|apikey|api_key|secret|client_secret|password|code|signature|access_token|refresh_token|id_token|auth";

// L'ordre compte : les identifiants d'URL passent avant les emails (« user:mdp@hote.tld »).
const VALUE_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/(\/\/)[^/\s:@]+:[^/\s@]+@/g, `$1${REDACTED}@`],
  [/\bBearer\s+[\w\-.~+/]+=*/gi, `Bearer ${REDACTED}`],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, REDACTED],
  [/\bsk-ant-[\w-]+/g, REDACTED],
  // Jeton de bot Telegram (« 123456:AA… »), y compris dans /bot<jeton>/.
  [/(?<!\d)\d+:[\w-]{30,}/g, REDACTED],
  [
    new RegExp(`([?&;](?:${SENSITIVE_PARAMS})=)[^&#\\s]*`, "gi"),
    `$1${REDACTED}`,
  ],
  [/(?<![\w.%+-])[\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}/g, REDACTED],
];

export type RedactOptions = {
  /** false : ne masque que les valeurs (contextes techniques du SDK, dont les clés sont connues). */
  readonly keys?: boolean;
};

export function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_\s.]/g, "");
  if (SENSITIVE_KEYS.has(normalized)) return true;
  if (TOKEN_COUNTERS.test(normalized)) return false;
  return SENSITIVE_PARTS.some((part) => normalized.includes(part));
}

/** Masque les motifs sensibles d'un texte, puis le tronque à `max` caractères. */
export function redactString(text: string, max = MAX_STRING): string {
  let result = text.slice(0, MAX_SCAN);
  for (const [pattern, replacement] of VALUE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result.length > max || text.length > MAX_SCAN
    ? result.slice(0, max) + TRUNCATED_MARK
    : result;
}

/** Copie masquée et sérialisable en JSON d'une valeur quelconque ; l'entrée n'est jamais modifiée. */
export function redact(value: unknown, options: RedactOptions = {}): unknown {
  return walk(value, options.keys ?? true, 0, new WeakSet());
}

function walk(
  value: unknown,
  keys: boolean,
  depth: number,
  ancestors: WeakSet<object>,
): unknown {
  if (typeof value === "string") return redactString(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol")
    return undefined;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  if (value instanceof URL) return redactString(value.href);
  // Seuls les ancêtres comptent : une même référence à deux endroits n'est pas un cycle.
  if (ancestors.has(value)) return CIRCULAR;
  if (depth >= MAX_DEPTH) return DEPTH_MARK;

  ancestors.add(value);
  try {
    if (value instanceof Error)
      return { name: value.name, message: redactString(value.message) };
    if (value instanceof Map)
      return walkEntries(
        [...value].map(([key, item]) => [String(key), item] as const),
        keys,
        depth,
        ancestors,
      );
    if (Array.isArray(value) || value instanceof Set) {
      const items: unknown[] = [...value];
      const kept = items
        .slice(0, MAX_ITEMS)
        .map((item) => walk(item, keys, depth + 1, ancestors));
      if (items.length > MAX_ITEMS)
        kept.push(`[… ${items.length - MAX_ITEMS} de plus]`);
      return kept;
    }
    return walkEntries(Object.entries(value), keys, depth, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function walkEntries(
  entries: readonly (readonly [string, unknown])[],
  keys: boolean,
  depth: number,
  ancestors: WeakSet<object>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, item] of entries) {
    if (typeof item === "function" || typeof item === "symbol") continue;
    result[key] =
      keys && isSensitiveKey(key)
        ? REDACTED
        : walk(item, keys, depth + 1, ancestors);
  }
  return result;
}
