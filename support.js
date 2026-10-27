const V='eduvos-v1';
const CORE=['app.html','app.css','app.js','manifest.webmanifest','support.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
    if(res.ok&&new URL(e.request.url).origin===location.origin){const c=res.clone();caches.open(V).then(ch=>ch.put(e.request,c));}
    return res;
  }).catch(()=>caches.match('app.html'))));
});
