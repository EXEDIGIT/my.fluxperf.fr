# Workflow n8n - Demande d'intervention MyFluxperf

Ce document decrit la mise en place du workflow background pour les demandes
d'intervention envoyees depuis MyFluxperf.

## Objectif

Le workflow doit :

1. recevoir le webhook MyFluxperf ;
2. verifier le secret partage ;
3. creer une carte dans le Trello actuel ;
4. joindre les fichiers a la carte ;
5. generer un accuse de reception court avec OpenAI ;
6. envoyer l'email via Brevo depuis `notifications@fluxperf.fr` ;
7. ajouter un commentaire de suivi dans Trello.

## Fichier a importer

Importer dans n8n :

```text
docs/n8n/myfluxperf-intervention-workflow.json
```

Apres import, garder le workflow inactif jusqu'a la fin des tests.

## Variables n8n a creer

Creer ces variables dans n8n :

```text
MYFLUXPERF_WEBHOOK_SECRET=<secret long aleatoire>
TRELLO_INTERVENTION_LIST_ID=<id de la liste Trello actuelle>
OPENAI_API_KEY=<cle API OpenAI>
OPENAI_MODEL=gpt-5.6-luna
BREVO_API_KEY=<cle API Brevo transactionnelle>
```

Le meme `MYFLUXPERF_WEBHOOK_SECRET` devra etre renseigne ensuite dans Cloudflare
Pages sous le nom `N8N_INTERVENTION_WEBHOOK_SECRET`.

## Credentials et nodes a verifier

### Webhook - MyFluxperf

- Method : `POST`
- Path : `myfluxperf/intervention`
- Response mode : `Using Respond to Webhook node`

Pendant les tests, utiliser l'URL de test n8n. En production, utiliser l'URL
production du webhook.

### Validate + Normalize

Ce node :

- parse le champ `payload` ;
- verifie le header `X-Fluxperf-Webhook-Secret` ;
- normalise les libelles service, besoin, priorite ;
- prepare le titre et la description Trello ;
- conserve les fichiers binaires pour les pieces jointes.

### Trello - Create Card

Configurer le credential Trello du compte actuel.

Le node utilise :

- `TRELLO_INTERVENTION_LIST_ID` pour la liste cible ;
- le titre `[FP-JJMMAAAA-XXXX] Client - Service`, par exemple
  `[FP-17072026-ABCD] Client - Service` ;
- une description structuree avec client, demandeur, site, besoin, priorite,
  message et nombre de pieces jointes.

### Trello - Add Attachment

Configurer le meme credential Trello.

Le node lit chaque fichier binaire et l'ajoute a la carte creee. Si aucun fichier
n'est present, le workflow passe directement a l'IA.

### OpenAI - Generate Reply

Le workflow appelle l'API Responses OpenAI avec :

- `OPENAI_API_KEY`
- `OPENAI_MODEL`, par defaut `gpt-5.6-luna`

Le prompt impose :

- corps d'email uniquement ;
- moins de 300 caracteres ;
- ton professionnel ;
- adaptation a la demande ;
- signature exacte : `L'equipe Fluxperf`.

### Brevo - Send Email

Le workflow appelle l'API transactionnelle Brevo :

```text
POST https://api.brevo.com/v3/smtp/email
```

Parametres d'envoi :

- expéditeur : `Fluxperf <notifications@fluxperf.fr>`
- destinataire : email du demandeur MyFluxperf
- objet : `Demande recue - {{requestId}}`
- contenu : message genere par OpenAI

Verifier dans Brevo que `notifications@fluxperf.fr` est un expéditeur autorise.

### Trello - Add Comment

Configurer le meme credential Trello.

Le commentaire final indique :

- email client envoye ;
- reference de demande ;
- message IA ;
- identifiant Brevo si disponible.

## Configuration Cloudflare Pages

Apres validation du workflow n8n en URL de test :

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
2. Dans MyFluxperf, envoyer une demande sans piece jointe.
3. Verifier la reponse front : reference `FP-...` affichee.
4. Verifier dans Trello : carte creee, description complete.
5. Verifier l'email Brevo recu depuis `notifications@fluxperf.fr`.
6. Refaire avec une image ou un PDF.
7. Verifier que le fichier est ajoute a la carte Trello.
8. Tester un lot de fichiers superieur a 15 Mo : MyFluxperf doit bloquer avant
   n8n.
9. Tester un mauvais secret : n8n doit refuser la demande.

## Notes importantes

- MyFluxperf limite maintenant les fichiers a 5 fichiers, 10 Mo par fichier, 15
  Mo au total.
- Les pieces jointes ne sont pas envoyees au client par email.
- Les cles OpenAI, Brevo et Trello restent dans n8n, jamais dans Cloudflare Pages.
- La journalisation V1 repose sur Trello et l'historique des executions n8n.
