import { describe, expect, it } from "vitest";

import {
  fauxCleAnthropic,
  fauxCleResend,
  fauxJetonTelegram,
  fauxJwt,
} from "@/test/secrets-factices";

import {
  CIRCULAR,
  REDACTED,
  isSensitiveKey,
  redact,
  redactString,
} from "./redact";

describe("isSensitiveKey", () => {
  it.each([
    "password",
    "Authorization",
    "access_token",
    "apiKey",
    "X-Api-Key",
    "app_key",
    "set-cookie",
    "userEmail",
    "SENTRY_DSN",
    "refreshToken",
    "client_secret",
    "key",
    "ip",
    "ip_address",
    "name",
    "first_name",
    "salary",
    "salaryMin",
    "cv",
    "cvText",
    "resumeUrl",
    "username",
    "userName",
    "mail",
    "mobile",
    "prenom",
    "nom",
    "privateKey",
    "accessKey",
    "birthDate",
    "pushTokens",
    "tokens",
    "host",
    "hostname",
  ])("considère %s comme sensible (casse et séparateurs ignorés)", (cle) => {
    expect(isSensitiveKey(cle)).toBe(true);
  });

  it.each([
    "source",
    "count",
    "offerId",
    "userId",
    "status",
    "durationMs",
    "keywords",
    "monkey",
    "nombre",
  ])("garde la clé neutre %s", (cle) => {
    expect(isSensitiveKey(cle)).toBe(false);
  });
});

describe("redact — clés", () => {
  it("masque les clés sensibles à toute profondeur, dans les objets et les tableaux", () => {
    const entree = {
      source: "adzuna",
      headers: { Authorization: "Bearer abc", "X-Api-Key": "k" },
      tentatives: [{ access_token: "t1", status: 401 }],
      profil: { contact: { email: "kwasi@example.com" } },
    };
    expect(redact(entree)).toEqual({
      source: "adzuna",
      headers: { Authorization: REDACTED, "X-Api-Key": REDACTED },
      tentatives: [{ access_token: REDACTED, status: 401 }],
      profil: { contact: { email: REDACTED } },
    });
  });

  it("masque la valeur entière d'une clé sensible, même si c'est un objet", () => {
    expect(redact({ session: { id: "s1", data: "x" } })).toEqual({
      session: REDACTED,
    });
  });

  it("conserve les identifiants internes et les compteurs", () => {
    const entree = { userId: "7f9c", offerId: "o-1", count: 3, ok: true };
    expect(redact(entree)).toEqual(entree);
  });

  it("garde les compteurs de jetons d'un LLM, mais seulement s'ils sont des nombres", () => {
    expect(
      redact({
        inputTokens: 1200,
        output_tokens: 80,
        tokens: ["abc123secretvalue"],
        pushTokens: ["xyz"],
        sessionTokens: "s3cr3t",
      }),
    ).toEqual({
      inputTokens: 1200,
      output_tokens: 80,
      tokens: REDACTED,
      pushTokens: REDACTED,
      sessionTokens: REDACTED,
    });
  });

  it("peut ne masquer que les valeurs (contextes techniques du SDK)", () => {
    expect(
      redact(
        { os: { name: "Linux" }, note: "écrire à a@b.example" },
        { keys: false },
      ),
    ).toEqual({ os: { name: "Linux" }, note: `écrire à ${REDACTED}` });
  });
});

