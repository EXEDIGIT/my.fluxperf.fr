# Statistiques Google Ads

Le portail client affiche les statistiques des lignes `Solutions` actives dont
`nom_solution` vaut `Publicité Google Ads`. Une ligne correspond a un compte
Google Ads client et son `google_ads_customer_id` doit contenir 10 chiffres.

## Donnees affichees

Le portail interroge Google Ads uniquement pour :

- apparitions ;
- visites via les annonces ;
- actions utiles (`metrics.conversions`) ;
- taux de clic ;
- evolution des visites et actions utiles ;
- repartitions par campagne active et par appareil.

Les requetes n'incluent jamais les couts, budgets, CPC, couts par conversion,
valeurs de conversion, devises ou autres metriques financieres.

## Raccordement initial

1. Utiliser ou creer le compte administrateur Google Ads (MCC) Fluxperf.
2. Dans [Google Ads API Center](https://ads.google.com/aw/apicenter), demander
   le developer token necessaire a l'API.
3. Reutiliser le Service Account Google Fluxperf puis lui donner un acces
   lecture au MCC ou aux comptes clients. Google documente le flux officiel des
   [Service Accounts](https://developers.google.com/google-ads/api/docs/oauth/service-accounts).
4. Verifier que le compte client est rattache au MCC et relever son ID client a
   10 chiffres.
5. Dans Cloudflare Pages, ajouter les secrets :

   ```env
   GOOGLE_ADS_DEVELOPER_TOKEN=<developer-token>
   GOOGLE_ADS_LOGIN_CUSTOMER_ID=<id-mcc-sans-tirets>
   ```

6. Dans `Solutions`, renseigner `google_ads_customer_id` sur la ligne
   `Publicité Google Ads` du client. La console admin accepte aussi
   `123-456-7890` et le normalise automatiquement en `1234567890`.
7. Deployer Pages, puis ouvrir le CTA `Statistiques` de la carte Google Ads.

Le developer token, l'authentification REST et les rapports Google Ads sont
documentes par Google : [developer token](https://developers.google.com/google-ads/api/docs/api-policy/developer-token),
[REST authentication](https://developers.google.com/google-ads/api/rest/auth) et
[reporting](https://developers.google.com/google-ads/api/docs/reporting/overview).
