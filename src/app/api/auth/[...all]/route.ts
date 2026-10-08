import { getAuth } from "@/lib/auth";

/**
 * Porte unique de l'authentification (ADR 0013) : les formulaires y passent par authClient,
 * protégés par le contrôle d'origine et le limiteur de Better Auth. L'instance est construite à
 * la première requête, jamais au build.
 */
function handler(request: Request): Promise<Response> {
  return getAuth().handler(request);
}

export { handler as GET, handler as POST };
