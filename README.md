# django184.github.io

Site utilisateur GitHub Pages de Django184. Il ne sert plus aucune app : seulement les **passeurs** des anciennes adresses, qui renvoient vers les nouvelles origines des apps (`ECOSYSTEME.md` §7.4, chantier B).

| Ancienne adresse | Nouvelle adresse |
|---|---|
| https://django184.github.io/panier-temoin/ | https://panier-temoin.pages.dev/ |
| https://django184.github.io/minuterie/ | https://ma-journee-2q9.pages.dev/ (Ma journée) |

La liste fait foi dans `passeurs.json` ; chaque page la reprend dans `<meta name="cible">`.

## Utilisation

Rien à faire : ouvrir une ancienne adresse ou une ancienne icône, avec du réseau, suffit.

- **Page** (`index.html`, `passeur.js`) : lit les données de l'app restées sur l'appareil à l'ancienne adresse, les transmet à la nouvelle dans le fragment de l'URL (`#/demenagement/…`, enveloppe `ecosysteme.export`, jamais envoyée à un serveur), puis **les efface d'ici**. La session et les secrets ne partent jamais. Les liens de Claude (`#/import/…`, `#/courses/…`) suivent tels quels.
- **Service worker d'autodestruction** (`sw.js`) : il remplace celui de l'app installée à sa prochaine vérification de mise à jour, efface les caches de l'app, se désinscrit et recharge la fenêtre, qui tombe sur la page.
- **Origine partagée** : seules les clés et les caches de l'app concernée sont touchés. Pratique Guitare (`/guitar/`) est encore servie par son propre dépôt sur cette origine.

Ce que chaque passeur efface :

| Passeur | Effacé à chaque passage | Effacé une fois transmis |
|---|---|---|
| `/panier-temoin/` | session Supabase (`sb-tpovnthrvlajmyjrfltn-*`), copie de la carte Cumulus | toutes les autres clés `panier-temoin:` (gardées si l'on arrive par un lien de Claude) |
| `/minuterie/` | — | `journee-timers-v1` et sa copie `journee-timers-v1.avant-v2` (rien si les données sont illisibles) |

## Fonctionnement de la publication

- La CI publie le site (Settings → Pages → Source : « GitHub Actions ») après les tests, à chaque envoi sur `main` : seulement `passeurs.json` et les dossiers qu'il liste, pas les tests ni la documentation.
- Un dépôt de projet du même nom qui publie encore son site **masque** le dossier correspondant d'ici : c'est pourquoi le dépôt d'une app ne passe en privé qu'une fois son passeur ici.
- Les dépôts des apps récupèrent leur passeur ici pour leur test du changement d'adresse de bout en bout (seule source du passeur).

## Développement

```sh
npm install --no-save playwright && npx playwright install chromium
node tests/passeurs.mjs            # deux origines locales : autodestruction, transfert, effacement
node tests/en_ligne.mjs            # le site en ligne sert-il les fichiers de ce commit ?
```

La CI (`.github/workflows/verification.yml`) lance les deux à chaque envoi sur `main` et le 1er de chaque mois. Ajouter un passeur : un dossier au nom de l'ancien chemin, une ligne dans `passeurs.json`, puis les cas propres à l'app dans `tests/passeurs.mjs`.

## Limites

- GitHub Pages n'envoie pas d'en-têtes HTTP : la CSP est en balise `<meta>`.
- Un appareil qui ne revient jamais à l'ancienne adresse garde ses anciennes données : seul un passage les efface.

## Licence

MIT (`LICENSE`).
