# Catalogue des solutions MyFluxperf

Le catalogue est unique pour la console, les API et l'import silencieux. Seuls les
couples suivants peuvent être enregistrés dans `Solutions`.

| Famille (`type_solution`) | Nom de solution (`nom_solution`) |
| --- | --- |
| Flux Visibilité & Acquisition | Site web |
| Flux Visibilité & Acquisition | Site e-shop |
| Flux Visibilité & Acquisition | Publicité Google Ads |
| Flux Visibilité & Acquisition | Réseaux sociaux |
| Flux Automatisation & IA | Tableau de bord |
| Flux Automatisation & IA | Automatisation & Synchronisation |
| Flux Assistant IA | Copilote entreprise - Alzy |

Les noms libres, les anciens intitulés et les noms préfixés par leur famille ne sont
pas acceptés à l'écriture. Les valeurs affichées dans `Parametres` sont un miroir de
ce référentiel ; elles ne peuvent pas étendre le catalogue applicatif.

## Normaliser la BDD existante

La commande ne modifie que `Parametres!B` et `Solutions!E`. Elle ne touche ni aux
statuts, ni aux URL, domaines, identifiants statistiques ou accès clients.

```powershell
pnpm normalize:solutions -- --mode dry-run --env-file .\.dev.vars
pnpm normalize:solutions -- --mode apply --env-file .\.dev.vars
```

Utiliser systématiquement le `dry-run` et consulter `normalisation.csv` et
`exceptions.csv` avant `apply`. La commande est idempotente : une solution déjà
conforme n'est pas réécrite lors d'une relance.
