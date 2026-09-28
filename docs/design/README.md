# Design — Trouvio

- `tokens.json` : couleurs, typographies, espacements et rayons officiels. **Source unique** du thème Tailwind (tâche P0-05). Thème **clair uniquement** jusqu'au lancement (M3) ; le thème sombre est reporté, les tokens restent structurés par thème (`value.light`) pour l'ajouter sans refonte.
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

Effets animés : Magic UI, surtout sur le site public, avec une liste fermée de composants adaptés aux tokens et au mouvement réduit. Voir `docs/adr/0007-magic-ui.md`.

## Version 3 des tokens (P0-05, 2026-09-28)
Les contrastes WCAG AA ont été vérifiés (et sont testés automatiquement, `src/lib/design-tokens.test.ts`). Deux ajustements, validés :
- **`brand-strong` #157573** (nouveau) : même teinte que `brand`, plus foncée, pour tout ce qui porte du texte — bouton primaire (blanc dessus : 5,49), liens et texte turquoise (4,99 sur `surface`), anneau de focus. `#1F9997` (`brand`) reste la couleur de marque pour le symbole et le décoratif : blanc dessus n'atteignait que 3,46.
- **`ink-muted` #6B7684 → #5F6A78** : 4,99 sur `surface` au lieu de 4,19.
Les maquettes HTML ne sont pas modifiées ; elles restent la référence de hiérarchie et de mise en page, les couleurs de texte suivent les tokens.

`src/app/icon.svg` (icône d'application servie par Next) est une copie de `public/brand/trouvio-app-icon.svg` : les mettre à jour ensemble.
