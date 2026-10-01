import { describe, expect, it } from "vitest";

import { describeTarget, effectiveSslMode, isLoopbackUrl } from "./target";

describe("isLoopbackUrl", () => {
  it.each([
    "postgres://trouvio:trouvio@127.0.0.1:54329/trouvio_dev",
    "postgres://trouvio:trouvio@localhost:54329/trouvio_dev",
    "postgres://trouvio:trouvio@LOCALHOST/trouvio_dev",
    "postgres://trouvio:trouvio@[::1]:54329/trouvio_dev",
  ])("reconnaît la boucle locale : %s", (url) => {
    expect(isLoopbackUrl(url)).toBe(true);
  });

  it.each([
    "postgresql://app:mdp@hote.example/trouvio?sslmode=require",
    "postgres://app:mdp@localhost.evil.example/trouvio",
    "postgres://app:mdp@127.0.0.1.evil.example/trouvio",
    "postgres://app:mdp@10.0.0.1/trouvio",
    "pas une url",
    // pg donne la priorité au paramètre host sur l'hôte de l'URL.
    "postgres://u:p@127.0.0.1:54329/db?host=ep-x.example.neon.tech",
    "postgres://u:p@localhost/db?sslmode=disable&host=hote.example",
    "postgres://u:p@127.0.0.1/db?HOST=hote.example",
    "postgres://u:p@127.0.0.1/db?hostaddr=192.0.2.10",
    // pg réencode une URL qui contient une espace ou un % isolé avant de la lire.
    "postgres://u:p@127.0.0.1/d b",
  ])("considère comme distante : %s", (url) => {
    expect(isLoopbackUrl(url)).toBe(false);
  });
});

describe("effectiveSslMode", () => {
  it.each([
    ["postgresql://a:b@hote.example/x?sslmode=require", "require"],
    [
      "postgresql://a:b@hote.example/x?sslmode=require&sslmode=disable",
      "disable",
    ],
    [
      "postgresql://a:b@hote.example/x?sslmode=disable&sslmode=verify-full",
      "verify-full",
    ],
    ["postgresql://a:b@hote.example/x", undefined],
    ["pas une url", undefined],
  ])("lit le sslmode retenu par pg (dernière occurrence) : %s", (url, mode) => {
    expect(effectiveSslMode(url)).toBe(mode);
  });
});

describe("describeTarget", () => {
  it("décrit une base locale sans citer l'hôte ni les identifiants", () => {
    expect(describeTarget("postgres://trouvio:secret@127.0.0.1:54329/x")).toBe(
      "base locale",
    );
  });

  it("décrit une base distante sans citer l'hôte ni les identifiants", () => {
    expect(
      describeTarget("postgresql://app:secret@hote.example/x?sslmode=require"),
    ).toBe("base distante");
  });
});
