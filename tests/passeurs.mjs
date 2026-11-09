// Passeurs des anciennes adresses (ECOSYSTEME.md §7.4), de bout en bout dans Chromium.
//
// Deux serveurs locaux = deux origines :
//   - l'ancienne (comme django184.github.io) sert d'abord deux apps installées simulées
//     (/panier-temoin/ et /minuterie/ : service worker en cache d'abord, données dans le stockage,
//     plus les données d'une app voisine), puis ce dépôt, comme GitHub Pages ;
//   - la nouvelle (comme *.pages.dev) est une page témoin qui reçoit le lien.
// On vérifie : service worker d'autodestruction, lien transmis, ce qui part et ce qui ne part pas,
// effacement des seules données de l'app, données et caches des voisines intacts, liens de Claude,
// cas sans données et données illisibles, aucune erreur de page ni violation de CSP.
// La reprise réelle à l'arrivée est testée dans le dépôt de chaque app (scripts/demenagement.mjs,
// tests/demenagement.mjs), avec ces mêmes fichiers.
//
// Lancer : node tests/passeurs.mjs   (playwright doit être installé : npm i --no-save playwright)
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const RACINE = fileURLToPath(new URL("..", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const REF = "tpovnthrvlajmyjrfltn";

let echecs = 0;
const ok = (cond, msg) => {
  console.log((cond ? "✓ " : "✗ ") + msg);
  if (!cond) { echecs++; console.log(`::error::Passeurs : ${msg}`); }
};

// Adresses de destination : passeurs.json fait foi, et chaque page doit dire la même chose.
const liste = JSON.parse(await readFile(join(RACINE, "passeurs.json"), "utf8")).passeurs;
for (const [chemin, cible] of Object.entries(liste)) {
  const page = await readFile(join(RACINE, chemin, "index.html"), "utf8");
  ok(page.includes(`<meta name="cible" content="${cible}">`), `${chemin} : adresse de destination identique à passeurs.json (${cible})`);
  for (const f of ["passeur.js", "passeur.css", "sw.js"]) {
    ok(await readFile(join(RACINE, chemin, f)).then(() => true, () => false), `${chemin}${f} présent`);
  }
}

// Nouvelle origine : page témoin, un dossier par app.
const TEMOIN = "<!doctype html><meta charset=utf-8><title>Nouvelle adresse</title><p>nouvelle adresse</p>";
const neuf = http.createServer((req, res) => { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(TEMOIN); });
await new Promise((r) => neuf.listen(0, r));
const NOUVELLE = `http://127.0.0.1:${neuf.address().port}/`;   // autre hôte : autre origine
const DESTINATION = { "/panier-temoin/": NOUVELLE + "panier/", "/minuterie/": NOUVELLE + "journee/" };

// Ancienne origine : apps installées simulées, puis ce dépôt (comme GitHub Pages).
const ANCIENNE_PAGE = '<!doctype html><title>Ancienne app</title><script src="ancienne.js"></script><p>ancienne app</p>';
const ANCIENNE_JS = 'navigator.serviceWorker.register("sw.js");';
const ancienSw = (cache) => `
const CACHE = ${cache};
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "ancienne.js"]))));
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode === "navigate") { e.respondWith(caches.match("./")); return; }
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});`;
const ANCIENS_SW = {
  "/panier-temoin/": ancienSw('"workbox-precache-v2-" + self.registration.scope'),   // nom des caches Workbox
  "/minuterie/": ancienSw('"ma-journee-0123456789ab"'),
};
let enPasseur = false;

const ancien = http.createServer(async (req, res) => {
  const chemin = new URL(req.url, "http://x").pathname;
  const app = Object.keys(liste).find((p) => chemin.startsWith(p));
  if (!enPasseur && app) {
    const fichier = chemin.slice(app.length) || "index.html";
    const corps = { "index.html": ANCIENNE_PAGE, "ancienne.js": ANCIENNE_JS, "sw.js": ANCIENS_SW[app] }[fichier];
    if (corps === undefined) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[extname(fichier)] || TYPES[".html"], "Cache-Control": "no-cache" });
    res.end(corps);
    return;
  }
  if (Object.keys(liste).some((p) => chemin === p.slice(0, -1))) { res.writeHead(301, { Location: chemin + "/" }).end(); return; }
  let p = normalize(chemin.endsWith("/") ? chemin + "index.html" : chemin).replace(/^(\.\.[/\\])+/, "");
  try {
    let corps = await readFile(join(RACINE, p));
    if (app && p.endsWith("index.html")) corps = Buffer.from(corps.toString().replaceAll(liste[app], DESTINATION[app]));
    res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(corps);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => ancien.listen(0, r));
const ANCIENNE = `http://localhost:${ancien.address().port}`;

async function attendreAdresse(page, debut, delai = 15000) {
  const fin = Date.now() + delai;
  while (Date.now() < fin) {
    if (page.url().startsWith(debut)) { await page.waitForLoadState("load").catch(() => {}); return true; }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}
function enveloppe(url) {
  const m = /#\/demenagement\/([A-Za-z0-9_-]+)$/.exec(url);
  if (!m) return null;
  return JSON.parse(Buffer.from(m[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
}
// État de l'ancienne origine, lu depuis une ressource qui ne redirige pas.
async function etatAncien(contexte) {
  const p = await contexte.newPage();
  await p.goto(ANCIENNE + "/passeurs.json");
  const etat = await p.evaluate(async () => ({
    cles: Object.keys(localStorage).sort(),
    scopes: (await navigator.serviceWorker.getRegistrations()).map((r) => new URL(r.scope).pathname),
    caches: await caches.keys(),
  }));
  await p.close();
  return etat;
}

const navigateur = await chromium.launch();
const erreurs = [];
function surveiller(contexte) {
  contexte.on("page", (p) => {
    p.on("pageerror", (e) => erreurs.push(String(e)));
    p.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused/i.test(m.text())) erreurs.push(m.text()); });
  });
}

// 1. Les deux apps installées à l'ancienne adresse, avec leurs données et celles d'une voisine.
const contexte = await navigateur.newContext({ locale: "fr-CH" });
surveiller(contexte);
const panier = await contexte.newPage();
await panier.goto(ANCIENNE + "/panier-temoin/");
await panier.evaluate((ref) => {
  const p = "panier-temoin:";
  localStorage.setItem(p + "preferences", JSON.stringify({ aides: false, couleur: "rose" }));
  localStorage.setItem(p + "projet-claude", "https://claude.ai/project/00000000-0000-4000-8000-000000000000");
  localStorage.setItem(p + "synchro-file", JSON.stringify([{ table: "recettes", type: "upsert", id: "r-attente" }]));
  localStorage.setItem(p + "courses", "[]");
  localStorage.setItem(p + "recettes", JSON.stringify([{ id: "r-attente", titre: "En attente" }, { id: "r-base", titre: "Déjà dans la base" }]));
  localStorage.setItem(p + "synchro-initiale:compte", "2026-11-01T10:00:00Z");
  localStorage.setItem(p + "carte-cumulus", JSON.stringify({ numero: "2099999999993" }));
  localStorage.setItem(`sb-${ref}-auth-token`, '{"access_token":"jeton-factice"}');
  localStorage.setItem(`sb-${ref}-auth-token-code-verifier`, "verificateur-factice");
  localStorage.setItem("guitar:reglages", '{"voisine":true}');   // app voisine de l'origine
}, REF);
await panier.evaluate(() => navigator.serviceWorker.ready);
await panier.goto(ANCIENNE + "/panier-temoin/#/courses");
await panier.waitForFunction(() => !!navigator.serviceWorker.controller);

const journee = await contexte.newPage();
await journee.goto(ANCIENNE + "/minuterie/");
await journee.evaluate(() => {
  const s = { schemaVersion: 2, date: "2026-11-09", single: true, sort: "alpha", items: [
    { id: "a1", name: "Piano", type: "time", target: 1800, desc: "", acc: 600000, startedAt: null, notified: false },
    { id: "a2", name: "Courrier", type: "check", target: 1, desc: "", acc: 0, startedAt: null, notified: false },
  ] };
  localStorage.setItem("journee-timers-v1", JSON.stringify(s));
  localStorage.setItem("journee-timers-v1.avant-v2", '{"items":[]}');
});
await journee.evaluate(() => navigator.serviceWorker.ready);
await journee.reload();
await journee.waitForFunction(() => !!navigator.serviceWorker.controller);
await journee.evaluate(() => caches.open("guitar-precache").then((c) => c.put("/guitar/x", new Response("x"))));

const avant = await etatAncien(contexte);
ok(avant.scopes.includes("/panier-temoin/") && avant.scopes.includes("/minuterie/"), "ancienne adresse : les deux apps installées");

// 2. L'ancienne adresse sert ce dépôt. Panier Témoin vérifie la mise à jour de son service worker.
enPasseur = true;
await panier.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update())).catch(() => {});
ok(await attendreAdresse(panier, DESTINATION["/panier-temoin/"]), "Panier Témoin : fenêtre rechargée puis renvoyée vers la nouvelle adresse");
const envP = enveloppe(panier.url());
ok(envP && envP.format === "ecosysteme.export" && envP.app === "panier-temoin" && envP.appVersion === "passeur", "Panier Témoin : export au format commun dans le lien");
const clesP = envP ? envP.data.cles : {};
ok(JSON.parse(clesP.preferences || "{}").couleur === "rose" && clesP["projet-claude"] && clesP["synchro-file"], "Panier Témoin : réglages, projet Claude et changements en attente transmis");
ok(clesP.recettes && clesP.recettes.includes("r-attente") && !clesP.recettes.includes("r-base"), "Panier Témoin : seules les recettes en attente partent");
ok(!JSON.stringify(clesP).includes("2099999999993") && !JSON.stringify(clesP).includes("jeton-factice"), "Panier Témoin : ni carte Cumulus ni session dans le lien");
ok(journee.url() === ANCIENNE + "/minuterie/", "fenêtre de l'app voisine laissée en place");

let etat = await etatAncien(contexte);
ok(!etat.cles.some((c) => c.startsWith("panier-temoin:")), "Panier Témoin : données de l'app effacées de l'ancienne adresse");
ok(!etat.cles.some((c) => c.startsWith(`sb-${REF}-`)), "Panier Témoin : session Supabase effacée");
ok(etat.cles.includes("journee-timers-v1") && etat.cles.includes("guitar:reglages"), "données des apps voisines intactes");
ok(!etat.scopes.includes("/panier-temoin/") && etat.scopes.includes("/minuterie/"), "Panier Témoin : service worker désinscrit, celui de la voisine en place");
ok(!etat.caches.some((c) => c.includes("/panier-temoin/")) && etat.caches.includes("ma-journee-0123456789ab") && etat.caches.includes("guitar-precache"),
  "Panier Témoin : caches de l'app effacés, ceux des voisines intacts");

// 3. Ma journée vérifie à son tour la mise à jour de son service worker.
await journee.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update())).catch(() => {});
ok(await attendreAdresse(journee, DESTINATION["/minuterie/"]), "Ma journée : fenêtre rechargée puis renvoyée vers la nouvelle adresse");
const envJ = enveloppe(journee.url());
ok(envJ && envJ.app === "ma-journee" && envJ.schemaVersion === 2 && envJ.data.state.items.map((x) => x.name).join() === "Piano,Courrier",
  "Ma journée : activités transmises au format commun");
