# Architecture My FluxPerf

Document d'archive pour comprendre rapidement le fonctionnement de `my.fluxperf.fr`.

## L'idee en une phrase

`my.fluxperf.fr` est un portail client prive : Cloudflare verifie l'identite, l'application lit uniquement la fiche du client connecte dans Google Sheets, puis React affiche son dashboard.

## Les roles, version ludique

Imagine le portail comme une agence FluxPerf avec plusieurs personnes a l'accueil.

| Outil | Role dans l'histoire | Role technique |
| --- | --- | --- |
| Domaine `my.fluxperf.fr` | L'adresse sur la porte | Adresse publique utilisee par les clients |
| Cloudflare DNS | Le panneau qui indique ou aller | Fait pointer `my.fluxperf.fr` vers Cloudflare Pages |
| Cloudflare Pages | Le batiment qui sert le portail | Heberge le frontend React et les Pages Functions |
| Cloudflare Access | Le vigile souriant a l'entree | Demande un code email OTP et autorise uniquement les emails prevus |
| Cookie/JWT Access | Le bracelet visiteur | Prouve a l'API que l'utilisateur est deja authentifie |
| React/Vite | La salle d'accueil client | Affiche le dashboard, les cartes, les services et les ressources |
| `/api/me` | Le guichet prive | Recupere l'email connecte et retourne une seule fiche client |
| Pages Functions | Le bureau cote serveur | Execute le code API sur Cloudflare, sans exposer les secrets au navigateur |
| Thumbnail Worker | Le photographe interne | Sert et rafraichit les vignettes de services actifs par `solution_id` |
| Cloudflare R2 | Le casier images | Stocke durablement les captures homepage des solutions site web |
| Browser Run | L'appareil photo headless | Genere les screenshots de homepage depuis les URL autorisees |
| Google Sheet | Le classeur clients | Contient les donnees clients, contacts, solutions et actions |
| Google Service Account | Le badge lecteur | Autorise l'API a lire le Google Sheet sans compte humain |
| Google Sheets API | Le bibliothecaire | Donne les lignes demandees au serveur apres verification du badge |
| GitHub | L'atelier source | Stocke le code et declenche les builds Cloudflare |
| Formulaire natif | Le comptoir demandes | Collecte les demandes d'intervention depuis MyFluxperf |
| n8n | Le repartiteur | Recoit les demandes, cree les taches, declenche Brevo et journalise |
| Jotform | Le comptoir support historique | Peut encore ouvrir un formulaire support quand l'URL est renseignee |
| Looker Studio | Salle historique d'indicateurs | Peut rester reference via `report_url`, mais le dashboard V1 affiche le module Temps libere |

## Chemin d'une connexion

1. Le client ouvre `https://my.fluxperf.fr`.
2. Cloudflare Access intercepte la demande avant l'application.
3. Le client saisit son email et recoit un code temporaire.
4. Si l'email est autorise par la strategie Access, Cloudflare ouvre la porte.
5. Le navigateur charge le dashboard React.
6. React appelle `/api/me`.
7. La Pages Function lit l'identite Cloudflare Access : header email ou jeton Access.
8. La Pages Function lit le Google Sheet via le Service Account.
9. L'API cherche le client actif correspondant a l'email connecte.
10. L'API renvoie uniquement la fiche de ce client.
11. React affiche le dashboard.

## Schema visuel

Voir le fichier [schema-my-fluxperf.svg](schema-my-fluxperf.svg).

```mermaid
flowchart LR
  U["Client"] --> D["my.fluxperf.fr"]
  D --> A["Cloudflare Access<br/>OTP email"]
  A --> P["Cloudflare Pages<br/>React"]
  P --> API["/api/me<br/>Pages Function"]
  API --> SA["Service Account<br/>JWT signe"]
  SA --> GS["Google Sheets API"]
  GS --> DB["Google Sheet<br/>Clients / Contacts / Solutions / Actions"]
  DB --> API
  API --> P
  P --> THAPI["/api/thumbnails/:solution_id"]
  THAPI --> TH["Thumbnail Worker<br/>R2 / Browser Run"]
  P --> REQ["/api/intervention-requests"]
  REQ --> N8N["n8n webhook"]
```

## Donnees Google Sheet utilisees

Le portail supporte la structure actuelle de la BDD :

| Onglet | Usage |
| --- | --- |
| `Clients` | Identite du compte, statut client, activation de l'espace client, email principal |
| `Contacts` | Prenom, nom, email, statut contact |
| `Solutions` | Services Fluxperf rattaches au client, avec type, statut, nom, domaine, URL ou indication et date d'activation |
| `Actions` | Journal des demandes client affiche dans le module Dernieres actions |
| `Documents` | Métadonnées internes des documents administratifs ; aucun fichier bancaire n’est stocké dans le tableur |
| `Parametres` | Valeurs de reference lues par la console admin pour alimenter les options de solutions |

L'ancien onglet `Sites` peut rester archive sous `Archive_Sites`, masque, le temps
de conserver l'historique de migration. Il n'est plus lu par le portail.

Conditions pour qu'un client soit affiche :

