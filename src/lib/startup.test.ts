import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_INFO,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from "next/constants";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import config from "../../next.config";
import { EnvValidationError } from "./env";

// Non-régression (fix add122c) : la validation au démarrage vit dans next.config.ts,
// car une erreur dans instrumentation.ts laissait le serveur vivant (HTTP 500).
describe("validation de l'environnement au démarrage (next.config.ts)", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([PHASE_PRODUCTION_SERVER, PHASE_DEVELOPMENT_SERVER])(
    "refuse de démarrer un serveur (%s) si une variable requise manque",
    (phase) => {
      expect(() => config(phase)).toThrow(EnvValidationError);
    },
  );

  it.each([PHASE_PRODUCTION_BUILD, PHASE_INFO])(
    "n'exige aucune variable hors démarrage d'un serveur (%s)",
    (phase) => {
      expect(() => config(phase)).not.toThrow();
    },
  );

  it("refuse de démarrer avec un DSN Sentry invalide (plutôt que de désactiver Sentry sans rien dire)", () => {
    vi.stubEnv("APP_URL", "https://trouvio.example");
    vi.stubEnv("SENTRY_DSN", "pas-une-url");
    expect(() => config(PHASE_PRODUCTION_SERVER)).toThrow(EnvValidationError);
  });

  it("ne publie dans le bundle que le DSN et l'environnement, en valeurs brutes (sans guillemets ajoutés)", () => {
    vi.stubEnv("SENTRY_DSN", "https://cle@o1.ingest.de.sentry.io/2");
    expect(config(PHASE_PRODUCTION_BUILD).compiler?.define).toEqual({
      __TROUVIO_SENTRY_DSN__: "https://cle@o1.ingest.de.sentry.io/2",
      __TROUVIO_ENV__: "production",
    });
  });

  it("publie un DSN vide quand Sentry n'est pas configuré", () => {
    expect(config(PHASE_PRODUCTION_BUILD).compiler?.define).toMatchObject({
      __TROUVIO_SENTRY_DSN__: "",
    });
  });

  it("ne sert aucune source map au navigateur", () => {
    expect(config(PHASE_PRODUCTION_BUILD).productionBrowserSourceMaps).toBe(
      false,
    );
  });

  it("n'embarque aucun secret de l'environnement dans la configuration", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "SENTINELLE_ANTHROPIC");
    vi.stubEnv("SENTRY_AUTH_TOKEN", "SENTINELLE_SENTRY");
    vi.stubEnv("DATABASE_URL", "postgresql://u:SENTINELLE@h/db");
    expect(JSON.stringify(config(PHASE_PRODUCTION_BUILD))).not.toContain(
      "SENTINELLE",
    );
  });

  it("démarre avec un environnement valide", () => {
    vi.stubEnv("APP_URL", "https://trouvio.example");
    expect(config(PHASE_PRODUCTION_SERVER)).toMatchObject({
      poweredByHeader: false,
    });
  });
});
