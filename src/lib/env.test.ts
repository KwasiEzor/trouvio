import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertStartupEnv,
  createEnvReader,
  isNodeRuntime,
  publicBuildEnv,
  envSchemas,
  envVariables,
  EnvValidationError,
  parseEnv,
  parseEnvDomains,
  STARTUP_DOMAINS,
  type EnvDomain,
  type EnvSource,
} from "./env";
import { fausseUrlPostgres } from "@/test/secrets-factices";

const SECRET_32 = "x".repeat(32);
const DSN_VALIDE = "https://cle@o450000.ingest.de.sentry.io/4500000000000000";

/** Une source complète et valide pour chaque domaine. */
const VALID: Record<EnvDomain, EnvSource> = {
  core: { NODE_ENV: "production", APP_URL: "https://trouvio.example" },
  database: {
    DATABASE_URL:
      "postgresql://app:mdp@hote.example/trouvio?sslmode=verify-full",
  },
  databaseMigration: {
    DATABASE_MIGRATION_URL:
      "postgresql://proprio:mdp@hote.example/trouvio?sslmode=verify-full",
  },
  testDatabase: {
    TEST_DATABASE_URL: "postgres://trouvio:trouvio@localhost:55432/postgres",
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
  sentry: {
    SENTRY_DSN: "https://cle@o450000.ingest.de.sentry.io/4500000000000000",
  },
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
      LOG_LEVEL: "info",
    });
  });

  it("applique les valeurs par défaut hors production", () => {
    expect(parseEnv("core", {})).toEqual({
      NODE_ENV: "development",
      APP_URL: "http://localhost:3000",
      LOG_LEVEL: "info",
    });
  });

  it.each(["debug", "info", "warn", "error", "silent"])(
    "accepte LOG_LEVEL=%s",
    (level) => {
      expect(parseEnv("core", { LOG_LEVEL: level }).LOG_LEVEL).toBe(level);
    },
  );

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

  it.each([
    DSN_VALIDE,
    "https://cle@o1.ingest.de.sentry.io/2",
    "https://cle@O1.INGEST.DE.SENTRY.IO/2",
  ])("accepte le DSN d'un projet en région UE : %s", (dsn) => {
    expect(parseEnv("sentry", { SENTRY_DSN: dsn }).SENTRY_DSN).toBe(dsn);
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

  it("exige au démarrage core et sentry (DSN optionnel mais jamais invalide), web comme job", () => {
    expect(STARTUP_DOMAINS).toEqual({
      web: ["core", "sentry"],
      job: ["core", "sentry"],
    });
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
    ["LOG_LEVEL inconnu", "core", { LOG_LEVEL: "verbeux" }, "LOG_LEVEL"],
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
    [
      "DSN Sentry en http",
      "sentry",
      { SENTRY_DSN: "http://cle@o1.ingest.de.sentry.io/2" },
      "SENTRY_DSN",
    ],
    [
      "DSN Sentry sans clé publique",
      "sentry",
      { SENTRY_DSN: "https://o1.ingest.de.sentry.io/2" },
      "SENTRY_DSN",
    ],
    [
      "DSN Sentry sans identifiant de projet numérique",
      "sentry",
      { SENTRY_DSN: "https://cle@o1.ingest.de.sentry.io/trouvio" },
      "SENTRY_DSN",
    ],
    // Région UE exigée (ADR 0010) : hôte o<id>.ingest.de.sentry.io, rien d'autre.
    ...(
      [
        ["hors UE (US)", "https://cle@o1.ingest.us.sentry.io/2"],
        ["hôte d'ingestion sans région", "https://cle@o1.ingest.sentry.io/2"],
        ["hôte sentry.io nu", "https://cle@sentry.io/2"],
        [
          "hôte de.sentry.io (API, pas l'ingestion)",
          "https://cle@de.sentry.io/2",
        ],
        ["sosie suffixé", "https://cle@o1.ingest.de.sentry.io.evil.example/2"],
        ["sosie par @", "https://cle@o1.ingest.de.sentry.io@evil.example/2"],
        ["organisation non numérique", "https://cle@ox.ingest.de.sentry.io/2"],
        ["clé secrète héritée", "https://cle:secret@o1.ingest.de.sentry.io/2"],
        ["port explicite", "https://cle@o1.ingest.de.sentry.io:8443/2"],
        ["query string", "https://cle@o1.ingest.de.sentry.io/2?x=1"],
        ["fragment", "https://cle@o1.ingest.de.sentry.io/2#x"],
      ] as const
    ).map(
      ([cas, dsn]) =>
        [
          `DSN Sentry : ${cas}`,
          "sentry",
          { SENTRY_DSN: dsn },
          "SENTRY_DSN",
        ] as const,
    ),
  ] as const)("signale %s comme invalide", (_cas, domain, source, name) => {
    const err = capture(() => parseEnv(domain, source));
    expect(err.issues).toContainEqual({ name, reason: "invalide" });
  });

  it("exige HTTPS pour APP_URL en production", () => {
    const err = capture(() =>
      parseEnv("core", {
        NODE_ENV: "production",
        APP_URL: "http://trouvio.example",
      }),
    );
    expect(err.issues).toEqual([{ name: "APP_URL", reason: "invalide" }]);
  });

  it.each(["http://localhost:3100", "http://127.0.0.1:3000"])(
    "accepte %s en production (serveur local)",
    (url) => {
      expect(
        parseEnv("core", { NODE_ENV: "production", APP_URL: url }).APP_URL,
      ).toBe(url);
    },
  );

  it("accepte HTTP hors production", () => {
    expect(
      parseEnv("core", { APP_URL: "http://trouvio.example" }).APP_URL,
    ).toBe("http://trouvio.example");
  });

  it("signale les variables requises absentes comme manquantes", () => {
    const err = capture(() => parseEnv("franceTravail", {}));
    expect(err.issues).toEqual([
      { name: "FRANCE_TRAVAIL_CLIENT_ID", reason: "manquante" },
      { name: "FRANCE_TRAVAIL_CLIENT_SECRET", reason: "manquante" },
    ]);
  });
});

