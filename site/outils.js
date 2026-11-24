/* Outils de vérification.
   Outil 1 : est-ce mon visage ? (selfie en direct + défi de mouvement, comparaison 1:1).
             Tout se passe dans le navigateur : le selfie et les empreintes du visage ne sont jamais envoyés.
   Outil 2 : l'image suspecte (et elle seule) est envoyée à notre serveur, en morceaux (api.js) ;
             il répond par un verdict simple et l'efface. Puis liste de contrôle corporelle + rapport de preuve.
   DEMO_UPLOAD_SELFIE : uniquement pour une démo sans caméra ; doit rester à false sur le site public. */
(() => {
const DEMO_UPLOAD_SELFIE = false;
const MODELS = 'models';
const t = (k, v) => window.t ? window.t(k, v) : k;
const $ = id => document.getElementById(id);
const T = { ref: null, refs: [], arcRefs: [], refFrom: null, refWeak: false, match: null, img2: null, file2: null, signals: null, hash: null, prnu: null, run1: 0, run2: 0 };
let ready = null, stream = null, loopOn = false;

/* ---------- chargement paresseux ---------- */
function loadScript(src){return new Promise((ok,ko)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>ko(new Error('script '+src));document.head.appendChild(s)})}
function boot(){
  if(ready) return ready;
  setStatus(t('o.loading'));
  ready=(async()=>{
    if(!window.faceapi) await loadScript('lib/face-api.js');
    if(!window.exifr) await loadScript('lib/exifr.js');
    if(!window.Moteurs) await loadScript('moteurs.js');
    const f=window.faceapi;
    try{await f.tf.setBackend('webgl')}catch(_){}
    await f.tf.ready();
    await Promise.all([f.nets.tinyFaceDetector.loadFromUri(MODELS),f.nets.ssdMobilenetv1.loadFromUri(MODELS),f.nets.faceLandmark68Net.loadFromUri(MODELS),f.nets.faceRecognitionNet.loadFromUri(MODELS)]);
    setStatus('');return f;
  })().catch(e=>{setStatus(t('o.loadFail',{e:e.message}));ready=null;throw e});
  return ready;
}
function setStatus(s){const e=$('oStatus');if(e){e.textContent=s;e.classList.toggle('hide',!s)}}

/* ---------- utilitaires ---------- */
const urls=[];
const fileToImg=f=>new Promise((ok,ko)=>{const u=URL.createObjectURL(f);urls.push(u);const i=new Image();i.onload=()=>ok(i);i.onerror=()=>ko(new Error(t('o.badImage')));i.src=u});
const dist=(a,b)=>{let s=0;for(let i=0;i<a.length;i++){const d=a[i]-b[i];s+=d*d}return Math.sqrt(s)};
const mean=arr=>{const o=new Float32Array(arr[0].length);arr.forEach(a=>a.forEach((v,i)=>o[i]+=v/arr.length));return o};
const yaw=lm=>{const p=lm.positions;return (p[30].x-p[0].x)/((p[16].x-p[0].x)||1)};

/* ---------- recherche de visages en trois essais, du plus strict au plus permissif ----------
   Les captures d'écran et les images volées montrent souvent un visage petit, de profil ou en partie caché.
   Un visage trouvé seulement par les essais permissifs est signalé : la confiance affichée reste « faible ». */
async function findFaces(f,img){
  const tries=[new f.SsdMobilenetv1Options({minConfidence:.4}),new f.SsdMobilenetv1Options({minConfidence:.2}),new f.TinyFaceDetectorOptions({inputSize:608,scoreThreshold:.2})];
  for(let i=0;i<tries.length;i++){
    const res=await f.detectAllFaces(img,tries[i]).withFaceLandmarks().withFaceDescriptors();
    if(res.length) return {res,weak:i>0};
  }
  return {res:[],weak:false};
}

/* ---------- conseils pendant le selfie : distance, lumière, netteté ----------
   Mesurés sur l'image de la caméra, sur l'appareil ; rien n'est envoyé. Les seuils viennent de la pratique photo
   courante et ne sont pas calibrés statistiquement : ce sont des conseils, jamais un verdict.
   Renvoie '' (rien à corriger) ou far | near | back | dark | bright | side | blur. */
const coA=document.createElement('canvas'),coB=document.createElement('canvas');
const COACH={dark:85,bright:200,back:60,side:.2,blur:5,far:.18,near:.7,N:112};
function coach(v,box,frontal){
  const vw=v.videoWidth,vh=v.videoHeight;if(!vw||!vh) return '';
  const fr=box.width/vw;
  if(fr<COACH.far) return 'far';
  if(fr>COACH.near) return 'near';
  const lum=(d,i)=>.299*d[i]+.587*d[i+1]+.114*d[i+2];
  const W=160,k=W/vw,H=Math.max(2,Math.round(vh*k));coA.width=W;coA.height=H;
  const xa=coA.getContext('2d',{willReadFrequently:true});xa.drawImage(v,0,0,W,H);
  const bx=Math.max(0,Math.round(box.x*k)),by=Math.max(0,Math.round(box.y*k)),bw=Math.min(W-bx,Math.round(box.width*k)),bh=Math.min(H-by,Math.round(box.height*k));
  if(bw<8||bh<8) return '';
  const d=xa.getImageData(bx,by,bw,bh).data;let L=0,Ll=0,Lr=0;
  for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){const val=lum(d,(y*bw+x)*4);L+=val;if(x<bw/2)Ll+=val;else Lr+=val}
  L/=bw*bh;
  if(by>=4){const g=xa.getImageData(0,0,W,by).data;let Lb=0,n=0;for(let i=0;i<g.length;i+=16){Lb+=lum(g,i);n++}
    if(n&&Lb/n>L+COACH.back) return 'back';}
  if(L<COACH.dark) return 'dark';
  if(L>COACH.bright) return 'bright';
  if(frontal&&Math.abs(Ll-Lr)/((Ll+Lr)||1)>COACH.side) return 'side';
  /* netteté : écart-type du laplacien sur le visage ramené à 112 px */
  const N=COACH.N;coB.width=coB.height=N;const xb=coB.getContext('2d',{willReadFrequently:true});
  xb.drawImage(v,Math.max(0,box.x),Math.max(0,box.y),Math.min(vw-Math.max(0,box.x),box.width),Math.min(vh-Math.max(0,box.y),box.height),0,0,N,N);
  const e=xb.getImageData(0,0,N,N).data,g2=new Float32Array(N*N);for(let i=0;i<N*N;i++)g2[i]=lum(e,i*4);
  let q=0,n2=0;for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){const i=y*N+x,l=4*g2[i]-g2[i-1]-g2[i+1]-g2[i-N]-g2[i+N];q+=l*l;n2++}
  if(Math.sqrt(q/n2)<COACH.blur) return 'blur';
  return '';
}
/* aucun visage trouvé : si le centre de l'image est très sombre ou très clair, on le dit plutôt qu'un message général */
function coachFrame(v){
  const vw=v.videoWidth,vh=v.videoHeight;if(!vw||!vh) return null;
  const W=160,H=Math.max(2,Math.round(vh*W/vw));coA.width=W;coA.height=H;
  const xa=coA.getContext('2d',{willReadFrequently:true});xa.drawImage(v,0,0,W,H);
  const d=xa.getImageData(W>>2,H>>2,W>>1,H>>1).data;let L=0,n=0;for(let i=0;i<d.length;i+=4){L+=.299*d[i]+.587*d[i+1]+.114*d[i+2];n++}
  L/=n||1;return L<50?'dark':L>215?'bright':null;
}
const WEAKQ={dark:1,blur:1,back:1,bright:1};
function setCoach(q){const h=$('coachHint');if(!h)return;const s=q===null?'':q?t('o.co.'+q):t('o.co.ok');if(h.textContent!==s)h.textContent=s}
async function sha256(buf){const h=await crypto.subtle.digest('SHA-256',buf);return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('')}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const strip=s=>String(s).replace(/<[^>]+>/g,'');
const med=a=>{if(!a.length)return 0;const b=Float32Array.from(a).sort();return b[(b.length/2)|0]};
const fmt=n=>n.toLocaleString(document.documentElement.lang||'fr',{maximumFractionDigits:1});

