import { describe, expect, it } from "vitest";

import { EnvValidationError } from "../env";
import { CIRCULAR, REDACTED } from "./redact";
import { serializeError } from "./serialize-error";

describe("serializeError", () => {
  it("garde le nom, le message et la pile", () => {
    const resultat = serializeError(new RangeError("hors limites"));
    expect(resultat.name).toBe("RangeError");
    expect(resultat.message).toBe("hors limites");
    expect(resultat.stack).toContain("RangeError: hors limites");
  });

  it("suit la chaîne cause sur plusieurs niveaux", () => {
    const racine = new Error("connexion refusée");
    const milieu = new Error("requête Adzuna échouée", { cause: racine });
    const haut = new Error("collecte échouée", { cause: milieu });

    const resultat = serializeError(haut);
    expect(resultat.message).toBe("collecte échouée");
    expect(resultat.cause).toMatchObject({
      message: "requête Adzuna échouée",
      cause: { message: "connexion refusée" },
    });
  });

  it("borne une chaîne cause qui boucle", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    a.cause = b;
    const resultat = serializeError(a);
    expect(resultat.cause).toMatchObject({ message: "b", cause: CIRCULAR });
  });

  it("borne une chaîne cause trop profonde", () => {
    let erreur = new Error("niveau 0");
    for (let i = 1; i <= 10; i++)
      erreur = new Error(`niveau ${i}`, { cause: erreur });
    expect(JSON.stringify(serializeError(erreur))).not.toContain("niveau 0");
  });

  it("sérialise les erreurs d'une AggregateError", () => {
    const resultat = serializeError(
      new AggregateError(
        [new Error("France Travail"), new Error("Adzuna")],
        "2 sources en échec",
      ),
    );
    expect(resultat.errors).toEqual([
      expect.objectContaining({ message: "France Travail" }),
      expect.objectContaining({ message: "Adzuna" }),
    ]);
  });

  it("conserve les propriétés utiles (code, status) en les masquant au besoin", () => {
    const erreur = Object.assign(new Error("HTTP 401"), {
      status: 401,
      code: "E_AUTH",
      token: "secret",
    });
    expect(serializeError(erreur)).toMatchObject({
      status: 401,
      code: "E_AUTH",
      token: REDACTED,
    });
  });

  it("masque les données sensibles du message et de la pile", () => {
    const resultat = serializeError(
      new Error("utilisateur kwasi@exemple.fr introuvable"),
    );
    expect(resultat.message).toBe(`utilisateur ${REDACTED} introuvable`);
    expect(resultat.stack).not.toContain("kwasi@exemple.fr");
  });

  it.each([
    ["une chaîne", "boum", "boum"],
    ["un objet", { email: "a@b.fr", code: 3 }, { email: REDACTED, code: 3 }],
    ["null", null, null],
  ])(
    "accepte une valeur lancée qui n'est pas une Error : %s",
    (_cas, lancee, attendu) => {
      expect(serializeError(lancee)).toEqual({
        name: "NonError",
        value: attendu,
      });
    },
  );

  it("sérialise EnvValidationError avec les noms de variables, sans valeur", () => {
    const erreur = new EnvValidationError("web", [
      { name: "SENTRY_DSN", reason: "invalide" },
    ]);
    const resultat = serializeError(erreur);
    expect(resultat.name).toBe("EnvValidationError");
    expect(resultat.message).toContain("SENTRY_DSN");
  });
});
