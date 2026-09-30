// Keeps the app usable on courses with weak or no signal.
// The page itself: network first (so updates show up), the saved copy when the network is slow or gone.
// Libraries, fonts, map photos, elevation tiles: saved on first use, then served from the phone.
const VERSION = "golf-v5-20260930";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
const RUNTIME = "golf-runtime-1";
const TILES = "golf-tiles-1";
const TILE_MAX = 500;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {}))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith("golf-v") && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const isTile = u => /(^|\.)arcgisonline\.com$|(^|\.)cyberjapandata\.gsi\.go\.jp$/.test(u.hostname);
const isLib = u => /(^|\.)(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|storage\.googleapis\.com)$/.test(u.hostname);
async function trim(name, max){
  const c = await caches.open(name), ks = await c.keys();
  for(let i = 0; i < ks.length - max; i++) await c.delete(ks[i]);
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET") return;
  const u = new URL(req.url);
  if(req.mode === "navigate"){
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const net = fetch(req).then(res => { if(res.ok) cache.put("./index.html", res.clone()).catch(() => {}); return res; });
      try{
        return await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), 4000))]);
      }catch(err){
        return (await cache.match("./index.html")) || (await cache.match("./")) || net;
      }
    })());
    return;
  }
  if(isLib(u) || isTile(u)){
    const name = isTile(u) ? TILES : RUNTIME;
    e.respondWith(caches.open(name).then(async c => {
      const hit = await c.match(req);
      if(hit) return hit;
      const res = await fetch(req);
      if(res && (res.ok || res.type === "opaque")) c.put(req, res.clone()).then(() => name === TILES ? trim(TILES, TILE_MAX) : 0).catch(() => {});
      return res;
    }));
    return;
  }
  if(u.origin === self.location.origin){
    e.respondWith(caches.open(VERSION).then(async c => {
      try{ const res = await fetch(req); if(res.ok) c.put(req, res.clone()).catch(() => {}); return res; }
      catch(err){ const hit = await c.match(req, { ignoreSearch: true }); if(hit) return hit; throw err; }
    }));
  }
});
