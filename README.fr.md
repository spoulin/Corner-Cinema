<img src="Resources/AppIcon.png" width="128" alt="">

# Corner Cinema

[English](README.md) · **Français**

Lecteur vidéo pour macOS, pour ceux qui écoutent des films et des séries en travaillant.
On ajoute les services de streaming auxquels on est abonné, on s'y connecte une fois, et on
les regarde dans l'app.

> **Réécriture en cours.** La version 0.1 (Swift + WebKit, tag `v0.1-webkit`) n'affichait pas
> la vidéo quand DisplayLink est actif. La version 0.2 passe à Chromium avec Widevine
> (Electron de castLabs). Le mini lecteur, le son coupé pendant les pubs et les raccourcis
> globaux reviennent dans les prochaines étapes.

## Utilisation

- Corner Cinema ne contient aucun site.
- **Ajouter un service** (＋) : une adresse comme `example.com`, et un nom.
- Le service s'ouvre : se connecter sur sa propre page. La session est gardée sur ce Mac.
- Clic droit sur un service : le modifier, le déplacer, s'en déconnecter (oublier ses
  cookies) ou le retirer.
- Les fenêtres de connexion (« Continuer avec Google / Apple ») s'ouvrent dans une petite fenêtre.
- ⇧⌘H accueil, ⌘[ / ⌘] précédent / suivant, ⌘R recharger, ⌘, réglages.

### DisplayLink

Quand DisplayLink est actif, la vidéo affichée par la puce graphique reste noire sur tous les
écrans, avec le son seulement, et macOS bloque les vidéos protégées.

- Corner Cinema vérifie au lancement : si DisplayLink est actif, l'accélération matérielle est
  coupée et Chromium décode et affiche la vidéo lui-même. La vidéo s'affiche, Netflix compris
  (en 720p au plus), au prix de plus de travail pour le processeur.
- DisplayLink démarré après l'app : un avis dans la barre d'outils propose de redémarrer.
- *Réglages › Accélération matérielle* : Automatique (par défaut), Activée ou Désactivée.

## Construire

Prérequis : macOS 14+, Node.js 20+, Python 3.

```bash
npm install
node node_modules/electron/install.js   # télécharge l'Electron de castLabs, si npm ne l'a pas fait
npm run evs:setup                       # outil EVS de castLabs, dans .evs
```

Widevine demande une signature VMP, que Netflix et d'autres vérifient. Elle vient du service
gratuit EVS de castLabs, avec votre propre compte :

```bash
.evs/bin/python -m castlabs_evs.account signup   # la première fois ; ensuite `reauth` quand elle expire
npm run evs:sign-dev                             # signe node_modules/electron pour `npm start`
```

Ensuite :

- `npm start` : lance l'app depuis les sources.
- `npm run app` : construit `dist/mac-arm64/Corner Cinema.app` (signé VMP, puis signé localement pour ce Mac).
- `npm run dist` : construit un `.dmg` et un `.zip`.

Les gens qui téléchargent une app construite n'ont besoin d'aucun compte : la signature est
dans l'app, et le module Widevine se télécharge depuis Google au premier lancement.

## Fonctionnement

- `src/main/main.js` : démarrage (accélération matérielle, Widevine), menus, réglages, messages.
- `src/main/main-window.js` : la fenêtre principale ; chaque service ouvert est une
  `WebContentsView` sous la barre d'outils, dans une session gardée (`persist:services`).
- `src/main/store.js` : services, icônes et réglages, en JSON dans le dossier de l'app.
- `src/main/displaylink.js` : savoir si DisplayLink est actif.
- `src/renderer/` : la barre d'outils, l'accueil, l'éditeur de service et les réglages (HTML, sans framework).
- `src/preload/ui.js` : la petite API des fenêtres de l'app. Les pages des services n'y ont pas accès.
- `scripts/evs.js` : la signature VMP (avant la signature Apple, comme macOS l'exige).

L'interface est en anglais, et en français quand le Mac est en français (`src/i18n/fr.json`).

## Licence

[MIT](LICENSE). Electron for Content Security de castLabs ; le module Widevine est celui de
Google, téléchargé au premier lancement.
