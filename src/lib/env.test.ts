import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertStartupEnv,
  createEnvReader,
  envSchemas,
  envVariables,
  EnvValidationError,
  parseEnv,
  parseEnvDomains,
  STARTUP_DOMAINS,
  type EnvDomain,
  type EnvSource,
} from "./env";

const SECRET_32 = "x".repeat(32);

/** Une source complète et valide pour chaque domaine. */
const VALID: Record<EnvDomain, EnvSource> = {
  core: { NODE_ENV: "production", APP_URL: "https://trouvio.example" },
  database: {
    DATABASE_URL: "postgresql://app:mdp@hote.example/trouvio?sslmode=require",
  },
  auth: { BETTER_AUTH_SECRET: SECRET_32 },
  anthropic: {
    ANTHROPIC_API_KEY: "cle-anthropic",
    ANTHROPIC_MODEL_SCORING: "claude-haiku-4-5-20251001",
  },
  franceTravail: {
    FRANCE_TRAVAIL_CLIENT_ID: "id",
    FRANCE_TRAVAIL_CLIENT_SECRET: "secret",
  },
  adzuna: { ADZUNA_APP_ID: "id", ADZUNA_APP_KEY: "cle" },
  telegram: {
    TELEGRAM_BOT_TOKEN: "123:abc",
    TELEGRAM_WEBHOOK_SECRET: SECRET_32,
  },
  email: {
    RESEND_API_KEY: "cle-resend",
    EMAIL_FROM: "Trouvio <digest@trouvio.example>",
  },
  sentry: { SENTRY_DSN: "https://cle@o0.ingest.sentry.io/1" },
  cron: { CRON_SECRET: SECRET_32 },
};

const domains = Object.keys(envSchemas) as EnvDomain[];

function capture(fn: () => unknown): EnvValidationError {
  try {
    fn();
  } catch (error) {
    if (error instanceof EnvValidationError) return error;
    throw error;
  }
  throw new Error("aucune EnvValidationError levée");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseEnv — cas nominaux", () => {
  it("renvoie un objet typé pour un core valide", () => {
    expect(parseEnv("core", VALID.core)).toEqual({
      NODE_ENV: "production",
      APP_URL: "https://trouvio.example",
    });
  });

  it("applique les valeurs par défaut hors production", () => {
    expect(parseEnv("core", {})).toEqual({
      NODE_ENV: "development",
      APP_URL: "http://localhost:3000",
    });
  });

  it("ramène APP_URL à son origine (sans chemin ni barre finale)", () => {
    expect(
      parseEnv("core", { APP_URL: "https://trouvio.example/chemin/" }).APP_URL,
    ).toBe("https://trouvio.example");
  });

  it("utilise claude-haiku-4-5-20251001 comme modèle de scoring par défaut", () => {
    expect(
      parseEnv("anthropic", { ANTHROPIC_API_KEY: "cle" })
        .ANTHROPIC_MODEL_SCORING,
    ).toBe("claude-haiku-4-5-20251001");
  });

  it.each(domains)(
    "accepte une source complète pour %s et ne renvoie que ses clés",
    (domain) => {
      const bruit = { AUTRE_VARIABLE: "ignorée" };
      const result = parseEnv(domain, { ...VALID[domain], ...bruit });
      expect(Object.keys(result).sort()).toEqual(
        [...envVariables[domain]].sort(),
      );
    },
  );

  it("considère Sentry comme optionnel", () => {
    expect(parseEnv("sentry", {})).toEqual({});
  });
});

describe("parseEnv — limites", () => {
  it("traite une chaîne faite d'espaces comme une variable absente", () => {
    const err = capture(() =>
      parseEnv("core", { NODE_ENV: "production", APP_URL: "   " }),
    );
    expect(err.issues).toEqual([{ name: "APP_URL", reason: "manquante" }]);
  });

  it("applique la valeur par défaut quand la variable est vide", () => {
    expect(
      parseEnv("anthropic", {
        ANTHROPIC_API_KEY: "cle",
        ANTHROPIC_MODEL_SCORING: "",
      }).ANTHROPIC_MODEL_SCORING,
    ).toBe("claude-haiku-4-5-20251001");
  });

  it("retire les espaces autour des valeurs", () => {
    expect(
      parseEnv("adzuna", { ADZUNA_APP_ID: "  id  ", ADZUNA_APP_KEY: "cle\n" }),
    ).toEqual({
      ADZUNA_APP_ID: "id",
      ADZUNA_APP_KEY: "cle",
    });
  });

  it("agrège et trie les erreurs de plusieurs domaines", () => {
    const err = capture(() =>
      parseEnvDomains(
        ["database", "auth", "core"],
        { NODE_ENV: "production", BETTER_AUTH_SECRET: "court" },
        "test",
      ),
    );
    expect(err.issues).toEqual([
      { name: "APP_URL", reason: "manquante" },
      { name: "BETTER_AUTH_SECRET", reason: "invalide" },
      { name: "DATABASE_URL", reason: "manquante" },
    ]);
    expect(err.message).toBe(
      "Configuration invalide (test) — manquantes : APP_URL, DATABASE_URL ; invalides : BETTER_AUTH_SECRET",
    );
  });

  it("n'exige au démarrage que le domaine core, pour le web comme pour le job", () => {
    expect(STARTUP_DOMAINS).toEqual({ web: ["core"], job: ["core"] });
  });
});