/* verdict 1:1 — face-api (descripteur 128-d, distance euclidienne) : < 0.45 très proche, < 0.6 seuil usuel */
function verdict(d){
  if(d<0.45) return {cls:'hi',t:t('o.v1.hi'),s:t('o.v1.hiS')};
  if(d<0.6)  return {cls:'mid',t:t('o.v1.mid'),s:t('o.v1.midS')};
  return {cls:'lo',t:t('o.v1.lo'),s:t('o.v1.loS')};
}
const simPct=d=>Math.round(Math.max(0,Math.min(1,1-d/1.2))*100);

/* ======================= OUTIL 1 ======================= */
async function startCam(){
  const f=await boot();
  $('camErr').classList.add('hide');
  try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false})}
  catch(e){camUnavailable();return}
  const v=$('camV');v.srcObject=stream;await v.play();
  $('camBox').classList.remove('hide');$('camStart').classList.add('hide');
  const order=Math.random()<.5?['face','left','right','back']:['face','right','left','back'];
  let step=0,hold=0,nTick=0,lastQ='';const front=[],frontQ=[],all=[],snaps=[];
  loopOn=true;
  const tick=async()=>{
    if(!loopOn) return;
    const res=await f.detectAllFaces(v,new f.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:.5})).withFaceLandmarks().withFaceDescriptors();
    if(!loopOn) return;
    const want=order[step];
    $('chal').textContent=t('o.ch.'+want);
    $('chalStep').textContent=t('o.stepOf',{a:step+1,b:order.length});
    if(res.length!==1){$('chalHint').textContent=res.length?t('o.oneFace'):t('o.noFaceCam');hold=0;setCoach(res.length?null:coachFrame(v))}
    else{
      const r=res[0],y=yaw(r.landmarks);
      /* cohérence d'identité sur TOUTES les images du défi, pas seulement les vues de face */
      if(all.length&&dist(r.descriptor,all[0])>0.62){$('chalHint').textContent=t('o.faceChanged');step=0;hold=0;front.length=0;frontQ.length=0;all.length=0}
      else{
        const ok=(want==='face'||want==='back')?(y>.42&&y<.58):want==='left'?y>.64:y<.36;
        $('chalHint').textContent=ok?t('o.hold'):'';
        if(nTick++%3===0){lastQ=coach(v,r.detection.box,ok&&(want==='face'||want==='back'));setCoach(lastQ)}
        hold=ok?hold+1:0;
        all.push(r.descriptor);
        if(ok&&(want==='face'||want==='back')){front.push(r.descriptor);frontQ.push(lastQ);if(window.ARCFACE_ON&&snaps.length<4){const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);snaps.push({c,lm:r.landmarks})}}
        if(hold>=3){step++;hold=0;
          if(step>=order.length){finishLive(front,snaps,frontQ);return}}
      }
    }
    $('chalBar').style.width=Math.round(step/order.length*100)+'%';
    setTimeout(()=>requestAnimationFrame(tick),60);
  };
  tick();
}
function stopCam(){loopOn=false;if(stream){stream.getTracks().forEach(x=>x.stop());stream=null}const v=$('camV');if(v)v.srcObject=null;const b=$('camBox');if(b)b.classList.add('hide');setCoach(null)}
async function finishLive(descs,snaps,qs){
  T.ref=mean(descs.slice(-6));T.refs=[T.ref];T.refFrom='live';stopCam();
  T.refWeak=(qs||[]).slice(-6).filter(q=>WEAKQ[q]).length>=3;
  T.arcRefs=[];if(window.ARCFACE_ON){try{for(const s of snaps)T.arcRefs.push(await Moteurs.arcEmbed(s.c,s.lm))}catch(e){console.warn(e)}}
  $('camStart').classList.add('hide');
  $('refOk').innerHTML=t('o.liveOk')+(T.refWeak?'<br><span class="small">'+t('o.liveWeak')+'</span>':'');
  $('refOk').classList.remove('hide');$('step2').classList.remove('dim');
}
function camUnavailable(){
  const e=$('camErr');e.classList.remove('hide');
  e.innerHTML=t('o.camNo')+(DEMO_UPLOAD_SELFIE?t('o.camDemo')+'<label class="f" for="refFile">'+t('o.refLabel')+'</label><input type="file" id="refFile" accept="image/*" multiple>':'');
  if(DEMO_UPLOAD_SELFIE)$('refFile').addEventListener('change',e2=>refFromFile(e2).catch(err=>{$('refOk').textContent=err.message;$('refOk').classList.remove('hide')}));
}
async function refFromFile(e){
  const f=await boot();const files=[...e.target.files].slice(0,5);if(!files.length)return;
  const descs=[],arcs=[],bad=[];
  for(const file of files){
    const img=await fileToImg(file);
    const res=await f.detectAllFaces(img,new f.SsdMobilenetv1Options({minConfidence:.5})).withFaceLandmarks().withFaceDescriptors();
    if(res.length!==1){bad.push(esc(file.name)+' ('+(res.length?t('o.refManyShort'):t('o.refNoneShort'))+')');continue}
    descs.push(res[0].descriptor);
    if(window.ARCFACE_ON){try{arcs.push(await Moteurs.arcEmbed(img,res[0].landmarks))}catch(err){console.warn(err)}}
  }
  /* toutes les références doivent montrer la même personne */
  if(descs.length>1&&descs.some(d=>dist(d,descs[0])>0.6)){$('refOk').innerHTML=t('o.refMixed');$('refOk').classList.remove('hide');return}
  if(!descs.length){$('refOk').innerHTML=t('o.refNone')+(bad.length?'<br>'+bad.join(', '):'');$('refOk').classList.remove('hide');return}
  T.refs=descs;T.ref=mean(descs);T.arcRefs=arcs;T.refFrom='upload';T.refWeak=false;
  $('refOk').innerHTML=t('o.refDemoOkN',{n:descs.length})+(bad.length?'<br><span class="small">'+t('o.refSkipped')+' '+bad.join(', ')+'</span>':'');
  $('refOk').classList.remove('hide');$('step2').classList.remove('dim');
}

