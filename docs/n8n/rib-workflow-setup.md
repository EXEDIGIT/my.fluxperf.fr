# Workflow n8n — Dépôt RIB / IBAN MyFluxperf

Ce guide configure le dépôt sécurisé de RIB depuis la rubrique **Mon compte**.
Le workflow reçoit le document, le dépose dans Google Drive, journalise le dépôt
dans le classeur client et alerte `support@fluxperf.fr` avec Brevo.

## 1. Préparer Google Drive et Google Sheets

1. Le dossier Drive racine est déjà défini :

   ```text
   1aBgJtElK3lfzIZWZqmsORAfkCxx3kNj4
   ```

2. Vérifier que `tdacunha@exedigit.fr` est propriétaire ou éditeur de ce dossier.
   Ne partagez pas ce dossier avec les clients et ne créez aucun lien public.
3. Dans le classeur client déjà utilisé par MyFluxperf, créer un onglet nommé
   exactement `Documents`, puis renseigner la ligne d’en-tête suivante :

   ```text
   document_id | client_id | document_type | company_name | drive_folder_id | drive_file_id | file_name | submitted_at | submitted_by_email | status
   ```

4. Vérifier que l’onglet `Actions` possède ses en-têtes actuels, notamment :

   ```text
   action_id | client_id | date_action | type_action | libelle_action | reference | email_demandeur | source | statut | details
   ```

5. Le Service Account déjà utilisé par MyFluxperf doit conserver au minimum un
   accès en lecture à ce nouveau onglet `Documents`.

## 2. Créer les credentials n8n Cloud

Dans n8n Cloud, connecté au compte `tdacunha@exedigit.fr` :

1. Créer un credential **Google Drive OAuth2 API**, nommé par exemple
   `Google Drive - Fluxperf`.
2. Créer un credential **Google Sheets OAuth2 API**, nommé par exemple
   `Google Sheets - Fluxperf`.
3. Autoriser ces credentials sur le même compte Google et vérifier qu’ils peuvent
   ouvrir le dossier Drive racine et le classeur client.

Les IDs de credentials exportés dans le JSON sont des placeholders : après
l’import, sélectionnez les deux credentials créés dans les nœuds Google.

## 3. Créer les variables n8n

Dans **Settings → Variables**, créer les valeurs suivantes. Ne placez aucune
valeur secrète dans le workflow lui-même.

```text
MYFLUXPERF_RIB_WEBHOOK_SECRET=<secret long et aléatoire>
MYFLUXPERF_RIB_DRIVE_ROOT_FOLDER_ID=1aBgJtElK3lfzIZWZqmsORAfkCxx3kNj4
MYFLUXPERF_GOOGLE_SHEET_ID=<identifiant du classeur client>
MYFLUXPERF_SUPPORT_EMAIL=support@fluxperf.fr
BREVO_API_KEY=<clé API transactionnelle Brevo>
BREVO_FROM_EMAIL=notifications@fluxperf.fr
BREVO_FROM_NAME=Fluxperf
```

`notifications@fluxperf.fr` doit être validé comme expéditeur transactionnel
dans Brevo avant d’activer le workflow.

## 4. Importer et configurer le workflow

1. Importer [myfluxperf-rib-workflow.json](myfluxperf-rib-workflow.json).
2. Laisser le workflow **inactif** pendant les essais.
3. Dans les quatre nœuds Google, sélectionner les credentials créés à l’étape 2.
4. Vérifier les deux nœuds Google Sheets :
   - `Read RIB Documents` et `Append RIB Document Record` ciblent `Documents` ;
   - `Append RIB Action Record` cible `Actions`.
5. Le webhook utilise :

   ```text
   POST /webhook/myfluxperf/rib
   ```

   En test, n8n fournit une URL `/webhook-test/...`; en production, activez le
   workflow puis utilisez l’URL `/webhook/...`.

Le workflow répond au portail seulement après le téléversement Drive et les deux
écritures Google Sheets. L’email Brevo est déclenché ensuite, avec trois essais.
Il contient un lien Drive interne, jamais le RIB en pièce jointe.

## 5. Configurer Cloudflare Pages

Dans les secrets du projet Cloudflare Pages `my.fluxperf.fr`, renseigner :

```text
N8N_RIB_WEBHOOK_URL=https://<votre-instance-n8n>/webhook/myfluxperf/rib
N8N_RIB_WEBHOOK_SECRET=<même valeur que MYFLUXPERF_RIB_WEBHOOK_SECRET>
GOOGLE_DOCUMENTS_RANGE=Documents!A1:J1000
```

Conserver les variables Google Sheets déjà existantes. Après l’ajout des secrets,
redéployer le projet pour rendre le dépôt disponible.

## 6. Recette avant activation

1. Dans n8n, cliquer sur **Listen for test event**.
2. Depuis un client de test MyFluxperf sans RIB, envoyer un PDF de moins de 10 Mo.
3. Vérifier : dossier Drive au nom de la société, fichier
   `NOM_SOCIETE_RIB-IBAN-JJMMAAAA.pdf`, ligne `Documents`, ligne `Actions` et
   email Brevo à `support@fluxperf.fr`.
4. Déposer ensuite une image JPG ou PNG pour le même client : le même dossier
   Drive doit être réutilisé et les deux fichiers doivent rester présents.
5. Tester un fichier DOCX, un fichier de plus de 10 Mo et un appel webhook avec
   un mauvais secret : ils doivent tous être refusés.
6. Après les essais, remplacer l’URL de test par l’URL de production Cloudflare,
   activer le workflow n8n, puis vérifier une dernière fois le parcours complet.

## Règles de confidentialité

- Le navigateur ne reçoit jamais d’URL Drive, d’ID de fichier, de nom de fichier
  ni d’IBAN.
- Les accès Google Drive sont réservés aux collaborateurs Fluxperf autorisés.
- L’email interne contient seulement les métadonnées nécessaires et un lien
  Drive sécurisé.
- Les anciens RIB restent dans le dossier du client conformément à la règle V1.
