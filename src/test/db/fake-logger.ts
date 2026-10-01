import { vi, type Mock } from "vitest";

import type { Logger } from "@/lib/logger";

export type FakeLogger = {
  debug: Mock<Logger["debug"]>;
  info: Mock<Logger["info"]>;
  warn: Mock<Logger["warn"]>;
  error: Mock<Logger["error"]>;
  child: Mock<Logger["child"]>;
};

/** Logger factice : chaque niveau est un vi.fn() inspectable. */
export function fakeLogger(): FakeLogger {
  const logger: FakeLogger = {
    debug: vi.fn<Logger["debug"]>(),
    info: vi.fn<Logger["info"]>(),
    warn: vi.fn<Logger["warn"]>(),
    error: vi.fn<Logger["error"]>(),
    child: vi.fn<Logger["child"]>(() => logger),
  };
  return logger;
}

/** Tout ce qui a été journalisé, messages et contextes, en un texte (recherche de fuites). */
export function everythingLogged(
  logger: ReturnType<typeof fakeLogger>,
): string {
  const calls = [
    ...logger.debug.mock.calls,
    ...logger.info.mock.calls,
    ...logger.warn.mock.calls,
    ...logger.error.mock.calls,
  ];
  return calls
    .map(([message, context]) =>
      [message, context ? JSON.stringify(context, errorAware) : ""].join(" "),
    )
    .join("\n");
}

function errorAware(_key: string, value: unknown): unknown {
  return value instanceof Error
    ? { name: value.name, message: value.message }
    : value;
}