/* niveaux : hi / mid / lo */
function arcVerdict(c){
  if(c>=0.5) return {cls:'hi',t:t('o.v1.hi'),s:t('o.v1.hiS')};
  if(c>=0.35) return {cls:'mid',t:t('o.v1.mid'),s:t('o.v1.midS')};
  return {cls:'lo',t:t('o.v1.lo'),s:t('o.v1.loS')};
}
function confidence(faceW,faVc,arcVc,weak){
  const rank={hi:2,mid:1,lo:0};
  const nRef=T.refFrom==='live'?3:T.refs.length;
  if(faceW<60) return {lvl:'low',why:t('o.conf.small',{w:Math.round(faceW)})};
  if(weak) return {lvl:'low',why:t('o.conf.weak')};
  if(arcVc&&Math.abs(rank[faVc]-rank[arcVc])===2) return {lvl:'low',why:t('o.conf.disagree')};
  if(T.refWeak) return {lvl:'mid',why:t('o.conf.refWeak')};
  if(faceW>=112&&(!arcVc||faVc===arcVc)&&nRef>=2) return {lvl:'high',why:t('o.conf.good')};
  return {lvl:'mid',why:faceW<112?t('o.conf.medSize',{w:Math.round(faceW)}):nRef<2?t('o.conf.oneRef'):t('o.conf.partial')};
}

