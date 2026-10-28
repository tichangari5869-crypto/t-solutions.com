"use strict";
// T Solutions server. No dependencies. Node 18+.
const http=require("http"),fs=require("fs"),path=require("path"),crypto=require("crypto"),zlib=require("zlib");
const PROD=process.env.NODE_ENV==="production",PORT=+process.env.PORT||3000,PUB=path.join(__dirname,"public"),DATA=path.join(__dirname,"data");
const EMAIL=(process.env.ADMIN_EMAIL||"").toLowerCase(),HASH=process.env.ADMIN_PASS_HASH||"",SECRET=process.env.SESSION_SECRET||"",SITE=process.env.SITE_URL||"";
if(PROD&&(!EMAIL||!HASH||SECRET.length<32||!/^https:\/\//.test(SITE))){console.error("Production needs ADMIN_EMAIL, ADMIN_PASS_HASH, SESSION_SECRET (32+ chars) and SITE_URL (https://...). See .env.example");process.exit(1)}
const KEY=SECRET||crypto.randomBytes(32).toString("hex");
fs.mkdirSync(DATA,{recursive:true});const UP=path.join(DATA,"uploads");fs.mkdirSync(UP,{recursive:true});const SF=path.join(DATA,"services.json"),OF=path.join(DATA,"orders.json");
if(!fs.existsSync(SF))fs.copyFileSync(path.join(__dirname,"seed","services.json"),SF);if(!fs.existsSync(OF))fs.writeFileSync(OF,"[]");
const rd=f=>JSON.parse(fs.readFileSync(f,"utf8")),wr=(f,d)=>{const t=f+".tmp";fs.writeFileSync(t,JSON.stringify(d));fs.renameSync(t,f)};
const HDR={"X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"strict-origin-when-cross-origin","Permissions-Policy":"camera=(),microphone=(),geolocation=(),payment=()","Cross-Origin-Opener-Policy":"same-origin","Cross-Origin-Resource-Policy":"same-origin",
"Content-Security-Policy":"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"+(PROD?"; upgrade-insecure-requests":"")};
if(PROD)HDR["Strict-Transport-Security"]="max-age=31536000; includeSubDomains";
const MIME={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json",".svg":"image/svg+xml",".png":"image/png",".txt":"text/plain; charset=utf-8",".xml":"application/xml"};
// rate limiting (per IP, in memory)
const HITS=new Map();function limited(k,max,ms){const n=Date.now(),a=(HITS.get(k)||[]).filter(t=>n-t<ms);a.push(n);HITS.set(k,a);return a.length>max}
setInterval(()=>{const n=Date.now();for(const[k,a]of HITS)if(!a.some(t=>n-t<3600e3))HITS.delete(k)},600e3).unref();
const ip=r=>(process.env.TRUST_PROXY==="1"?(r.headers["x-forwarded-for"]||"").split(",").pop().trim():"")||r.socket.remoteAddress||"?";
// sessions: signed token, HttpOnly cookie
const sign=s=>crypto.createHmac("sha256",KEY).update(s).digest("base64url");
function mk(){const p=Buffer.from(JSON.stringify({exp:Date.now()+2*3600e3,csrf:crypto.randomBytes(24).toString("base64url")})).toString("base64url");return p+"."+sign(p)}
function sess(r){const m=/(?:^|;\s*)ts_s=([\w.-]+)/.exec(r.headers.cookie||"");if(!m)return null;const[p,s]=m[1].split(".");if(!p||!s)return null;const a=Buffer.from(sign(p)),b=Buffer.from(s);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;try{const o=JSON.parse(Buffer.from(p,"base64url"));return o.exp>Date.now()?o:null}catch{return null}}
const ck=(v,age)=>`ts_s=${v}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${PROD?"; Secure":""}`;
function pass(p){if(!HASH)return false;const[s,h]=HASH.split(":");try{const x=crypto.scryptSync(String(p),Buffer.from(s,"hex"),64),y=Buffer.from(h,"hex");return x.length===y.length&&crypto.timingSafeEqual(x,y)}catch{return false}}
// input cleaning
const clean=(v,n)=>String(v??"").replace(/[\u0000-\u001f\u007f<>]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const send=(res,c,o,h={})=>{const b=JSON.stringify(o);res.writeHead(c,{...HDR,"Content-Type":"application/json","Cache-Control":"no-store",...h});res.end(b)};
function body(req){return new Promise((ok,no)=>{let n=0,c=[];req.on("data",d=>{n+=d.length;if(n>40e3){no(new Error("Too large"));req.destroy()}else c.push(d)});req.on("end",()=>{try{ok(JSON.parse(Buffer.concat(c).toString()||"{}"))}catch{no(new Error("Bad JSON"))}});req.on("error",no)})}
function sameOrigin(req){const o=req.headers.origin;if(!o)return true;try{return new URL(o).host===req.headers.host}catch{return false}}
function raw(req,max){return new Promise((ok,no)=>{let n=0,c=[];req.on("data",d=>{n+=d.length;if(n>max){no(new Error("Too large"));req.destroy()}else c.push(d)});req.on("end",()=>ok(Buffer.concat(c)));req.on("error",no)})}
function cleanup(v){const used=new Set();v.cats.forEach(c=>c.items.forEach(x=>x.img&&used.add(x.img)));for(const f of fs.readdirSync(UP)){try{const p=path.join(UP,f);if(!used.has(f)&&Date.now()-fs.statSync(p).mtimeMs>3600e3)fs.unlinkSync(p)}catch{}}}
function upl(req,res,u){const m=/^\/uploads\/([a-f0-9]{24}\.(jpg|png|webp))$/.exec(u.pathname),f=m&&path.join(UP,m[1]);if(!m||!fs.existsSync(f)){res.writeHead(404,HDR);return res.end()}const t={jpg:"image/jpeg",png:"image/png",webp:"image/webp"}[m[2]];res.writeHead(200,{...HDR,"Content-Type":t,"Cache-Control":"public, max-age=31536000, immutable","Content-Security-Policy":"default-src 'none'"});res.end(req.method==="HEAD"?undefined:fs.readFileSync(f))}
const STAT=["Received","In progress","Ready","Sent","Delivered","Paid"];
function validServices(d){if(!d||typeof d!=="object"||!d.cfg||!Array.isArray(d.cats)||d.cats.length>20)return null;const cfg={wa:clean(d.cfg.wa,15),mp:clean(d.cfg.mp,15),fee:Math.min(100000,Math.max(0,Math.floor(+d.cfg.fee)||0))};
if(!/^254\d{9}$/.test(cfg.wa)||!/^0?\d{9,12}$/.test(cfg.mp))return null;const ids=new Set(),cats=[];
for(const c of d.cats){if(!Array.isArray(c.items)||c.items.length>100||!clean(c.n,80))return null;const items=[];for(const x of c.items){const id=clean(x.id,80);if(!/^[a-z0-9-]+$/.test(id)||ids.has(id))return null;ids.add(id);const lo=Math.floor(+x.lo),hi=Math.floor(+x.hi);if(!(lo>=0&&hi>=lo&&hi<=1e6))return null;
const nn=clean(x.n,120);if(!nn)return null;let img="",alt="";if(x.img){img=String(x.img);alt=clean(x.alt,150);if(!/^[a-f0-9]{24}\.(jpg|png|webp)$/.test(img)||!fs.existsSync(path.join(UP,img))||!alt)return null}
items.push({id,img,alt,n:nn,lo,hi,per:x.per?1:0,min:Math.min(9999,Math.max(1,Math.floor(+x.min)||1)),t:clean(x.t,100),d:clean(x.d,200),b:(Array.isArray(x.b)?x.b:[]).slice(0,12).map(s=>clean(s,150)),ask:(Array.isArray(x.ask)?x.ask:[]).slice(0,8).map(s=>clean(s,60))})}cats.push({n:clean(c.n,80),items})}
return{cfg,cats}}
async function api(req,res,u){
  if(u.pathname==="/api/admin/upload"&&req.method==="POST"){const s0=sess(req);if(!sameOrigin(req))return send(res,403,{error:"Blocked"});if(!s0)return send(res,401,{error:"Please log in"});if(req.headers["x-csrf-token"]!==s0.csrf)return send(res,403,{error:"Bad token"});if(limited("u"+ip(req),40,3600e3))return send(res,429,{error:"Too many uploads"});
    const b=await raw(req,2e6),k=b.length>12&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff?"jpg":b.length>12&&b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))?"png":b.length>12&&b.subarray(0,4).toString()==="RIFF"&&b.subarray(8,12).toString()==="WEBP"?"webp":"";
    if(!k)return send(res,400,{error:"Only JPG, PNG or WebP pictures"});if(fs.readdirSync(UP).length>300)return send(res,400,{error:"Too many pictures saved"});const name=crypto.randomBytes(12).toString("hex")+"."+k;fs.writeFileSync(path.join(UP,name),b,{flag:"wx"});return send(res,201,{img:name})}
  if(req.method!=="GET"&&!sameOrigin(req))return send(res,403,{error:"Blocked"});
  if(req.method!=="GET"&&!/^application\/json/.test(req.headers["content-type"]||""))return send(res,415,{error:"JSON only"});
  const s=sess(req),admin=()=>{if(!s){send(res,401,{error:"Please log in"});return false}if(req.method!=="GET"&&req.headers["x-csrf-token"]!==s.csrf){send(res,403,{error:"Bad token"});return false}return true};
  const r=u.pathname;
  if(r==="/api/orders"&&req.method==="POST"){if(limited("o"+ip(req),10,3600e3))return send(res,429,{error:"Too many orders. Try later."});const b=await body(req),sv=rd(SF),items=[];let lo=0,hi=0;
    for(const i of(Array.isArray(b.items)?b.items.slice(0,40):[])){let f;for(const c of sv.cats)for(const x of c.items)if(x.id===i.id)f=x;const q=Math.floor(+i.qty);if(!f||!(q>=f.min&&q<=9999))return send(res,400,{error:"Invalid item"});items.push({id:f.id,qty:q});lo+=f.lo*q;hi+=f.hi*q}
    const phone=String(b.phone||"").replace(/[\s-]/g,"");if(!items.length||!/^(?:\+?254|0)[17]\d{8}$/.test(phone)||!clean(b.name,80))return send(res,400,{error:"Check name, phone and items"});
    const code=/^TS-[A-Z2-9]{4}$/.test(b.code)?b.code:"TS-"+crypto.randomBytes(3).toString("hex").toUpperCase();const o=rd(OF);if(o.length>5000)o.shift();
    o.push({code,name:clean(b.name,80),phone,channel:["WhatsApp","Email","Delivery"].includes(b.channel)?b.channel:"WhatsApp",location:clean(b.location,120),items,estimate_lo:lo,estimate_hi:hi,status:"Received",at:new Date().toISOString()});wr(OF,o);return send(res,201,{code})}
  if(r==="/api/login"&&req.method==="POST"){if(limited("l"+ip(req),5,15*60e3))return send(res,429,{error:"Too many attempts. Wait 15 minutes."});const b=await body(req);
    if(EMAIL&&clean(b.email,120).toLowerCase()===EMAIL&&pass(b.password)){const t=mk(),o=JSON.parse(Buffer.from(t.split(".")[0],"base64url"));return send(res,200,{csrf:o.csrf},{"Set-Cookie":ck(t,7200)})}return send(res,401,{error:"Wrong email or password"})}
  if(r==="/api/logout"&&req.method==="POST")return send(res,200,{ok:1},{"Set-Cookie":ck("",0)});
  if(r==="/api/me")return s?send(res,200,{csrf:s.csrf}):send(res,401,{error:"No session"});
  if(r==="/api/admin/data"&&req.method==="GET"){if(!admin())return;return send(res,200,{services:rd(SF),orders:rd(OF).slice(-200).reverse()})}
  if(r==="/api/admin/services"&&req.method==="PUT"){if(!admin())return;const v=validServices(await body(req));if(!v)return send(res,400,{error:"Invalid data. Check prices and numbers."});try{fs.copyFileSync(SF,SF+".bak")}catch{}wr(SF,v);cleanup(v);return send(res,200,{ok:1})}
  const m=/^\/api\/admin\/orders\/(TS-[A-Z0-9]{4,6})$/.exec(r);if(m&&req.method==="PATCH"){if(!admin())return;const b=await body(req),o=rd(OF),x=o.find(z=>z.code===m[1]);if(!x||!STAT.includes(b.status))return send(res,400,{error:"Invalid"});x.status=b.status;wr(OF,o);return send(res,200,{ok:1})}
  send(res,404,{error:"Not found"})}
function file(req,res,u){let p;try{p=decodeURIComponent(u.pathname)}catch{p="/404"}if(p==="/")p="/index.html";if(p.includes("\0"))p="/404";
  let f=path.normalize(path.join(PUB,p));let code=200;if(!f.startsWith(PUB+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()||p==="/services.json"&&false){f=path.join(PUB,"404.html");code=404}
  const ext=path.extname(f);let buf=fs.readFileSync(f);
  if(path.basename(f)==="index.html"){try{const j=JSON.stringify(rd(SF)).replace(/</g,"\\u003c");buf=Buffer.from(buf.toString().replace(/(<script type="application\/json" id="svc">)[\s\S]*?(<\/script>)/,(_,a,b)=>a+j+b))}catch{}}
  const h={...HDR,"Content-Type":MIME[ext]||"application/octet-stream","Cache-Control":ext===".html"||ext===".json"?"no-cache":"public, max-age=86400"};
  if(/\.(html|css|js|svg|json|txt|xml)$/.test(f)&&/\bgzip\b/.test(req.headers["accept-encoding"]||"")){buf=zlib.gzipSync(buf);h["Content-Encoding"]="gzip";h.Vary="Accept-Encoding"}
  res.writeHead(code,h);res.end(req.method==="HEAD"?undefined:buf)}
http.createServer(async(req,res)=>{try{
  if(PROD&&process.env.TRUST_PROXY==="1"&&req.headers["x-forwarded-proto"]==="http"){res.writeHead(301,{Location:SITE+req.url});return res.end()}
  if(limited("g"+ip(req),300,60e3)){res.writeHead(429,HDR);return res.end("Too many requests")}
  const u=new URL(req.url,"http://x");
  if(u.pathname.startsWith("/api/"))return await api(req,res,u);
  if(!["GET","HEAD"].includes(req.method)){res.writeHead(405,HDR);return res.end()}
  if(u.pathname.startsWith("/uploads/"))return upl(req,res,u);
  file(req,res,u)}catch(e){if(!PROD)console.error(e);if(!res.headersSent)send(res,e.message==="Too large"?413:500,{error:e.message==="Too large"?"Too large":"Something went wrong"})}}).listen(PORT,()=>console.log("T Solutions on port "+PORT+(PROD?" (production)":" (development, admin login disabled until ADMIN_EMAIL and ADMIN_PASS_HASH are set)")));
