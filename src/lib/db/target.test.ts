import { describe, expect, it } from "vitest";

import { describeTarget, isLoopbackUrl } from "./target";

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
  ])("considère comme distante : %s", (url) => {
    expect(isLoopbackUrl(url)).toBe(false);
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
