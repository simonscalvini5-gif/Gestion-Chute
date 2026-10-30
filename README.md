# Gestion des chutes – Profilés Elcom (TDM by Insidix)

Application web interne : l'opérateur choisit le profilé (40X40, 80X40, 80X80), saisit la longueur à couper,
et le logiciel répond **OUI** (avec la chute à prendre) ou **NON** (barre neuve de 2000 mm).
Le trait de scie (5 mm) est pris en compte, le reste est remis en stock avec un numéro à écrire sur la pièce.
Le stock est **partagé** entre tous les postes et protégé par **mot de passe**.

## Site goulottes

Voir **[goulottes/LISEZMOI.md](goulottes/LISEZMOI.md)** : site dédié aux goulottes (découpe par machine, plan PDF).

## Mettre le site en ligne gratuitement (recommandé)

Voir **[google-apps-script/LISEZMOI.md](google-apps-script/LISEZMOI.md)** : hébergement gratuit par Google,
stock enregistré dans Google Sheets, aucune installation. Les sections suivantes concernent la variante
« serveur sur un PC de l'atelier ».

## Lancer le site

Prérequis : [Node.js](https://nodejs.org) 18 ou plus récent. Aucune autre installation.

```bash
APP_PASSWORD="le-mot-de-passe" node server.js
```

Puis ouvrir http://localhost:3000. Le navigateur demande l'identifiant (`Production` par défaut) et le mot de passe.
Le mot de passe n'est volontairement pas écrit dans le code : il est donné au lancement.

| Variable       | Rôle                                             | Défaut              |
|----------------|--------------------------------------------------|---------------------|
| `APP_USER`     | identifiant d'accès                              | `Production`        |
| `APP_PASSWORD` | mot de passe d'accès                             | généré au démarrage |
| `PORT`         | port d'écoute                                    | `3000`              |
| `DATA_DIR`     | dossier où est enregistré `data.json` (le stock) | `./data`            |
| `BACKUP_DIR`   | dossier des sauvegardes quotidiennes             | `data/sauvegardes`  |
| `BACKUP_DAYS`  | nombre de jours de sauvegardes gardés            | `90`                |

## Enregistrement du stock

- Chaque découpe, ajout ou retrait est **écrit sur le disque immédiatement** dans `data/data.json`
  (écriture sécurisée : une coupure de courant pendant l'enregistrement ne peut pas abîmer le fichier).
- Une **sauvegarde par jour** est faite dans `data/sauvegardes/stock-AAAA-MM-JJ.json` ; les 90 derniers jours sont gardés.
- Au démarrage, si `data.json` est absent ou abîmé, le serveur repart **automatiquement de la sauvegarde la plus récente**.
  Si rien n'est lisible, il refuse de démarrer plutôt que d'écraser quoi que ce soit.
- Pour se protéger d'une panne du disque du PC : définir `BACKUP_DIR` vers une clé USB, un autre disque ou un dossier réseau.

**Restaurer une sauvegarde à la main** : arrêter le serveur, copier le fichier `stock-AAAA-MM-JJ.json` voulu
à la place de `data/data.json`, relancer.

## Installation sur le PC de l'atelier (Windows)

1. Installer Node.js (version LTS) depuis https://nodejs.org.
2. Copier ce dossier sur le PC, par exemple dans `C:\Chutes`.
3. Dans ce dossier, créer un fichier `motdepasse.txt` contenant uniquement le mot de passe.
4. Double-cliquer sur `demarrer-serveur.bat` pour tester. Autoriser Node.js dans le pare-feu Windows (« réseaux privés »).
5. Sur les postes de l'atelier, ouvrir `http://<nom-ou-ip-du-PC>:3000` (l'IP s'obtient avec la commande `ipconfig`).
   Identifiant `Production` + le mot de passe.

**Démarrage automatique** (le site tourne dès que le PC est allumé, même sans session ouverte) :
Planificateur de tâches → *Créer une tâche* →
- Général : « Exécuter même si l'utilisateur n'est pas connecté »
- Déclencheurs : « Au démarrage »
- Actions : programme `C:\Chutes\demarrer-serveur.bat`, « Commencer dans » `C:\Chutes`
- Paramètres : décocher « Arrêter la tâche si elle s'exécute plus de… »

Le script relance aussi le serveur tout seul s'il s'arrête. Les messages sont dans `serveur.log`.

Conseil : donner au PC une adresse IP fixe (réglage de la box ou du routeur) pour que l'adresse du site ne change pas.

## Mettre le site sur Internet (optionnel)

Seulement si des personnes hors de l'atelier doivent y accéder : Cloudflare Tunnel depuis ce PC
(https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/), ou un hébergeur Docker
avec un disque persistant monté sur `/data`. Toujours en HTTPS.

## Fichiers

- `server.js` – serveur (API + pages), sans dépendance
- `google-apps-script/` – version hébergée gratuitement par Google (recommandée)
- `public/` – interface (page, logos)
- `demarrer-serveur.bat` – lancement Windows avec redémarrage automatique
- `artifact/chutes-elcom.html` – ancienne version hébergée sur claude.ai
