# YouTube Subscriptions Manager Extension

Extension Firefox qui permet de gérer les abonnements YouTube directement depuis le navigateur et d'ouvrir automatiquement les nouvelles vidéos.

## Fonctionnalités principales

- Barre de recherche pour filtrer instantanément les abonnements (chaînes et playlists).
- Ajoute un abonnement depuis l'extension en saisissant simplement le nom de la chaîne (sans `@`), ou depuis une page YouTube via le bouton `S'abonner`.
- Supprime un abonnement ou inverse l'ordre de lecture pour les playlists.
- Vérifie les nouveautés manuellement ou automatiquement lorsque la page `https://www.youtube.com/` est visitée et ouvre chaque nouvelle vidéo dans un nouvel onglet.
- Affiche le nombre de vidéos fraichement ouvertes sur le badge rouge de l'icône (remis à zéro après ouverture).
- Un clic sur le nom dans la liste ouvre directement la chaîne ou la playlist, avec indication relative de la dernière vidéo publiée.
- Remplace le bouton `S'abonner` de YouTube (recherche, chaîne, vidéo) pour ajouter la chaîne à l'extension et affiche `Abonné` lorsque déjà suivi.

## Remarques

- L'extension stocke les abonnements dans `browser.storage.local`; ils ne sont pas partagés avec le fichier `youtube.json` du script Python.
- Le suivi des relais se base sur les flux publics `https://www.youtube.com/feeds/videos.xml`.
- Le handle `@channel` est résolu automatiquement pour récupérer l'identifiant de chaîne.
