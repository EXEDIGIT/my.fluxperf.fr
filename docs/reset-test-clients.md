# Remise à zéro des comptes clients de test

Cette procédure est **définitive** et limitée aux cinq fiches de test connues :
BAEGNE COMPANY, FFIA, GabyPower, HBINT et LAUD SARL. Elle ne déclenche ni Brevo,
ni magic link, ni création de nouvelle ligne d'historique.

La fiche cliente HBINT est supprimée, ainsi que ses deux archives de sites de
test connues (dont l'ancienne archive `SITE-0002` au rattachement historique
invalide). L'identité Supabase
`tdacunha@exedigit.fr` est préservée pour l'administration de la console. La
commande refuse de continuer si cette adresse n'est pas présente dans
`ADMIN_EMAILS` ou si son utilisateur Supabase est introuvable.

## Pré-requis

Le fichier d'environnement local non versionné doit contenir :

```text
GOOGLE_SHEET_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_EMAILS=tdacunha@exedigit.fr
THUMBNAIL_WORKER_URL=
THUMBNAIL_INTERNAL_SECRET=
```

Déployer d'abord le Worker de vignettes afin que sa route `DELETE` protégée soit
disponible :

```powershell
pnpm thumbnail:deploy
```

## Exécution

Contrôler impérativement le rapport du mode lecture seule :

```powershell
pnpm reset:test-clients -- --mode dry-run --env-file .\reset-production.env
```

Appliquer ensuite la suppression avec la confirmation littérale :

```powershell
pnpm reset:test-clients -- --mode apply --confirm DELETE_TEST_CLIENTS --env-file .\reset-production.env
```

Chaque lancement crée `reset-report.json` et `reset-summary.csv` dans
`.codex-tmp/reset-test-clients/`. Une reprise est sûre : les vignettes et les
utilisateurs Auth déjà absents sont traités comme déjà supprimés, et les lignes
Sheets restantes sont supprimées sans recréer de données.

Avant toute écriture, la commande bloque si une fiche ou une ligne associée ne
correspond pas au périmètre approuvé. Elle préserve `Parametres`, les en-têtes et
la configuration de la console.
