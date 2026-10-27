'use strict';
/* ===== DATA (from the project's real photospheres & aerial map) =====
   x/y are pixel positions on assets/map.webp (1042x748). The courtyard position comes from
   the original nodemap.json; the other two are estimates - adjust them to match reality.
   yaw = degrees to rotate the photo so its centre points north. */
const METERS_PER_PX = 0.25, WALK_MPS = 1.3;
const nodes = [
  {id:'courtyard',name:'Central Courtyard',cat:'Outdoors',icon:'🏛️',desc:'Paved courtyard between the curved campus buildings.',x:486,y:313,yaw:0,links:['lawn','path']},
  {id:'lawn',name:'Open Lawn',cat:'Outdoors',icon:'🌿',desc:'Large grassy area with shade sails and trees.',x:520,y:440,yaw:0,links:['courtyard','path']},
  {id:'path',name:'Brick Path',cat:'Outdoors',icon:'🚶',desc:'Brick-paved walkway running between lawns and buildings.',x:600,y:510,yaw:0,links:['courtyard','lawn']}
];
const byId=Object.fromEntries(nodes.map(n=>[n.id,n]));
const $=id=>document.getElementById(id);
let cur='courtyard',routeIds=[],routeIdx=-1,auto=false;
const rad=d=>d*Math.PI/180;

/* ===== WEBGL EQUIRECTANGULAR VIEWER (no dependencies) ===== */
const cv=$('gl');
const gl=cv.getContext('webgl',{antialias:false,alpha:false});
const VS='attribute vec2 p;varying vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}';
const FS=`precision highp float;varying vec2 v;uniform sampler2D t;uniform float yaw,pitch,tf,asp;
void main(){
 vec3 f=vec3(sin(yaw)*cos(pitch),sin(pitch),cos(yaw)*cos(pitch));
 vec3 r=normalize(cross(vec3(0.,1.,0.),f));vec3 u=cross(f,r);
 vec3 d=normalize(f+r*v.x*tf*asp+u*v.y*tf);
 float lon=atan(d.x,d.z),lat=asin(clamp(d.y,-1.,1.));
 gl_FragColor=texture2D(t,vec2(lon/6.2831853+.5,.5-lat/3.1415927));}`;
function sh(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);return s;}
const prog=gl.createProgram();gl.attachShader(prog,sh(gl.VERTEX_SHADER,VS));gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(prog);gl.useProgram(prog);
const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
const loc=gl.getAttribLocation(prog,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
const U={};['yaw','pitch','tf','asp'].forEach(k=>U[k]=gl.getUniformLocation(prog,k));
const tex=gl.createTexture();
function upload(img){
  gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,img);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
}
let yaw=0,pitch=0,fov=80,tYaw=0,tPitch=0,tFov=80,vel=0,drag=false,lastInput=0,W=1,H=1;
function resize(){const d=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;cv.width=W*d;cv.height=H*d;gl.viewport(0,0,cv.width,cv.height);}
addEventListener('resize',resize);resize();

const imgCache={};
function loadImg(src){return imgCache[src]||(imgCache[src]=new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>{delete imgCache[src];rej(new Error('load '+src));};i.src=src;}));}

/* hotspot math */
const bearing=(a,b)=>(Math.atan2(b.x-a.x,-(b.y-a.y))*180/Math.PI+360)%360; // 0 = north, clockwise
const yawFor=(a,b)=>bearing(a,b)-(a.yaw||0);

function frame(){
  requestAnimationFrame(frame);
  if(auto&&performance.now()-lastInput>1500)tYaw+=.15;
  if(!drag){tYaw+=vel;vel*=.94;}
  tPitch=Math.max(-85,Math.min(85,tPitch));
  yaw+=(((tYaw-yaw+540)%360)-180)*.18;pitch+=(tPitch-pitch)*.18;fov+=(tFov-fov)*.15;
  gl.uniform1f(U.yaw,rad(yaw));gl.uniform1f(U.pitch,rad(pitch));gl.uniform1f(U.tf,Math.tan(rad(fov)/2));gl.uniform1f(U.asp,W/H);
  gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  placeHotspots();
  $('needle').style.transform=`rotate(${-(yaw+(byId[cur].yaw||0))}deg)`;
  updateMapPin();
}

