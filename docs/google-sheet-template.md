# Template Google Sheet

Créer un onglet nommé `Clients`.

## Colonnes attendues

```text
client_id
status
company_name
contact_first_name
contact_last_name
primary_email
allowed_emails
plan_label
services_active
jotform_request_url
jotform_support_url
report_url
resources_url
contact_fluxperf_name
contact_fluxperf_email
last_action_1_label
last_action_1_date
last_action_2_label
last_action_2_date
last_action_3_label
last_action_3_date
```

Pour le schema structure de production, la colonne `Clients!H` est
`nb_services_actifs` et compte les lignes `Solutions` actives rattachees au
client.

## Exemple de ligne

```text
client_id: a2cm
status: active
company_name: A2-CM
contact_first_name: Anthony
contact_last_name: Dupont
primary_email: contact@a2-cm.fr
allowed_emails: contact@a2-cm.fr, direction@a2-cm.fr
plan_label: Abonnement actif
services_active: Site internet, Visibilité Web, Google Ads
jotform_request_url: https://form.jotform.com/XXXXXXXX
jotform_support_url: https://form.jotform.com/YYYYYYYY
report_url: https://lookerstudio.google.com/...
resources_url: /ressources
contact_fluxperf_name: Tristan
contact_fluxperf_email: hello@fluxperf.fr
last_action_1_label: Demande de modification envoyée
last_action_1_date: Il y a 2h
last_action_2_label: Rapport mensuel disponible
last_action_2_date: Il y a 1j
last_action_3_label: Support en cours de traitement
last_action_3_date: Il y a 2j
```

## Règles de remplissage

- `status` doit être `active` pour afficher l'espace client.
- `primary_email` et `allowed_emails` sont comparés en minuscules.
- `allowed_emails` peut contenir plusieurs emails séparés par des virgules.
- `services_active` est une liste séparée par des virgules.
- Les champs vides sont acceptés.
- Si `report_url` est vide, l'interface affiche un état vide élégant.
- `jotform_request_url` est conserve pour compatibilite, mais la demande d'intervention utilise maintenant le formulaire natif.
- Si `jotform_support_url` est vide, la carte Support est desactivee.

## Onglet `Solutions`

Creer un onglet nomme `Solutions` pour declarer toutes les solutions Fluxperf
rattachees aux clients. C'est la source des services actifs, des impacts et du
contexte des demandes d'intervention.

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

## Exemple de lignes `Solutions`

```text
solution_id: SOL-0001
client_id: CLI-0001
type_solution: Flux Visibilité & Acquisition
statut_solution: Actif
nom_solution: Flux Visibilité & Acquisition • Site web
domaine: hbint.com
url: https://www.hbint.com
date_activation: 2026-07-17
notes:

solution_id: SOL-0002
client_id: CLI-0001
type_solution: Flux Visibilité & Acquisition
statut_solution: Actif
nom_solution: Flux Visibilité & Acquisition • Site e-shop
domaine: trial.hbint.com
url: https://trial.hbint.com
date_activation: 2026-07-17
notes:

solution_id: SOL-0003
client_id: CLI-0001
type_solution: Flux Automatisation & IA
statut_solution: Actif
nom_solution: Flux Automatisation & IA • Tableau de bord
domaine:
url:
date_activation: 2026-07-17
notes:
```

## Regles du module Impacts

- Les lignes `Solutions` actives apparaissent aussi dans la section `Services actifs`.
- `type_solution` doit utiliser les valeurs de reference `Flux Visibilité & Acquisition`, `Flux Automatisation & IA` ou `Flux Assistant IA`.
- Les anciens codes `visibility_acquisition`, `automation_ai` et `assistant_ai` restent acceptes par compatibilite.
- Une ligne `Solutions` compte uniquement si `statut_solution` vaut `Actif`.
- `Flux Visibilité & Acquisition` ajoute 1,5 h / semaine.
- `Flux Automatisation & IA` ajoute 1 h / semaine.
- `Flux Assistant IA` ajoute 2 h / semaine.

## Onglet `Parametres`

Ajouter les listes suivantes pour alimenter les listes deroulantes de `Solutions`.
Dans le Google Sheet de production, `Solutions!C2:C1000` pointe vers
`Parametres!B20:B22`, `Solutions!D2:D1000` pointe vers `Parametres!B23:B27` et
`Solutions!E2:E1000` pointe vers `Parametres!B28:B32`.

```text
categorie: type_solution
valeur: Flux Visibilité & Acquisition

categorie: type_solution
valeur: Flux Automatisation & IA

categorie: type_solution
valeur: Flux Assistant IA

categorie: statut_solution
valeur: Actif

categorie: statut_solution
valeur: En cours d'activation

categorie: statut_solution
valeur: En pause

categorie: statut_solution
valeur: Inactif

categorie: statut_solution
valeur: Résilié

categorie: nom_solution
valeur: Flux Visibilité & Acquisition • Site web

categorie: nom_solution
valeur: Flux Visibilité & Acquisition • Site e-shop

categorie: nom_solution
valeur: Flux Automatisation & IA • Tableau de bord

categorie: nom_solution
valeur: Flux Automatisation & IA • Synchronisation de données

categorie: nom_solution
valeur: Flux Assistant IA • Copilote entreprise
```

## Onglet `Actions`

Creer un onglet nomme `Actions` pour journaliser les demandes envoyees depuis
MyFluxperf.

```text
action_id
client_id
date_action
type_action
libelle_action
reference
email_demandeur
source
statut
details
```

L'espace client filtre les lignes par `client_id`, trie par `date_action`
descendante, puis affiche les 3 dernieres actions dans le module `Dernieres
actions`.
