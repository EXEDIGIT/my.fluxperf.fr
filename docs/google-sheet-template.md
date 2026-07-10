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
