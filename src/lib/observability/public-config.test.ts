import { afterEach, describe, expect, it, vi } from "vitest";

import { publicSentryConfig } from "./public-config";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("publicSentryConfig (valeurs figées au build par compiler.define)", () => {
  it("lit le DSN et l'environnement injectés", () => {
    vi.stubGlobal(
      "__TROUVIO_SENTRY_DSN__",
      "https://cle@o1.ingest.de.sentry.io/2",
    );
    vi.stubGlobal("__TROUVIO_ENV__", "production");
    expect(publicSentryConfig()).toEqual({
      dsn: "https://cle@o1.ingest.de.sentry.io/2",
      environment: "production",
    });
  });

  it("considère un DSN vide comme absent", () => {
    vi.stubGlobal("__TROUVIO_SENTRY_DSN__", "");
    vi.stubGlobal("__TROUVIO_ENV__", "development");
    expect(publicSentryConfig().dsn).toBeUndefined();
  });

  it("fonctionne hors build Next (identifiants non définis)", () => {
    expect(publicSentryConfig()).toEqual({
      dsn: undefined,
      environment: "development",
    });
  });
});
