import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Client navigateur de Better Auth : appels en même origine vers /api/auth (baseURL déduite de la
 * page). Ne connaît ni la base ni le secret.
 */
export const authClient = createAuthClient({ plugins: [magicLinkClient()] });
