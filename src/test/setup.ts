import { afterAll, afterEach, beforeAll } from "vitest";

import { server } from "./msw/server";

// Aucun appel réseau réel pendant les tests : toute requête non simulée échoue.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
