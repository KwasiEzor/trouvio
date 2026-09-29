import { CIRCULAR, redact, redactString } from "./redact";

/**
 * Erreur prête pour un journal JSON : nom, message et pile masqués, propriétés propres (code,
 * status…) masquées, chaîne `cause` et erreurs d'une AggregateError suivies avec une borne.
 */
export type SerializedError = {
  name: string;
  message?: string;
  stack?: string;
  cause?: SerializedError | string;
  errors?: (SerializedError | string)[];
  value?: unknown;
  [property: string]: unknown;
};

// Même profondeur pour `cause` et pour les `errors` d'une AggregateError.
const MAX_DEPTH = 5;
// Nombre total d'erreurs sérialisées par appel (AggregateError imbriquées comprises).
const MAX_ERRORS = 20;
// Une pile porte plus d'information utile qu'un message : borne plus large.
const MAX_STACK = 8_000;
const RESERVED = new Set(["name", "message", "stack", "cause", "errors"]);

type State = { readonly seen: WeakSet<Error>; count: number };

export function serializeError(error: unknown): SerializedError {
  return serialize(error, 0, { seen: new WeakSet(), count: 0 });
}

function serialize(
  error: unknown,
  depth: number,
  state: State,
): SerializedError {
  state.count += 1;
  // Une valeur lancée qui n'est pas une Error (chaîne, objet, null) reste lisible, masquée.
  if (!(error instanceof Error))
    return { name: "NonError", value: redact(error) };
  state.seen.add(error);

  const own = Object.fromEntries(
    Object.entries(error).filter(([key]) => !RESERVED.has(key)),
  );
  const result: SerializedError = {
    name: error.name,
    message: redactString(error.message),
    ...(redact(own) as Record<string, unknown>),
  };
  if (error.stack) result.stack = redactString(error.stack, MAX_STACK);

  if (error.cause !== undefined) {
    const cause = follow(error.cause, depth, state);
    if (cause !== undefined) result.cause = cause;
  }
  if (error instanceof AggregateError) {
    const items: unknown[] = Array.isArray(error.errors) ? error.errors : [];
    const kept: (SerializedError | string)[] = [];
    for (const item of items) {
      const serialized = follow(item, depth, state);
      if (serialized === undefined) break;
      kept.push(serialized);
    }
    if (kept.length < items.length)
      kept.push(`[… ${items.length - kept.length} de plus]`);
    result.errors = kept;
  }
  return result;
}

/** undefined : profondeur ou budget épuisé, le reste est omis. */
function follow(
  item: unknown,
  depth: number,
  state: State,
): SerializedError | string | undefined {
  if (item instanceof Error && state.seen.has(item)) return CIRCULAR;
  if (depth + 1 > MAX_DEPTH || state.count >= MAX_ERRORS) return undefined;
  return serialize(item, depth + 1, state);
}
