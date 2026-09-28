import { createCn } from "cn/config";

import { TYPE_STYLE_NAMES } from "./design-tokens";

/**
 * Fusion des classes Tailwind (clsx + résolution des conflits). Configurée avec les tailles de
 * texte du thème : sans cela, `text-label` serait prise pour une couleur et effacée par
 * `text-primary-foreground`. Seul point d'import de `cn` (règle ESLint).
 */
export const cn = createCn({
  extend: { classGroups: { "font-size": [{ text: [...TYPE_STYLE_NAMES] }] } },
});
