const CACHE="doodhwala-v5";
const ASSETS=["/Dudh-Wallah/","/Dudh-Wallah/index.html","/Dudh-Wallah/auth.html","/Dudh-Wallah/checkout.html","/Dudh-Wallah/provider.html","/Dudh-Wallah/orders.html","/Dudh-Wallah/styles.css","/Dudh-Wallah/auth.css","/Dudh-Wallah/checkout.css","/Dudh-Wallah/provider.css","/Dudh-Wallah/app.js","/Dudh-Wallah/auth.js","/Dudh-Wallah/checkout.js","/Dudh-Wallah/provider.js","/Dudh-Wallah/orders.css","/Dudh-Wallah/orders.js","/Dudh-Wallah/plans.html","/Dudh-Wallah/plans.css","/Dudh-Wallah/plans.js","/Dudh-Wallah/supabase-config.js","/Dudh-Wallah/supabase-client.js","/Dudh-Wallah/assets/logo.svg","/Dudh-Wallah/manifest.webmanifest"];
self.addEventListener("install",function(event){event.waitUntil(caches.open(CACHE).then(function(cache){return cache.addAll(ASSETS)}).then(function(){return self.skipWaiting()}))});
self.addEventListener("activate",function(event){event.waitUntil(caches.keys().then(function(keys){return Promise.all(keys.filter(function(key){return key!==CACHE}).map(function(key){return caches.delete(key)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener("fetch",function(event){
 if(event.request.method!=="GET")return;
 const requestUrl=new URL(event.request.url);
 if(requestUrl.origin!==self.location.origin)return;
 event.respondWith(caches.match(event.request).then(function(cached){
   if(cached)return cached;
   return fetch(event.request).then(function(response){
     if(response.ok){const copy=response.clone();caches.open(CACHE).then(function(cache){return cache.put(event.request,copy)}).catch(function(){})}
     return response;
   }).catch(function(){
     if(event.request.mode==="navigate")return caches.match("/Dudh-Wallah/index.html");
     return Response.error();
   });
 }));
});