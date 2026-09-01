# Import silencieux des clients

Cette procédure crée des fiches MyFluxperf et, seulement pour les dossiers complets,
les utilisateurs Supabase Auth de chaque contact importé. Elle n'envoie aucun email Brevo et ne demande aucun
magic link : les clients ne sont donc pas informés par l'import.

## Préparer depuis le modèle Google Sheet

Le modèle d'import peut être utilisé directement, sans export manuel. La commande
lit uniquement les lignes indiquées, convertit les huit blocs `Service` en package
CSV interne et ne modifie jamais le Sheet source.

Le compte de service Google doit disposer d'un accès **Lecteur** au modèle. Une
propriété GA4 doit être renseignée par son ID numérique ; un ID de mesure qui commence
par `G-` n'est pas utilisable pour les statistiques MyFluxperf.

```powershell
pnpm prepare:client-import -- --rows 6,7,8 --env-file .\pilot-production.env --output .\.codex-tmp\pilote-mfp-001-003
```

La commande écrit `preparation.csv` et, si toutes les lignes sont valides,
`clients.csv`, `contacts.csv` et `solutions.csv`. En cas d'erreur, seuls les
rapports de préparation sont créés.

## Fichiers attendus

Créer un dossier contenant trois CSV UTF-8, séparés par des points-virgules.

`clients.csv`

```text
client_key;organisation;email_principal;notes
acme-001;ACME SAS;contact@acme.fr;Client historique
```

`contacts.csv`

```text
client_key;prenom;nom;email;role_contact;contact_principal
acme-001;Camille;Martin;contact@acme.fr;Direction;Oui
```

`solutions.csv`

```text
client_key;type_solution;statut_solution;nom_solution;url_ou_indication;ga4_property_id;google_ads_customer_id;notes
acme-001;Flux Visibilité & Acquisition;Actif;Site web;https://www.acme.fr;123456789;;
```

`client_key` est une clé stable, propre à la vague d'import. Ne la modifiez pas
entre un `dry-run` et un éventuel redémarrage de l'import.

Les valeurs `type_solution` et `nom_solution` doivent correspondre au catalogue
MyFluxperf. Une famille ne peut recevoir que ses types autorisés : toute association
incohérente est rejetée et reportée dans les exceptions.

| Famille | Types autorisés |
| --- | --- |
| Flux Visibilité & Acquisition | Site web · Site e-shop · Publicité Google Ads · Réseaux sociaux |
| Flux Automatisation & IA | Tableau de bord · Automatisation & Synchronisation |
| Flux Assistant IA | Copilote entreprise - Alzy |

## Exécution

Utiliser un fichier d'environnement local qui contient les secrets déjà configurés
dans Cloudflare Pages. Il ne doit jamais être ajouté à Git.

```powershell
pnpm import:clients -- --input .\imports\vague-1 --mode dry-run --env-file .\.dev.vars
pnpm import:clients -- --input .\imports\vague-1 --mode apply --env-file .\.dev.vars
```

### Retrait contrôlé de la fiche pilote historique

La commande suivante est volontairement limitée à la fiche test GabyPower
`CLI-17072026-C4F5`. Elle retire, sans notification, les lignes liées dans
`Clients`, `Contacts`, `Solutions`, `Actions`, `Connexions`, les éventuelles
archives et l'utilisateur Supabase associé. Le rapport local ne contient que des
identifiants et des volumes.

```powershell
pnpm retire:client -- --client-id CLI-17072026-C4F5 --mode dry-run --env-file .\pilot-production.env
pnpm retire:client -- --client-id CLI-17072026-C4F5 --mode apply --env-file .\pilot-production.env
```

Pour le pilote MFP-001 à MFP-003, exécuter ensuite le `dry-run` et l'`apply` sur
le dossier produit par `prepare:client-import` :

```powershell
pnpm import:clients -- --input .\.codex-tmp\pilote-mfp-001-003 --mode dry-run --env-file .\pilot-production.env
pnpm import:clients -- --input .\.codex-tmp\pilote-mfp-001-003 --mode apply --env-file .\pilot-production.env
```

Le `dry-run` lit le Google Sheet de production mais n'écrit rien. Contrôler ses
rapports avant d'utiliser `apply`. Les vérifications GA4/Google Ads sont en lecture
seule et n'empêchent pas l'import : elles produisent `available`, `pending_setup`
ou `not_checked`. Ajouter `--skip-statistics` pour les omettre.

Par défaut, l'import demande aussi au service de vignettes de préparer les sites
éligibles. Ajouter `--skip-thumbnails` pour ne pas le faire.

## Résultats et reprise

Les rapports sont créés dans `rapport-import-AAAA-MM-JJ` dans le dossier d'entrée :

- `synthese.csv` : résultat de chaque client, des raccordements contrôlés et des demandes de vignettes ;
- `exceptions.csv` : conflits, erreurs et actions à effectuer ;
- `mapping.csv` : correspondance entre `client_key` et identifiants MyFluxperf.

Les clients complets sont créés `Actif` avec accès portail `Oui`, mais sans
notification. Les dossiers incomplets restent `Brouillon`, accès `Non`, et ne
créent pas d'utilisateur Supabase. Chaque création ajoute une trace dans `Actions`.

L'import est rejouable : la note client contient la clé d'import, ce qui permet de
reprendre une exécution interrompue sans recréer la fiche principale. Les rapports
doivent toutefois être conservés avec la vague d'import.
