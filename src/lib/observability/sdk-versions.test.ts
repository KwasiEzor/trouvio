import { SDK_VERSION as versionCore } from "@sentry/core";
import { SDK_VERSION as versionNextjs } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

// Le logger signale via @sentry/core ; le client est initialisé par @sentry/nextjs. Le porteur
// global de Sentry est indexé par version : deux versions différentes = signalements perdus
// sans aucune erreur. Dependabot les regroupe (groupe « sentry ») ; ce test en est le garde-fou.
describe("versions des SDK Sentry", () => {
  it("@sentry/core et @sentry/nextjs sont exactement à la même version", () => {
    expect(versionNextjs).toBe(versionCore);
  });
});
