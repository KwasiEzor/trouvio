import type { Breadcrumb, ErrorEvent } from "@sentry/core";
import { describe, expect, it } from "vitest";

import { REDACTED } from "../logger/redact";
import {
  buildSentryOptions,
  DATA_COLLECTION,
  scrubBreadcrumb,
  scrubEvent,
} from "./sentry-options";

const DSN = "https://cle@o450000.ingest.de.sentry.io/4500000000000000";

/** Événement réaliste tel que le SDK pourrait le produire sans nos réglages. */
function evenementSale(): ErrorEvent {
  return {
    type: undefined,
    event_id: "e1",
    environment: "development",
    server_name: "poste-de-kwasi.local",
    message: "échec pour kwasi@exemple.fr",
    request: {
      method: "GET",
      url: "https://trouvio.example/offres?token=abc&page=2#haut",
      query_string: "token=abc&page=2",
      cookies: { "better-auth.session_token": "s3cr3t" },
      data: { password: "p" },
      env: { REMOTE_ADDR: "203.0.113.7" },
      headers: {
        "User-Agent": "Mozilla/5.0",
        Authorization: "Bearer abc",
        Cookie: "a=b",
        "Content-Type": "text/html",
        "X-Forwarded-For": "203.0.113.7",
      },
    },
    user: {
      id: "7f9c",
      email: "kwasi@exemple.fr",
      ip_address: "203.0.113.7",
      username: "kwasi",
    },
    extra: { adzunaApiKey: "cle", note: "voir a@b.fr" },
    tags: { source: "adzuna", "user.email": "a@b.fr" },
    contexts: {
      os: { name: "macOS", version: "15" },
      log: { source: "adzuna", email: "a@b.fr" },
      response: { status_code: 500, headers: { "set-cookie": "x" } },
    },
    exception: {
      values: [
        {
          type: "Error",
          value: "utilisateur kwasi@exemple.fr introuvable",
          stacktrace: {
            frames: [
              {
                filename: "app:///page.js",
                function: "charger",
                vars: { email: "kwasi@exemple.fr", profil: {} },
              },
            ],
          },
        },
      ],
    },
    breadcrumbs: [
      {
        category: "fetch",
        data: {
          url: "https://api.adzuna.com/v1?app_key=CLE&what=dev",
          method: "GET",
        },
      },
    ],
  };
}

describe("buildSentryOptions", () => {
  it("n'initialise rien sans DSN", () => {
    expect(
      buildSentryOptions({ dsn: undefined, environment: "production" }),
    ).toBeUndefined();
    expect(
      buildSentryOptions({ dsn: "", environment: "production" }),
    ).toBeUndefined();
  });

  it("passe le DSN et l'environnement explicitement, sans traces ni replay", () => {
    const options = buildSentryOptions({ dsn: DSN, environment: "production" });
    expect(options).toMatchObject({
      dsn: DSN,
      environment: "production",
      debug: false,
      tracePropagationTargets: [],
    });
    expect(options).not.toHaveProperty("tracesSampleRate");
    expect(options).not.toHaveProperty("replaysSessionSampleRate");
    expect(options).not.toHaveProperty("integrations");
    expect(options?.beforeSend).toBe(scrubEvent);
    expect(options?.beforeBreadcrumb).toBe(scrubBreadcrumb);
  });

  it("pose explicitement chaque catégorie de collecte (les défauts de la v11 sont permissifs)", () => {
    expect(
      buildSentryOptions({ dsn: DSN, environment: "x" })?.dataCollection,
    ).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { allow: ["user-agent", "content-type", "accept-language"] },
        response: false,
      },
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
      stackFrameVariables: false,
      frameContextLines: 5,
    });
    expect(DATA_COLLECTION.stackFrameVariables).toBe(false);
  });
});

