import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { server } from "./server";

// Le harnais garantit qu'aucun appel réseau réel ne sort pendant `pnpm test` (docs/TESTING.md).
describe("harnais MSW", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renvoie la réponse simulée d'une requête déclarée par le test", async () => {
    server.use(
      http.get("https://api.trouvio.test/ping", () =>
        HttpResponse.json({ ok: true }),
      ),
    );

    const response = await fetch("https://api.trouvio.test/ping");

    expect(await response.json()).toEqual({ ok: true });
  });

  it("refuse toute requête non simulée, qui ne part donc jamais sur le réseau", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      fetch("https://api.trouvio.test/non-simulee"),
    ).rejects.toThrow();

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("https://api.trouvio.test/non-simulee"),
    );
  });
});
