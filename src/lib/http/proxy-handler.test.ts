import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  everythingLogged,
  fakeLogger,
  type FakeLogger,
} from "@/test/db/fake-logger";

import {
  createProxy,
  REQUEST_ID_HEADER,
  type ProxyDeps,
} from "./proxy-handler";
import { buildPageCsp } from "./security-headers";

const NONCE = "bm9uY2UtZGUtdGVzdA==";
const REQUEST_ID = "6f1c2b8e-9a3d-4e6f-8b7a-1c2d3e4f5a6b";
const SESSION = "better-auth.session_token=jeton-secret.signature";
const SET_COOKIE =
  "better-auth.session_token=jeton.sig; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax";
const CSP_INPUT = { dev: false, https: true, sentryDsn: undefined };
const LOG_WINDOW_MS = 10 * 60 * 1000;

let log: FakeLogger;
let refreshSession: ReturnType<typeof vi.fn<ProxyDeps["refreshSession"]>>;
let clock: number;

function proxy() {
  return createProxy({
    refreshSession,
    log,
    csp: () => CSP_INPUT,
    newNonce: () => NONCE,
    newRequestId: () => REQUEST_ID,
    now: () => clock,
  });
}

function request(
  path = "/fil",
  {
    method = "GET",
    headers = {},
  }: { method?: string; headers?: Record<string, string> } = {},
) {
  return new NextRequest(`https://trouvio.example${path}`, { method, headers });
}

beforeEach(() => {
  log = fakeLogger();
  refreshSession = vi.fn<ProxyDeps["refreshSession"]>().mockResolvedValue([]);
  clock = 0;
});

describe("CSP et en-têtes de requête", () => {
  it("laisse passer la page avec la même CSP à nonce en réponse et en requête", async () => {
    const response = await proxy()(request("/connexion"));
    const csp = buildPageCsp({ ...CSP_INPUT, nonce: NONCE });
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("content-security-policy")).toBe(csp);
    expect(
      response.headers.get("x-middleware-request-content-security-policy"),
    ).toBe(csp);
  });

  it("écrase une CSP de requête envoyée par le client (Next y lit le nonce)", async () => {
    const response = await proxy()(
      request("/", {
        headers: { "content-security-policy": "script-src 'nonce-forge'" },
      }),
    );
    expect(
      response.headers.get("x-middleware-request-content-security-policy"),
    ).toContain(`'nonce-${NONCE}'`);
  });

  it("génère un requestId, écrase celui du client, le renvoie en réponse", async () => {
    const response = await proxy()(
      request("/", { headers: { [REQUEST_ID_HEADER]: "forge" } }),
    );
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(REQUEST_ID);
    expect(
      response.headers.get(`x-middleware-request-${REQUEST_ID_HEADER}`),
    ).toBe(REQUEST_ID);
  });

  it("rend par défaut un nonce et un requestId neufs à chaque requête", async () => {
    const handler = createProxy({ refreshSession, log, csp: () => CSP_INPUT });
    const first = await handler(request("/"));
    const second = await handler(request("/"));
    const id = first.headers.get(REQUEST_ID_HEADER) ?? "";
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(second.headers.get(REQUEST_ID_HEADER)).not.toBe(id);
    expect(second.headers.get("content-security-policy")).not.toBe(
      first.headers.get("content-security-policy"),
    );
  });
});

describe("prolongation de session", () => {
  it("ne lit pas la session sans cookie de session", async () => {
    await proxy()(request("/fil", { headers: { cookie: "autre=1" } }));
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it.each([
    ["document", { "sec-fetch-dest": "document" }],
    ["sans sec-fetch-dest", {}],
  ])(
    "prolonge sur un chargement de document (%s) et recopie les Set-Cookie",
    async (_, extra) => {
      refreshSession.mockResolvedValue([SET_COOKIE, "autre=; Max-Age=0"]);
      const response = await proxy()(
        request("/fil", { headers: { cookie: SESSION, ...extra } }),
      );
      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(refreshSession.mock.calls[0]?.[0].get("cookie")).toBe(SESSION);
      expect(response.headers.getSetCookie()).toEqual([
        SET_COOKIE,
        "autre=; Max-Age=0",
      ]);
    },
  );

  it("prolonge aussi sur HEAD", async () => {
    await proxy()(
      request("/fil", { method: "HEAD", headers: { cookie: SESSION } }),
    );
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["navigation RSC ou fetch", "GET", { "sec-fetch-dest": "empty" }],
    ["image", "GET", { "sec-fetch-dest": "image" }],
    ["POST", "POST", { "sec-fetch-dest": "document" }],
  ])("ne lit pas la session sur %s", async (_, method, extra) => {
    await proxy()(
      request("/fil", { method, headers: { cookie: SESSION, ...extra } }),
    );
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("garde la CSP et journalise une seule fois une panne, avec requestId et sans cookie", async () => {
    refreshSession.mockRejectedValue(new Error("base injoignable"));
    const handler = proxy();

    const response = await handler(
      request("/fil", { headers: { cookie: SESSION } }),
    );
    expect(response.headers.get("content-security-policy")).toContain(NONCE);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn.mock.calls[0]?.[1]).toMatchObject({
      requestId: REQUEST_ID,
    });
    expect(everythingLogged(log)).not.toContain("jeton-secret");

    clock += LOG_WINDOW_MS - 1;
    await handler(request("/fil", { headers: { cookie: SESSION } }));
    expect(log.warn).toHaveBeenCalledTimes(1);

    clock += 1;
    await handler(request("/fil", { headers: { cookie: SESSION } }));
    expect(log.warn).toHaveBeenCalledTimes(2);
    expect(log.warn.mock.calls[1]?.[1]).toMatchObject({ suppressed: 1 });
  });
});
