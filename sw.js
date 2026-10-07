const CACHE="doodhwala-v2";
const ASSETS=["./","./index.html","./auth.html","./checkout.html","./provider.html","./styles.css","./auth.css","./checkout.css","./provider.css","./app.js","./auth.js","./checkout.js","./provider.js","./supabase-config.js","./supabase-client.js","./assets/logo.svg","./manifest.webmanifest"];
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
     if(event.request.mode==="navigate")return caches.match("./index.html");
     return Response.error();
   });
 }));
});