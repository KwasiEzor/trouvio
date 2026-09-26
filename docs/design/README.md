# Design — Trouvio

- `tokens.json` : couleurs, typographies, espacements et rayons officiels. **Source unique** du thème Tailwind (tâche P0-05).
- `../../public/brand/` : logos (symbole, icône d'app, logo horizontal, wordmark) en SVG.
- `mockups/` : maquettes HTML statiques de tous les écrans, à ouvrir dans un navigateur (les liens entre pages fonctionnent).

| Maquette | Écran cible | Phase |
|---|---|---|
| `Main.html` | Fil d'offres | P6-02 |
| `Offre.html` | Détail d'une offre | P6-03 |
| `Suivi.html` | Suivi (kanban) | P6-04 |
| `Configuration.html` | Configuration | P6-05 |
| `Statistiques.html` | Statistiques | P6-06 |
| `Accueil.html`, `Fonctionnalites.html`, `Tarifs.html`, `Contact.html` | Site public | P7-01 |
| `Connexion.html`, `Inscription.html` | Authentification | P7-02 |
| `AdminDashboard.html` | Administration | P8-01 |

Les maquettes sont une **référence visuelle** (hiérarchie, espacements, états, contenus). Elles ne sont pas à copier telles quelles : l'implémentation passe par les composants shadcn/ui et le thème Tailwind.

Règles de marque : le symbole tient lieu de « T » dans le logo horizontal ; en texte, écrire « Trouvio ». Turquoise `#1F9997` = seule couleur vive, à utiliser avec parcimonie. Polices : Poppins (titres), Work Sans (texte).

Thème : **clair uniquement** jusqu'au lancement (M3). Le thème sombre est reporté après le lancement ; les tokens restent structurés par thème (`value.light`) pour l'ajouter sans refonte.
