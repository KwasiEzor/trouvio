---
name: security-audit
description: Audit de sécurité complet du dépôt (avant bêta et avant lancement) — dépendances, secrets, en-têtes, autorisations, LLM, RGPD. Produit docs/audits/<date>-security.md.
disable-model-invocation: true
---

## Procédure
1. Dépendances : `pnpm audit --prod` ; noter les vulnérabilités hautes/critiques.
2. Secrets : `gitleaks git` si installé (et résultat du job CI `gitleaks`), sinon recherche de motifs dans tout l'historique (`git log -p`) ; vérifier que `.env*` n'est pas suivi.
3. Lancer en parallèle :
   - le sous-agent `security-reviewer` sur tout `src/`, `db/`, `prompts/` (OWASP Top 10, OWASP LLM Top 10, checklist §5, RGPD) ;
   - le skill `security-review` sur les changements récents.
4. Vérifications ciblées avec preuves : tests IDOR présents pour chaque ressource, rate limiting des routes publiques, en-têtes de sécurité (`next.config`/middleware), cron protégé, webhooks signés, suppression/export de compte effectifs.
5. Écrire `docs/audits/<AAAA-MM-JJ>-security.md` : périmètre, méthode, constats classés (critique → basse) avec fichier:ligne, correctifs proposés, points acceptés avec justification.
6. Proposer une tâche ROADMAP par constat critique ou haut. Ne corriger qu'après validation.
