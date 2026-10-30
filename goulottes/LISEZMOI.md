# Site « Goulottes » – mise en ligne gratuite (Google)

Site dédié aux goulottes (40x40, 40x60, 40x80, 60x60, 60x80 ; brutes de 2000 mm) :
recherche de chute, découpe par machine (CP3XLV2, CP3V2, CP3V1…), découpe sur mesure, plan PDF, stock et historique.
C'est un site **séparé** du site profilés : il a son propre tableau Google Sheets et donc son propre stock.

## Installation (environ 5 minutes)
1. Aller sur https://sheets.new, nommer le tableau « Stock goulottes ».
2. **Extensions → Apps Script**.
3. `Code.gs` : tout effacer, coller [Code.gs](Code.gs), écrire le mot de passe dans `const MOT_DE_PASSE = '';`.
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

## Vue 3D
Le plan de découpe s'affiche en 3D (goulottes à la bonne section, pièces colorées) : glisser pour tourner,
molette ou pincement pour zoomer, Maj + glisser pour déplacer, « Vue éclatée », filtre par section,
clic sur une pièce pour la retrouver dans la liste. Une image 3D du plan est ajoutée en tête du PDF.
La 3D utilise la bibliothèque Three.js chargée depuis cdnjs.cloudflare.com ; si un poste ne peut pas la charger,
le plan reste affiché en 2D comme avant.

## Mise à jour du code plus tard
Coller le nouveau code, enregistrer, puis **Déployer → Gérer les déploiements → crayon → Nouvelle version**. L'adresse ne change pas.
