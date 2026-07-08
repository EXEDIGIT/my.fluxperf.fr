# My FluxPerf

MVP de l'espace client FluxPerf pour `my.fluxperf.fr`.

L'application est prevue pour Cloudflare Pages. L'authentification client passe par Supabase Auth en magic link. Le frontend ne choisit jamais l'email client en production : `/api/me` verifie le token Supabase cote Pages Function, puis retourne uniquement la fiche client correspondante depuis Google Sheets.

## Installation locale

```bash
pnpm install
```

## Lancement dev

```bash
pnpm run dev
```

En dev Vite pur, l'interface utilise un fallback de demonstration si `/api/me` n'est pas disponible. Pour tester les fonctions Cloudflare localement :

```bash
pnpm run build
pnpm exec wrangler pages dev dist
```

Variables locales utiles :

```env
VITE_SUPABASE_URL=https://ymtqssbfruuziypiwpie.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_URL=https://ymtqssbfruuziypiwpie.supabase.co
SUPABASE_PUBLISHABLE_KEY=
APP_ENV=development
DEV_AUTH_EMAIL=contact@a2-cm.fr
```

## Build et tests

```bash
pnpm run typecheck
pnpm run test
pnpm run build
```

## Deploiement Cloudflare Pages

- Build command : `pnpm run build`
- Output directory : `dist`
- Framework preset : Vite
- Runtime : Cloudflare Pages Functions via le dossier `functions/`

Variables a configurer dans Cloudflare Pages :

```env
APP_ENV=production
VITE_SUPABASE_URL=https://ymtqssbfruuziypiwpie.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_URL=https://ymtqssbfruuziypiwpie.supabase.co
SUPABASE_PUBLISHABLE_KEY=
GOOGLE_SHEET_ID=
GOOGLE_SHEET_RANGE=Clients!A1:Z1000
GOOGLE_CONTACTS_RANGE=Contacts!A1:Z1000
GOOGLE_SITES_RANGE=Sites!A1:Z1000
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
```

`DEV_AUTH_EMAIL` ne doit pas etre renseigne en production.

## Supabase Auth

Supabase gere l'envoi du magic link et la session navigateur :

1. Configurer `Site URL` sur `https://my.fluxperf.fr`.
2. Autoriser les redirects `https://my.fluxperf.fr/auth/callback` et `http://127.0.0.1:5173/auth/callback`.
3. Creer dans Supabase Auth les utilisateurs autorises a recevoir un lien.
4. Personnaliser le template email magic link / OTP.
5. Configurer un SMTP custom avant production.

Le code utilise `shouldCreateUser: false` pour eviter qu'une adresse inconnue cree automatiquement un compte.

## Google Cloud et Google Sheets

1. Creer un Service Account Google.
2. Activer Google Sheets API.
3. Creer une cle privee JSON pour le Service Account.
4. Copier `client_email` dans `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
5. Copier `private_key` dans `GOOGLE_PRIVATE_KEY` en conservant les `\n`.
6. Partager le Google Sheet avec l'email du Service Account en lecture seule.

Le Google Sheet n'est jamais expose cote navigateur. `/api/me` lit la feuille cote serveur et retourne uniquement la fiche du client connecte.

## Ajouter un client

Dans l'onglet `Clients`, ajoutez une ligne avec :

- `status=active`
- `primary_email` renseigne
- `allowed_emails` optionnel, separe par des virgules
- les URLs Jotform, rapport et ressources si disponibles

Voir [docs/google-sheet-template.md](docs/google-sheet-template.md).

## Ajouter un formulaire Jotform

Renseignez `jotform_request_url` ou `jotform_support_url` dans la fiche client. L'application ouvre le formulaire en modale et ajoute ces parametres non sensibles :

- `client_id`
- `company`
- `email`
- `first_name`

## Limitations MVP

- Dashboard unique, sans sous-pages applicatives.
- Ressources statiques.
- Pas encore de base SQL metier.
- Les comptes autorises doivent etre crees dans Supabase Auth.
- Pas de section contenus.

## Pistes V2

- Historique detaille des demandes.
- Notifications client.
- Gestion de documents par client.
- Roles utilisateurs par societe.
- Synchronisation bidirectionnelle avec un outil support ou CRM.