async function checkSuspect(e){
  const file=e.target.files[0];if(!file)return;
  if(!T.ref){$('matchOut').innerHTML='<p>'+t('o.needSelfie')+'</p>';return}
  const run=++T.run1;
  const f=await boot();
  $('matchOut').innerHTML='<p class="small">'+t('o.working')+'</p>';
  const img=await fileToImg(file);
  const {res,weak}=await findFaces(f,img);
  if(run!==T.run1)return; /* une image plus récente a été choisie entre-temps */
  const c=$('matchCv'),W=Math.min(img.naturalWidth,900),k=W/img.naturalWidth;
  c.width=W;c.height=Math.round(img.naturalHeight*k);const x=c.getContext('2d');x.drawImage(img,0,0,c.width,c.height);
  c.classList.remove('hide');
  if(!res.length){T.match={file,none:true};$('matchOut').innerHTML=`<div class="vcard lo"><b>${t('o.noFaceImg')}</b><span>${t('o.noFaceImgS')}</span></div>`;return}
  const rows=[];
  for(const r of res){
    const d=Math.min(...T.refs.map(x=>dist(r.descriptor,x)));
    let c=null;
    if(window.ARCFACE_ON&&T.arcRefs.length){try{const e=await Moteurs.arcEmbed(img,r.landmarks);c=Math.max(...T.arcRefs.map(x=>Moteurs.cos(e,x)))}catch(err){console.warn(err)}}
    rows.push({r,d,c});
  }
  if(run!==T.run1)return;
  const useArc=rows.every(o=>o.c!==null);
  rows.sort((a,b)=>useArc?b.c-a.c:a.d-b.d);
  const pctOf=o=>useArc?Math.round(Math.max(0,Math.min(1,o.c))*100):simPct(o.d);
  rows.forEach((o,i)=>{const b=o.r.detection.box;x.lineWidth=3;x.strokeStyle=i===0?'#d9503c':'#9ab';x.strokeRect(b.x*k,b.y*k,b.width*k,b.height*k);
    x.fillStyle=i===0?'#d9503c':'#9ab';x.font='bold 15px DM Sans, sans-serif';x.fillText(pctOf(o)+' %',b.x*k+4,Math.max(16,b.y*k-6))});
  const best=rows[0],faV=verdict(best.d),arcV=useArc?arcVerdict(best.c):null,v=arcV||faV;
  const conf=confidence(best.r.detection.box.width,faV.cls,arcV&&arcV.cls,weak);
  T.match={file,pts:best.r.landmarks.positions.map(q=>({x:q.x,y:q.y})),iw:img.naturalWidth,ih:img.naturalHeight,d:best.d,c:useArc?best.c:null,n:res.length,pct:pctOf(best),label:v.t,refFrom:T.refFrom,conf:conf.lvl,nRef:T.refFrom==='live'?0:T.refs.length};
  $('matchOut').innerHTML=`<div class="vcard ${v.cls}"><div class="big">${pctOf(best)} %</div><b>${v.t}</b><span>${v.s}</span>
   <div class="meter"><i style="width:${pctOf(best)}%"></i></div>
   <p class="conf ${conf.lvl}"><b>${t('o.conf.label')} : ${t('o.conf.'+conf.lvl)}</b> · ${conf.why}</p>
   <table class="eng"><tr><td>${t('o.eng.arc')}</td><td>${useArc?t('o.eng.cos',{c:best.c.toFixed(3)})+' → '+arcV.t:t('o.eng.off')}</td></tr>
   <tr><td>${t('o.eng.fa')}</td><td>${t('o.eng.dist',{d:best.d.toFixed(3)})} → ${faV.t}</td></tr></table>
   <span class="small">${t('o.facesN',{n:res.length})} · ${T.refFrom==='live'?t('o.r.live'):t('o.refsN',{n:T.refs.length})+' · '+t('o.refNotLive')}</span></div>
   <p class="small">${t('o.swapNote')}</p>
   <div class="ctas"><button class="main" id="toTool2">${t('o.toTool2')}</button></div>`;
  $('toTool2').addEventListener('click',()=>{showTab('t2');analyse(file).catch(err=>$('sigOut').textContent=err.message)});
}

