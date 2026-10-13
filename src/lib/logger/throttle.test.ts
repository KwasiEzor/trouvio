import { describe, expect, it } from "vitest";

import { createLogThrottle } from "./throttle";

function clock(start = 0) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("createLogThrottle", () => {
  it("laisse passer le premier événement d'une clé", () => {
    const throttle = createLogThrottle({ windowMs: 1000, maxKeys: 10 });
    expect(throttle("a")).toEqual({ log: true, suppressed: 0 });
  });

  it("tait les suivants dans la fenêtre", () => {
    const c = clock();
    const throttle = createLogThrottle({ windowMs: 1000, maxKeys: 10, now: c.now });
    throttle("a");
    c.advance(999);
    expect(throttle("a").log).toBe(false);
  });

  it("compte les événements tus au premier de la fenêtre suivante", () => {
    const c = clock();
    const throttle = createLogThrottle({ windowMs: 1000, maxKeys: 10, now: c.now });
    for (let i = 0; i < 5; i++) throttle("a");
    c.advance(1000);
    expect(throttle("a")).toEqual({ log: true, suppressed: 4 });
    expect(throttle("a")).toEqual({ log: false, suppressed: 0 });
  });

  it("traite chaque clé à part", () => {
    const throttle = createLogThrottle({ windowMs: 1000, maxKeys: 10 });
    throttle("a");
    expect(throttle("b").log).toBe(true);
  });

  it("borne la mémoire en oubliant la clé la plus ancienne", () => {
    const throttle = createLogThrottle({ windowMs: 1000, maxKeys: 2 });
    throttle("a");
    throttle("b");
    throttle("c");
    expect(throttle("a").log).toBe(true);
    expect(throttle("c").log).toBe(false);
  });
});