describe("redactString — motifs dans les valeurs", () => {
  it.each([
    ["email dans une phrase", "échec pour kwasi.ezor+test@example.com hier"],
    ["en-tête Bearer", "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.x.y"],
    ["JWT seul", `jeton ${fauxJwt()}`],
    ["clé Anthropic", `clé ${fauxCleAnthropic()} refusée`],
  ])("masque un secret : %s", (_cas, texte) => {
    const resultat = redactString(texte);
    expect(resultat).toContain(REDACTED);
    expect(resultat).not.toMatch(
      /kwasi|eyJ[A-Za-z0-9_-]{10,}|sk-ant-api03|Bearer ey/,
    );
  });

  it("masque les identifiants d'une URL de connexion", () => {
    expect(redactString("postgresql://app:mdp-secret@hote.example/db")).toBe(
      `postgresql://${REDACTED}@hote.example/db`,
    );
  });

  it("masque app_id et app_key d'Adzuna mais garde les autres paramètres", () => {
    const url =
      "https://api.adzuna.com/v1/api/jobs/be/search/1?app_id=ID123&app_key=CLE456&what=dev&where=Liege";
    const resultat = redactString(url);
    expect(resultat).toBe(
      `https://api.adzuna.com/v1/api/jobs/be/search/1?app_id=${REDACTED}&app_key=${REDACTED}&what=dev&where=Liege`,
    );
  });

  it("masque le jeton d'un bot Telegram dans une URL", () => {
    const jeton = fauxJetonTelegram();
    const resultat = redactString(
      `https://api.telegram.org/bot${jeton}/sendMessage`,
    );
    expect(resultat).not.toContain(jeton.split(":")[1]);
    expect(resultat).toBe(
      `https://api.telegram.org/bot${REDACTED}/sendMessage`,
    );
  });

  it.each([
    [
      "paramètres en début de chaîne (URLSearchParams)",
      "app_key=CLE456&app_id=ID123&what=dev",
      `app_key=${REDACTED}&app_id=${REDACTED}&what=dev`,
    ],
    [
      "corps de formulaire OAuth cité dans un message",
      "corps : client_secret=S3cr3t&client_id=abc",
      `corps : client_secret=${REDACTED}&client_id=abc`,
    ],
    [
      "jeton dans un fragment d'URL",
      "https://trouvio.example/rappel#access_token=Xy7&type=bearer",
      `https://trouvio.example/rappel#access_token=${REDACTED}&type=bearer`,
    ],
    [
      "email encodé en paramètre",
      "/connexion?email=jean.dupont%40example.com&q=dev",
      `/connexion?email=${REDACTED}&q=dev`,
    ],
    [
      "signature d'un lien de désinscription",
      "/desinscription?u=7f9c&sig=a1b2c3",
      `/desinscription?u=7f9c&sig=${REDACTED}`,
    ],
    [
      "jeton opaque dans un corps JSON",
      'réponse {"access_token":"opaque42","expires_in":1499}',
      `réponse {"access_token":"${REDACTED}","expires_in":1499}`,
    ],
    [
      "email percent-encodé dans un chemin",
      "/u/jean%40example.com/profil",
      `/u/${REDACTED}/profil`,
    ],
    [
      "identifiants HTTP Basic",
      "Authorization: Basic dXNlcjpwYXNz",
      `Authorization: Basic ${REDACTED}`,
    ],
    ["clé Resend", `clé ${fauxCleResend()} refusée`, `clé ${REDACTED} refusée`],
    [
      "IBAN",
      "virement vers BE71 0961 2345 6769 refusé",
      `virement vers ${REDACTED} refusé`,
    ],
    [
      "téléphone français",
      "rappeler le 06 12 34 56 78 ou +33 6 12 34 56 78",
      `rappeler le ${REDACTED} ou ${REDACTED}`,
    ],
    [
      "téléphone belge",
      "joindre au 0470 12 34 56 ou +32 470 12 34 56",
      `joindre au ${REDACTED} ou ${REDACTED}`,
    ],
  ])("masque : %s", (_cas, texte, attendu) => {
    expect(redactString(texte)).toBe(attendu);
  });

  // Erreurs réseau de Node (pg, fetch) : le message cite l'hôte ou l'adresse visés (ADR 0012).
  it.each([
    [
      "hôte introuvable",
      "getaddrinfo ENOTFOUND ep-essai-123.eu-central-1.aws.neon.tech",
      `getaddrinfo ENOTFOUND ${REDACTED}`,
    ],
    [
      "résolution en échec temporaire",
      "getaddrinfo EAI_AGAIN base.example",
      `getaddrinfo EAI_AGAIN ${REDACTED}`,
    ],
    [
      "connexion refusée (IPv4)",
      "connect ECONNREFUSED 203.0.113.7:5432",
      `connect ECONNREFUSED ${REDACTED}`,
    ],
    [
      "connexion refusée (IPv6)",
      "connect ECONNREFUSED 2001:db8::7:5432",
      `connect ECONNREFUSED ${REDACTED}`,
    ],
    [
      "délai dépassé, au milieu d'une pile",
      "Error: connect ETIMEDOUT 203.0.113.7:5432\n    at TCPConnectWrap.afterConnect",
      `Error: connect ETIMEDOUT ${REDACTED}\n    at TCPConnectWrap.afterConnect`,
    ],
  ])("masque la cible d'une erreur réseau : %s", (_cas, texte, attendu) => {
    expect(redactString(texte)).toBe(attendu);
  });

  it.each([
    "offre 1:550e8400-e29b-41d4-a716-446655440000 retenue",
    "read ECONNRESET",
    "impossible de se connect à la base",
    "offre Adzuna 4567891234 vue 3 fois",
    "3 offres collectées depuis France Travail en 1200 ms",
  ])("laisse intact un texte sans donnée sensible : %s", (texte) => {
    expect(redactString(texte)).toBe(texte);
  });

  it("tronque une chaîne trop longue après masquage", () => {
    const resultat = redactString(`${"a".repeat(4990)} x@y.test`);
    expect(resultat.length).toBeLessThan(2100);
    expect(resultat).toMatch(/…\[tronqué\]$/);
    expect(redactString("court")).toBe("court");
  });

  it("n'examine que le début d'une entrée énorme et la signale tronquée", () => {
    const resultat = redactString(`${"a".repeat(25_000)} x@y.test`, 30_000);
    expect(resultat).toHaveLength(20_000 + "…[tronqué]".length);
    expect(resultat).toMatch(/…\[tronqué\]$/);
    expect(resultat).not.toContain("x@y.test");
  });

  it("reste linéaire sur des entrées hostiles", () => {
    const hostiles = [
      "a%40".repeat(5_000),
      `${"a.".repeat(10_000)}x`,
      "0".repeat(20_000),
      `Basic ${"A".repeat(19_000)}`,
      `${"BE71 ".repeat(4_000)}`,
    ];
    for (const texte of hostiles) {
      const debut = performance.now();
      redactString(texte);
      expect(performance.now() - debut).toBeLessThan(50);
    }
  });
});

