# Import silencieux des clients

Cette procédure crée des fiches MyFluxperf et, seulement pour les dossiers complets,
les utilisateurs Supabase Auth de chaque contact importé. Elle n'envoie aucun email Brevo et ne demande aucun
magic link : les clients ne sont donc pas informés par l'import.

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
