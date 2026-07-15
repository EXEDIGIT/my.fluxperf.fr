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
GOOGLE_SITES_RANGE=Sites!A1:Z1000
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
N8N_INTERVENTION_WEBHOOK_URL=
N8N_INTERVENTION_WEBHOOK_SECRET=
BREVO_API_KEY=
```

Configurer `GOOGLE_PRIVATE_KEY` et `BREVO_API_KEY` comme secrets Cloudflare Pages. Ces cles doivent rester cote serveur.

## Checklist Supabase

1. `Site URL` configure sur `https://my.fluxperf.fr`.
2. Redirect autorise : `https://my.fluxperf.fr/auth/callback`.
3. Redirect local autorise : `http://127.0.0.1:5173/auth/callback`.
4. Utilisateurs clients crees dans Supabase Auth.
5. Template email magic link personnalise.
6. SMTP custom configure avant ouverture client.

## Checklist Google

1. Google Sheets API activee.
2. Service Account cree.
3. Google Sheet partage en lecture avec le Service Account.
4. `GOOGLE_SHEET_ID` recupere depuis l'URL du Sheet.
5. Onglets `Clients`, `Contacts` et `Sites` presents si le schema structure est utilise.

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

## Test final

1. Deployer sur Cloudflare Pages.
2. Verifier `/api/health`.
3. Ouvrir `https://my.fluxperf.fr/login`.
4. Demander un magic link avec un email cree dans Supabase Auth.
5. Verifier que `/auth/callback` ouvre bien une session.
6. Verifier qu'un email configure dans le Sheet affiche le dashboard.
7. Verifier qu'un email authentifie mais absent du Sheet retourne l'erreur client non configure.
8. Tester la demande d'intervention native avec et sans piece jointe.
9. Tester la carte Support, la popin Solutions, le rapport et les ressources.
