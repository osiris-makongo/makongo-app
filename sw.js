// L'appli s'ouvre même sans réseau : ses fichiers sont gardés ici. Le modèle du téléphone est
// gardé à part par WebLLM (Cache Storage). Aucune réponse du PC n'est mise en cache.
const VERSION = "makongo-mobile-v1";
const FICHIERS = ["./", "index.html", "app.js", "style.css", "web-llm.js", "manifest.webmanifest", "icone-192.png",
  "icone-512.png", "polices/chakra-petch-latin-400.woff2", "polices/chakra-petch-latin-600.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((cles) => Promise.all(
    cles.filter((c) => c.startsWith("makongo-mobile-") && c !== VERSION).map((c) => caches.delete(c)),
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;  // PC et modèle : jamais ici
  e.respondWith(fetch(e.request).then((r) => {
    const copie = r.clone();
    caches.open(VERSION).then((c) => c.put(e.request, copie));
    return r;
  }).catch(() => caches.match(e.request)));
});
