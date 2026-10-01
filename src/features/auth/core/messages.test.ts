import { describe, expect, it } from "vitest";

import { AUTH_NOTICES, messageForAuthError, noticeForQuery } from "./messages";

const GENERIQUE = "Une erreur est survenue. Réessaie dans un instant.";

describe("messageForAuthError", () => {
  // Une réponse différente selon que le compte existe permettrait d'énumérer les comptes.
  it.each([
    "INVALID_EMAIL_OR_PASSWORD",
    "INVALID_PASSWORD",
    "USER_NOT_FOUND",
    "CREDENTIAL_ACCOUNT_NOT_FOUND",
  ])("donne le même texte pour %s", (code) => {
    expect(messageForAuthError({ code, status: 401 })).toBe(
      "Email ou mot de passe incorrect.",
    );
  });

  it.each([
    [
      "EMAIL_NOT_VERIFIED",
      "Ton adresse n'est pas encore vérifiée. Un nouveau lien vient de t'être envoyé.",
    ],
    ["INVALID_EMAIL", "Adresse email invalide."],
    ["PASSWORD_TOO_SHORT", "12 caractères au minimum."],
    ["PASSWORD_TOO_LONG", "128 caractères au maximum."],
  ])("traduit %s", (code, attendu) => {
    expect(messageForAuthError({ code })).toBe(attendu);
  });

  it("annonce une limite de débit quel que soit le code", () => {
    expect(messageForAuthError({ status: 429 })).toBe(
      "Trop de tentatives. Réessaie dans un instant.",
    );
    expect(
      messageForAuthError({ code: "INVALID_EMAIL_OR_PASSWORD", status: 429 }),
    ).toBe("Trop de tentatives. Réessaie dans un instant.");
  });

  it.each([
    [{}],
    [{ code: "CODE_INCONNU" }],
    [{ code: "USER_ALREADY_EXISTS", status: 422 }],
    [{ code: "<script>alert(1)</script>", status: 500 }],
    [{ code: "constructor" }],
  ])(
    "reste générique pour %o, sans recopier ce que le serveur a renvoyé",
    (erreur) => {
      expect(messageForAuthError(erreur)).toBe(GENERIQUE);
    },
  );
});

describe("noticeForQuery", () => {
  it("annonce un lien qui n'est plus valable", () => {
    expect(noticeForQuery("lien")).toBe(
      "Ce lien n'est plus valable. Demande-en un nouveau.",
    );
  });

  // Liste fermée : rien de ce que porte l'URL n'est affiché tel quel.
  it.each([undefined, "", "autre", "<b>lien</b>", "toString", ["lien", "x"]])(
    "n'affiche rien pour %o",
    (valeur) => {
      expect(noticeForQuery(valeur)).toBeUndefined();
    },
  );
});

describe("AUTH_NOTICES", () => {
  it("ne dit jamais si l'adresse a un compte", () => {
    expect(AUTH_NOTICES).toEqual({
      signUpSent:
        "Vérifie ta boîte mail. Si cette adresse peut être utilisée, tu y trouveras un lien pour activer ton compte.",
      magicLinkSent:
        "Si cette adresse peut être utilisée, un lien vient d'y être envoyé.",
    });
  });
});
