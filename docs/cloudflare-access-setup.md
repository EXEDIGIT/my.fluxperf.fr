# Configuration Cloudflare Access

## Objectif

Protéger `my.fluxperf.fr` avec Cloudflare Access et une connexion OTP email.

## Étapes

1. Dans Cloudflare Zero Trust, créer une application Access.
2. Choisir `Self-hosted`.
3. Domaine : `my.fluxperf.fr`.
4. Chemin : laisser vide ou utiliser `/*` pour protéger tout le domaine.
5. Activer le fournisseur `One-time PIN`.
6. Créer une politique `Allow` avec les emails clients autorisés.
7. Ajouter aussi les emails FluxPerf nécessaires aux tests internes.
8. Déployer la politique.

## Déconnexion

Si un bouton de déconnexion est souhaité, renseigner `CF_ACCESS_LOGOUT_URL` dans Cloudflare Pages. La valeur dépend du compte Cloudflare Access.

## Vérification

- Ouvrir `https://my.fluxperf.fr`.
- Saisir un email autorisé.
- Valider l'OTP reçu par email.
- Vérifier que `/api/me` retourne la fiche correspondant à l'email authentifié.

## Points de sécurité

- Ne pas créer d'authentification applicative supplémentaire.
- Ne pas accepter un email envoyé par le frontend en production.
- Ne pas exposer la clé Google côté navigateur.
- Ne pas rendre le Google Sheet public.

