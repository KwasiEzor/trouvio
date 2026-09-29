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
const SIZE_MARK = "[Taille max]";
const TRUNCATED_MARK = "…[tronqué]";
// Clé ajoutée à un objet coupé (le reste est compté, comme pour les tableaux).
const MORE_KEY = "…";

const MAX_DEPTH = 8;
const MAX_ITEMS = 50;
// Budget de valeurs visitées par appel : borne la sortie même avec des références partagées.
const MAX_NODES = 1_000;
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
  "privatekey",
  "accesskey",
  "mail",
  "phone",
  "mobile",
  "iban",
  "session",
  "signature",
  "dsn",
  "credential",
  "username",
  "firstname",
  "lastname",
  "fullname",
  "prenom",
  "birth",
  "salary",
  "cv",
  "resume",
];
// …ou si elles valent exactement l'un de ceux-ci (trop courts ou trop génériques pour « contient »).
const SENSITIVE_KEYS = new Set([
  "key",
  "pwd",
  "auth",
  "ip",
  "ipaddress",
  "address",
  "name",
  "nom",
]);
// Compteurs de jetons d'un LLM (inputTokens, output_tokens) : gardés s'ils sont des nombres.
const TOKEN_COUNTERS = /tokens$|tokencount$/;

const SENSITIVE_PARAMS =
  "token|key|app_key|app_id|apikey|api_key|secret|client_secret|password|code|signature|sig|access_token|refresh_token|id_token|auth|email|phone";
// Champs d'un corps JSON cité tel quel (réponse OAuth, erreur d'API).
const SENSITIVE_JSON_FIELDS =
  "access_token|refresh_token|id_token|client_secret|password|api_key|apikey|app_key|token|secret|authorization";

// L'ordre compte : les identifiants d'URL passent avant les emails (« user:mdp@hote.tld »), les
// IBAN avant les téléphones (dont les chiffres ressemblent à un numéro).
const VALUE_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/(\/\/)[^/\s:@]+:[^/\s@]+@/g, `$1${REDACTED}@`],
  [/\bBearer\s+[\w\-.~+/]+=*/gi, `Bearer ${REDACTED}`],
  [/\bBasic\s+[A-Za-z0-9+/]{8,}=*/g, `Basic ${REDACTED}`],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, REDACTED],
  [/\bsk-ant-[\w-]+/g, REDACTED],
  [/\bre_[A-Za-z0-9_]{16,}/g, REDACTED],
  // Jeton de bot Telegram (« 123456789:AA… »), y compris dans /bot<jeton>/.
  [/(?<!\d)\d{6,}:[\w-]{30,}/g, REDACTED],
  [
    new RegExp(`((?:^|[?&;#\\s,])(?:${SENSITIVE_PARAMS})=)[^&#\\s]*`, "gi"),
    `$1${REDACTED}`,
  ],
  [
    new RegExp(`("(?:${SENSITIVE_JSON_FIELDS})"\\s*:\\s*")[^"]*"`, "gi"),
    `$1${REDACTED}"`,
  ],
  // Email, y compris percent-encodé (« jean%40gmail.com »).
  [
    /(?<![\w.%+-])[\w.%+-]+(?:@|%40)[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}/g,
    REDACTED,
  ],
  [/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g, REDACTED],
  // Téléphones français et belges, nationaux ou internationaux.
  [/\+3[23][ .-]?[1-9](?:[ .-]?\d{2}){4}(?!\d)/g, REDACTED],
  [/(?<![\d+])0[1-9](?:[ .-]?\d{2}){4}(?!\d)/g, REDACTED],
];

export type RedactOptions = {
  /** false : ne masque que les valeurs (contextes techniques du SDK, dont les clés sont connues). */
  readonly keys?: boolean;
};

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_\s.]/g, "");
}

export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    SENSITIVE_KEYS.has(normalized) ||
    SENSITIVE_PARTS.some((part) => normalized.includes(part))
  );
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

type Walk = {
  readonly keys: boolean;
  readonly ancestors: WeakSet<object>;
  nodes: number;
};

/** Copie masquée et sérialisable en JSON d'une valeur quelconque ; l'entrée n'est jamais modifiée. */
export function redact(value: unknown, options: RedactOptions = {}): unknown {
  return walk(value, 0, {
    keys: options.keys ?? true,
    ancestors: new WeakSet(),
    nodes: 0,
  });
}

function walk(value: unknown, depth: number, state: Walk): unknown {
  state.nodes += 1;
  if (state.nodes > MAX_NODES) return SIZE_MARK;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol")
    return undefined;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  if (value instanceof URL) return redactString(value.href);
  if (ArrayBuffer.isView(value)) return `[Binaire ${value.byteLength} octets]`;
  // Seuls les ancêtres comptent : une même référence à deux endroits n'est pas un cycle.
  if (state.ancestors.has(value)) return CIRCULAR;
  if (depth >= MAX_DEPTH) return DEPTH_MARK;

  state.ancestors.add(value);
  try {
    if (value instanceof Error)
      return { name: value.name, message: redactString(value.message) };
    if (value instanceof Map)
      return walkEntries(
        [...value].map(([key, item]) => [String(key), item] as const),
        depth,
        state,
      );
    if (Array.isArray(value) || value instanceof Set) {
      const items: unknown[] = [...value];
      const kept = items
        .slice(0, MAX_ITEMS)
        .map((item) => walk(item, depth + 1, state));
      if (items.length > MAX_ITEMS)
        kept.push(`[… ${items.length - MAX_ITEMS} de plus]`);
      return kept;
    }
    return walkEntries(Object.entries(value), depth, state);
  } finally {
    state.ancestors.delete(value);
  }
}

function walkEntries(
  entries: readonly (readonly [string, unknown])[],
  depth: number,
  state: Walk,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const kept = entries.filter(
    ([, item]) => typeof item !== "function" && typeof item !== "symbol",
  );
  for (const [key, item] of kept.slice(0, MAX_ITEMS)) {
    result[key] =
      state.keys && isSensitiveKey(key) && !isTokenCount(key, item)
        ? REDACTED
        : walk(item, depth + 1, state);
  }
  if (kept.length > MAX_ITEMS)
    result[MORE_KEY] = `[… ${kept.length - MAX_ITEMS} de plus]`;
  return result;
}

function isTokenCount(key: string, item: unknown): boolean {
  return typeof item === "number" && TOKEN_COUNTERS.test(normalizeKey(key));
}