/* ======================= OUTIL 2 : vérification par notre serveur =======================
   Le détecteur n'est pas dans ce code : seule l'image suspecte est envoyée, par morceaux
   (voir api.js), jamais ton selfie. Le serveur répond par un verdict simple et oublie tout. */
const V={likely:['lo2','o.g.hi','o.g.hiS','fort'],possible:['mid','o.g.mid','o.g.midS','moyen'],
 no_sign:['neutral','o.g.lo','o.g.loS','info'],insufficient:['neutral','o.api.insuf','o.api.insufS','info'],
 unsupported:['neutral','o.api.unsup','o.api.unsupS','info'],too_large:['neutral','o.api.big','o.api.bigS','info']};
const MAX_BYTES=15*1024*1024;
async function analyse(file){
  const run=++T.run2;
  const out=$('sigOut'),inp=$('f2');
  if(file.size>MAX_BYTES){out.innerHTML=`<div class="vcard neutral"><b>${t('o.api.big')}</b><span>${t('o.api.bigS')}</span></div>`;return}
  out.innerHTML='<p class="small">'+t('o.working')+'</p>';
  if(inp)inp.disabled=true;
  try{await analyseRun(file,run,out)}finally{if(run===T.run2&&inp)inp.disabled=false}
}
async function analyseRun(file,run,out){
  const buf=await file.arrayBuffer();const hash=await sha256(buf);
  let img=null;try{img=await fileToImg(file)}catch(_){}             /* HEIC may not preview: not a problem */
  if(run!==T.run2)return;
  T.file2=file;T.img2=img;T.hash=hash;T.signals=null;
  let verdict;
  try{verdict=await window.ImStillMineAPI.check(file)}
  catch(e){
    if(run!==T.run2)return;
    if(e instanceof window.ImStillMineAPI.LimitError){
      if(e.info.error==='wait'){out.innerHTML=`<div class="vcard neutral"><b>${t('o.api.wait',{s:e.retry||30})}</b></div>`;return}
      if(e.info.error==='ipv6'){out.innerHTML=`<div class="vcard neutral"><b>${t('o.api.ipv6')}</b></div>`;return}
      out.innerHTML=`<div class="vcard neutral"><b>${t('o.api.limit')}</b><span>${t('o.api.limitS')}</span></div>
       <form id="unlockF" class="unlock"><label class="f" for="unlockMail">${t('o.api.mail')}</label>
       <input id="unlockMail" type="email" required autocomplete="email"/><button class="btn" type="submit">${t('o.api.send')}</button>
       <p class="small" id="unlockMsg">${t('o.api.mailNote')}</p></form>`;
      $('unlockF').addEventListener('submit',async ev=>{ev.preventDefault();const m=$('unlockMsg');
        try{await window.ImStillMineAPI.unlock($('unlockMail').value,document.documentElement.lang);m.textContent=t('o.api.queued');$('unlockMail').value=''}
        catch(err){const st=String(err.message||'').replace('api ','');m.textContent=t(st==='400'||st==='422'?'o.api.badMail':st==='429'?'o.api.mailLimit':'o.api.err')}});
      return;
    }
    out.innerHTML=`<div class="vcard neutral"><b>${t(e.message==='too_big'?'o.api.big':'o.api.err')}</b></div>`;return;
  }
  if(run!==T.run2)return;
  const g=V[verdict]||V.insufficient;
  T.signals=[{l:g[3],k:'file',t:t(g[1])}];
  out.innerHTML=`<div class="vcard ${g[0]}"><b>${t(g[1])}</b><span>${t(g[2])}</span></div><p class="small">${t('o.api.how')}</p>`;
  renderMaps(out,img,window.ImStillMineAPI.lastMaps,file);
  renderChecklist();
  $('bodyChk').classList.remove('hide');$('evid').classList.remove('hide');buildReport();
}

