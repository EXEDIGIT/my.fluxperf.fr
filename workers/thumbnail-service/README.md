# Thumbnail Service

Worker Cloudflare dedie aux vignettes de services actifs MyFluxperf.

## Role

- sert `GET /thumbnail/:solution_id` depuis le cache Cloudflare puis R2 ;
- lance `POST /thumbnail/:solution_id/refresh` sans accepter d'URL libre ;
- relit les sources autorisees via `/api/internal/thumbnail-sources` ;
- genere les captures avec Browser Run ;
- rafraichit les vignettes obsoletes via le cron hebdomadaire.

## Ressources Cloudflare

1. Creer le bucket R2 `myfluxperf-thumbnails`.
2. Deployer ce Worker avec `wrangler.toml`.
3. Ajouter les secrets Worker :

```bash
pnpm dlx wrangler@latest secret put INTERNAL_API_BASE_URL -c workers/thumbnail-service/wrangler.toml
pnpm dlx wrangler@latest secret put THUMBNAIL_INTERNAL_SECRET -c workers/thumbnail-service/wrangler.toml
```

`INTERNAL_API_BASE_URL` doit valoir `https://my.fluxperf.fr`.
`THUMBNAIL_INTERNAL_SECRET` doit etre identique cote Cloudflare Pages.

## Commandes utiles

```bash
pnpm dlx wrangler@latest dev --remote -c workers/thumbnail-service/wrangler.toml
pnpm dlx wrangler@latest deploy -c workers/thumbnail-service/wrangler.toml
```

Le binding Browser Run `quickAction()` demande une version recente de Wrangler.
Utiliser `wrangler@latest` pour eviter les incompatibilites avec la version
historique utilisee par le portail Pages.
