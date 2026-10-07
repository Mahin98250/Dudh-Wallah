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

if(errors.length){
  console.error("Doodhwala site contract validation failed:");
  for(const e of errors) console.error(" - "+e);
  process.exit(1);
}
console.log("Doodhwala site contract validation passed: "+htmlFiles.length+" HTML files, "+refs+" local asset references checked.");
