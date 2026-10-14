import type { NextRequest, NextResponse } from "next/server";

import { getAuth } from "@/lib/auth";
import { refreshSession } from "@/lib/auth/session-refresh";
import { getEnv } from "@/lib/env";
import { createProxy } from "@/lib/http/proxy-handler";
import { logger } from "@/lib/logger";
import { publicSentryConfig } from "@/lib/observability/public-config";

/**
 * Proxy de Next (ex-middleware), runtime Node (P1-05, ADR 0016) : CSP à nonce des pages, requestId,
 * prolongation de session. Jamais d'autorisation ici (src/lib/auth/guards.ts). Câblage paresseux :
 * rien n'est lu à l'import (next build), l'instance est construite à la première requête.
 */

let handler: ((request: NextRequest) => Promise<NextResponse>) | undefined;

export function proxy(request: NextRequest): Promise<NextResponse> {
  handler ??= createProxy({
    // getAuth() seulement si un cookie de session est présent : une page anonyme ne touche pas la base.
    refreshSession: (headers) => refreshSession(getAuth(), headers),
    log: logger.child({ source: "proxy" }),
    csp: () => {
      const { NODE_ENV, APP_URL } = getEnv("core");
      return {
        dev: NODE_ENV === "development",
        https: APP_URL?.startsWith("https://") ?? false,
        // DSN figé au build : celui du bundle navigateur (ADR 0010).
        sentryDsn: publicSentryConfig().dsn,
      };
    },
  });
  return handler(request);
}

export const config = {
  // Pages seulement : l'API, les fichiers statiques et public/ reçoivent les en-têtes de
  // next.config.ts. Les prefetchs ne sont pas exclus (en-tête forgeable). Littéral : analysé au build.
  matcher: ["/((?!api/|_next/static/|_next/image|icon\\.svg$|brand/).*)"],
};
