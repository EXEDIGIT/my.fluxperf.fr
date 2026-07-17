# Console interne MyFluxperf

La console interne MVP vit sur `/fp-console`.

## Objectif V1

Permettre a Fluxperf d'ajouter un client sans modifier Supabase et Google Sheets a la main.

Le formulaire cree :

- une ligne dans `Clients` ;
- une ligne dans `Contacts` ;
- une ou plusieurs lignes dans `Solutions` ;
- l'utilisateur Supabase Auth associe a l'email principal ;
- un email Brevo indiquant au client que son espace est pret.

## Securite

La securite ne repose pas sur l'URL.

Les protections attendues sont :

1. Supabase Auth pour connecter l'admin.
2. Verification serveur de l'email via `ADMIN_EMAILS`.
3. Cle Supabase service role uniquement dans Cloudflare Pages Functions.
4. Service Account Google uniquement cote serveur.
5. Cloudflare Access recommande en barriere supplementaire sur `/fp-console` et `/api/admin/*`.

## Variables

```env
ADMIN_EMAILS=tristan@fluxperf.fr,david@fluxperf.fr
SUPABASE_SERVICE_ROLE_KEY=
APP_PUBLIC_URL=https://my.fluxperf.fr
GOOGLE_CLIENTS_WRITE_RANGE=Clients!A:K
GOOGLE_CONTACTS_WRITE_RANGE=Contacts!A:J
GOOGLE_SOLUTIONS_WRITE_RANGE=Solutions!A:I
```

Le Service Account Google doit avoir le droit d'edition sur le Google Sheet pour que l'ajout client fonctionne.

## Colonnes ecrites

`Clients`

```text
client_id
nom_compte
organisation
statut_client
espace_client_actif
contact_principal_id
email_principal
nb_services_actifs
date_creation
date_mise_a_jour
notes
```

`Contacts`

```text
contact_id
client_id
prenom
nom
email
role_contact
contact_principal
statut_contact
date_creation
notes
```

`Solutions`

```text
solution_id
client_id
type_solution
statut_solution
nom_solution
domaine
url
date_activation
notes
```