describe("redact — limites et robustesse", () => {
  it("remplace une référence circulaire sans lever d'exception", () => {
    const a: Record<string, unknown> = { etape: "collecte" };
    a["soi"] = a;
    expect(redact(a)).toEqual({ etape: "collecte", soi: CIRCULAR });
  });

  it("ne confond pas une référence partagée avec un cycle", () => {
    const partage = { n: 1 };
    expect(redact({ a: partage, b: partage })).toEqual({
      a: { n: 1 },
      b: { n: 1 },
    });
  });

  it("borne la profondeur", () => {
    let profond: Record<string, unknown> = { fin: true };
    for (let i = 0; i < 12; i++) profond = { suite: profond };
    expect(JSON.stringify(redact(profond))).toContain("[Profondeur max]");
  });

  it("coupe les tableaux trop longs en signalant le reste", () => {
    const resultat = redact(Array.from({ length: 51 }, (_, i) => i));
    expect(resultat).toHaveLength(51);
    expect((resultat as unknown[])[50]).toBe("[… 1 de plus]");
  });

  it("coupe les objets qui ont trop de clés en signalant le reste", () => {
    const entree = Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [`k${i}`, i]),
    );
    const resultat = redact(entree) as Record<string, unknown>;
    expect(Object.keys(resultat)).toHaveLength(51);
    expect(resultat["…"]).toBe("[… 10 de plus]");
  });

  it("résume un contenu binaire au lieu de l'énumérer", () => {
    expect(
      redact({
        corps: new Uint8Array(200_000),
        vue: new DataView(new ArrayBuffer(8)),
      }),
    ).toEqual({ corps: "[Binaire 200000 octets]", vue: "[Binaire 8 octets]" });
  });

  it("borne la taille totale, même avec des références partagées", () => {
    let niveau: unknown = { feuille: "x".repeat(100) };
    for (let i = 0; i < 6; i++) {
      const enfant = niveau;
      niveau = Object.fromEntries(
        Array.from({ length: 10 }, (_, j) => [`k${j}`, enfant]),
      );
    }
    const debut = performance.now();
    const texte = JSON.stringify(redact(niveau));
    expect(performance.now() - debut).toBeLessThan(200);
    expect(texte.length).toBeLessThan(200_000);
    expect(texte).toContain("[Taille max]");
  });

  it("convertit les types non sérialisables en JSON", () => {
    const resultat = redact({
      grand: BigInt(10),
      date: new Date("2026-09-28T08:00:00.000Z"),
      invalide: new Date("pas une date"),
      fn: () => 1,
      sym: Symbol("s"),
      rien: undefined,
      carte: new Map([["source", "adzuna"]]),
      ensemble: new Set(["a"]),
      url: new URL("https://x.example/?token=abc"),
      erreur: new TypeError("pour a@b.example"),
    });
    expect(resultat).toEqual({
      grand: "10",
      date: "2026-09-28T08:00:00.000Z",
      invalide: "Invalid Date",
      rien: undefined,
      carte: { source: "adzuna" },
      ensemble: ["a"],
      url: `https://x.example/?token=${REDACTED}`,
      erreur: { name: "TypeError", message: `pour ${REDACTED}` },
    });
    expect(() => JSON.stringify(resultat)).not.toThrow();
  });

  it("ne modifie jamais l'entrée", () => {
    const entree = { password: "p", liste: [{ email: "a@b.example" }] };
    const copie = structuredClone(entree);
    redact(entree);
    expect(entree).toEqual(copie);
  });
});
