import { describe, expect, it } from "vitest";

import { assertSeedAllowed, SeedRefusedError } from "./guard";

const LOCALE = "postgres://trouvio:trouvio@127.0.0.1:54329/trouvio_dev";
const DISTANTE =
  "postgresql://app:SENTINELLE@hote.example/trouvio?sslmode=require";

function refus(fn: () => void): SeedRefusedError {
  try {
    fn();
  } catch (error) {
    if (error instanceof SeedRefusedError) return error;
    throw error;
  }
  throw new Error("aucune SeedRefusedError levée");
}

describe("assertSeedAllowed", () => {
  it("autorise une base locale hors production", () => {
    expect(() =>
      assertSeedAllowed({
        nodeEnv: "development",
        databaseUrl: LOCALE,
        allowRemote: false,
      }),
    ).not.toThrow();
  });

  it("autorise une base distante avec --allow-remote", () => {
    expect(() =>
      assertSeedAllowed({
        nodeEnv: "development",
        databaseUrl: DISTANTE,
        allowRemote: true,
      }),
    ).not.toThrow();
  });

  it("refuse la production, même sur une base locale et avec --allow-remote", () => {
    const err = refus(() =>
      assertSeedAllowed({
        nodeEnv: "production",
        databaseUrl: LOCALE,
        allowRemote: true,
      }),
    );
    expect(err.message).toBe("Seed refusé en production.");
  });

  it("refuse une boucle locale détournée par ?host= sans --allow-remote", () => {
    expect(() =>
      assertSeedAllowed({
        nodeEnv: "development",
        databaseUrl: `${LOCALE}?host=hote.example`,
        allowRemote: false,
      }),
    ).toThrow(SeedRefusedError);
  });

  it("refuse une base distante sans --allow-remote, sans citer l'URL", () => {
    const err = refus(() =>
      assertSeedAllowed({
        nodeEnv: "development",
        databaseUrl: DISTANTE,
        allowRemote: false,
      }),
    );
    expect(err.message).toBe(
      "Seed refusé sur une base distante sans --allow-remote.",
    );
    expect(err.message).not.toMatch(/SENTINELLE|hote\.example/);
  });
});
