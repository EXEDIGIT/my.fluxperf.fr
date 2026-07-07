# My FluxPerf

MVP de l'espace client privé FluxPerf pour `my.fluxperf.fr`.

L'application est prévue pour Cloudflare Pages, protégée en amont par Cloudflare Access. Le frontend React ne choisit jamais l'email client en production : `/api/me` lit l'email authentifié côté Pages Function, puis retourne uniquement la fiche client correspondante depuis Google Sheets.

## Installation locale

```bash
pnpm install
```

## Lancement dev

```bash
pnpm run dev
```

En dev Vite pur, l'interface utilise un fallback de démonstration si `/api/me` n'est pas disponible. Pour tester les fonctions Cloudflare localement :

```bash
pnpm run build
pnpm exec wrangler pages dev dist
```

Ajoutez une `.dev.vars` locale si besoin :

```env
APP_ENV=development
DEV_AUTH_EMAIL=contact@a2-cm.fr
```

## Build et tests

```bash
pnpm run typecheck
pnpm run test
pnpm run build
```

## Déploiement Cloudflare Pages

- Build command : `pnpm run build`
- Output directory : `dist`
- Framework preset : Vite
- Runtime : Cloudflare Pages Functions via le dossier `functions/`

Variables à configurer dans Cloudflare Pages :

```env
APP_ENV=production
GOOGLE_SHEET_ID=
GOOGLE_SHEET_RANGE=Clients!A1:Z1000
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
CF_ACCESS_LOGOUT_URL=
```

`DEV_AUTH_EMAIL` ne doit pas être renseigné en production.

## Cloudflare Access OTP

Cloudflare Access protège `my.fluxperf.fr` avant l'application :

1. Créer une application Access pour `my.fluxperf.fr`.
2. Activer l'authentification par email OTP.
3. Autoriser les emails clients dans la politique Access.
4. Protéger le domaine complet.
5. Renseigner `CF_ACCESS_LOGOUT_URL` si un bouton de déconnexion est souhaité.

## Google Cloud et Google Sheets

1. Créer un Service Account Google.
2. Activer Google Sheets API.
3. Créer une clé privée JSON pour le Service Account.
4. Copier `client_email` dans `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
5. Copier `private_key` dans `GOOGLE_PRIVATE_KEY` en conservant les `\n`.
6. Partager le Google Sheet avec l'email du Service Account en lecture seule.

Le Google Sheet n'est jamais exposé côté navigateur. `/api/me` lit la feuille côté serveur et retourne uniquement la fiche du client connecté.

## Ajouter un client

Dans l'onglet `Clients`, ajoutez une ligne avec :

- `status=active`
- `primary_email` renseigné
- `allowed_emails` optionnel, séparé par des virgules
- les URLs Jotform, rapport et ressources si disponibles

Voir [docs/google-sheet-template.md](docs/google-sheet-template.md).

## Ajouter un formulaire Jotform

Renseignez `jotform_request_url` ou `jotform_support_url` dans la fiche client. L'application ouvre le formulaire en modale et ajoute ces paramètres non sensibles :

- `client_id`
- `company`
- `email`
- `first_name`

## Limitations MVP

- Dashboard unique, sans sous-pages applicatives.
- Ressources statiques.
- Pas de base SQL.
- Pas d'authentification custom côté application.
- Pas de section contenus.

## Pistes V2

- Historique détaillé des demandes.
- Notifications client.
- Gestion de documents par client.
- Rôles utilisateurs par société.
- Synchronisation bidirectionnelle avec un outil support ou CRM.
