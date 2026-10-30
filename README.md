# Gestion des chutes – Profilés Elcom

Page web interne pour gérer le stock de chutes de profilés Elcom (40X40, 80X40, 80X80).

## Utilisation

Ouvrir `index.html` dans un navigateur (aucune installation nécessaire).

1. Choisir le profilé (40X40, 80X40 ou 80X80).
2. Saisir la longueur à découper (mm) puis **Rechercher** (ou touche Entrée).
3. Le logiciel répond :
   - **OUI**: il indique la chute à prendre (la plus courte qui suffit, pour limiter les pertes) et le reste après coupe.
   - **NON**: il faut prendre une barre neuve de 2000 mm ; la chute produite est indiquée.
4. **Valider la découpe** met le stock à jour : la chute utilisée est retirée, le reste (moins le trait de scie de 5 mm) est ajouté au stock avec un numéro à reporter sur la pièce.

## Règles de calcul

- Barre neuve : 2000 mm, trait de scie : 5 mm (modifiables dans « Paramètres »).
- Reste = longueur source − longueur coupée − 5 mm (pas de trait de scie si la longueur est exacte).
- Les restes inférieurs à la « chute mini conservée » (100 mm par défaut) sont considérés comme déchet.

## Données

Les données sont enregistrées dans le navigateur (localStorage) du poste utilisé.
Les boutons **Exporter / Importer** permettent de sauvegarder le stock dans un fichier JSON ou de le transférer sur un autre poste.
