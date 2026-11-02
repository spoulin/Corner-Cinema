<img src="Resources/AppIcon.png" width="128" alt="">

# Corner Cinema

[English](README.md) · **Français**

Lecteur vidéo pour macOS, pour ceux qui écoutent des films et des séries en travaillant.
On ajoute les services de streaming auxquels on est abonné, on s'y connecte une fois, et on
les regarde dans l'app.

> **Réécriture en cours.** La version 0.1 (Swift + WebKit, tag `v0.1-webkit`) n'affichait pas
> la vidéo quand DisplayLink est actif. La version 0.2 passe à Chromium avec Widevine
> (Electron de castLabs). Le son coupé pendant les pubs revient à la prochaine étape.

## Utilisation

- Corner Cinema ne contient aucun site.
- **Ajouter un service** (＋) : une adresse comme `example.com`, et un nom.
- Le service s'ouvre : se connecter sur sa propre page. La session est gardée sur ce Mac.
- Clic droit sur un service : le modifier, le déplacer, s'en déconnecter (oublier ses
  cookies) ou le retirer.
- Les fenêtres de connexion (« Continuer avec Google / Apple ») s'ouvrent dans une petite fenêtre.
- ⇧⌘H accueil, ⌘[ / ⌘] précédent / suivant, ⌘R recharger, ⌘, réglages.

## Mini lecteur

Pendant une vidéo, cliquer **Mini lecteur** (⇧⌘M), ou simplement passer à une autre app : la
page passe dans une petite fenêtre flottante, sans s'arrêter.

- Elle reste par-dessus toutes les apps, sur tous les bureaux, et par-dessus les apps en plein écran.
- Le lecteur du site s'affiche seul dans toute la fenêtre, avec ses propres commandes et
  sous-titres : Corner Cinema n'ajoute rien par-dessus la vidéo.
- Elle garde les proportions de la vidéo, s'aimante aux bords et aux coins de l'écran, et
  retient sa taille et sa place.
- **La glisser de n'importe où** pour la déplacer. Un simple clic reste un clic pour le site ;
  les barres de progression du site continuent de marcher.
- **Échap** (après un clic sur le lecteur) ramène la vidéo dans la fenêtre, sans l'arrêter.
- **Clic droit** pour les options : revenir à la fenêtre, fermer (met en pause), **Opacité**
  (de 100 % à 40 %), **Son seulement** (une bande mince avec les commandes ; le film continue
  dessous), **Verrouiller** (les clics passent au travers ; ⌃⌥⌘T déverrouille).
- *Réglages › Passer au mini lecteur quand je vais dans une autre app* désactive le passage automatique.
- Les chaînes en direct (Pluto TV) repartent d'elles-mêmes après une pause : c'est le choix du site.

### Raccourcis depuis n'importe quelle app

| Action | Raccourci |
| --- | --- |
| Lecture / Pause | ⌃⌥⌘P |
| Reculer / avancer de 10 secondes | ⌃⌥⌘J / ⌃⌥⌘L |
| Couper / remettre le son | ⌃⌥⌘M |
| Verrouiller / déverrouiller le mini lecteur | ⌃⌥⌘T |
| Afficher / masquer le mini lecteur | ⌃⌥⌘H |

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
  `WebContentsView` sous la barre d'outils, dans une session gardée (`persist:services`). Elle pilote la vidéo.
- `src/main/mini-player.js` : le panneau flottant où passe la page ; sa barre « son seulement »
  et ses messages sont dans `src/renderer/mini.*`.
- `src/preload/page.js` : tourne dans chaque page de service, dans un monde que le site ne peut
  ni voir ni appeler : trouve, décrit et pilote la vidéo principale, marque le lecteur du site et
  déplace le mini lecteur quand on le glisse. `src/page/focus.css` affiche le lecteur seul. Rien
  d'autre n'est caché dans la page (les sites vérifient que leurs éléments de pub restent visibles).
- `src/main/store.js` : services, icônes et réglages, en JSON dans le dossier de l'app.
- `src/main/displaylink.js` : savoir si DisplayLink est actif.
- `src/renderer/` : la barre d'outils, l'accueil, l'éditeur de service et les réglages (HTML, sans framework).
- `src/preload/ui.js` : la petite API des fenêtres de l'app. Les pages des services ne peuvent pas l'atteindre.
- `scripts/evs.js` : la signature VMP (avant la signature Apple, comme macOS l'exige).

L'interface est en anglais, et en français quand le Mac est en français (`src/i18n/fr.json`).

## Licence

[MIT](LICENSE). Electron for Content Security de castLabs ; le module Widevine est celui de
Google, téléchargé au premier lancement.