/* touch / mouse: 1 pointer rotates, 2 pointers pinch-zoom */
const ptrs=new Map();let pd=0,sx=0,sy=0,sY=0,sP=0,lx=0;
cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,[e.clientX,e.clientY]);
  if(ptrs.size===1){drag=true;vel=0;sx=lx=e.clientX;sy=e.clientY;sY=tYaw;sP=tPitch;if(sheetState!=='peek')setSheet('peek');}
  else if(ptrs.size===2){const [a,b]=[...ptrs.values()];pd=Math.hypot(a[0]-b[0],a[1]-b[1]);drag=false;}lastInput=performance.now();});
cv.addEventListener('pointermove',e=>{if(!ptrs.has(e.pointerId))return;ptrs.set(e.pointerId,[e.clientX,e.clientY]);lastInput=performance.now();
  if(ptrs.size===2){const [a,b]=[...ptrs.values()];const d=Math.hypot(a[0]-b[0],a[1]-b[1]);tFov=Math.max(30,Math.min(100,tFov*pd/d));pd=d;}
  else if(drag){const k=fov/H*1.0;tYaw=sY-(e.clientX-sx)*k;tPitch=sP+(e.clientY-sy)*k;vel=-(e.clientX-lx)*k*.35;lx=e.clientX;}});
['pointerup','pointercancel'].forEach(t=>cv.addEventListener(t,e=>{ptrs.delete(e.pointerId);if(ptrs.size===0)drag=false;if(ptrs.size===1){const [p]=[...ptrs.values()];sx=lx=p[0];sy=p[1];sY=tYaw;sP=tPitch;drag=true;}}));
cv.addEventListener('wheel',e=>{e.preventDefault();tFov=Math.max(30,Math.min(100,tFov+e.deltaY*.05));},{passive:false});
$('zi').onclick=()=>tFov=Math.max(30,tFov-10);$('zo').onclick=()=>tFov=Math.min(100,tFov+10);

/* ===== HOTSPOTS ===== */
let hs=[];
function buildHotspots(){
  const box=$('hotspots');box.innerHTML='';hs=[];
  const nextId=routeIdx>=0?routeIds[routeIdx+1]:null;
  byId[cur].links.forEach(id=>{const t=byId[id];if(!t)return;
    const el=document.createElement('button');el.className='hs'+(id===nextId?' next':'');
    el.innerHTML=`<span class="a">➜</span><span class="t">${t.name}</span>`;
    el.onclick=()=>{if(id===nextId)routeIdx++;else if(routeIdx>0&&routeIds[routeIdx-1]===id)routeIdx--;goTo(id);};
    box.appendChild(el);hs.push({el,yaw:yawFor(byId[cur],t)});});
}
function placeHotspots(){
  const f=Math.tan(rad(fov)/2);
  hs.forEach(({el,yaw:hy})=>{
    // direction relative to the camera, hotspot sits slightly below the horizon
    const dy=rad(hy-yaw),pp=rad(-8),cp=rad(pitch);
    const x=Math.cos(pp)*Math.sin(dy),y=Math.sin(pp),z=Math.cos(pp)*Math.cos(dy);
    // rotate by camera pitch
    const z2=z*Math.cos(cp)+y*Math.sin(cp),y2=y*Math.cos(cp)-z*Math.sin(cp);
    if(z2<=0.05){el.style.display='none';return;}
    el.style.display='flex';
    el.style.left=((x/z2/(f*W/H))*.5+.5)*W+'px';
    el.style.top=((1-(y2/z2/f))*.5)*H+'px';
  });
}

