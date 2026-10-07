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

const htmlFiles=[...localFiles].filter(x=>x.endsWith(".html"));
const errors=[];
const refs=[];
const refRe=/(?:src|href)=["']([^"']+)["']/gi;

for(const file of htmlFiles){
  const text=fs.readFileSync(path.join(root,file.slice(1)),"utf8");
  let m;
  while((m=refRe.exec(text))){
    const ref=m[1];
    if(!ref.startsWith("/")||ref.startsWith("//")||ref.startsWith("http://")||ref.startsWith("https://")||ref.startsWith("#")) continue;
    const clean=ref.split(/[?#]/)[0];
    refs.push([file,clean]);
    if(!localFiles.has(clean)) errors.push(file+" -> missing "+clean);
  }
}

const swPath="/sw.js";
if(localFiles.has(swPath)){
  const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");
  const match=sw.match(/const ASSETS=\[(.*?)\];/s);
  if(!match) errors.push("sw.js -> ASSETS list not found");
  else{
    const assets=[...match[1].matchAll(/["']([^"']+)["']/g)].map(x=>x[1]);
    for(const asset of assets) if(!localFiles.has(asset)) errors.push("sw.js -> cached asset missing "+asset);
  }
}

for(const file of ["/app.js","/auth.js","/checkout.js","/provider.js","/orders.js","/plans.js","/admin.js","/store.js","/product.js","/customer-nav.js","/location.js","/provider-location.js","/supabase-client.js","/supabase-config.js","/sw.js"]){
  if(localFiles.has(file)){
    // Syntax validation is handled by node --check in the workflow.
  } else errors.push("required runtime file missing "+file);
}

if(errors.length){
  console.error("Doodhwala site contract validation failed:");
  for(const e of errors) console.error(" - "+e);
  process.exit(1);
}
console.log("Doodhwala site contract validation passed: "+htmlFiles.length+" HTML files, "+refs.length+" local asset references checked.");
