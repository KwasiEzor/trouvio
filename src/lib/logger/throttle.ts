/**
 * Limite le nombre de lignes de journal par clé : le premier événement d'une fenêtre est journalisé,
 * les suivants sont comptés et rapportés (`suppressed`) au premier de la fenêtre suivante. En
 * mémoire, borné à `maxKeys` clés : un échantillonnage de journaux, sans besoin de durabilité.
 */

export type LogThrottle = (key: string) => {
  readonly log: boolean;
  readonly suppressed: number;
};

export function createLogThrottle({
  windowMs,
  maxKeys,
  now = Date.now,
}: {
  windowMs: number;
  maxKeys: number;
  now?: () => number;
}): LogThrottle {
  const windows = new Map<string, { start: number; suppressed: number }>();
  return (key) => {
    const time = now();
    const current = windows.get(key);
    if (current !== undefined && time - current.start < windowMs) {
      current.suppressed += 1;
      return { log: false, suppressed: 0 };
    }
    // Réinsertion : l'ordre de la Map reste celui des fenêtres ouvertes, la plus ancienne d'abord.
    windows.delete(key);
    if (windows.size >= maxKeys) {
      const oldest = windows.keys().next();
      if (oldest.done !== true) windows.delete(oldest.value);
    }
    windows.set(key, { start: time, suppressed: 0 });
    return { log: true, suppressed: current?.suppressed ?? 0 };
  };
}
