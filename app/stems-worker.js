'use strict';
/* =====================================================================
   Mixlab · séparation des stems, « qualité rapide » (DSP, sans modèle)
   Tourne dans un Web Worker (créé par stems.js à partir de ce code) ou,
   si le navigateur refuse le worker, sur le fil principal par tranches.

   Méthode, trame par trame (STFT, fenêtre racine de Hann, N = 4096 à
   44,1/48 kHz, recouvrement de moitié) :
   - batterie : séparation harmonique / percussive par filtres médians
     (médiane dans le temps = ce qui tient, médiane en fréquence = ce qui
     frappe), masques de Wiener ; dans le grave, la queue d'un coup de
     grosse caisse qui décroît après l'attaque reste à la batterie ;
   - basse : la partie harmonique sous ~200 Hz (fondu jusqu'à 320 Hz) ;
   - voix : la partie harmonique entre 150 Hz et 9 kHz qui est au centre
     de l'image stéréo (gauche et droite en phase) et qui bouge
     (présente sur une demi-seconde, absente de la médiane sur une
     seconde : notes chantées, syllabes) ;
   - mélodie : le reste exact (mix − voix − batterie − basse), donc la
     somme des 4 stems redonne le morceau d'origine.
   Limites : un synthé lead au centre part avec la voix, les sifflantes
   avec la batterie, une basse très percussive en partie avec la batterie.
   ===================================================================== */