/* ===== NAVIGATION ===== */
let navToken=0,firstDone=false;
async function goTo(id,faceTo){
  const n=byId[id];if(!n)return;const my=++navToken;
  $('fade').classList.add('on');await new Promise(r=>setTimeout(r,220));
  try{
    const low=await loadImg(`assets/${id}_low.webp`);if(my!==navToken)return;
    upload(low);
    const prev=byId[cur];cur=id;
    const nextId=faceTo||(routeIdx>=0?routeIds[routeIdx+1]:null);
    if(nextId&&byId[nextId])tYaw=yaw=yawFor(n,byId[nextId]);
    else if(prev&&prev!==n)tYaw=yaw=yawFor(prev,n);
    else if(!firstDone&&n.links[0]&&byId[n.links[0]])tYaw=yaw=yawFor(n,byId[n.links[0]]);
    firstDone=true;
    tPitch=pitch=0;vel=0;
    buildHotspots();drawMap();updateInfo();markPlace();markStep();
    $('fade').classList.remove('on');
    loadImg(`assets/${id}_high.webp`).then(hi=>{if(cur===id&&my===navToken)upload(hi);}).catch(()=>{});
  }catch(err){console.error(err);toast('Unable to load that panorama.');$('fade').classList.remove('on');}
}
function updateInfo(){const n=byId[cur];$('iName').textContent=n.name;$('iDesc').textContent=n.desc||'';}
function toast(m){const t=$('toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove('on'),2600);}

/* ===== ROUTING (Dijkstra over node graph) ===== */
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function routeBetween(from,to){
  const d={},p={},q=new Set(nodes.map(n=>n.id));nodes.forEach(n=>d[n.id]=Infinity);d[from]=0;
  while(q.size){let u=null;q.forEach(i=>{if(u===null||d[i]<d[u])u=i;});if(d[u]===Infinity)break;q.delete(u);if(u===to)break;
    byId[u].links.forEach(v=>{if(!byId[v])return;const nd=d[u]+dist(byId[u],byId[v]);if(nd<d[v]){d[v]=nd;p[v]=u;}});}
  if(d[to]===Infinity)return null;const path=[to];while(path[0]!==from)path.unshift(p[path[0]]);
  return {path,meters:d[to]*METERS_PER_PX};
}

/* ===== MAP (pan / pinch-zoom aerial image with pins) ===== */
const wrap=$('mapWrap'),inner=$('mapInner');
let ms=0.5,mx=0,my_=0,mapInit=false;
function applyMap(){const w=wrap.clientWidth,h=wrap.clientHeight;
  const minS=Math.max(w/1042,h/748)*0.0+Math.min(w/1042,h/748);ms=Math.max(minS*0.9,Math.min(3,ms));
  mx=Math.min(w*.5,Math.max(w*.5-1042*ms,mx));my_=Math.min(h*.5,Math.max(h*.5-748*ms,my_));
  inner.style.transform=`translate(${mx}px,${my_}px) scale(${ms})`;}
function centerMapOn(n){const w=wrap.clientWidth,h=wrap.clientHeight;mx=w/2-n.x*ms;my_=h/2-n.y*ms;applyMap();}
const mp=new Map();let mpd=0,mdx=0,mdy=0,moved=0;
wrap.addEventListener('pointerdown',e=>{wrap.setPointerCapture(e.pointerId);mp.set(e.pointerId,[e.clientX,e.clientY]);moved=0;
  if(mp.size===2){const [a,b]=[...mp.values()];mpd=Math.hypot(a[0]-b[0],a[1]-b[1]);}});
wrap.addEventListener('pointermove',e=>{const o=mp.get(e.pointerId);if(!o)return;const nx=e.clientX,ny=e.clientY;
  if(mp.size===1){mx+=nx-o[0];my_+=ny-o[1];moved+=Math.abs(nx-o[0])+Math.abs(ny-o[1]);mp.set(e.pointerId,[nx,ny]);applyMap();}
  else{mp.set(e.pointerId,[nx,ny]);const [a,b]=[...mp.values()];const d=Math.hypot(a[0]-b[0],a[1]-b[1]);
    const r=wrap.getBoundingClientRect(),cx=(a[0]+b[0])/2-r.left,cy=(a[1]+b[1])/2-r.top;
    const k=d/mpd,ns=Math.max(.2,Math.min(3,ms*k)),f=ns/ms;mx=cx-(cx-mx)*f;my_=cy-(cy-my_)*f;ms=ns;mpd=d;moved+=10;applyMap();}});
['pointerup','pointercancel'].forEach(t=>wrap.addEventListener(t,e=>{mp.delete(e.pointerId);}));
wrap.addEventListener('wheel',e=>{e.preventDefault();const r=wrap.getBoundingClientRect(),cx=e.clientX-r.left,cy=e.clientY-r.top;
  const ns=Math.max(.2,Math.min(3,ms*(e.deltaY<0?1.12:.89))),f=ns/ms;mx=cx-(cx-mx)*f;my_=cy-(cy-my_)*f;ms=ns;applyMap();},{passive:false});
function drawMap(){
  let h='';const seen=new Set();
  nodes.forEach(n=>n.links.forEach(l=>{const k=[n.id,l].sort().join('|');if(seen.has(k)||!byId[l])return;seen.add(k);
    const i=routeIds.indexOf(n.id),j=routeIds.indexOf(l);const on=i>=0&&j>=0&&Math.abs(i-j)===1;
    h+=`<line class="edge${on?' route':''}" x1="${n.x}" y1="${n.y}" x2="${byId[l].x}" y2="${byId[l].y}"/>`;}));
  nodes.forEach(n=>{const c=n.id===cur;
    if(c)h+=`<circle class="pulse" cx="${n.x}" cy="${n.y}" r="26"/>`;
    h+=`<g class="pin${c?' cur':''}" data-id="${n.id}"><circle cx="${n.x}" cy="${n.y}" r="${c?18:14}"/><text x="${n.x}" y="${n.y-26}">${n.name}</text></g>`;});
  h+=`<g id="viewCone"></g>`;
  $('mapSvg').innerHTML=h;
  $('mapSvg').querySelectorAll('.pin').forEach(g=>g.addEventListener('click',()=>{if(moved>6)return;routeIds=[];routeIdx=-1;goTo(g.dataset.id);setSheet('peek');}));
}
function updateMapPin(){
  const g=$('viewCone');if(!g)return;const n=byId[cur];
  const b=yaw+(n.yaw||0),a1=rad(b-fov/2-90+0),a2=rad(b+fov/2-90),R=70;
  // heading 0 = north (up); svg angle 0 = east, so subtract 90deg
  g.innerHTML=`<path d="M${n.x} ${n.y} L${n.x+R*Math.cos(a1)} ${n.y+R*Math.sin(a1)} A${R} ${R} 0 0 1 ${n.x+R*Math.cos(a2)} ${n.y+R*Math.sin(a2)}Z" fill="rgba(192,138,46,.45)" stroke="#C08A2E" stroke-width="2" pointer-events="none"/>`;
}

/* ===== PLACES ===== */
function renderList(){
  const q=$('q').value.trim().toLowerCase();
  const items=nodes.filter(n=>!q||(n.name+n.cat+(n.desc||'')).toLowerCase().includes(q));
  $('list').innerHTML=items.length?items.map(n=>`<button class="place${n.id===cur?' on':''}" data-id="${n.id}"><span class="ic">${n.icon}</span><span><b>${n.name}</b><small>${n.cat}</small></span></button>`).join(''):'<div class="empty">No places match your search.</div>';
}
$('q').oninput=renderList;
$('list').onclick=e=>{const b=e.target.closest('.place');if(!b)return;routeIds=[];routeIdx=-1;goTo(b.dataset.id);setSheet('peek');};
function markPlace(){document.querySelectorAll('.place').forEach(p=>p.classList.toggle('on',p.dataset.id===cur));}

/* ===== DIRECTIONS ===== */
const opts=nodes.map(n=>`<option value="${n.id}">${n.name}</option>`).join('');
$('from').innerHTML=opts;$('to').innerHTML=opts;$('to').value=nodes[nodes.length-1].id;
$('swap').onclick=()=>{const a=$('from').value;$('from').value=$('to').value;$('to').value=a;};
$('findBtn').onclick=()=>{
  const f=$('from').value,t=$('to').value;
  if(f===t){$('routeOut').innerHTML='<div class="empty">You’re already there! Pick a different destination.</div>';return;}
  const r=routeBetween(f,t);if(!r){$('routeOut').innerHTML='<div class="empty">No walkable route found.</div>';return;}
  routeIds=r.path;routeIdx=0;
  const mins=Math.max(1,Math.round(r.meters/WALK_MPS/60));
  const steps=r.path.map((id,i)=>{const n=byId[id];const txt=i===0?`Start at <b>${n.name}</b>`:i===r.path.length-1?`Arrive at <b>${n.name}</b>`:`Continue to <b>${n.name}</b>`;
    return `<div class="step" data-i="${i}"><span class="n">${i+1}</span><span>${txt}</span></div>`;}).join('');
  $('routeOut').innerHTML=`<div class="sum">${r.path.length-1} stop${r.path.length>2?'s':''} · about ${Math.round(r.meters)} m · ~${mins} min walk</div>
   <div class="row" style="margin:10px 0"><button class="pbtn go" id="tourBtn">▶ Walk me there</button><button class="pbtn alt" id="clearBtn">Clear</button></div>${steps}`;
  $('tourBtn').onclick=toggleTour;$('clearBtn').onclick=clearRoute;
  goTo(f,r.path[1]);toast('Follow the pulsing arrow');
};
$('routeOut').onclick=e=>{const s=e.target.closest('.step');if(!s)return;routeIdx=+s.dataset.i;goTo(routeIds[routeIdx]);};
function markStep(){document.querySelectorAll('.step').forEach(s=>s.classList.toggle('on',+s.dataset.i===routeIdx));}
function clearRoute(){stopTour();routeIds=[];routeIdx=-1;$('routeOut').innerHTML='<div class="empty">Route cleared.</div>';buildHotspots();drawMap();}
let tour=null;
function toggleTour(){tour?stopTour():startTour();}
function startTour(){
  if(routeIdx<0||routeIdx>=routeIds.length-1)routeIdx=0;
  $('tourBtn').textContent='❚❚ Pause';if(cur!==routeIds[routeIdx])goTo(routeIds[routeIdx]);setSheet('peek');
  tour=setInterval(()=>{if(routeIdx>=routeIds.length-1){stopTour();toast('You’ve arrived!');return;}routeIdx++;goTo(routeIds[routeIdx]);},4000);
}
function stopTour(){clearInterval(tour);tour=null;const b=$('tourBtn');if(b)b.textContent='▶ Walk me there';}

/* ===== SHEET & UI ===== */
let sheetState='peek';
function setSheet(s){sheetState=s;const el=$('sheet');el.className=s;if(s!=='peek')setTimeout(()=>{applyMap();},300);}
$('grab').onclick=()=>setSheet(sheetState==='peek'?'half':sheetState==='half'?'full':'peek');
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x===t));
  ['map','places','dir'].forEach(k=>$('p-'+k).classList.toggle('on',t.dataset.t===k));
  if(sheetState==='peek')setSheet('half');
  if(t.dataset.t==='map')setTimeout(()=>{if(!mapInit){mapInit=true;ms=Math.min(wrap.clientWidth/1042,wrap.clientHeight/748)*1.6;}centerMapOn(byId[cur]);},320);
});
$('autoBtn').onclick=()=>{auto=!auto;$('autoBtn').classList.toggle('on',auto);toast(auto?'Auto-rotate on':'Auto-rotate off');};
$('fsBtn').onclick=()=>{const a=$('app');if(!document.fullscreenElement&&a.requestFullscreen)a.requestFullscreen();else if(document.exitFullscreen)document.exitFullscreen();else toast('Use “Add to Home Screen” for full screen');};
$('startBtn').onclick=()=>$('welcome').classList.add('hide');
addEventListener('resize',()=>{applyMap();});

if(!gl){document.body.innerHTML='<p style="color:#fff;padding:24px">Sorry, your browser does not support WebGL, which is needed for the 360° viewer.</p>';}
renderList();drawMap();updateInfo();frame();goTo(cur);
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('support.js').catch(()=>{});
