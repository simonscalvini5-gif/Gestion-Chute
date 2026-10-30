# Gestion des chutes – Profilés Elcom (TDM by Insidix)

Application web interne : l'opérateur choisit le profilé (40X40, 80X40, 80X80), saisit la longueur à couper,
et le logiciel répond **OUI** (avec la chute à prendre) ou **NON** (barre neuve de 2000 mm).
Le trait de scie (5 mm) est pris en compte, le reste est remis en stock avec un numéro à écrire sur la pièce.
Le stock est **partagé** entre tous les postes et protégé par **mot de passe**.

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

**Sauvegarde** : tout le stock est dans `data/data.json`. Copiez ce fichier régulièrement.

## Mettre le site en ligne (privé)

### Option A – Un PC ou serveur de l'entreprise + Cloudflare Tunnel (gratuit, recommandé)
1. Sur un PC toujours allumé : installer Node.js, copier ce dossier, lancer `node server.js` avec `APP_PASSWORD`.
2. Installer `cloudflared` et créer un tunnel vers `http://localhost:3000`
   (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).
   Le site obtient une adresse HTTPS, sans ouvrir de port sur la box.
3. Optionnel : Cloudflare Access pour n'autoriser que les adresses e-mail de l'entreprise.

Si le site ne sert qu'à l'atelier, l'étape 2 est inutile : les postes du réseau local ouvrent `http://<ip-du-pc>:3000`.

### Option B – Hébergeur avec Docker (Render, Railway, Fly.io, VPS…)
Le `Dockerfile` est prêt. Définir `APP_PASSWORD` et **monter un disque persistant sur `/data`**,
sinon le stock est perdu à chaque redémarrage.

Toujours utiliser HTTPS sur Internet : le mot de passe circule dans chaque requête.

## Fichiers

- `server.js` – serveur (API + pages), sans dépendance
- `public/` – interface (page, logos)
- `artifact/chutes-elcom.html` – ancienne version hébergée sur claude.ai