describe("scrubEvent", () => {
  const propre = scrubEvent(evenementSale());

  it("ne garde de la requête que la méthode, l'URL sans query string et les en-têtes autorisés", () => {
    expect(propre.request).toEqual({
      method: "GET",
      url: "https://trouvio.example/offres",
      headers: { "User-Agent": "Mozilla/5.0", "Content-Type": "text/html" },
    });
  });

  it("réduit l'utilisateur à son identifiant interne", () => {
    expect(propre.user).toEqual({ id: "7f9c" });
    expect(
      scrubEvent({ type: undefined, user: { email: "a@b.fr" } }).user,
    ).toBeUndefined();
  });

  it("retire le nom de la machine", () => {
    expect(propre).not.toHaveProperty("server_name");
  });

  it("masque le message, les extras et les tags", () => {
    expect(propre.message).toBe(`échec pour ${REDACTED}`);
    expect(propre.extra).toEqual({
      adzunaApiKey: REDACTED,
      note: `voir ${REDACTED}`,
    });
    expect(propre.tags).toEqual({ source: "adzuna", "user.email": REDACTED });
  });

  it("masque les contextes, sans casser ceux du SDK (os.name)", () => {
    expect(propre.contexts).toEqual({
      os: { name: "macOS", version: "15" },
      log: { source: "adzuna", email: REDACTED },
      response: { status_code: 500, headers: { "set-cookie": REDACTED } },
    });
  });

  it("masque le message d'exception et retire les variables locales des frames", () => {
    const exception = propre.exception?.values?.[0];
    expect(exception?.value).toBe(`utilisateur ${REDACTED} introuvable`);
    expect(exception?.stacktrace?.frames?.[0]).toEqual({
      filename: "app:///page.js",
      function: "charger",
    });
  });

  it("nettoie aussi les fils d'Ariane déjà attachés", () => {
    expect(propre.breadcrumbs?.[0]?.data).toEqual({
      url: "https://api.adzuna.com/v1",
      method: "GET",
    });
  });

  it("ne contient plus aucune des valeurs sensibles de l'événement d'origine", () => {
    const texte = JSON.stringify(propre);
    for (const secret of [
      "kwasi@exemple.fr",
      "s3cr3t",
      "203.0.113.7",
      "Bearer",
      "token=abc",
      "app_key=CLE",
      "poste-de-kwasi",
    ]) {
      expect(texte).not.toContain(secret);
    }
  });

  it("ne modifie pas l'événement reçu", () => {
    const evenement = evenementSale();
    scrubEvent(evenement);
    expect(evenement).toEqual(evenementSale());
  });

  it("accepte un événement minimal", () => {
    expect(scrubEvent({ type: undefined })).toEqual({ type: undefined });
  });
});

describe("scrubBreadcrumb", () => {
  it("retire la query string des URL (fetch, xhr, navigation)", () => {
    const fetch: Breadcrumb = {
      category: "fetch",
      data: { url: "https://x.example/api?token=abc", status_code: 200 },
    };
    const navigation: Breadcrumb = {
      category: "navigation",
      data: { from: "/connexion?email=a@b.fr", to: "/offres?page=2" },
    };
    expect(scrubBreadcrumb(fetch).data).toEqual({
      url: "https://x.example/api",
      status_code: 200,
    });
    expect(scrubBreadcrumb(navigation).data).toEqual({
      from: "/connexion",
      to: "/offres",
    });
  });

  it("masque le message d'un fil d'Ariane de console", () => {
    const filConsole: Breadcrumb = {
      category: "console",
      message: "profil de kwasi@exemple.fr chargé",
      data: { arguments: ["kwasi@exemple.fr"], logger: "console" },
    };
    expect(scrubBreadcrumb(filConsole)).toEqual({
      category: "console",
      message: `profil de ${REDACTED} chargé`,
      data: { arguments: [REDACTED], logger: "console" },
    });
  });

  it("laisse intact un fil d'Ariane sans donnée", () => {
    expect(scrubBreadcrumb({ category: "ui.click" })).toEqual({
      category: "ui.click",
    });
  });
});
