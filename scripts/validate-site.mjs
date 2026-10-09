import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const localFiles=new Set();
function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.name==="."||entry.name===".."||entry.name===".git") continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) walk(full);
    else localFiles.add("/"+path.relative(root,full).replaceAll(path.sep,"/"));
  }
}
walk(root);

function resolveSitePath(urlPath){
  const clean=urlPath.split(/[?#]/)[0];
  if(clean==="/Dudh-Wallah/"||clean==="/Dudh-Wallah") return "/index.html";
  if(clean.startsWith("/Dudh-Wallah/")) return clean.slice("/Dudh-Wallah".length);
  return clean;
}

const htmlFiles=[...localFiles].filter(x=>x.endsWith(".html"));
const errors=[];
let refs=0;
const refRe=/(?:src|href)=["']([^"']+)["']/gi;

for(const file of htmlFiles){
  const text=fs.readFileSync(path.join(root,file.slice(1)),"utf8");
  let m;
  while((m=refRe.exec(text))){
    const ref=m[1];
    if(!ref.startsWith("/")||ref.startsWith("//")||ref.startsWith("http://")||ref.startsWith("https://")||ref.startsWith("#")) continue;
    refs++;
    const resolved=resolveSitePath(ref);
    if(!localFiles.has(resolved)) errors.push(file+" -> missing "+ref);
  }
}

if(localFiles.has("/sw.js")){
  const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");
  const match=sw.match(/const ASSETS=\[(.*?)\];/s);
  if(!match) errors.push("sw.js -> ASSETS list not found");
  else{
    const assets=[...match[1].matchAll(/["']([^"']+)["']/g)].map(x=>x[1]);
    for(const asset of assets){
      const resolved=resolveSitePath(asset);
      if(!localFiles.has(resolved)) errors.push("sw.js -> cached asset missing "+asset);
    }
  }
}else errors.push("required runtime file missing /sw.js");

for(const file of ["/app.js","/auth.js","/checkout.js","/provider.js","/orders.js","/plans.js","/admin.js","/store.js","/product.js","/customer-nav.js","/location.js","/provider-location.js","/supabase-client.js","/supabase-config.js"]){
  if(!localFiles.has(file)) errors.push("required runtime file missing "+file);
}


const providerJsPath=path.join(root,"provider.js");
if(fs.existsSync(providerJsPath)){
  const providerJs=fs.readFileSync(providerJsPath,"utf8");
  for(const contract of [
    "provider_get_dashboard",
    "provider_set_store_status",
    "provider_upsert_product",
    "provider_delete_product",
    "provider_get_subscriptions",
    "setupProviderOrderRealtime",
    "setupProviderSubscriptionRealtime",
    "acceptance_window_expired"
  ]) if(!providerJs.includes(contract)) errors.push("provider.js -> missing Phase 2 contract "+contract);
}
const providerHtmlPath=path.join(root,"provider.html");
if(fs.existsSync(providerHtmlPath)){
  const providerHtml=fs.readFileSync(providerHtmlPath,"utf8");
  if(!providerHtml.includes('data-view="subscriptions"')) errors.push("provider.html -> subscriptions navigation missing");
  if(!providerHtml.includes('id="view-subscriptions"')) errors.push("provider.html -> subscriptions view missing");
  if(!providerHtml.includes("provider.js?v=")) errors.push("provider.html -> provider bundle cache bust missing");
}
if(localFiles.has("/sw.js")){
  const swText=fs.readFileSync(path.join(root,"sw.js"),"utf8");
  if(!swText.includes("/Dudh-Wallah/provider.js?v=")) errors.push("sw.js -> versioned provider bundle missing from cache assets");
}

const provider10xPath=path.join(root,"provider-10x.js");
if(fs.existsSync(provider10xPath)){
  const provider10x=fs.readFileSync(provider10xPath,"utf8");
  for(const contract of [
    "milkCommittedToday",
    "milkDeliveredToday",
    "if(error)throw error;",
    'data-shop-action="${esc(a.action)}"'
  ]) if(!provider10x.includes(contract)) errors.push("provider-10x.js -> missing reliability contract "+contract);
}
const customer10xPath=path.join(root,"customer-10x.js");
if(fs.existsSync(customer10xPath)){
  const customer10x=fs.readFileSync(customer10xPath,"utf8");
  for(const contract of ["milk_products","daily_available","unavailable item(s) skipped"]) if(!customer10x.includes(contract)) errors.push("customer-10x.js -> missing reorder safety contract "+contract);
}
const adminIntelPath=path.join(root,"admin-intelligence.js");
if(fs.existsSync(adminIntelPath)){
  const adminIntel=fs.readFileSync(adminIntelPath,"utf8");
  if(!adminIntel.includes("Latest seven dates in the selected overview range")) errors.push("admin-intelligence.js -> GMV range label must match selected range");
  if(!adminIntel.includes("loaded admin index")) errors.push("admin-intelligence.js -> bounded customer index must be disclosed");
}
if(errors.length){
  console.error("Doodhwala site contract validation failed:");
  for(const e of errors) console.error(" - "+e);
  process.exit(1);
}
console.log("Doodhwala site contract validation passed: "+htmlFiles.length+" HTML files, "+refs+" local asset references checked.");
