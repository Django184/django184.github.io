// Site publié (https://django184.github.io/) : les fichiers servis sont-ils ceux de ce dépôt ?
//
// - passeurs.json, à la racine, prouve que la publication de ce dépôt est en ligne (attente bornée) ;
// - pour chaque ancienne adresse (/panier-temoin/, /minuterie/…), GitHub Pages sert le dépôt de
//   projet du même nom tant qu'il publie encore son site : c'est attendu, et signalé, tant que ce
//   dépôt est public avec GitHub Pages. Dès qu'il ne publie plus (dépôt privé, Pages coupé),
//   ce dépôt doit servir le passeur, à l'identique : sinon, échec.
// Lancer : node tests/en_ligne.mjs [https://django184.github.io]
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = (process.argv[2] || "https://django184.github.io").replace(/\/$/, "");
const COMPTE = "Django184";
const RACINE = fileURLToPath(new URL("..", import.meta.url));
const DELAI = Number(process.env.DELAI_MS || 10 * 60 * 1000);
const liste = JSON.parse(await readFile(join(RACINE, "passeurs.json"), "utf8")).passeurs;

let echecs = 0;
const ok = (cond, msg) => { console.log((cond ? "✓ " : "✗ ") + msg); if (!cond) { echecs++; console.log(`::error::Site publié : ${msg}`); } };
const resume = [];

let n = 0;
async function servi(chemin) {
  const r = await fetch(`${SITE}${chemin}?ci=${Date.now()}-${n++}`, { redirect: "follow" });
  return { statut: r.status, texte: r.ok ? await r.text() : "" };
}
const local = (chemin) => readFile(join(RACINE, chemin.endsWith("/") ? chemin + "index.html" : chemin), "utf8");

// 1. La publication de ce dépôt est en ligne.
const fin = Date.now() + DELAI;
let enLigne = false;
while (Date.now() < fin) {
  const r = await servi("/passeurs.json").catch(() => ({ statut: 0, texte: "" }));
  if (r.texte === (await local("/passeurs.json"))) { enLigne = true; break; }
  await new Promise((res) => setTimeout(res, 15000));
}
ok(enLigne, `passeurs.json de ce commit servi à la racine${enLigne ? "" : ` (pas après ${DELAI / 60000} min)`}`);

// 2. Chaque ancienne adresse.
for (const chemin of Object.keys(liste)) {
  const depot = chemin.replaceAll("/", "");
  const entetes = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) entetes.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;   // limite de l'API sans jeton
  const api = await fetch(`https://api.github.com/repos/${COMPTE}/${depot}`, { headers: entetes }).catch(() => ({ ok: false }));
  const projet = api.ok ? await api.json() : null;
  const projetPublie = !!(projet && !projet.private && projet.has_pages && projet.name.toLowerCase() === depot.toLowerCase());
  const fichiers = [chemin, chemin + "passeur.js", chemin + "passeur.css", chemin + "sw.js"];
  const etats = [];
  for (const f of fichiers) {
    const r = await servi(f).catch(() => ({ statut: 0, texte: "" }));
    etats.push({ f, statut: r.statut, identique: r.statut === 200 && r.texte === (await local(f)), passeur: /<meta name="cible"|autodestruction/.test(r.texte) });
  }
  const identiques = etats.every((e) => e.identique);
  if (identiques) {
    ok(true, `${chemin} : passeur de ce dépôt servi à l'identique`);
    resume.push(`| \`${chemin}\` | ✅ ce dépôt |`);
  } else if (projetPublie) {
    const ancienPasseur = etats.every((e) => e.statut === 200) && etats[0].passeur;
    console.log(`::notice::${chemin} : servi par le dépôt de projet ${depot} (public, GitHub Pages actif)${ancienPasseur ? ", passeur de la version précédente" : ""}.`);
    console.log(`• ${chemin} : servi par le dépôt de projet ${depot} (attendu tant qu'il publie)`);
    ok(ancienPasseur, `${chemin} : un passeur est servi (dépôt de projet)`);
    resume.push(`| \`${chemin}\` | ⏳ dépôt de projet \`${depot}\` (public, Pages actif)${ancienPasseur ? "" : " — ❌ pas de passeur"} |`);
  } else {
    ok(false, `${chemin} : le dépôt de projet ne publie plus, mais ce dépôt n'est pas servi à l'identique (${etats.map((e) => `${e.f} ${e.statut}`).join(", ")})`);
    resume.push(`| \`${chemin}\` | ❌ ni ce dépôt ni le projet |`);
  }
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `## ${echecs ? "❌" : "✅"} Site publié ${SITE}\n\n| Ancienne adresse | Servie par |\n|---|---|\n${resume.join("\n")}\n`);
}
console.log(echecs ? `\n${echecs} échec(s)` : "\nSite publié vérifié.");
process.exit(echecs ? 1 : 0);
