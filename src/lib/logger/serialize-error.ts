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
  errors?: SerializedError[];
  value?: unknown;
  [property: string]: unknown;
};

const MAX_CAUSE_DEPTH = 5;
const MAX_ERRORS = 50;
// Une pile porte plus d'information utile qu'un message : borne plus large.
const MAX_STACK = 8_000;
const RESERVED = new Set(["name", "message", "stack", "cause", "errors"]);

export function serializeError(error: unknown): SerializedError {
  return serialize(error, 0, new WeakSet());
}

function serialize(
  error: unknown,
  depth: number,
  seen: WeakSet<Error>,
): SerializedError {
  // Une valeur lancée qui n'est pas une Error (chaîne, objet, null) reste lisible, masquée.
  if (!(error instanceof Error))
    return { name: "NonError", value: redact(error) };
  seen.add(error);

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
    result.cause = followCause(error.cause, depth, seen);
  }
  if (error instanceof AggregateError) {
    result.errors = (error.errors as unknown[])
      .slice(0, MAX_ERRORS)
      .map((item) => serialize(item, depth + 1, seen));
  }
  return result;
}

function followCause(
  cause: unknown,
  depth: number,
  seen: WeakSet<Error>,
): SerializedError | string | undefined {
  if (cause instanceof Error && seen.has(cause)) return CIRCULAR;
  if (depth + 1 > MAX_CAUSE_DEPTH) return undefined;
  return serialize(cause, depth + 1, seen);
}
