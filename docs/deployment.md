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
```

Configurer `GOOGLE_PRIVATE_KEY` comme secret Cloudflare Pages. La cle doit rester cote serveur.

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

## Test final

1. Deployer sur Cloudflare Pages.
2. Verifier `/api/health`.
3. Ouvrir `https://my.fluxperf.fr/login`.
4. Demander un magic link avec un email cree dans Supabase Auth.
5. Verifier que `/auth/callback` ouvre bien une session.
6. Verifier qu'un email configure dans le Sheet affiche le dashboard.
7. Verifier qu'un email authentifie mais absent du Sheet retourne l'erreur client non configure.
8. Tester les cartes Jotform, rapport, ressources et contact.
