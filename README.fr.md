<img src="Resources/AppIcon.png" width="128" alt="">

# Corner Cinema

[English](README.md) · **Français**

Lecteur vidéo pour macOS, pour ceux qui écoutent des films et des séries en travaillant.
On ajoute les services de streaming auxquels on est abonné, on s'y connecte une fois, et la
vidéo joue dans une petite fenêtre qui reste au premier plan, dans un coin de l'écran.
Les pubs jouent sans le son, et le son revient avec le film.

## Construire

```bash
scripts/build-app.sh
open "build/Corner Cinema.app"
```

Prérequis : macOS 14+, Xcode / Swift 6.
Pour l'installer, copier `build/Corner Cinema.app` dans `/Applications`.

## Services

- Corner Cinema ne contient aucun site.
- **Ajouter un service** (＋) : une adresse comme `example.com`, et un nom.
- Le service s'ouvre : se connecter sur sa propre page, comme dans Safari.
  La session est gardée sur ce Mac (cookies et stockage, comme un navigateur).
- Clic droit sur un service : le modifier, le déplacer, s'en déconnecter (oublier ses
  cookies) ou le retirer.
- Les fenêtres de connexion (« Continuer avec Google / Apple ») s'ouvrent dans une petite fenêtre.

Corner Cinema se présente comme Safari et lit les vidéos protégées avec FairPlay,
le DRM de Safari. Un service qui joue dans Safari joue ici.
Un service qui ne marche que dans Chrome (Widevine) ne joue pas.

## Mini lecteur

Pendant une vidéo, cliquer **Mini lecteur** (⇧⌘M), ou simplement passer à une autre app :
la vidéo passe dans une petite fenêtre flottante.

- Elle reste par-dessus toutes les apps, sur tous les bureaux, et par-dessus les apps en plein écran.
- Rien n'est retiré de la page : la même page continue de jouer, avec le lecteur du site,
  ses commandes et ses sous-titres, montrés seuls dans toute la fenêtre.
- Elle garde les proportions de la vidéo, s'aimante aux bords et aux coins de l'écran
  quand on la lâche près d'eux, et retient sa taille et sa place.
- Les commandes apparaissent quand le pointeur passe dessus :
  - ⟲ 10 s, lecture / pause, ⟳ 10 s, couper le son ;
  - la barre de progression, pour se déplacer dans la vidéo ;
  - 📣 *C'est une pub*, les options (•••), revenir à la fenêtre, fermer (met en pause).
- Glisser le haut du lecteur pour le déplacer.
- Options :
  - **Opacité** : de 100 % à 40 %.
  - **Son seulement** : une bande mince avec le titre et les commandes ; le film continue dessous.
  - **Verrouiller** : les clics passent au travers du lecteur, vers la fenêtre derrière. ⌃⌥⌘T le déverrouille.
- L'icône de la barre des menus a les mêmes commandes, depuis n'importe quelle app.

*Réglages › Passer au mini lecteur quand je vais dans une autre app* désactive le passage automatique.

## Pubs

Pendant une pub, Corner Cinema coupe le son de la vidéo, puis le remet quand le film revient.
Une vidéo dont vous avez coupé le son reste muette. Rien n'est sauté, bloqué ni modifié
sur le site : la pub joue quand même, sans le son.

- Une pub est reconnue par :
  - son étiquette dans le lecteur (« Publicité 1 sur 2 », « Ad · 0:15 », « Votre vidéo reprendra après la pub ») ;
  - les classes qu'utilisent les lecteurs de pub courants ;
  - les cadres (iframes) de serveurs de pub qui jouent une vidéo.
- « Pub · son coupé » s'affiche dans la barre d'outils et sur le mini lecteur.
- Une pub non reconnue : cliquer 📣 (ou ⌃⌥⌘A). Le son reste coupé jusqu'au prochain clic.
- Pour un service dont les pubs passent toujours : *Modifier › Avancé › Repère de pub*,
  un sélecteur CSS d'un élément que le service n'affiche que pendant les pubs.
  L'inspecteur web aide à le trouver : Safari › Développement › *votre Mac* › Corner Cinema.

## Raccourcis depuis n'importe quelle app

| Action | Raccourci |
| --- | --- |
| Lecture / Pause | ⌃⌥⌘P |
| Reculer / avancer de 10 secondes | ⌃⌥⌘J / ⌃⌥⌘L |
| Couper / remettre le son | ⌃⌥⌘M |
| C'est une pub (son coupé jusqu'au prochain appui) | ⌃⌥⌘A |
| Verrouiller / déverrouiller le mini lecteur | ⌃⌥⌘T |
| Afficher / masquer le mini lecteur | ⌃⌥⌘H |

Dans l'app : ⇧⌘M mini lecteur, ⇧⌘H accueil, ⌘[ / ⌘] précédent / suivant, ⌘R recharger.
Les raccourcis utilisent la position des touches d'un clavier américain (les lettres sont à
la même place sur un clavier canadien français).

## Automatisation

- `open "cornercinema://open?url=https%3A%2F%2Fexample.com%2Fwatch"` : ouvre une page.
- `open "cornercinema://mini"` : active ou quitte le mini lecteur.
- `open "cornercinema://play-pause"`.

## Fonctionnement

- `PlayerModel` : un seul `WKWebView` (données de sites gardées, agent utilisateur de Safari),
  son état, ses commandes et l'état des pubs de chaque cadre.
- `PageScript` : le script ajouté à chaque page et à chaque cadre, dans son propre monde
  JavaScript (le site ne le voit pas) :
  - repérer les pubs et couper le son, dans chaque cadre ;
  - dans le cadre principal, l'état et les commandes de la vidéo, et le lecteur isolé.
- `MiniPlayer` : le panneau flottant (`NSPanel`) où passe le web view. Déplacer le même web
  view garde la vidéo en lecture, vidéos protégées comprises.
- `MiniOverlay` : les commandes dessinées par-dessus la vidéo (SwiftUI).
- `MainWindowController` : la fenêtre principale (AppKit), avec les vues et la barre d'outils SwiftUI.
- `HotKeys` : les raccourcis depuis n'importe quelle app (raccourcis Carbon, sans permission).
- Netflix s'arrête avec une erreur quand un script déplace sa vidéo : son lecteur est piloté
  avec les touches qu'il comprend (espace, ← et →).

L'interface est en anglais, et en français quand le Mac est en français (`Resources/fr.lproj`).

### Développement

Les versions debug (`scripts/build-app.sh debug`) ajoutent des accès pour vérifier l'app
depuis un terminal :

```bash
open "cornercinema://debug-eval?js=document.title"     # résultat dans le journal
open "cornercinema://debug-snapshot?path=/tmp/cc"      # /tmp/cc-web.png, -window.png, -mini.png
log stream --level info --predicate 'subsystem == "local.cornercinema"'
```

## Licence

[MIT](LICENSE).
