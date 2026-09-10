# Bilans mensuels Fluxperf® — exploitation V1

## Ce que stocke chaque système

- **Google Sheets** est la source de vérité des clients, contacts, services et propriétés GA4.
- **D1 `fluxperf-monthly-reports`** conserve uniquement un instantané des bilans, des livraisons, des erreurs et des événements pendant 24 mois.
- **Supabase** reste dédié à l’authentification ; aucune table PostgreSQL Supabase n’est nécessaire.

La D1 est liée au Worker et aux Pages Functions sous le même binding
`MONTHLY_REPORTS_DB`. Le navigateur ne reçoit jamais ce binding : seules les
routes `/api/admin/monthly-reports*`, déjà protégées par `requireAdmin`, y ont
accès depuis MyFluxperf.

## 1. Mettre à jour Google Sheets

Dans l’onglet `Contacts`, ajouter en colonne Q l’en-tête exact :

```text
bilan_mensuel_actif
```

`Oui` ou une cellule vide activent le bilan ; `Non` le désactive pour ce seul
contact. Les créations depuis la console renseignent `Oui`. Configurer
`GOOGLE_CONTACTS_WRITE_RANGE=Contacts!A:Q` dans Pages.

Les propriétés GA4 doivent être renseignées dans `Solutions!ga4_property_id`
sur les solutions actives concernées. L’identifiant est numérique, avec ou
sans préfixe `properties/`. Le Worker ne dépend plus du libellé exact de la
solution : une propriété correctement renseignée reste exploitable pour un
site vitrine, une boutique ou tout autre nom de solution.

## 2. Créer et relier la D1

Depuis un terminal authentifié Cloudflare :

```bash
pnpm dlx wrangler@latest d1 create fluxperf-monthly-reports
```

Copier le `database_id` retourné dans
`workers/monthly-report-service/wrangler.toml`, à la place de
`REPLACE_WITH_D1_DATABASE_ID`, puis appliquer le schéma :

```bash
pnpm run monthly-reports:migrate
pnpm run monthly-reports:deploy
```

Dans **Cloudflare Pages → Settings → Bindings**, ajouter une liaison D1 :

```text
Variable name: MONTHLY_REPORTS_DB
Database: fluxperf-monthly-reports
```

Le schéma crée les contraintes d’unicité `client_id + period_key` et
`report_id + contact_id`, ce qui évite les doublons lors de crons concurrents.

## 3. Configurer le Worker

Dans le Worker `myfluxperf-monthly-report-service`, ajouter comme secrets :

```text
GOOGLE_SHEET_ID
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY
GOOGLE_GA_SERVICE_ACCOUNT_EMAIL
GOOGLE_GA_PRIVATE_KEY
BREVO_API_KEY
MONTHLY_REPORT_INTERNAL_SECRET
```

`APP_PUBLIC_URL` et les plages Google sont des variables non secrètes déjà
déclarées dans `wrangler.toml`. Configurer aussi dans Pages
`MONTHLY_REPORT_WORKER_URL` (URL du Worker) et le même
`MONTHLY_REPORT_INTERNAL_SECRET`. Il permet à une relance manuelle validée par
la console de réveiller immédiatement le Worker, sans donner d’accès D1 au
navigateur. Ne déposer aucune clé dans Git.

`GOOGLE_SERVICE_ACCOUNT_EMAIL` et `GOOGLE_PRIVATE_KEY` désignent le nouveau
**Service Account dédié aux Sheets**, en lecture seule. `GOOGLE_GA_SERVICE_ACCOUNT_EMAIL`
et `GOOGLE_GA_PRIVATE_KEY` sont l’identité GA4 MyFluxperf déjà existante : le
Worker l’emploie seulement pour Analytics Data API. Cela évite de redonner
l’accès à chaque propriété GA4, tout en conservant un compte Sheets sans droit
d’écriture.

Le cron Cloudflare s’exécute toutes les 15 minutes. Le Worker décide lui-même
du créneau : premier jour lundi-vendredi du mois, dès 09:00 en Europe/Paris,
y compris aux changements d’heure. Les jours fériés ne modifient pas la règle.

## Fonctionnement et sécurité d’envoi

- Un rapport couvre le mois civil précédent et le compare au mois M-1.
- Chaque client actif ayant au moins un service Fluxperf actif reçoit un bilan.
  Les propriétés GA4 accessibles d’une même organisation sont agrégées lorsqu’elles
  existent. Une propriété inaccessible est tracée ; si aucune donnée GA4 n’est
  disponible, le client reçoit tout de même un bilan centré sur ses services actifs
  et son temps libéré, sans métrique analytique inventée.
- Chaque contact actif avec une adresse valide et `bilan_mensuel_actif != Non`
  reçoit son propre email. La préférence est relue juste avant l’envoi.
- La clé d’idempotence stockée dans D1 est conservée lors des reprises courtes.
  Après un timeout non résolu, la livraison devient `unknown` et n’est jamais
  relancée automatiquement.
- Les pourcentages sont cachés sous 20 sessions sur l’un des deux mois. Les
  événements techniques et ceux à zéro ne sont pas mis en avant.

La purge quotidienne enlève rapports, livraisons et événements expirés après
24 mois. Les envois de test sont stockés dans des tables distinctes, jamais
mélangées à l’historique réel, puis purgés après 14 jours.

## Console et recette

Dans `/fp-console`, l’onglet **Bilans mensuels** donne le statut par
organisation, le détail des KPI et chaque livraison. Une relance n’est
proposée que pour les états `failed`; les états `unknown` demandent une
vérification manuelle dans Brevo pour éviter tout doublon.

Avant production, tester une organisation de préproduction avec :

1. deux contacts actifs, dont un avec `bilan_mensuel_actif=Non` ;
2. deux propriétés, dont une accessible pour l’identité GA4 existante et une sans accès GA4 ;
3. un échec Brevo simulé puis une relance `failed` ;
4. une tentative d’accès à l’onglet ou aux API admin avec une adresse absente de `ADMIN_EMAILS`.

Pour une recette contrôlée, renseigner temporairement `MONTHLY_REPORT_ALLOWED_CLIENT_IDS`
avec le seul `client_id` de test, en conservant `MONTHLY_REPORTS_ENABLED=false`.
Dans **Bilans mensuels**, saisir ensuite cet identifiant dans **Envoyer un bilan
de test**. Le Worker envoie un e-mail `[TEST]` aux contacts éligibles, dans un
historique séparé, sans créer ni relancer le bilan mensuel réel. Retirer la
liste d’autorisation après la recette.
