# Service de vignettes Cloudflare

Cette procedure installe les vignettes automatiques des services actifs sans
reintroduire d'onglet `Sites`. La source reste `Solutions` et l'identifiant
transmis reste `solution_id`.

## 1. Verifier Google Sheet

Dans `Solutions`, chaque ligne site web active doit avoir :

- `type_solution = Flux Visibilite & Acquisition`
- `statut_solution = Actif`
- `domaine` renseigne
- `url_ou_indication` avec l'URL ou le domaine a capturer

Exemples valides :

```text
domaine: hbint.com
url_ou_indication: https://www.hbint.com

domaine: trial.hbint.com
url_ou_indication: https://trial.hbint.com
```

## 2. Creer R2

Dans Cloudflare, creer un bucket R2 :

```text
myfluxperf-thumbnails
```

Le Worker stockera les fichiers sous :

```text
solutions/{solution_id}/homepage.jpg
solutions/{solution_id}/state.json
```

## 3. Configurer Pages

Ajouter dans Cloudflare Pages, projet `my.fluxperf.fr` :

```env
THUMBNAIL_WORKER_URL=https://myfluxperf-thumbnail-service.<account>.workers.dev
THUMBNAIL_INTERNAL_SECRET=<secret-long-aleatoire>
```

`THUMBNAIL_INTERNAL_SECRET` doit etre cree comme secret, pas comme variable
publique.

## 4. Configurer le Worker

Depuis le repo :

```bash
pnpm dlx wrangler@latest secret put INTERNAL_API_BASE_URL -c workers/thumbnail-service/wrangler.toml
pnpm dlx wrangler@latest secret put THUMBNAIL_INTERNAL_SECRET -c workers/thumbnail-service/wrangler.toml
```

Valeurs :

```text
INTERNAL_API_BASE_URL=https://my.fluxperf.fr
THUMBNAIL_INTERNAL_SECRET=<meme-secret-que-Pages>
```

Deployer :

```bash
pnpm run thumbnail:deploy
```

## 5. Premier refresh

Une fois le portail redeploye et connecte avec un compte client autorise,
lancer un refresh sur chaque solution site web :

```bash
curl -X POST https://my.fluxperf.fr/api/thumbnails/SOL-0001/refresh -H "Authorization: Bearer <token-supabase-client>"
curl -X POST https://my.fluxperf.fr/api/thumbnails/SOL-0002/refresh -H "Authorization: Bearer <token-supabase-client>"
```

Le frontend retombera sur le placeholder tant que la premiere capture n'est pas
encore disponible.

## 6. Verification

- `https://<worker-url>/health` retourne `status: ok`.
- `/api/me` retourne `client.solutions[].thumbnail`.
- `/api/thumbnails/:solution_id` retourne `image/jpeg` pour une solution site active deja capturee.
- Les solutions Publicité Google Ads, Réseaux sociaux, Automatisation & IA et Assistant IA affichent un placeholder sans appel Worker.

References Cloudflare :

- Browser Run screenshot : https://developers.cloudflare.com/browser-run/quick-actions/screenshot-endpoint/
- R2 Workers API : https://developers.cloudflare.com/r2/api/workers/workers-api-usage/
- Cron Triggers : https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Rate Limiting binding : https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
