import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeLogger, type FakeLogger } from "@/test/db/fake-logger";

const REQUEST_ID = "6f1c2b8e-9a3d-4e6f-8b7a-1c2d3e4f5a6b";

let incoming: Headers;
vi.mock("next/headers", () => ({ headers: () => Promise.resolve(incoming) }));
vi.mock("@/lib/logger", () => ({ logger: fakeLogger() }));

const { requestLogger } = await import("./request-context");

let base: FakeLogger;
beforeEach(() => {
  base = fakeLogger();
  incoming = new Headers();
});

describe("requestLogger", () => {
  it("rend un enfant porteur du requestId posé par le proxy", async () => {
    const child = fakeLogger();
    base.child.mockReturnValue(child);
    incoming.set("x-request-id", REQUEST_ID);
    expect(await requestLogger(base)).toBe(child);
    expect(base.child).toHaveBeenCalledWith({ requestId: REQUEST_ID });
  });

  it.each([
    ["absent", undefined],
    ["invalide", "pas-un-uuid"],
    ["trop long", `${REQUEST_ID}${"a".repeat(500)}`],
  ])("rend le logger de base si l'en-tête est %s", async (_, value) => {
    if (value !== undefined) incoming.set("x-request-id", value);
    expect(await requestLogger(base)).toBe(base);
    expect(base.child).not.toHaveBeenCalled();
  });
});
