# Déploiement Cloudflare Pages

## Paramètres Pages

- Framework preset : Vite
- Build command : `pnpm run build`
- Output directory : `dist`
- Functions directory : `functions`

## Variables d'environnement

```env
APP_ENV=production
GOOGLE_SHEET_ID=
GOOGLE_SHEET_RANGE=Clients!A1:Z1000
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
CF_ACCESS_LOGOUT_URL=
```

Configurer `GOOGLE_PRIVATE_KEY` comme secret Cloudflare Pages. La clé doit rester côté serveur.

## Checklist Google

1. Google Sheets API activée.
2. Service Account créé.
3. Google Sheet partagé en lecture avec le Service Account.
4. `GOOGLE_SHEET_ID` récupéré depuis l'URL du Sheet.
5. Onglet `Clients` présent.

## Test final

1. Déployer sur Cloudflare Pages.
2. Vérifier `/api/health`.
3. Vérifier que Cloudflare Access bloque un email non autorisé.
4. Vérifier que `/api/me` retourne `401` sans authentification.
5. Vérifier qu'un email autorisé et configuré affiche le dashboard.
6. Vérifier qu'un email autorisé mais absent du Sheet retourne l'erreur client non configuré.
7. Tester les cartes Jotform, rapport, ressources et contact.
