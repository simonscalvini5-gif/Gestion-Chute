# Site « Goulottes » – mise en ligne gratuite (Google)

Site dédié aux goulottes (40x40, 40x60, 40x80, 60x60, 60x80 ; brutes de 2000 mm) :
recherche de chute, découpe par machine (CP3XLV2, CP3V2, CP3V1…), découpe sur mesure, plan PDF, stock et historique.
C'est un site **séparé** du site profilés : il a son propre tableau Google Sheets et donc son propre stock.

## Installation (environ 5 minutes)
1. Aller sur https://sheets.new, nommer le tableau « Stock goulottes ».
2. **Extensions → Apps Script**.
3. `Code.gs` : tout effacer, coller [Code.gs](Code.gs), écrire le mot de passe atelier dans `const MOT_DE_PASSE = '';`
   et le mot de passe de la rubrique Achat dans `const ACHAT_MOT_DE_PASSE = '';` (identifiant Achat : `Morgan`).
4. **+ → HTML**, nommer le fichier `Index`, coller [Index.html](Index.html). **Enregistrer**.
5. **Déployer → Nouveau déploiement → Application Web** ; *Exécuter en tant que* : Moi ; *Qui a accès* : Tout le monde.
   **Déployer** et autoriser (si « application non validée » : *Paramètres avancés → Accéder à… (non sécurisé)*).
6. L'adresse qui finit par `/exec` est le site. Identifiant `Production` + mot de passe.

## Utilisation
- **Recherche** : choisir la section, taper la longueur → OUI (numéro de la chute) ou NON (goulotte neuve).
- **Découpe → Découpe par machine** : régler le nombre de machines (− / +), « Préparer » : le plan optimisé est calculé
  (chutes du stock d'abord, puis le moins de goulottes neuves possible). « Générer le PDF », puis « Valider » une fois
  les coupes faites, ou « Annuler le plan ».
- **Découpe → Découpe sur mesure** : saisir section, longueur et quantité ligne par ligne.
- Les listes des machines sont dans l'onglet **Machines** du tableau (Machine, Section, Longueur, Quantité ;
  la section s'écrit comme « Goulotte 40x60 »). Pour une nouvelle machine, ajouter des lignes avec son nom.

## Achat et goulottes brutes
- **Stock → Goulottes brutes** : nombre de bruts (2000 mm) par section ; « Ajouter des bruts » pour une entrée manuelle.
- Chaque découpe dans une goulotte neuve (recherche ou plan validé) retire automatiquement un brut du stock.
  Si les bruts ne suffisent pas pour un plan, une alerte l'indique.
- **Achat** (identifiant `Morgan` + mot de passe Achat) : choisir les machines à fabriquer (− / +), « Calculer les bruts à acheter » :
  les pièces sont placées d'abord dans les chutes, puis dans des goulottes neuves ; le besoin est comparé aux bruts en stock.
  Les quantités sont modifiables ; « Valider l'achat » ajoute les bruts au stock.
- **Alerte e-mail** à simon.scalvini@insidix.com quand une section passe à 3 bruts ou moins, puis à 0 (rupture).
  Adresse et seuil réglables en haut de `Code.gs` (`ALERTE_EMAIL`, `SEUIL_ALERTE`). Lors de la mise à jour, Google
  demande l'autorisation « envoyer des e-mails en votre nom » : l'accepter. Les e-mails partent du compte qui a publié le site.
- **Rupture** : sans brut d'une section, la découpe dans une goulotte neuve est refusée (recherche et plan),
  comme dans la réalité ; ajouter les bruts reçus ou passer par Achat.
- **Achat → Planning annuel** : une colonne par semaine (ISO) sur toute l'année, ◀ ▶ pour changer d'année.
  Saisir le nombre de machines prévues par semaine ; les bruts nécessaires sont calculés (même optimisation que le plan de découpe,
  sans compter les chutes). « Calculer automatiquement » propose les livraisons selon le délai fournisseur, le stock de sécurité
  et le lot d'achat ; elles restent modifiables. « Enregistrer le planning » les sauvegarde.
  La liste « Commandes à passer » indique la semaine de commande (livraison – délai), avec « en retard » / « cette semaine ».
- **Stock automatique** : chaque livraison prévue entre seule dans le stock de bruts quand sa semaine arrive
  (au premier affichage du site cette semaine-là) ; « Reçue maintenant » l'ajoute tout de suite si elle arrive en avance.
- Onglets du tableau : **Prévisions**, **Livraisons**, **Bruts** (stock), **Mouvements bruts** (chaque entrée/sortie), **Achats** (historique des achats).

## Vue 3D
Le plan de découpe s'affiche en 3D (goulottes à la bonne section, pièces colorées) : glisser pour tourner,
molette ou pincement pour zoomer, Maj + glisser pour déplacer, « Vue éclatée », filtre par section,
clic sur une pièce pour la retrouver dans la liste. Une image 3D du plan est ajoutée en tête du PDF.
La 3D utilise la bibliothèque Three.js chargée depuis cdnjs.cloudflare.com ; si un poste ne peut pas la charger,
le plan reste affiché en 2D comme avant.

## Mise à jour du code plus tard
Coller le nouveau code, enregistrer, puis **Déployer → Gérer les déploiements → crayon → Nouvelle version**. L'adresse ne change pas.
