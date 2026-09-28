import type {
  Breadcrumb,
  DataCollection,
  ErrorEvent,
  Exception,
} from "@sentry/core";

import { redact, redactString } from "../logger/redact";

/**
 * Options Sentry communes au serveur et au navigateur (ADR 0010). Pur et isomorphe : aucune
 * lecture d'environnement ici, le DSN est passé par l'appelant.
 *
 * Défense en profondeur : (1) dataCollection coupe la collecte à la source — les défauts de la
 * v11 sont permissifs, chaque catégorie est donc posée explicitement ; (2) beforeSend et
 * beforeBreadcrumb masquent ce qui passerait quand même ; (3) les scrubbers du projet Sentry.
 */

const ALLOWED_HEADERS = ["user-agent", "content-type", "accept-language"];

export const DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ALLOWED_HEADERS }, response: false },
  httpBodies: [],
  urlQueryParams: false,
  // Entrées/sorties du LLM : offres et critères de l'utilisateur (dès P3).
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
  // Les variables locales peuvent contenir un profil ou un email.
  stackFrameVariables: false,
  // Lignes de code source autour d'une frame : le dépôt est public.
  frameContextLines: 5,
} satisfies DataCollection;

// Contextes posés par le SDK (clés connues, « name » y est le nom d'un OS ou d'un navigateur) :
// seules leurs valeurs sont masquées. Tout autre contexte (dont « log ») est masqué entièrement.
const SDK_CONTEXTS = new Set([
  "app",
  "browser",
  "cloud_resource",
  "culture",
  "device",
  "os",
  "runtime",
  "trace",
]);

export type SentryConfigInput = {
  dsn: string | undefined;
  environment: string;
};

/** undefined sans DSN : l'appelant n'initialise alors pas Sentry du tout. */
export function buildSentryOptions({ dsn, environment }: SentryConfigInput) {
  if (!dsn) return undefined;
  return {
    dsn,
    environment,
    debug: false,
    dataCollection: DATA_COLLECTION,
    // Pas de traces en P0 (plan P0-06, D5) ; jamais d'en-têtes sentry-trace vers les API tierces.
    tracePropagationTargets: [],
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}

function stripQuery(url: string): string {
  return url.split(/[?#]/, 1)[0] ?? "";
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  // server_name = nom de la machine : inutile (un seul serveur) et personnel sur un poste.
  const { server_name: _machine, ...rest } = event;
  const result: ErrorEvent = { ...rest };

  if (event.request) {
    // Liste d'autorisation : ni cookies, ni corps, ni query string, ni env (REMOTE_ADDR).
    const { method, url, headers } = event.request;
    result.request = {
      ...(method !== undefined && { method }),
      ...(url !== undefined && { url: stripQuery(url) }),
      ...(headers && {
        headers: Object.fromEntries(
          Object.entries(headers).filter(([name]) =>
            ALLOWED_HEADERS.includes(name.toLowerCase()),
          ),
        ),
      }),
    };
  }
  if (event.user) {
    const { id } = event.user;
    if (id === undefined) delete result.user;
    else result.user = { id };
  }
  if (event.message !== undefined) result.message = redactString(event.message);
  if (event.extra)
    result.extra = redact(event.extra) as NonNullable<ErrorEvent["extra"]>;
  if (event.tags)
    result.tags = redact(event.tags) as NonNullable<ErrorEvent["tags"]>;
  if (event.contexts)
    result.contexts = Object.fromEntries(
      Object.entries(event.contexts).map(([name, context]) => [
        name,
        redact(context, { keys: !SDK_CONTEXTS.has(name) }),
      ]),
    ) as NonNullable<ErrorEvent["contexts"]>;
  if (event.exception?.values)
    result.exception = {
      ...event.exception,
      values: event.exception.values.map(scrubException),
    };
  if (event.breadcrumbs)
    result.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  return result;
}

function scrubException(exception: Exception): Exception {
  const result: Exception = { ...exception };
  if (exception.value !== undefined)
    result.value = redactString(exception.value);
  if (exception.stacktrace?.frames)
    result.stacktrace = {
      ...exception.stacktrace,
      frames: exception.stacktrace.frames.map(
        ({ vars: _vars, ...frame }) => frame,
      ),
    };
  return result;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const result: Breadcrumb = { ...breadcrumb };
  if (breadcrumb.message !== undefined)
    result.message = redactString(breadcrumb.message);
  if (breadcrumb.data) {
    const data = redact(breadcrumb.data) as Record<string, unknown>;
    // fetch/xhr/http : url ; navigation : from, to.
    for (const key of ["url", "from", "to"]) {
      const value = data[key];
      if (typeof value === "string") data[key] = stripQuery(value);
    }
    result.data = data;
  }
  return result;
}
