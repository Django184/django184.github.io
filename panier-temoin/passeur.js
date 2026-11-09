// Passeur de l'ancienne adresse (https://django184.github.io/panier-temoin/) — ECOSYSTEME.md §7.4.
// Lit les données de Panier Témoin gardées sur ce téléphone à l'ancienne adresse et les transmet
// à la nouvelle dans le fragment de l'URL (jamais envoyé à un serveur), au format d'export commun.
// Jamais transmises : la session Supabase et la copie de la carte Cumulus (reconnexion demandée).
// Format attendu à l'arrivée : src/lib/demenagement.ts du dépôt panier-temoin.
//
// Effacement (version 2, décision de l'utilisateur du 2026-11-04, étape 4 du changement d'origine) :
//   - la session Supabase et la copie de la carte Cumulus sont effacées à chaque passage ;
//   - les autres données de l'app (clés « panier-temoin: ») le sont dès qu'elles sont parties dans le lien.
// Rien d'autre n'est touché : l'origine django184.github.io est partagée avec d'autres apps.
(function () {
  const PREFIXE = "panier-temoin:";
  const SESSION = "sb-tpovnthrvlajmyjrfltn-";   // session Supabase : auth-token, code-verifier
  const CARTE = PREFIXE + "carte-cumulus";
  const SIMPLES = ["preferences", "projet-claude", "projet-chef-feta", "brouillon"];
  const cible = document.querySelector('meta[name="cible"]').content;
  const fragment = location.hash;
  const lien = document.getElementById("lien");

  function base64url(texte) {
    const octets = new TextEncoder().encode(texte);
    let bin = "";
    for (let i = 0; i < octets.length; i += 0x8000) bin += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  const lire = (cle) => { try { return localStorage.getItem(PREFIXE + cle); } catch (e) { return null; } };
  function effacer(tout) {
    try {
      for (const cle of Object.keys(localStorage)) {
        if (cle.startsWith(SESSION) || cle === CARTE || (tout && cle.startsWith(PREFIXE))) localStorage.removeItem(cle);
      }
    } catch (e) { /* stockage inaccessible : rien à effacer */ }
  }

  // Un lien envoyé par Claude (ticket « #/import/{…} », recette « #/courses/{…} ») suit tel quel :
  // les réglages passeront à la prochaine ouverture de l'ancienne icône, ils restent donc ici.
  // Pour tout autre fragment (#/courses, #/cumulus… : l'écran où l'app était restée), les réglages
  // passent maintenant, puis sont effacés.
  const lienClaude = /^#\/(import|courses)\/./.test(fragment);
  let adresse = cible + (lienClaude ? fragment : "");

  if (!lienClaude) {
    const cles = {};
    for (const cle of SIMPLES) { const v = lire(cle); if (v) cles[cle] = v; }
    // Changements de la liste pas encore envoyés : la liste, la recette affichée et les recettes
    // concernées partent avec eux, pour être envoyés après la connexion à la nouvelle adresse.
    let file = [];
    try { file = JSON.parse(lire("synchro-file") || "[]"); } catch (e) { file = []; }
    if (Array.isArray(file) && file.length) {
      cles["synchro-file"] = JSON.stringify(file);
      const courses = lire("courses"); if (courses) cles["courses"] = courses;
      const active = lire("recette-active"); if (active) cles["recette-active"] = active;
      const ids = new Set(file.filter((op) => op && op.table === "recettes").map((op) => op.id));
      try {
        const recettes = JSON.parse(lire("recettes") || "[]").filter((r) => r && ids.has(r.id));
        if (recettes.length) cles["recettes"] = JSON.stringify(recettes);
      } catch (e) { /* recettes illisibles : la base fait foi */ }
    }
    if (Object.keys(cles).length) {
      const enveloppe = {
        format: "ecosysteme.export",
        formatVersion: 1,
        app: "panier-temoin",
        appVersion: "passeur",
        schemaVersion: 0,
        exportedAt: new Date().toISOString(),
        data: { cles: cles }
      };
      adresse = cible + "#/demenagement/" + base64url(JSON.stringify(enveloppe));
    }
  }
  effacer(!lienClaude);
  lien.href = adresse;
  location.replace(adresse);
})();
