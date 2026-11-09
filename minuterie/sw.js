// Service worker d'autodestruction de l'ancienne adresse (ECOSYSTEME.md §7.4).
// Il remplace celui de l'app installée : à la prochaine vérification de mise à jour du navigateur,
// il s'active aussitôt, efface les caches de Ma journée (et seulement eux : l'origine est partagée),
// se désinscrit et recharge les fenêtres ouvertes, qui tombent alors sur le passeur.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const cles = await caches.keys();
    await Promise.all(cles.filter((c) => c.startsWith("ma-journee-")).map((c) => caches.delete(c)));
    await self.registration.unregister();
    const fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.all(fenetres.map((f) => f.navigate(f.url).catch(() => undefined)));
  })());
});