describe("parseEnv — cas négatifs", () => {
  it("refuse la production sans APP_URL", () => {
    const err = capture(() => parseEnv("core", { NODE_ENV: "production" }));
    expect(err.issues).toEqual([{ name: "APP_URL", reason: "manquante" }]);
    expect(err.message).toContain("APP_URL");
  });

  it.each([
    ["APP_URL mal formée", "core", { APP_URL: "pas-une-url" }, "APP_URL"],
    ["APP_URL en ftp", "core", { APP_URL: "ftp://trouvio.example" }, "APP_URL"],
    ["NODE_ENV inconnu", "core", { NODE_ENV: "staging" }, "NODE_ENV"],
    [
      "base non Postgres",
      "database",
      { DATABASE_URL: "mysql://u:p@h/db" },
      "DATABASE_URL",
    ],
    [
      "secret d'auth trop court",
      "auth",
      { BETTER_AUTH_SECRET: "court" },
      "BETTER_AUTH_SECRET",
    ],
    [
      "modèle non Claude",
      "anthropic",
      { ANTHROPIC_API_KEY: "cle", ANTHROPIC_MODEL_SCORING: "gpt-4o" },
      "ANTHROPIC_MODEL_SCORING",
    ],
    ["secret cron trop court", "cron", { CRON_SECRET: "court" }, "CRON_SECRET"],
  ] as const)("signale %s comme invalide", (_cas, domain, source, name) => {
    const err = capture(() => parseEnv(domain, source));
    expect(err.issues).toContainEqual({ name, reason: "invalide" });
  });

  it("signale les variables requises absentes comme manquantes", () => {
    const err = capture(() => parseEnv("franceTravail", {}));
    expect(err.issues).toEqual([
      { name: "FRANCE_TRAVAIL_CLIENT_ID", reason: "manquante" },
      { name: "FRANCE_TRAVAIL_CLIENT_SECRET", reason: "manquante" },
    ]);
  });
});

describe("assertStartupEnv", () => {
  it("refuse de démarrer le web si une variable requise manque", () => {
    const err = capture(() =>
      assertStartupEnv("web", { NODE_ENV: "production" }),
    );
    expect(err.message).toBe(
      "Configuration invalide (web) — manquantes : APP_URL",
    );
  });

  it("laisse démarrer le job avec un environnement valide", () => {
    expect(() => assertStartupEnv("job", VALID.core)).not.toThrow();
  });
});

describe("createEnvReader", () => {
  it("ne lit ni ne valide rien à la création", () => {
    const read = vi.fn((): EnvSource => ({}));
    createEnvReader(read);
    expect(read).not.toHaveBeenCalled();
  });

  it("lève une erreur au premier accès à un domaine invalide", () => {
    const getEnv = createEnvReader(() => ({}));
    expect(() => getEnv("database")).toThrow(EnvValidationError);
  });

  it("ne met jamais une erreur en cache : chaque accès revalide", () => {
    const getEnv = createEnvReader(() => ({}));
    expect(() => getEnv("database")).toThrow(EnvValidationError);
    expect(() => getEnv("database")).toThrow(EnvValidationError);
  });

  it("lit la source une seule fois et mémorise le résultat", () => {
    const read = vi.fn((): EnvSource => VALID.core);
    const getEnv = createEnvReader(read);
    expect(getEnv("core")).toBe(getEnv("core"));
    getEnv("sentry");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("refuse toute lecture côté navigateur", () => {
    vi.stubGlobal("window", {});
    const getEnv = createEnvReader(() => VALID.core);
    expect(() => getEnv("core")).toThrow(/réservé au serveur/);
  });
});

describe("sécurité", () => {
  it("n'expose jamais la valeur d'une variable dans l'erreur", () => {
    const source = {
      DATABASE_URL: "mysql://u:SENTINELLE_MDP@h/db",
      BETTER_AUTH_SECRET: "SENTINELLE_COURT",
    };
    const err = capture(() =>
      parseEnvDomains(["database", "auth"], source, "test"),
    );
    const surfaces = [
      err.message,
      String(err),
      err.stack ?? "",
      JSON.stringify(err),
      JSON.stringify(err.issues),
    ];
    for (const surface of surfaces) {
      expect(surface).not.toContain("SENTINELLE");
    }
    expect(err.cause).toBeUndefined();
  });

  it("ne déclare aucune variable serveur exposée au navigateur (NEXT_PUBLIC_)", () => {
    for (const domain of domains) {
      for (const name of envVariables[domain]) {
        expect(name.startsWith("NEXT_PUBLIC_")).toBe(false);
      }
    }
  });

  it("reste synchronisé avec .env.example, sans aucune valeur secrète", () => {
    const text = readFileSync(
      new URL("../../.env.example", import.meta.url),
      "utf8",
    );
    const entries = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)] as const;
      });
    const exampleNames = entries.map(([name]) => name).sort();
    const declared = domains
      .flatMap((domain) => envVariables[domain])
      .filter((name) => name !== "NODE_ENV")
      .sort();
    expect(exampleNames).toEqual(declared);

    const nonSecrets = new Set(["APP_URL", "ANTHROPIC_MODEL_SCORING"]);
    for (const [name, value] of entries) {
      if (!nonSecrets.has(name))
        expect(value, `${name} doit rester vide`).toBe("");
    }
  });
});
