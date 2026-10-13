import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";

import {
  API_CSP,
  buildPageCsp,
  createNonce,
  NONCE_PATTERN,
  type PageCspInput,
  securityHeaderRules,
  sentryIngestOrigin,
} from "./security-headers";

const DSN = "https://cle@o1.ingest.de.sentry.io/2";
const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";
// Motif de Next (get-script-nonce-from-header.js) : un nonce hors motif est ignoré sans bruit.
const NEXT_NONCE_SOURCE = /^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/;

const PROD: PageCspInput = {
  nonce: NONCE,
  dev: false,
  https: true,
  sentryDsn: undefined,
};

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part !== "")
      .map((part) => {
        const [name = "", ...sources] = part.split(/\s+/);
        return [name, sources];
      }),
  );
}

const SCRIPT_DIRECTIVES = [
  "default-src",
  "script-src",
  "script-src-elem",
  "script-src-attr",
];

describe("buildPageCsp", () => {
  it("rend exactement les directives de production prévues", () => {
    expect(buildPageCsp(PROD)).toBe(
      [
        "default-src 'self'",
        `script-src 'self' 'nonce-${NONCE}' 'strict-dynamic'`,
        `style-src 'self' 'nonce-${NONCE}'`,
        "style-src-attr 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "upgrade-insecure-requests",
      ].join("; "),
    );
  });

  it.each([
    ["production", { ...PROD }],
    ["développement", { ...PROD, dev: true, https: false }],
  ])(
    "n'autorise jamais de script par unsafe-inline ni unsafe-hashes (%s)",
    (_, input) => {
      const parsed = directives(buildPageCsp(input));
      for (const name of SCRIPT_DIRECTIVES) {
        const sources = parsed.get(name) ?? [];
        expect(sources).not.toContain("'unsafe-inline'");
        expect(sources).not.toContain("'unsafe-hashes'");
      }
    },
  );

  it("n'ajoute unsafe-eval qu'en développement", () => {
    expect(directives(buildPageCsp(PROD)).get("script-src")).not.toContain(
      "'unsafe-eval'",
    );
    expect(
      directives(buildPageCsp({ ...PROD, dev: true })).get("script-src"),
    ).toContain("'unsafe-eval'");
  });

  it("relâche les styles en développement seulement (overlay de Next)", () => {
    expect(
      directives(buildPageCsp({ ...PROD, dev: true })).get("style-src"),
    ).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directives(buildPageCsp(PROD)).get("style-src")).toEqual([
      "'self'",
      `'nonce-${NONCE}'`,
    ]);
  });

  it("n'ajoute upgrade-insecure-requests qu'en https", () => {
    expect(
      directives(buildPageCsp(PROD)).has("upgrade-insecure-requests"),
    ).toBe(true);
    expect(
      directives(buildPageCsp({ ...PROD, https: false })).has(
        "upgrade-insecure-requests",
      ),
    ).toBe(false);
  });

  it("autorise la seule origine d'ingestion de l'organisation Sentry", () => {
    expect(
      directives(buildPageCsp({ ...PROD, sentryDsn: DSN })).get("connect-src"),
    ).toEqual(["'self'", "https://o1.ingest.de.sentry.io"]);
  });

  it("place le nonce là où Next le lit", () => {
    const scriptSrc = directives(buildPageCsp(PROD)).get("script-src") ?? [];
    expect(scriptSrc.some((source) => NEXT_NONCE_SOURCE.test(source))).toBe(
      true,
    );
  });

  it.each(["a; script-src *", "abc'", "", "a b", "ab==="])(
    "refuse un nonce hors motif (%j)",
    (nonce) => {
      expect(() => buildPageCsp({ ...PROD, nonce })).toThrow();
    },
  );
});

describe("createNonce", () => {
  it("rend des nonces distincts, assez longs, conformes au motif de Next", () => {
    const first = createNonce();
    const second = createNonce();
    expect(first).not.toBe(second);
    for (const nonce of [first, second]) {
      expect(nonce.length).toBeGreaterThanOrEqual(22);
      expect(nonce).toMatch(NONCE_PATTERN);
      expect(`'nonce-${nonce}'`).toMatch(NEXT_NONCE_SOURCE);
    }
  });
});

describe("sentryIngestOrigin", () => {
  it("rend l'origine seule : ni clé, ni chemin", () => {
    expect(sentryIngestOrigin(DSN)).toBe("https://o1.ingest.de.sentry.io");
  });

  it.each([
    undefined,
    "",
    "pas une url",
    "https://cle@evil.example/2",
    "http://cle@o1.ingest.de.sentry.io/2",
  ])("ignore un DSN absent ou hors ingestion UE (%j)", (dsn) => {
    expect(sentryIngestOrigin(dsn)).toBeUndefined();
  });
});

describe("API_CSP", () => {
  it("n'autorise rien à s'exécuter", () => {
    expect(API_CSP).toBe(
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
  });
});

const COMMON_HEADERS = {
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy":
    "accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), serial=(), usb=()",
  "x-frame-options": "DENY",
};

async function responseFor(path: string) {
  return unstable_getResponseFromNextConfig({
    url: `https://trouvio.example${path}`,
    nextConfig: { headers: async () => securityHeaderRules() },
  });
}

describe("securityHeaderRules (next.config headers)", () => {
  it.each([
    "/",
    "/connexion",
    "/api/auth/ok",
    "/_next/static/x.js",
    "/brand/trouvio-mark.svg",
  ])("pose chaque en-tête commun sur %s", async (path) => {
    const { headers } = await responseFor(path);
    expect(
      Object.fromEntries(
        Object.keys(COMMON_HEADERS).map((name) => [name, headers.get(name)]),
      ),
    ).toEqual(COMMON_HEADERS);
  });

  it("pose la CSP de l'API sous /api/ seulement", async () => {
    expect(
      (await responseFor("/api/auth/ok")).headers.get(
        "content-security-policy",
      ),
    ).toBe(API_CSP);
  });

  it.each(["/", "/connexion", "/apiculteur"])(
    "ne pose aucune CSP sur %s (posée par src/proxy.ts)",
    async (path) => {
      expect(
        (await responseFor(path)).headers.get("content-security-policy"),
      ).toBeNull();
    },
  );
});
