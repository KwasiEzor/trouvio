import { describe, expect, it } from "vitest";

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
    "cv",
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
    "inputTokens",
    "output_tokens",
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
      profil: { contact: { email: "kwasi@exemple.fr" } },
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

  it("peut ne masquer que les valeurs (contextes techniques du SDK)", () => {
    expect(
      redact(
        { os: { name: "Linux" }, note: "écrire à a@b.fr" },
        { keys: false },
      ),
    ).toEqual({ os: { name: "Linux" }, note: `écrire à ${REDACTED}` });
  });
});

describe("redactString — motifs dans les valeurs", () => {
  it.each([
    ["email dans une phrase", "échec pour kwasi.ezor+test@exemple.fr hier"],
    ["en-tête Bearer", "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.x.y"],
    [
      "JWT seul",
      "jeton eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.SflKxwRJSMeKKF2QT4fwpMe",
    ],
    ["clé Anthropic", "clé sk-ant-api03-AbCdEf_123-xyz refusée"],
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
    const resultat = redactString(
      "https://api.telegram.org/bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw/sendMessage",
    );
    expect(resultat).not.toContain("AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw");
    expect(resultat).toContain("/sendMessage");
  });

  it("laisse intact un texte sans donnée sensible", () => {
    const texte = "3 offres collectées depuis France Travail en 1200 ms";
    expect(redactString(texte)).toBe(texte);
  });

  it("tronque une chaîne trop longue après masquage", () => {
    const resultat = redactString(`${"a".repeat(4990)} x@y.fr`);
    expect(resultat.length).toBeLessThan(2100);
    expect(resultat).toMatch(/…\[tronqué\]$/);
    expect(redactString("court")).toBe("court");
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
      erreur: new TypeError("pour a@b.fr"),
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
    const entree = { password: "p", liste: [{ email: "a@b.fr" }] };
    const copie = structuredClone(entree);
    redact(entree);
    expect(entree).toEqual(copie);
  });
});