function MixlabStemsCore(){
  const VERSION='dsp1';
  /* FFT complexe radix 2, en place */
  function makeFFT(N){
    const lg=Math.round(Math.log2(N)),rev=new Uint32Array(N),cs=new Float64Array(N/2),sn=new Float64Array(N/2);
    for(let i=0;i<N;i++){let r=0;for(let b=0;b<lg;b++)r|=((i>>b)&1)<<(lg-1-b);rev[i]=r;}
    for(let i=0;i<N/2;i++){cs[i]=Math.cos(2*Math.PI*i/N);sn[i]=Math.sin(2*Math.PI*i/N);}
    return function fft(re,im,inv){
      for(let i=0;i<N;i++){const j=rev[i];if(j>i){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t;}}
      const sg=inv?1:-1;
      for(let size=2;size<=N;size<<=1){
        const half=size>>1,step=N/size;
        for(let st=0;st<N;st+=size){
          for(let k=0,tw=0;k<half;k++,tw+=step){
            const wr=cs[tw],wi=sg*sn[tw],a=st+k,b=a+half;
            const xr=re[b]*wr-im[b]*wi,xi=re[b]*wi+im[b]*wr;
            re[b]=re[a]-xr;im[b]=im[a]-xi;re[a]+=xr;im[a]+=xi;
          }
        }
      }
      if(inv){const s=1/N;for(let i=0;i<N;i++){re[i]*=s;im[i]*=s;}}
    };
  }
  /* médiane de n valeurs (tri par insertion : n reste petit) */
  function median(a,n){
    for(let i=1;i<n;i++){const x=a[i];let j=i-1;while(j>=0&&a[j]>x){a[j+1]=a[j];j--;}a[j+1]=x;}
    return n&1?a[n>>1]:.5*(a[(n>>1)-1]+a[n>>1]);
  }
  /* Générateur : rend la progression (0 à 1) de temps en temps, puis le résultat.
     L, R : Float32Array du morceau ; sortie : 8 Float32Array (voix G/D, batterie G/D, basse G/D, mélodie G/D). */
  function* separate(L,R,sr,opt){
    opt=opt||{};const CP=opt.cpow||4,FK=opt.fk==null?.5:opt.fk;
    const n=L.length,N=sr>60000?8192:4096,H=N/2,K=N/2+1,hz=sr/N;
    const fft=makeFFT(N),win=new Float64Array(N);
    for(let i=0;i<N;i++)win[i]=Math.sin(Math.PI*(i+.5)/N);
    // noyaux des filtres médians : en trames (temps) et en cases (fréquence)
    const fr=sr/H,WS=Math.max(5,(Math.round(.42*fr)|1)),WL=Math.max(WS+4,(Math.round(1.0*fr)|1)),WF=17,D=(WL-1)>>1,A=WS>>1,RING=WL+1;
    const frames=Math.ceil((n+H)/H);
    const kB0=Math.round(200/hz),kB1=Math.round(320/hz),kV0=Math.round(130/hz),kV1=Math.round(180/hz),kV2=Math.round(7000/hz),kV3=Math.min(K-1,Math.round(9500/hz)),kLow=Math.round(260/hz);
    const bandB=new Float32Array(K),bandV=new Float32Array(K);
    for(let k=0;k<K;k++){
      bandB[k]=k<=kB0?1:k>=kB1?0:.5+.5*Math.cos(Math.PI*(k-kB0)/(kB1-kB0));
      bandV[k]=k<kV0||k>kV3?0:k<kV1?.5-.5*Math.cos(Math.PI*(k-kV0)/(kV1-kV0)):k<=kV2?1:.5+.5*Math.cos(Math.PI*(k-kV2)/(kV3-kV2));
    }
    // anneaux : spectres (G, D) et magnitudes des trames en attente
    const ZL=[],ZR=[],ML=[],MR=[],MAG=[];
    for(let i=0;i<RING;i++){ZL.push([new Float32Array(K),new Float32Array(K)]);ZR.push([new Float32Array(K),new Float32Array(K)]);MAG.push(new Float32Array(K));}
    const re=new Float64Array(N),im=new Float64Array(N),tmp=new Float32Array(Math.max(WL,WF)+1);
    const out=[];for(let i=0;i<8;i++)out.push(new Float32Array(n));
    const [vL,vR,dL,dR,bL,bR,mL,mR]=out;
    const kick=new Float32Array(kLow+1),prev=new Float32Array(kLow+1);
    const mV=new Float32Array(K),mD=new Float32Array(K),mB=new Float32Array(K);
    const hs=new Float32Array(K),hl=new Float32Array(K),pc=new Float32Array(K);
    const decay=Math.exp(-(H/sr)/.16),KTH=.3,ATT=Math.max(2,Math.round(.1*fr));let katt=0;
    const eps=1e-10;
    // médianes dans le temps : une fenêtre triée par case, glissée d'une trame à chaque pas (hors du morceau : 0)
    const SS=new Float32Array(K*WS),SL=new Float32Array(K*WL);
    const magAt=(t,k)=>t<0||t>=frames?0:MAG[t%RING][k];
    function slide(a,o,W,ov,nv){
      if(ov===nv)return;
      let lo=o,hi=o+W-1;while(lo<hi){const m=(lo+hi)>>1;if(a[m]<ov)lo=m+1;else hi=m;}
      let i=lo;const e=o+W-1;
      if(nv>ov){while(i<e&&a[i+1]<nv){a[i]=a[i+1];i++;}}
      else{while(i>o&&a[i-1]>nv){a[i]=a[i-1];i--;}}
      a[i]=nv;
    }
    function advance(u){
      for(let k=0;k<K;k++){
        slide(SS,k*WS,WS,magAt(u-1-A,k),magAt(u+A,k));
        if(bandV[k]>0)slide(SL,k*WL,WL,magAt(u-1-D,k),magAt(u+D,k));
      }
    }

    function analyse(t){
      const s0=t*H-H,slot=t%RING,[lr,li]=ZL[slot],[rr,ri]=ZR[slot],mg=MAG[slot];
      for(let i=0;i<N;i++){const j=s0+i,w=win[i];if(j>=0&&j<n){re[i]=L[j]*w;im[i]=R[j]*w;}else{re[i]=0;im[i]=0;}}
      fft(re,im,false);
      for(let k=0;k<K;k++){
        const k2=k===0?0:N-k,a=re[k],b=im[k],c=re[k2],d=im[k2];
        const xr=.5*(a+c),xi=.5*(b-d),yr=.5*(b+d),yi=.5*(c-a);
        lr[k]=xr;li[k]=xi;rr[k]=yr;ri[k]=yi;
        mg[k]=Math.sqrt(.5*(xr*xr+xi*xi+yr*yr+yi*yi));
      }
    }
    function synth(u,mask,oL,oR){
      const slot=u%RING,[lr,li]=ZL[slot],[rr,ri]=ZR[slot];
      for(let k=0;k<K;k++){
        const m=mask[k],p=lr[k]*m,q=li[k]*m,r=rr[k]*m,s=ri[k]*m;
        re[k]=p-s;im[k]=q+r;
        if(k>0&&k<N/2){re[N-k]=p+s;im[N-k]=r-q;}
      }
      fft(re,im,true);
      const s0=u*H-H;
      for(let i=0;i<N;i++){const j=s0+i;if(j>=0&&j<n){const w=win[i];oL[j]+=re[i]*w;oR[j]+=im[i]*w;}}
    }
    function masks(u){
      const slot=u%RING,mg=MAG[slot],[lr,li]=ZL[slot],[rr,ri]=ZR[slot];
      if(u===0)for(let x=-D;x<0;x++)advance(x);
      advance(u);
      for(let k=0;k<K;k++){
        // percussif : médiane en fréquence
        const f0=Math.max(0,k-(WF>>1)),f1=Math.min(K-1,k+(WF>>1));let c=0;
        for(let j=f0;j<=f1;j++)tmp[c++]=mg[j];
        pc[k]=median(tmp,c);
        // harmonique : médiane dans le temps (courte) ; tenu : médiane longue, dans la bande de la voix
        hs[k]=SS[k*WS+A];
        hl[k]=bandV[k]>0?SL[k*WL+D]:hs[k];
      }
      // attaque percussive dans le grave (grosse caisse) : part percussive pondérée par l'énergie
      let pn=0,pd=eps;
      for(let k=2;k<=kLow;k++){const P=pc[k]*pc[k],Hh=hs[k]*hs[k],w=mg[k]*mg[k];pn+=w*P/(P+Hh+eps);pd+=w;}
      const onset=pn/pd>KTH;
      if(onset)katt=ATT;else if(katt>0)katt--;
      for(let k=0;k<K;k++){
        const P=pc[k]*pc[k],Hh=hs[k]*hs[k];let d=P/(P+Hh+eps);
        if(k<=kLow){
          // l'énergie qui monte pendant l'attaque puis décroît reste à la batterie (queue de la grosse caisse)
          const m=mg[k];
          if(katt>0)kick[k]=Math.max(kick[k]*decay,m);else kick[k]*=decay;
          if((katt>0||m<=prev[k]*1.08)&&m>eps){const r=Math.min(1,kick[k]/m);d=Math.max(d,r*r);}
          prev[k]=m;
        }
        const h=1-d;
        // voix : centre de l'image stéréo et énergie qui bouge (absente de la médiane longue)
        let v=0;
        if(bandV[k]>0&&h>0){
          const sr_=lr[k]+rr[k],si=li[k]+ri[k],sum=Math.sqrt(lr[k]*lr[k]+li[k]*li[k])+Math.sqrt(rr[k]*rr[k]+ri[k]*ri[k])+eps;
          const cen=Math.sqrt(sr_*sr_+si*si)/sum,ce=Math.pow(cen,CP);
          const F=Math.max(0,hs[k]-FK*hl[k]),Fv=F*F/(F*F+hl[k]*hl[k]+eps);
          v=h*bandV[k]*ce*Fv;
        }
        const b=h*bandB[k]*(1-v);
        mD[k]=d;mB[k]=b;mV[k]=v*(1-bandB[k]);
      }
    }
    const total=frames+D;let last=0;
    for(let t=0;t<total;t++){
      if(t<frames)analyse(t);
      const u=t-D;
      if(u>=0&&u<frames){masks(u);synth(u,mV,vL,vR);synth(u,mD,dL,dR);synth(u,mB,bL,bR);}
      if(t-last>=64){last=t;yield t/total;}
    }
    for(let i=0;i<n;i++){mL[i]=L[i]-vL[i]-dL[i]-bL[i];mR[i]=R[i]-vR[i]-dR[i]-bR[i];}
    return out;
  }
  return{separate,VERSION};
}
/* lancement dans un worker : {L, R, sr} → messages {p} puis {done, out} */
function MixlabStemsWorkerBoot(){
  const core=MixlabStemsCore();
  self.onmessage=e=>{
    const{L,R,sr,id}=e.data;
    try{
      const g=core.separate(L,R,sr);let r;
      while(!(r=g.next()).done)self.postMessage({id,p:r.value});
      self.postMessage({id,done:true,out:r.value},r.value.map(a=>a.buffer));
    }catch(err){self.postMessage({id,error:String(err&&err.message||err)});}
  };
}
if(typeof window==='undefined'&&typeof self!=='undefined'&&typeof importScripts==='function')MixlabStemsWorkerBoot();
if(typeof module!=='undefined'&&module.exports)module.exports={MixlabStemsCore};
