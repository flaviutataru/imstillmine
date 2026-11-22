/* Moteurs avancés, tous exécutés dans le navigateur.
   1) ArcFace (InsightFace w600k_mbf, MobileFaceNet entraîné sur WebFace600K, 512-d) via ONNX Runtime Web.
      LICENCE : les modèles InsightFace sont « non-commercial research purposes only ».
      ARCFACE_PUBLIC doit rester false sur le site public tant qu'une autorisation écrite n'a pas été obtenue
      (contact indiqué par InsightFace : recognition-oss-pack@insightface.ai).
   (La recherche d’empreinte PRNU et le détecteur tournent sur notre serveur, pas ici.) */
(() => {
const ARCFACE_PUBLIC = false;           /* autorisation de licence obtenue ? */
const ARCFACE_DEMO = false;              // InsightFace weights are NOT included (non-commercial licence). See docs.

window.ARCFACE_ON = ARCFACE_PUBLIC || ARCFACE_DEMO;
const ARC_MODEL = 'models/arcface/w600k_mbf.onnx';
const ORT_MJS = 'ort-wasm-simd-threaded.mjs', ORT_WASM = 'ort-wasm-simd-threaded.wasm';
let arcSess = null, arcLoading = null;

function loadScript(src){return new Promise((ok,ko)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>ko(new Error('script '+src));document.head.appendChild(s)})}

/* ---------------- ArcFace ---------------- */
async function arcInit(){
  if(arcSess) return arcSess;
  if(arcLoading) return arcLoading;
  arcLoading=(async()=>{
    if(!window.ort) await loadScript('lib/ort/ort.wasm.min.js');
    const base=new URL('lib/ort/',location.href).href;
    ort.env.wasm.wasmPaths={mjs:base+ORT_MJS,wasm:base+ORT_WASM};
    ort.env.wasm.numThreads=1;          /* pas d'isolation cross-origin requise */
    arcSess=await ort.InferenceSession.create(ARC_MODEL,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
    return arcSess;
  })();
  try{return await arcLoading}catch(e){arcLoading=null;throw e}
}
/* gabarit ArcFace 112×112 (5 points : œil g., œil d., nez, coin bouche g., coin bouche d.) */
const TPL=[[38.2946,51.6963],[73.5318,51.5014],[56.0252,71.7366],[41.5493,92.3655],[70.7299,92.2041]];
function five(lm){
  const p=lm.positions,avg=a=>({x:a.reduce((s,i)=>s+p[i].x,0)/a.length,y:a.reduce((s,i)=>s+p[i].y,0)/a.length});
  /* points 68 (iBUG) : 36-41 œil gauche de l'image, 42-47 œil droit, 30 bout du nez, 48 et 54 coins de la bouche */
  const L=avg([36,37,38,39,40,41]),R=avg([42,43,44,45,46,47]);
  return [[L.x,L.y],[R.x,R.y],[p[30].x,p[30].y],[p[48].x,p[48].y],[p[54].x,p[54].y]];
}
/* similitude 2D (moindres carrés, Umeyama sans réflexion) : src -> dst */
function simil(src,dst){
  const n=src.length;let msx=0,msy=0,mdx=0,mdy=0;
  for(let i=0;i<n;i++){msx+=src[i][0];msy+=src[i][1];mdx+=dst[i][0];mdy+=dst[i][1]}
  msx/=n;msy/=n;mdx/=n;mdy/=n;let num1=0,num2=0,den=0;
  for(let i=0;i<n;i++){const sx=src[i][0]-msx,sy=src[i][1]-msy,dx=dst[i][0]-mdx,dy=dst[i][1]-mdy;num1+=sx*dx+sy*dy;num2+=sx*dy-sy*dx;den+=sx*sx+sy*sy}
  const a=num1/den,b=num2/den;
  return {a,b,tx:mdx-(a*msx-b*msy),ty:mdy-(b*msx+a*msy)};
}
/* source : image, vidéo ou canvas ; lm : landmarks face-api dans le repère de la source */
async function arcEmbed(source,lm){
  const s=await arcInit();
  const M=simil(five(lm),TPL);
  const c=document.createElement('canvas');c.width=112;c.height=112;
  const x=c.getContext('2d',{willReadFrequently:true});
  x.fillStyle='#000';x.fillRect(0,0,112,112);
  x.setTransform(M.a,M.b,-M.b,M.a,M.tx,M.ty);x.imageSmoothingQuality='high';x.drawImage(source,0,0);
  const D=x.getImageData(0,0,112,112).data,N=112*112,f=new Float32Array(3*N);
  for(let i=0;i<N;i++){f[i]=(D[i*4]-127.5)/127.5;f[N+i]=(D[i*4+1]-127.5)/127.5;f[2*N+i]=(D[i*4+2]-127.5)/127.5}
  const out=await s.run({[s.inputNames[0]]:new ort.Tensor('float32',f,[1,3,112,112])});
  const e=out[s.outputNames[0]].data;let nrm=0;for(const v of e)nrm+=v*v;nrm=Math.sqrt(nrm)||1;
  return Float32Array.from(e,v=>v/nrm);
}
const cos=(a,b)=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s};
window.Moteurs={arcInit,arcEmbed,cos,ARCFACE_PUBLIC};
})();
