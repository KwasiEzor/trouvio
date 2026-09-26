# PRD — Trouvio

## 1. Problème
Chercher un emploi en Belgique francophone oblige à consulter plusieurs sites chaque jour, à trier manuellement des dizaines d'offres hors sujet, et à suivre ses candidatures dans un tableur. Les outils d'IA existants optimisent le **volume** (auto-candidature en masse) plutôt que la **pertinence**, avec des prix souvent opaques.

## 2. Proposition de valeur
« Elle trie. Tu décides. » — Trouvio lit les offres à ta place, t'explique pourquoi chacune te correspond (ou non), et te laisse décider. Prix mensuel simple (0 à 5 € pour l'essentiel).

## 3. Personas
- **Kwasi (utilisateur zéro)** — développeur senior en Wallonie, cherche CDI ou freelance, tous modes de travail. Premier utilisateur réel (phase d'auto-test).
- **Demandeur·se d'emploi à budget serré** — veut gagner du temps sans payer 20–30 €/mois.
- **Administrateur (Kwasi)** — surveille coûts IA, quotas des sources, croissance.

## 4. Périmètre
### MVP personnel (jalon M1)
Collecte quotidienne (France Travail, Forem, Adzuna) → dédoublonnage → scoring IA expliqué → digest Telegram. Configuration par seed. Aucun écran obligatoire.

### Bêta (jalon M2)
Comptes utilisateurs, configuration dans l'app, fil d'offres, détail d'offre, suivi kanban, statistiques, digest email, site public (accueil, fonctionnalités, tarifs, contact), pages légales.

### Lancement (jalon M3)
Administration, facturation Stripe (Gratuit / Économique / Confort), durcissement sécurité, runbook d'exploitation.

### Hors périmètre (volontairement)
Candidature automatique, scraping de LinkedIn/Indeed, application mobile native, lettres envoyées sans relecture.

### Après le lancement (reporté)
Canal Notion ; thème sombre.

## 5. Exigences fonctionnelles
| ID | Exigence | Priorité |
|---|---|---|
| F1 | Collecter les offres des sources actives selon les critères de chaque utilisateur, 1×/jour minimum | Must |
| F2 | Dédoublonner une même offre publiée sur plusieurs sources | Must |
| F3 | Attribuer un score 0–100 + points forts + points de vigilance + raison courte | Must |
| F4 | N'envoyer que les offres ≥ seuil configurable (défaut 60) | Must |
| F5 | Digest Telegram quotidien à l'heure choisie | Must |
| F6 | Marquer une offre « pas pertinente » et l'exclure des digests | Should |
| F7 | Suivi : à examiner / postulé / relance / sans suite | Should |
| F8 | Statistiques personnelles (volume, score moyen, entonnoir) | Could |
| F9 | Export CSV des candidatures | Could |

## 6. Exigences non fonctionnelles
- **Coût** : coût IA ≤ **30 % du prix de la formule** de l'utilisateur (mesuré en P3-03, vérifié à la porte P3) ; alerte admin au-delà. Formule Gratuite : plafond fixe par utilisateur, défini en P9-03.
- **Fiabilité** : l'échec d'une source n'empêche pas le digest des autres ; job idempotent (relancer ne double pas les envois).
- **Sécurité & vie privée** : RGPD (utilisateurs en Belgique), données minimales envoyées au LLM, suppression de compte effective.
- **Performance** : pages de l'app < 2 s (LCP) en 4G ; digest généré en < 5 min pour 100 utilisateurs.
- **Accessibilité** : WCAG 2.1 AA sur les parcours principaux.

## 7. Métriques de succès
- M1 : Kwasi reçoit ≥ 2 offres pertinentes/semaine qu'il n'aurait pas trouvées seul (2 semaines d'auto-test).
- Scoring : ≥ 80 % d'accord avec le jugement humain sur le jeu de référence (`evals/`).
- Bêta : rétention 30 jours ≥ 60 %, ≥ 20 testeurs actifs.
