# Workflow n8n - Demande d'intervention MyFluxperf

Ce document decrit la mise en place du workflow background pour les demandes
d'intervention envoyées depuis MyFluxperf.

## Objectif

Le workflow doit :

1. recevoir le webhook MyFluxperf ;
2. vérifier le secret partagé ;
3. créer une carte dans le Trello actuel ;
4. joindre les fichiers à la carte ;
5. générer un accusé de réception court avec OpenAI ;
6. envoyer l'email via Brevo depuis `notifications@fluxperf.fr` ;
7. ajouter un commentaire de suivi dans Trello.

## Fichier a importer

Importer dans n8n :

```text
docs/n8n/myfluxperf-intervention-workflow.json
```

Après import, garder le workflow inactif jusqu'à la fin des tests.

## Variables n8n à créer

Créer ces variables dans n8n :

```text
MYFLUXPERF_WEBHOOK_SECRET=<secret long aleatoire>
TRELLO_INTERVENTION_LIST_ID=<id de la liste Trello actuelle>
OPENAI_API_KEY=<cle API OpenAI>
OPENAI_MODEL=gpt-5.6-luna
BREVO_API_KEY=<cle API Brevo transactionnelle>
```

Le même `MYFLUXPERF_WEBHOOK_SECRET` devra être renseigné ensuite dans Cloudflare
Pages sous le nom `N8N_INTERVENTION_WEBHOOK_SECRET`.

## Credentials et nodes à vérifier

### Webhook - MyFluxperf

- Method : `POST`
- Path : `myfluxperf/intervention`
- Response mode : `Using Respond to Webhook node`

Pendant les tests, utiliser l'URL de test n8n. En production, utiliser l'URL
production du webhook.

### Validate + Normalize

Ce node :

- parse le champ `payload` ;
- vérifie le header `X-Fluxperf-Webhook-Secret` ;
- normalise les libellés service, besoin, priorité ;
- prépare le titre et la description Trello ;
- conserve les fichiers binaires pour les pièces jointes.

### Trello - Create Card

Configurer le credential Trello du compte actuel.

Le node utilise :

- `TRELLO_INTERVENTION_LIST_ID` pour la liste cible ;
- le titre `[FP-JJMMAAAA-XXXX] Client - Service`, par exemple
  `[FP-17072026-ABCD] Client - Service` ;
- une description structurée avec client, demandeur, site, besoin, priorité,
  message et nombre de pièces jointes.

### Trello - Add Attachment

Configurer le meme credential Trello.

Le node lit chaque fichier binaire et l'ajoute à la carte créée. Si aucun fichier
n'est présent, le workflow passe directement à l'IA.

### OpenAI - Generate Reply

Le workflow appelle l'API Responses OpenAI avec :

- `OPENAI_API_KEY`
- `OPENAI_MODEL`, par defaut `gpt-5.6-luna`

Le prompt impose :

- corps d'email uniquement ;
- moins de 300 caracteres ;
- ton professionnel ;
- adaptation à la demande ;
- signature exacte : `L'équipe Fluxperf`.

### Brevo - Send Email

Le workflow appelle l'API transactionnelle Brevo :

```text
POST https://api.brevo.com/v3/smtp/email
```

Paramètres d'envoi :

- expéditeur : `Fluxperf <notifications@fluxperf.fr>`
- destinataire : email du demandeur MyFluxperf
- objet : `Demande reçue - {{requestId}}`
- contenu : message généré par OpenAI

Vérifier dans Brevo que `notifications@fluxperf.fr` est un expéditeur autorisé.

### Trello - Add Comment

Configurer le meme credential Trello.

Le commentaire final indique :

- email client envoyé ;
- référence de demande ;
- message IA ;
- identifiant Brevo si disponible.

## Configuration Cloudflare Pages

Après validation du workflow n8n en URL de test :

1. activer le workflow n8n ;
2. copier l'URL production du Webhook ;
3. ajouter dans Cloudflare Pages :

```env
N8N_INTERVENTION_WEBHOOK_URL=https://<instance-n8n>/webhook/myfluxperf/intervention
N8N_INTERVENTION_WEBHOOK_SECRET=<meme secret que MYFLUXPERF_WEBHOOK_SECRET>
```

4. redeployer MyFluxperf.

## Tests de recette

1. Dans n8n, cliquer sur `Listen for test event`.
2. Dans MyFluxperf, envoyer une demande sans pièce jointe.
3. Vérifier la réponse front : référence `FP-...` affichée.
4. Vérifier dans Trello : carte créée, description complète.
5. Vérifier l'email Brevo reçu depuis `notifications@fluxperf.fr`.
6. Refaire avec une image ou un PDF.
7. Vérifier que le fichier est ajouté à la carte Trello.
8. Tester un lot de fichiers superieur a 15 Mo : MyFluxperf doit bloquer avant
   n8n.
9. Tester un mauvais secret : n8n doit refuser la demande.

## Notes importantes

- MyFluxperf limite maintenant les fichiers a 5 fichiers, 10 Mo par fichier, 15
  Mo au total.
- Les pièces jointes ne sont pas envoyées au client par email.
- Les clés OpenAI, Brevo et Trello restent dans n8n, jamais dans Cloudflare Pages.
- La journalisation V1 repose sur Trello et l'historique des exécutions n8n.
