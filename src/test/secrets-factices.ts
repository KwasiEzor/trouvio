/**
 * Faux secrets construits à l'exécution, au format réel des fournisseurs. Un littéral au même
 * format déclencherait gitleaks et le secret scanning de GitHub, qui lisent tout l'historique
 * (qu'on ne réécrit pas). Aucun n'est valide ; ils ne servent qu'aux tests de masquage.
 */

export function fauxJetonTelegram(): string {
  return `${"1".repeat(9)}:${"A".repeat(35)}`;
}

export function fauxJwt(): string {
  const segment = (json: string) => Buffer.from(json).toString("base64url");
  return [
    segment('{"alg":"none"}'),
    segment('{"sub":"essai"}'),
    "s".repeat(20),
  ].join(".");
}

export function fauxCleAnthropic(): string {
  return ["sk", "ant", "api03", "x".repeat(93)].join("-");
}

export function fauxCleResend(): string {
  return ["re", "a".repeat(8), "b".repeat(24)].join("_");
}
