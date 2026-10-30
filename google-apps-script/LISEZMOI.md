# Mettre le site en ligne gratuitement (Google)

Le site est hébergé par Google Apps Script (gratuit, toujours en ligne) et le stock est enregistré
dans un tableau Google Sheets (sauvegarde automatique, historique des versions dans *Fichier → Historique des versions*).
Il faut seulement un compte Google. Durée : environ 5 minutes.

## 1. Créer le tableau
1. Aller sur https://sheets.new (connecté au compte Google de l'entreprise).
2. Renommer le tableau, par exemple « Stock chutes Elcom ».

## 2. Coller le code
1. Dans le tableau : menu **Extensions → Apps Script**.
2. Dans le fichier `Code.gs` déjà ouvert : tout effacer, puis coller le contenu de [`Code.gs`](Code.gs).
3. Ligne `const MOT_DE_PASSE = '';` : écrire le mot de passe entre les guillemets.
4. À gauche, cliquer sur **+ → HTML**, nommer le fichier exactement `Index` (sans .html).
   Tout effacer, puis coller le contenu de [`Index.html`](Index.html).
5. Cliquer sur l'icône **Enregistrer** (disquette).

## 3. Publier
1. En haut à droite : **Déployer → Nouveau déploiement**.
2. Roue dentée → **Application Web**.
3. *Exécuter en tant que* : **Moi**. *Qui a accès* : **Tout le monde**.
4. **Déployer**, puis **Autoriser l'accès** et choisir le compte Google.
   Si Google affiche « Google n'a pas validé cette application » : **Paramètres avancés → Accéder à … (non sécurisé)**
   (c'est votre propre script), puis **Autoriser**.
5. Copier l'**URL de l'application Web** (elle finit par `/exec`) : c'est l'adresse du site.

## 4. Sur chaque poste de l'atelier
Ouvrir l'adresse, se connecter une fois (identifiant `Production` + mot de passe) : le poste reste connecté.
Astuce : l'ajouter en favori, ou « Ajouter à l'écran d'accueil » sur une tablette.

## Bon à savoir
- Le stock est lisible directement dans le tableau (onglets *Stock*, *Historique*, *Paramètres*).
  Évitez de modifier l'onglet *Stock* à la main pendant que l'atelier travaille ; utilisez plutôt le site.
- « Tout le monde » signifie que la page de connexion est accessible avec le lien ; sans le mot de passe,
  rien n'est visible ni modifiable.
- **Mettre à jour le code plus tard** : coller le nouveau code, enregistrer, puis
  **Déployer → Gérer les déploiements → crayon → Version : Nouvelle version → Déployer**. L'adresse ne change pas.
- La page se met à jour toute seule toutes les 30 secondes, et toujours juste avant une recherche.
- Si deux opérateurs prennent la même chute, le second est prévenu.
