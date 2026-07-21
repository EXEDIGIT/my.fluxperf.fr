# Deploiement Cloudflare Pages

## Parametres Pages

- Framework preset : Vite
- Build command : `pnpm run build`
- Output directory : `dist`
- Functions directory : `functions`

## Variables d'environnement

```env
APP_ENV=production
VITE_SUPABASE_URL=https://ymtqssbfruuziypiwpie.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_URL=https://ymtqssbfruuziypiwpie.supabase.co
SUPABASE_PUBLISHABLE_KEY=
GOOGLE_SHEET_ID=
GOOGLE_SHEET_RANGE=Clients!A1:Z1000
GOOGLE_CONTACTS_RANGE=Contacts!A1:Z1000
GOOGLE_SOLUTIONS_RANGE=Solutions!A1:Z1000
GOOGLE_ACTIONS_RANGE=Actions!A1:J1000
GOOGLE_CONNECTIONS_RANGE=Connexions!A1:H1000
GOOGLE_PARAMETERS_RANGE=Parametres!A1:B1000
GOOGLE_SOLUTIONS_WRITE_RANGE=Solutions!A:K
GOOGLE_CONNECTIONS_WRITE_RANGE=Connexions!A:H
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_LOGIN_CUSTOMER_ID=
THUMBNAIL_WORKER_URL=
THUMBNAIL_INTERNAL_SECRET=
N8N_INTERVENTION_WEBHOOK_URL=
N8N_INTERVENTION_WEBHOOK_SECRET=
BREVO_API_KEY=
```

Configurer `GOOGLE_PRIVATE_KEY`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `BREVO_API_KEY` et `THUMBNAIL_INTERNAL_SECRET`
comme secrets Cloudflare Pages. Ces cles doivent rester cote serveur.

## Checklist Supabase

1. `Site URL` configure sur `https://my.fluxperf.fr`.
2. Redirect autorise : `https://my.fluxperf.fr/auth/callback`.
3. Redirect local autorise : `http://127.0.0.1:5173/auth/callback`.
4. Utilisateurs clients crees dans Supabase Auth.
5. Template email magic link personnalise.
6. SMTP custom configure avant ouverture client.

## Checklist Google

1. Google Sheets API activee.
2. Google Analytics Data API activee.
3. Service Account cree.
4. Google Sheet partage en lecture avec le Service Account.
5. Proprietes GA4 partagees en lecture avec le Service Account pour les clients raccordes.
6. `GOOGLE_SHEET_ID` recupere depuis l'URL du Sheet.
7. Onglets `Clients`, `Contacts`, `Solutions` et `Actions` presents si le schema structure est utilise.
8. Colonnes `ga4_property_id` et `google_ads_customer_id` presentes dans `Solutions` et `GOOGLE_SOLUTIONS_WRITE_RANGE=Solutions!A:K`.
9. Ancien onglet `Sites` archive/masque sous `Archive_Sites` si une migration a ete faite.
10. Pour Google Ads : developer token actif, Service Account en lecture sur le MCC, `GOOGLE_ADS_DEVELOPER_TOKEN` et `GOOGLE_ADS_LOGIN_CUSTOMER_ID` renseignes dans Pages.

## Checklist n8n / Brevo

1. Importer `docs/n8n/myfluxperf-intervention-workflow.json` dans n8n.
2. `payload` parse pour creer la carte Trello, preparer l'accuse de reception et journaliser la demande.
3. `files[]` rattaches a la carte Trello.
4. Envoi email Brevo configure depuis `notifications@fluxperf.fr`.
5. Secret partage configure dans `N8N_INTERVENTION_WEBHOOK_SECRET`.
6. Procedure detaillee : `docs/n8n/intervention-workflow-setup.md`.

## Checklist Support MyFluxperf

1. Verifier dans Brevo que `notifications@fluxperf.fr` est un expediteur autorise.
2. Creer une cle API Brevo transactionnelle.
3. Ajouter la cle dans Cloudflare Pages sous `BREVO_API_KEY`.
4. Tester la carte Support avec un compte client actif.
5. Verifier que l'email arrive a `support@fluxperf.fr` avec un reply-to client.
6. Tester la popin publique de demande d'acces depuis `/login`.
7. Verifier que l'email de demande d'acces arrive a `support@fluxperf.fr` avec un reply-to demandeur.

## Checklist Vignettes Services Actifs

Procedure detaillee : `docs/cloudflare-thumbnail-service.md`.

1. Verifier que les solutions site web actives dans `Solutions` ont `domaine` et `url_ou_indication`.
2. Creer le bucket R2 `myfluxperf-thumbnails`.
3. Deployer le Worker `workers/thumbnail-service` avec `pnpm run thumbnail:deploy`.
4. Ajouter cote Worker les secrets `INTERNAL_API_BASE_URL=https://my.fluxperf.fr` et `THUMBNAIL_INTERNAL_SECRET`.
5. Ajouter cote Pages `THUMBNAIL_WORKER_URL` avec l'URL du Worker et le meme `THUMBNAIL_INTERNAL_SECRET`.
6. Tester `GET /api/internal/thumbnail-sources` via Worker uniquement, jamais depuis le navigateur public.
7. Lancer un `POST /api/thumbnails/:solution_id/refresh` avec un compte client autorise pour les premieres captures.

## Test final

1. Deployer sur Cloudflare Pages.
2. Verifier `/api/health`.
3. Ouvrir `https://my.fluxperf.fr/login`.
4. Demander un magic link avec un email cree dans Supabase Auth.
5. Verifier que `/auth/callback` ouvre bien une session.
6. Verifier qu'un email configure dans le Sheet affiche le dashboard.
7. Verifier qu'un email authentifie mais absent du Sheet retourne l'erreur client non configure.
8. Tester la demande d'intervention native avec et sans piece jointe.
9. Tester la carte Support, la popin Solutions, le module Temps libere et les ressources.
10. Verifier que les services actifs affichent une vignette site ou un placeholder Fluxperf.