describe("URL des bases de données", () => {
  const DOMAINE_DE = {
    DATABASE_URL: "database",
    DATABASE_MIGRATION_URL: "databaseMigration",
  } as const;
  const VARIABLES = Object.keys(DOMAINE_DE) as (keyof typeof DOMAINE_DE)[];
  const lire = (name: keyof typeof DOMAINE_DE, url: string) =>
    (parseEnv(DOMAINE_DE[name], { [name]: url }) as Record<string, string>)[
      name
    ];

  describe.each(VARIABLES)("%s", (name) => {
    it.each([
      "postgresql://app:mdp@hote.example/trouvio?sslmode=verify-full",
      "postgresql://app:mdp@hote.example/trouvio?sslmode=verify-full&channel_binding=require",
      "postgresql://app:mdp@hote.example/trouvio?sslmode=require&sslmode=verify-full",
      "postgresql://app:mdp@hote.example/trouvio?sslmode=verify-full&uselibpqcompat=true",
    ])("accepte une base distante chiffrée et vérifiée : %s", (url) => {
      expect(lire(name, url)).toBe(url);
    });

    it.each([
      "postgres://trouvio:trouvio@127.0.0.1:54329/trouvio_dev",
      "postgres://trouvio:trouvio@localhost:54329/trouvio_dev",
      "postgres://trouvio:trouvio@[::1]:54329/trouvio_dev",
    ])("accepte une base locale sans TLS : %s", (url) => {
      expect(lire(name, url)).toBe(url);
    });

    it.each([
      ["sans sslmode", "postgresql://app:mdp@hote.example/trouvio"],
      [
        "sslmode=disable",
        "postgresql://app:mdp@hote.example/trouvio?sslmode=disable",
      ],
      [
        "sslmode=prefer",
        "postgresql://app:mdp@hote.example/trouvio?sslmode=prefer",
      ],
      // require ne vérifie le certificat qu'en pg 8 ; en pg 9, ou avec uselibpqcompat, plus du tout.
      [
        "sslmode=require",
        "postgresql://app:mdp@hote.example/trouvio?sslmode=require&channel_binding=require",
      ],
      [
        "sslmode=require avec uselibpqcompat",
        "postgresql://app:mdp@hote.example/trouvio?sslmode=require&uselibpqcompat=true",
      ],
      [
        "sslmode=verify-ca",
        "postgresql://app:mdp@hote.example/trouvio?sslmode=verify-ca",
      ],
      [
        "sslmode=no-verify",
        "postgresql://app:mdp@hote.example/trouvio?sslmode=no-verify",
      ],
      [
        "sosie de localhost",
        "postgres://app:mdp@localhost.evil.example/trouvio",
      ],
      [
        "sosie de 127.0.0.1",
        "postgres://app:mdp@127.0.0.1.evil.example/trouvio",
      ],
      [
        "boucle locale détournée par ?host=",
        "postgres://app:mdp@127.0.0.1/trouvio?host=hote.example",
      ],
      [
        "sslmode=require suivi de sslmode=disable (pg retient le dernier)",
        "postgresql://app:mdp@hote.example/trouvio?sslmode=require&sslmode=disable",
      ],
    ])("refuse une base distante non chiffrée (%s)", (_cas, url) => {
      const err = capture(() => parseEnv(DOMAINE_DE[name], { [name]: url }));
      expect(err.issues).toEqual([{ name, reason: "invalide" }]);
    });
  });

  it("donne à TEST_DATABASE_URL la base Docker locale par défaut", () => {
    expect(parseEnv("testDatabase", {})).toEqual({
      TEST_DATABASE_URL: "postgres://trouvio:trouvio@127.0.0.1:54329/postgres",
    });
  });

  it.each([
    [
      "une base Neon, même chiffrée",
      `${fausseUrlPostgres()}?sslmode=verify-full`,
    ],
    ["un sosie de 127.0.0.1", "postgres://t:t@127.0.0.1.evil.example/postgres"],
    [
      "une boucle locale détournée par ?host=",
      "postgres://t:t@127.0.0.1:54329/postgres?host=ep-x.example.neon.tech",
    ],
    ["un autre protocole", "mysql://t:t@127.0.0.1:3306/postgres"],
  ])("refuse pour TEST_DATABASE_URL %s", (_cas, url) => {
    const err = capture(() =>
      parseEnv("testDatabase", { TEST_DATABASE_URL: url }),
    );
    expect(err.issues).toEqual([
      { name: "TEST_DATABASE_URL", reason: "invalide" },
    ]);
  });

  it("ne cite jamais l'URL refusée dans l'erreur", () => {
    const err = capture(() =>
      parseEnvDomains(
        ["database", "databaseMigration", "testDatabase"],
        {
          DATABASE_URL: "postgresql://app:SENTINELLE_A@hote.example/trouvio",
          DATABASE_MIGRATION_URL:
            "postgresql://proprio:SENTINELLE_B@hote.example/trouvio",
          TEST_DATABASE_URL: "postgres://t:SENTINELLE_C@hote.example/postgres",
        },
        "test",
      ),
    );
    expect(err.message).not.toMatch(/SENTINELLE|hote\.example/);
    expect(err.issues).toHaveLength(3);
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

  it.each(["web", "job"] as const)(
    "refuse de démarrer (%s) si SENTRY_TRACES_SAMPLE_RATE est posée (le SDK la lirait hors env.ts)",
    (runtime) => {
      const err = capture(() =>
        assertStartupEnv(runtime, {
          ...VALID.core,
          SENTRY_TRACES_SAMPLE_RATE: "0.SENTINELLE",
        }),
      );
      expect(err.issues).toEqual([
        { name: "SENTRY_TRACES_SAMPLE_RATE", reason: "interdite" },
      ]);
      expect(err.message).toBe(
        `Configuration invalide (${runtime}) — interdites : SENTRY_TRACES_SAMPLE_RATE`,
      );
      expect(err.message).not.toContain("SENTINELLE");
    },
  );

  it("ignore SENTRY_TRACES_SAMPLE_RATE vide", () => {
    expect(() =>
      assertStartupEnv("web", {
        ...VALID.core,
        SENTRY_TRACES_SAMPLE_RATE: " ",
      }),
    ).not.toThrow();
  });
});

describe("publicBuildEnv (valeurs publiques figées au build)", () => {
  it("renvoie le DSN et NODE_ENV, sans exiger APP_URL en production", () => {
    expect(
      publicBuildEnv({
        NODE_ENV: "production",
        SENTRY_DSN: DSN_VALIDE,
      }),
    ).toEqual({
      NODE_ENV: "production",
      SENTRY_DSN: DSN_VALIDE,
    });
  });

  it("renvoie un DSN absent et development par défaut", () => {
    expect(publicBuildEnv({})).toEqual({
      NODE_ENV: "development",
      SENTRY_DSN: undefined,
    });
  });

  it("refuse un DSN invalide sans citer sa valeur", () => {
    const err = capture(() =>
      publicBuildEnv({ SENTRY_DSN: "https://SENTINELLE.example/x" }),
    );
    expect(err.issues).toEqual([{ name: "SENTRY_DSN", reason: "invalide" }]);
    expect(err.message).not.toContain("SENTINELLE");
  });

  it("refuse au build comme au démarrage un DSN hors UE, sans citer sa valeur", () => {
    const horsUe = "https://SENTINELLE@o1.ingest.us.sentry.io/2";
    for (const err of [
      capture(() => publicBuildEnv({ SENTRY_DSN: horsUe })),
      capture(() =>
        assertStartupEnv("web", { ...VALID.core, SENTRY_DSN: horsUe }),
      ),
    ]) {
      expect(err.issues).toEqual([{ name: "SENTRY_DSN", reason: "invalide" }]);
      expect(err.message).not.toContain("SENTINELLE");
    }
  });

  it("refuse un NODE_ENV inconnu", () => {
    const err = capture(() => publicBuildEnv({ NODE_ENV: "staging" }));
    expect(err.issues).toEqual([{ name: "NODE_ENV", reason: "invalide" }]);
  });
});

describe("isNodeRuntime", () => {
  it.each([
    ["nodejs", true],
    ["edge", false],
    [undefined, false],
  ] as const)("NEXT_RUNTIME=%s → %s", (valeur, attendu) => {
    expect(isNodeRuntime({ NEXT_RUNTIME: valeur })).toBe(attendu);
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
    const secretsRemplis = entries
      .filter(([name, value]) => !nonSecrets.has(name) && value !== "")
      .map(([name]) => name);
    expect(secretsRemplis).toEqual([]);
  });
});