etat = await etatAncien(contexte);
ok(!etat.cles.some((c) => c.startsWith("journee-timers-v1")), "Ma journée : données et copie d'avant migration effacées");
ok(etat.cles.join() === "guitar:reglages", "seules restent les données de l'app voisine");
ok(etat.scopes.length === 0 && !etat.caches.some((c) => c.startsWith("ma-journee-")) && etat.caches.includes("guitar-precache"),
  "Ma journée : service worker désinscrit, caches de l'app effacés, cache voisin intact");

// 4. Lien de Claude à l'ancienne adresse : il suit tel quel ; session et carte effacées, réglages gardés.
const contexte2 = await navigateur.newContext({ locale: "fr-CH" });
surveiller(contexte2);
const prep = await contexte2.newPage();
await prep.goto(ANCIENNE + "/passeurs.json");
await prep.evaluate((ref) => {
  localStorage.setItem("panier-temoin:preferences", '{"couleur":"vert"}');
  localStorage.setItem("panier-temoin:carte-cumulus", '{"numero":"2099999999993"}');
  localStorage.setItem(`sb-${ref}-auth-token`, '{"access_token":"jeton-factice"}');
}, REF);
const lien = "#/courses/" + encodeURIComponent(JSON.stringify({ r: "Soupe test", p: 2, i: [["Légumes", "2 carottes"]] }));
const claude = await contexte2.newPage();
await claude.goto(ANCIENNE + "/panier-temoin/" + lien).catch(() => {});
ok(await attendreAdresse(claude, DESTINATION["/panier-temoin/"]) && new URL(claude.url()).hash === lien, "lien de recette : suivi tel quel vers la nouvelle adresse");
etat = await etatAncien(contexte2);
ok(etat.cles.join() === "panier-temoin:preferences", "lien de recette : session et carte effacées, réglages gardés pour un prochain passage");

