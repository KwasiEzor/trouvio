import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";

import { securityHeaderRules } from "./lib/http/security-headers";
import { config } from "./proxy";

// La doc de Next cite unstable_doesProxyMatch, absent de 16.3.8 : même logique sous l'ancien nom.
function matches(url: string, headers: Record<string, string> = {}) {
  return unstable_doesMiddlewareMatch({ config, url, headers });
}

describe("matcher du proxy", () => {
  // Sans chevauchement avec next.config : chaque chemin à CSP statique ou d'API est hors du proxy
  // (deux CSP se cumuleraient), et chaque page y passe.
  it.each(securityHeaderRules().filter(({ source }) => source !== "/:path*"))(
    "laisse $source aux en-têtes de next.config",
    ({ source }) => {
      const exemple = source.replace(/\/:path\*$/, "/exemple");
      expect(matches(exemple)).toBe(false);
    },
  );

  it.each(["/", "/connexion", "/fil", "/styleguide", "/inexistante"])(
    "couvre la page %s",
    (url) => {
      expect(matches(url)).toBe(true);
    },
  );

  it("couvre un prefetch : un en-tête forgé ne doit pas faire sortir une page sans CSP", () => {
    expect(matches("/fil", { "next-router-prefetch": "1", rsc: "1" })).toBe(
      true,
    );
  });

  it.each([
    "/api/auth/ok",
    "/api/auth/sign-in/email",
    "/_next/static/chunks/a.js",
    "/_next/image?url=x",
    "/icon.svg",
    "/brand/trouvio-mark.svg",
  ])("exclut %s (en-têtes de next.config seulement)", (url) => {
    expect(matches(url)).toBe(false);
  });
});
