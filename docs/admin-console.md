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
GOOGLE_CONNECTIONS_RANGE=Connexions!A1:H1000
GOOGLE_CONNECTIONS_WRITE_RANGE=Connexions!A:H
GOOGLE_PARAMETERS_RANGE=Parametres!A1:B1000
```

Le Service Account Google doit avoir le droit d'edition sur le Google Sheet pour que l'ajout client fonctionne.
Les listes `type_solution` et `nom_solution` sont lues depuis l'onglet
`Parametres`. Si cet onglet est vide ou indisponible, la console utilise une
liste de secours.

## Formats generes

Pour les nouvelles lignes creees par la console interne :

- les identifiants utilisent une date compacte francaise `JJMMAAAA` :
  `CLI-17072026-XXXX`, `CON-17072026-XXXX`, `SOL-17072026-XXXX` ;
- les dates metier lisibles utilisent `JJ/MM/AAAA` :
  `date_creation`, `date_mise_a_jour` et `date_activation` ;
- les lignes existantes avec les anciens formats restent compatibles et ne sont
  pas migrees automatiquement.

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
url_ou_indication
date_activation
notes
```

La console ne demande plus le champ `domaine` : elle le deduit uniquement quand
`url_ou_indication` contient une URL. Une indication de service reste du texte
et laisse `domaine` vide. La valeur `url_ou_indication` est ecrite telle que
saisie, sans ajout automatique de protocole.

`Connexions`

```text
connexion_id
client_id
email
date_connexion
jour
mois
source
user_agent
```

La console V2 journalise au maximum une connexion par client et par jour apres
un acces reussi a `/api/me`. Cette journalisation alimente les statistiques de
connexion du tableau de bord et ne bloque jamais l'acces client si Google
Sheets est indisponible.

## Console V2

La console interne est organisee en trois onglets :

- `Tableau de bord` : comptes clients, solutions actives, demandes
  d'intervention, connexions et tops clients ;
- `Clients` : recherche, fiche client, desactivation client, ajout et
  desactivation de solution ;
- `Nouveau client` : formulaire de creation existant.

Les actions de desactivation ne suppriment aucune ligne : elles passent les
statuts a `Inactif` et conservent l'historique.