// 5. Sans données : simple redirection, sans lien de déménagement.
const vierge = await navigateur.newContext();
surveiller(vierge);
for (const chemin of Object.keys(liste)) {
  const p = await vierge.newPage();
  await p.goto(ANCIENNE + chemin).catch(() => {});
  ok(await attendreAdresse(p, DESTINATION[chemin]) && new URL(p.url()).hash === "", `${chemin} sans données : redirection simple`);
}
// Ancienne adresse sans la barre oblique finale : redirigée comme par GitHub Pages, puis passée.
const sansBarre = await vierge.newPage();
await sansBarre.goto(ANCIENNE + "/minuterie").catch(() => {});
ok(await attendreAdresse(sansBarre, DESTINATION["/minuterie/"]), "/minuterie sans barre oblique : renvoyée aussi");

// 6. Ma journée, données illisibles : ni transfert ni effacement, message affiché.
const casse = await navigateur.newContext();
surveiller(casse);
const p6 = await casse.newPage();
await p6.goto(ANCIENNE + "/passeurs.json");
await p6.evaluate(() => localStorage.setItem("journee-timers-v1", "{illisible"));
await p6.goto(ANCIENNE + "/minuterie/");
await p6.waitForTimeout(800);
ok(p6.url() === ANCIENNE + "/minuterie/" && (await p6.textContent("#etat")).includes("n'ont pas pu être lues"), "Ma journée, données illisibles : message affiché, pas de redirection");
ok((await p6.evaluate(() => localStorage.getItem("journee-timers-v1"))) === "{illisible", "Ma journée, données illisibles : rien d'effacé");

ok(erreurs.length === 0, "aucune erreur de page ni violation de CSP" + (erreurs.length ? ` : ${erreurs.join(" | ")}` : ""));
await navigateur.close();
ancien.close(); neuf.close();
console.log(echecs ? `\n${echecs} échec(s)` : "\nPasseurs vérifiés.");
process.exit(echecs ? 1 : 0);
