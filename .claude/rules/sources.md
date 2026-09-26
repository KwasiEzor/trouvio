---
paths:
  - "src/features/sources/**"
  - "src/features/offers/**"
  - "src/lib/http/**"
---

# Règles sources d'offres

- Chaque source implémente `JobSource` (`docs/ARCHITECTURE.md` §4). Aucun type ou détail propre à une source ne sort de `features/sources/<id>/`.
- Uniquement des API/données officielles dont les CGU autorisent l'usage. Jamais de scraping de LinkedIn, Indeed ou site l'interdisant.
- Client HTTP commun : timeout, 3 tentatives, backoff exponentiel, respect des quotas (compteur).
- Réponses des API validées par Zod ; champ inattendu = log + offre ignorée, pas de crash du run.
- `normalize()` est pure et testée par fixtures JSON **réelles anonymisées** dans `features/sources/<id>/__fixtures__/` (aucune donnée personnelle de recruteur).
- Échec d'une source = journalisé + Sentry, les autres sources continuent.
- Dédoublonnage : tests couvrant doublons inter-sources ET faux doublons (même entreprise, même intitulé, offres distinctes).
