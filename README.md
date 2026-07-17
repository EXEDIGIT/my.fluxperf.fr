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
GOOGLE_SOLUTIONS_RANGE=Solutions!A1:Z1000
GOOGLE_ACTIONS_RANGE=Actions!A1:J1000
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
N8N_INTERVENTION_WEBHOOK_URL=
N8N_INTERVENTION_WEBHOOK_SECRET=
BREVO_API_KEY=
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
- les URLs support et ressources si disponibles

Voir [docs/google-sheet-template.md](docs/google-sheet-template.md).

## Module Impacts

Le module "Impacts" affiche le temps libere estime pour le client connecte.
Le calcul est fait cote Pages Function dans `/api/me`, a chaque chargement du
dashboard :

- 1 site actif dans l'onglet `Sites` = 1,5 h / semaine
- 1 ligne `automation_ai` active dans l'onglet `Solutions` = 1 h / semaine
- 1 ligne `assistant_ai` active dans l'onglet `Solutions` = 2 h / semaine

L'onglet `Solutions` est optionnel pour garder la compatibilite avec les bases
existantes. Colonnes attendues :

```text
solution_id
client_id
type_solution
statut_solution
nom_solution
date_activation
notes
```

Valeurs V1 attendues pour `type_solution` : `automation_ai`, `assistant_ai`.

## Demande d'intervention

La carte "Faire une demande" ouvre un formulaire natif MyFluxperf. Pour le flux
"Visibilite & Acquisition", l'application propose automatiquement les sites actifs
de l'onglet `Sites` rattaches au client connecte.

La Pages Function `POST /api/intervention-requests` verifie l'identite, controle les
sites selectionnes, limite les pieces jointes a 5 fichiers, 10 Mo par fichier et
15 Mo au total, puis transmet a n8n un `multipart/form-data` avec :

- `payload` : demande structuree, client, contact et reference Fluxperf
- `files[]` : pieces jointes ajoutees par le client

Configurez `N8N_INTERVENTION_WEBHOOK_URL` et `N8N_INTERVENTION_WEBHOOK_SECRET` dans
Cloudflare Pages. n8n prend ensuite le relais pour Trello, l'accuse de reception
Brevo et la journalisation interne.

Le workflow n8n importable et la procedure de configuration sont dans
`docs/n8n/`.

Les demandes journalisees par n8n dans l'onglet `Actions` sont relues par
`/api/me` et alimentent le module "Dernieres actions" avec les 3 dernieres
actions du client connecte.

## Support MyFluxperf

La carte Support ouvre un formulaire natif MyFluxperf avec un objet et une
description. La Pages Function `POST /api/support-requests` reverifie l'identite,
retrouve le client connecte dans Google Sheets, puis envoie l'email via Brevo
Transactional :

- expediteur : `notifications@fluxperf.fr`
- destinataire : `support@fluxperf.fr`
- reply-to : email authentifie du client

Configurez `BREVO_API_KEY` dans Cloudflare Pages. En local, si la cle n'est pas
renseignee, l'API retourne une reception simulee pour faciliter les tests.

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
