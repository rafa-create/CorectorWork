# Corector Teacher App

Application pour suivre l'evolution des copies d'eleves avec:
- une app mobile (photo + envoi de copie),
- une API (OCR + correction orthographique + notation),
- une app web (tableau de suivi et detail des corrections).

## Architecture

- `server`: API Node.js + SQLite + Tesseract OCR + dictionnaire francais.
- `mobile`: application Expo React Native pour prendre la copie en photo.
- `web`: interface React/Vite pour visualiser les corrections.

## 1) Lancer l'API

```bash
cd server
npm install
npm run dev
```

API disponible par defaut sur `http://localhost:4000`.

## 2) Lancer la version web

```bash
cd web
npm install
```

Cree un fichier `.env` dans `web`:

```env
VITE_API_URL=http://localhost:4000
```

Puis lance:

```bash
npm run dev
```

## 3) Lancer la version mobile

```bash
cd mobile
npm install
npm start
```

Dans `mobile/App.js`, adapte la constante `API_URL` avec l'IP accessible depuis le telephone.

## Flux metier actuel

1. L'enseignante prend en photo la copie depuis l'app mobile.
2. L'image est envoyee a l'API.
3. L'API transcrit la copie (OCR), puis fait une correction orthographique.
4. Une note d'orthographe /20 est calculee.
5. Sur le web, la prof voit:
   - la transcription brute,
   - la version corrigee,
   - la note attribuee,
   - l'evolution des notes par eleve.

## Deploiement sur ton serveur Ubuntu

Connexion:

```bash
ssh -i C:\Users\orset\.ssh\ssh-key-2026-02-10.key ubuntu@129.151.255.80
```

Etapes conseillees (sur le serveur):

1. Installer Node.js (version 20+ recommandee).
2. Copier le projet (`scp` ou `git clone`).
3. Dans `server`: `npm install && npm run dev`.
4. Ouvrir le port `4000` dans le firewall, ou mieux:
   - utiliser `nginx` comme reverse proxy,
   - executer l'API avec `pm2`,
   - servir `web/dist` via nginx apres `npm run build` dans `web`.

