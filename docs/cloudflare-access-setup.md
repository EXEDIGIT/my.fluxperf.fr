# Cloudflare Access

Ce document correspond a l'ancien dispositif de connexion client par Cloudflare Access OTP.

Pour le MVP `my.fluxperf.fr`, le login client est maintenant gere par Supabase Auth :

- page de connexion FluxPerf dans l'application ;
- magic link envoye par Supabase ;
- token Supabase verifie par `/api/me` ;
- donnees client filtrees cote serveur depuis Google Sheets.

Cloudflare Access ne doit plus proteger le domaine complet `my.fluxperf.fr`, sinon les clients verront l'ecran Cloudflare avant la page de connexion FluxPerf.

## Usage possible

Cloudflare Access peut rester utile pour une future zone interne, par exemple :

- `admin.my.fluxperf.fr` ;
- `my.fluxperf.fr/admin` ;
- outils internes FluxPerf non destines aux clients.

Dans ce cas, creer une application Access separee et ne pas l'appliquer au parcours client public.
