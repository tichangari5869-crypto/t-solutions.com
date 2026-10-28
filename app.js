"use strict";
(function(){
var S=JSON.parse(document.getElementById("svc").textContent),$=function(s){return document.querySelector(s)},slip={};
var fmt=function(n){return Number(n).toLocaleString("en-KE")};
function price(x){var p=x.lo===x.hi?"KES "+fmt(x.lo):"KES "+fmt(x.lo)+" to "+fmt(x.hi);return p+(x.per?" per page":"")}
function el(t,txt,cls){var e=document.createElement(t);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e}
function find(id){for(var c of S.cats)for(var x of c.items)if(x.id===id)return x}
function list(){var q=$("#q").value.toLowerCase().trim(),box=$("#list");box.textContent="";var any=false;
S.cats.forEach(function(c,ci){var its=c.items.filter(function(x){return!q||(x.n+" "+c.n).toLowerCase().indexOf(q)>-1});if(!its.length)return;any=true;
var sec=el("section");sec.setAttribute("aria-labelledby","c"+ci);var h=el("h2",c.n);h.id="c"+ci;if(ci===0)box.id="services";sec.appendChild(h);
its.forEach(function(x){var d=el("details");if(q&&its.length===1)d.open=true;var s=el("summary");s.appendChild(el("span",x.n));s.appendChild(el("span",price(x),"pr"));d.appendChild(s);
var i=el("div",undefined,"in"),dl=el("dl");if(x.img&&/^[a-f0-9]{24}\.(jpg|png|webp)$/.test(x.img)){var im=el("img");im.src="/uploads/"+x.img;im.alt=x.alt||"";im.loading="lazy";im.decoding="async";im.className="pic";i.appendChild(im)}[["Time",x.t],["Delivery",x.d]].forEach(function(r){dl.appendChild(el("dt",r[0]));dl.appendChild(el("dd",r[1]))});
if(x.min>1){dl.appendChild(el("dt","Minimum"));dl.appendChild(el("dd",x.min+" items"))}i.appendChild(dl);
i.appendChild(el("p","What to bring",""));i.lastChild.style.fontWeight="700";var ul=el("ul");(x.b||[]).forEach(function(b){ul.appendChild(el("li",b))});i.appendChild(ul);
var lab=el("label",x.per?"Number of pages":"Quantity");var id="n-"+x.id;lab.htmlFor=id;var inp=el("input");inp.type="number";inp.id=id;inp.min=x.min||1;inp.max=9999;inp.value=slip[x.id]||x.min||1;inp.style.maxWidth="120px";
var b=el("button",slip[x.id]?"Update order":"Add to order","btn");b.type="button";b.onclick=function(){var n=Math.floor(+inp.value);if(!(n>=(x.min||1))||n>9999){inp.value=x.min||1;n=x.min||1}slip[x.id]=n;b.textContent="Update order";render();$("#order").scrollIntoView()};
i.appendChild(lab);i.appendChild(inp);i.appendChild(document.createTextNode(" "));i.appendChild(b);d.appendChild(i);sec.appendChild(d)});box.appendChild(sec)});
if(!any)box.appendChild(el("p","Nothing matches. Try another word, or ask us on WhatsApp."))}
function total(){var lo=0,hi=0;for(var k in slip){var x=find(k);if(x){lo+=x.lo*slip[k];hi+=x.hi*slip[k]}}return[lo,hi]}
function render(){var L=$("#lines");L.textContent="";var ks=Object.keys(slip);if(!ks.length){L.appendChild(el("p","Nothing added yet. Open a service and choose Add to order.","note"));$("#tot").textContent="";$("#form").hidden=true;return}
ks.forEach(function(k){var x=find(k),r=el("div",undefined,"ln");r.appendChild(el("span",x.n+" x "+slip[k]));var b=el("button","Remove","btn alt");b.type="button";b.setAttribute("aria-label","Remove "+x.n);b.onclick=function(){delete slip[k];render();list()};r.appendChild(b);L.appendChild(r)});
var t=total();$("#tot").textContent="Estimate: "+(t[0]===t[1]?"KES "+fmt(t[0]):"KES "+fmt(t[0])+" to "+fmt(t[1]))+(+S.cfg.fee&&$("#ch").value==="Delivery"?" plus delivery KES "+fmt(S.cfg.fee):"");$("#form").hidden=false}
function phone(v){var s=v.replace(/[\s-]/g,"");return/^(?:\+?254|0)[17]\d{8}$/.test(s)}
$("#q").addEventListener("input",list);$("#ch").addEventListener("change",function(){$("#emw").hidden=this.value!=="Email";$("#lcw").hidden=this.value!=="Delivery";render()});
$("#send").addEventListener("click",function(){var err=$("#err");err.textContent="";var n=$("#nm").value.trim(),p=$("#ph").value.trim(),ch=$("#ch").value;
if(!n)return err.textContent="Please enter your name.";if(!phone(p))return err.textContent="Enter a valid Kenyan phone number, like 0712 345 678.";
if(ch==="Email"&&!/^\S+@\S+\.\S+$/.test($("#em").value))return err.textContent="Enter a valid email address.";
var code="TS-"+Array.from(crypto.getRandomValues(new Uint8Array(4))).map(function(b){return"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b%32]}).join("");
var m="Hello T Solutions, I need:\n"+Object.keys(slip).map(function(k){var x=find(k);return"- "+x.n+" x "+slip[k]+" ("+price(x)+")"}).join("\n")+"\nName: "+n+"\nPhone: "+p+"\nOrder code: "+code+"\nSend my work by: "+ch+(ch==="Email"?" ("+$("#em").value+")":ch==="Delivery"?" to "+($("#lc").value||"(I will tell you)"):"")+"\nI will pay after I receive my work.";
try{fetch("/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:code,name:n,phone:p,channel:ch,location:$("#lc").value,items:Object.keys(slip).map(function(k){return{id:k,qty:slip[k]}})})}).catch(function(){})}catch(e){}
window.open("https://wa.me/"+S.cfg.wa+"?text="+encodeURIComponent(m),"_blank","noopener")});
list();render();
})();