/* ---------- cartes de chaleur (bêta) : 3 calques calculés par le serveur, le 4e ici, sur ton appareil ---------- */
function renderMaps(out,img,maps,file){
  if(!img||!maps)return;
  const mine=T.match&&T.match.file===file&&T.match.pts;
  const L=[['ela','#1c7ed6'],['noise','#7048e8'],['seams','#e8590c']];
  const box=document.createElement('div');box.className='hm';
  box.innerHTML=`<h3>${t('o.hm.title')}</h3><div class="hmtog">${L.map(([k,c])=>`<label><input type="checkbox" data-k="${k}"><span class="sw" style="background:${c}"></span>${t('o.hm.'+k)}</label>`).join('')}
   <label${mine?'':' class="dis"'}><input type="checkbox" data-k="mine" ${mine?'checked':'disabled'}><span class="sw" style="background:#2f9e44"></span>${t('o.hm.mine')}</label></div>
   <div class="hmimg"><canvas></canvas>${L.map(([k])=>`<img alt="" data-k="${k}" class="hide" src="data:image/png;base64,${maps[k]}">`).join('')}<canvas class="mine${mine?'':' hide'}"></canvas></div>
   <p class="small">${t('o.hm.note')}${mine?'':' '+t('o.hm.mineNo')}</p>`;
  out.appendChild(box);
  const cv=box.querySelector('canvas'),W=maps.w,H=maps.h;cv.width=W;cv.height=H;cv.getContext('2d').drawImage(img,0,0,W,H);
  if(mine){const m=box.querySelector('canvas.mine');m.width=W;m.height=H;const x=m.getContext('2d'),k=W/T.match.iw,P=T.match.pts;
    const grp=[[36,42],[42,48],[27,36],[48,68]];x.fillStyle='rgba(47,158,68,.45)';
    for(const[a,b]of grp){let cx=0,cy=0,r=0;for(let i=a;i<b;i++){cx+=P[i].x;cy+=P[i].y}cx/=b-a;cy/=b-a;
      for(let i=a;i<b;i++)r=Math.max(r,Math.hypot(P[i].x-cx,P[i].y-cy));x.beginPath();x.arc(cx*k,cy*k,(r+6)*k,0,7);x.fill()}}
  box.querySelectorAll('input').forEach(c=>c.addEventListener('change',()=>{const k=c.dataset.k;
    const el=k==='mine'?box.querySelector('canvas.mine'):box.querySelector(`img[data-k="${k}"]`);el.classList.toggle('hide',!c.checked)}));
}