- `Clients.statut_client = Actif`
- `Clients.espace_client_actif = Oui`
- l'email connecte correspond a `Clients.email_principal` ou a un contact actif de l'onglet `Contacts`

## Variables Cloudflare Pages

Variables principales :

```env
APP_ENV=production
GOOGLE_SHEET_ID=1UQg2AbJYg2GEfzHshUVaAVfDvIdHHQHAw7LADcAUvKA
GOOGLE_SHEET_RANGE=Clients!A1:Z1000
GOOGLE_CONTACTS_RANGE=Contacts!A1:Z1000
GOOGLE_SOLUTIONS_RANGE=Solutions!A1:Z1000
GOOGLE_ACTIONS_RANGE=Actions!A1:J1000
GOOGLE_SOLUTIONS_WRITE_RANGE=Solutions!A:K
GOOGLE_SERVICE_ACCOUNT_EMAIL=my-fluxperf-reader@fluxperf.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=...
GOOGLE_ADS_DEVELOPER_TOKEN=...
GOOGLE_ADS_LOGIN_CUSTOMER_ID=...
CF_ACCESS_HOSTNAME=my.fluxperf.fr
N8N_INTERVENTION_WEBHOOK_URL=...
N8N_INTERVENTION_WEBHOOK_SECRET=...
N8N_RIB_WEBHOOK_URL=...
N8N_RIB_WEBHOOK_SECRET=...
GOOGLE_DOCUMENTS_RANGE=Documents!A1:J1000
THUMBNAIL_WORKER_URL=https://myfluxperf-thumbnail-service.<account>.workers.dev
THUMBNAIL_INTERNAL_SECRET=...
```

`GOOGLE_PRIVATE_KEY` doit rester en secret Cloudflare. Elle ne doit jamais etre mise dans GitHub.

Le Worker vignettes a sa propre configuration dans `workers/thumbnail-service`.
Il utilise le bucket R2 `myfluxperf-thumbnails`, le binding Browser Run
`BROWSER`, le binding Rate Limiting `REFRESH_RATE_LIMITER` et le cron
hebdomadaire `0 4 * * 1`.

## Securite

Ce qui protege les donnees :

- Cloudflare Access bloque les visiteurs non autorises avant le portail.
- `/api/me` ignore les emails simules en production.
- L'API ne renvoie qu'un seul client : celui associe a l'email connecte.
- `/api/intervention-requests` reverifie l'identite et refuse les solutions non rattachees au client.
- `/api/account/rib` reverifie l'identite, accepte un seul PDF/JPG/PNG de 10 Mo maximum et ne transmet à n8n que la fiche client associée à la session.
- `/api/thumbnails/:solution_id` reverifie l'identite et refuse les solutions non rattachees au client.
- Le Worker n'accepte jamais d'URL depuis le frontend ; il relit les sources autorisees via un endpoint interne protege.
- Les captures bloquent localhost, IP privees, IP locales, protocoles non HTTP(S) et domaines qui ne correspondent pas a `Solutions.domaine`.
- La cle Google reste cote Cloudflare Pages Functions.
- Le navigateur ne voit jamais la feuille complete ni la cle privee.
- L'URL `pages.dev` ne doit pas servir de portail client principal.

## Lecture des erreurs

| Message | Signification | Action |
| --- | --- | --- |
| `AUTH_REQUIRED` | L'API ne recoit pas l'identite Cloudflare Access | Verifier Access, le domaine protege, le deploiement du correctif JWT |
| `CLIENT_NOT_CONFIGURED` | L'utilisateur est connecte mais aucun client actif ne correspond | Verifier `email_principal`, `Contacts.email`, `statut_client`, `espace_client_actif` |
| `DATA_UNAVAILABLE` | L'API n'arrive pas a lire Google Sheets | Verifier variables Cloudflare, cle privee, partage du Sheet au Service Account, onglets/ranges |
| `WEBHOOK_FAILED` | n8n n'a pas accepte une demande | Verifier le workflow n8n, l'URL webhook et le secret partage |
| `THUMBNAIL_UNAVAILABLE` | Une vignette n'est pas prete ou le Worker ne repond pas | Verifier R2, Worker, secret interne et premiere capture |

## Checklist de reprise pour un developpeur

1. Lire `README.md`.
2. Lire ce fichier.
3. Verifier les variables Cloudflare Pages.
4. Verifier la strategie Cloudflare Access sur `my.fluxperf.fr`.
5. Verifier que le Google Sheet est partage en lecture avec le Service Account.
6. Lancer en local :

```bash
pnpm install
pnpm run typecheck
pnpm run test
pnpm run build
```

7. Pousser sur `main` pour declencher un deploiement Cloudflare Pages.

## Recette apres chaque changement

1. `https://my.fluxperf.fr/api/health` retourne `status: ok`.
2. En navigation privee, Cloudflare Access demande un email et envoie un OTP.
3. Un email autorise arrive sur le dashboard.
4. Un email absent ou client inactif affiche un refus propre.
5. La demande d'intervention s'envoie avec et sans piece jointe.
6. Les solutions proposees correspondent uniquement au client connecte.
7. Le module Temps libere affiche le temps libere ou un etat vide si aucune donnee n'est active.
8. Desktop et mobile restent lisibles.