const CHK=['moles','tattoos','scars','ears','hands','hair','skinAge','proportions','chest','neck','jewelry','light','background','room'];
const chk={};
function renderChecklist(){
  const box=$('chkList');if(!box)return;
  box.innerHTML=CHK.map(k=>`<div class="q"><p>${t('o.chk.'+k)}</p><div class="opts">${['diff','same','na'].map(v=>`<label><input type="radio" name="chk_${k}" value="${v}" ${chk[k]===v?'checked':''}>${t('o.chkA.'+v)}</label>`).join('')}</div></div>`).join('');
}

/* ---------- rapport de preuve ---------- */
function buildReport(){
  if(!T.file2)return;
  const M=T.match&&T.match.file===T.file2&&!T.match.none?T.match:null;
  const diffs=CHK.filter(k=>chk[k]==='diff').map(k=>'- '+strip(t('o.chk.'+k)));
  const lines=[t('o.r.title'),t('o.r.date',{d:new Date().toLocaleString(document.documentElement.lang)}),'',
  t('o.r.img'),t('o.r.name',{v:T.file2.name}),t('o.r.size',{v:T.file2.size}),t('o.r.type',{v:T.file2.type||'?'}),
  t('o.r.dims',{v:T.img2?T.img2.naturalWidth+' x '+T.img2.naturalHeight:'?'}),'SHA-256 : '+T.hash,
  t('o.r.url',{v:$('evUrl').value||'—'}),t('o.r.seen',{v:$('evDate').value||'—'}),'',
  t('o.r.cmp'),
  M?t('o.r.cmpRes2',{p:M.pct,l:M.label,c:M.c!==null?M.c.toFixed(3):'—',d:M.d.toFixed(3),n:M.n,conf:t('o.conf.'+M.conf),r:M.refFrom==='live'?t('o.r.live'):t('o.r.uploadN',{n:M.nRef})}):t('o.r.none'),'',
  t('o.r.sig'),...(T.signals||[]).map(s=>`[${strip(t('o.lv.'+s.l))}] ${strip(s.t)}`),'',
  t('o.r.body'),...(diffs.length?diffs:[t('o.r.none')]),'',
  t('o.r.notes',{v:$('evNotes').value||'—'}),'',t('o.r.limits'),t('o.r.where')];
  $('evText').value=lines.join('\n');
}
async function copyReport(){const m=$('evMsg');try{await navigator.clipboard.writeText($('evText').value);m.textContent=t('o.copied')}catch(_){$('evText').select();m.textContent=t('o.copyFail')}}
function dlReport(){const b=new Blob([$('evText').value],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');const u=URL.createObjectURL(b);a.href=u;a.download='rapport-'+(T.hash||'').slice(0,8)+'.txt';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);$('evMsg').textContent=t('o.dlNote')}

function showTab(x){document.querySelectorAll('#v-outils .tabs button').forEach(b=>b.classList.toggle('on',b.dataset.o===x));['t1','t2','t3'].forEach(k=>$('o-'+k).classList.toggle('hide',x!==k))}
function wipe(){stopCam();T.run1++;T.run2++;['ref','refFrom','match','img2','file2','signals','hash'].forEach(k=>T[k]=null);Object.keys(chk).forEach(k=>delete chk[k]);
  urls.splice(0).forEach(u=>URL.revokeObjectURL(u));
  T.refs=[];T.arcRefs=[];T.prnu=null;T.refWeak=false;
  ['refFile','sus','f2','evUrl','evDate','evNotes'].forEach(i=>{const e=$(i);if(e)e.value=''});
  ['refOk','matchCv','evid','bodyChk','camErr'].forEach(i=>$(i).classList.add('hide'));$('matchOut').innerHTML='';$('sigOut').innerHTML='';$('evText').value='';
  $('camStart').classList.remove('hide');$('step2').classList.add('dim');$('wipeMsg').textContent=t('o.wiped')}
function pending(){const f=window.__homeFile;if(!f)return;window.__homeFile=null;showTab('t2');T.match=null;analyse(f).catch(err=>$('sigOut').textContent=err.message)}
window.initOutils=function(){
  if(window.__outilsInit){boot().catch(()=>{});pending();return}window.__outilsInit=true;
  document.querySelectorAll('#v-outils .tabs button').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.o)));
  $('camStart').addEventListener('click',()=>startCam().catch(e=>setStatus(e.message)));
  $('camStop').addEventListener('click',()=>{stopCam();$('camStart').classList.remove('hide')});
  $('sus').addEventListener('change',e=>checkSuspect(e).catch(err=>$('matchOut').textContent=err.message));
  $('f2').addEventListener('change',e=>{T.match=null;e.target.files[0]&&analyse(e.target.files[0]).catch(err=>$('sigOut').textContent=err.message)});
  $('chkList').addEventListener('change',e=>{const m=e.target.name&&e.target.name.match(/^chk_(.+)$/);if(m){chk[m[1]]=e.target.value;buildReport()}});
  ['evUrl','evDate','evNotes'].forEach(i=>$(i).addEventListener('input',buildReport));
  $('evCopy').addEventListener('click',copyReport);$('evDl').addEventListener('click',dlReport);
  $('wipe').addEventListener('click',wipe);
  addEventListener('hashchange',()=>{if(location.hash!=='#outils')stopCam()});
  addEventListener('pagehide',stopCam);
  document.addEventListener('langchange',()=>{renderChecklist();if(T.file2&&T.signals)buildReport()});
  boot().catch(()=>{});
  pending();
};
})();
