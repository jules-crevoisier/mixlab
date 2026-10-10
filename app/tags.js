'use strict';
/* =====================================================================
   Mixlab · lecture des tags des fichiers audio (pur JavaScript)
   - MP3 : ID3v2.2, 2.3 et 2.4 (et ID3v1 en secours).
   - MP4 / M4A / AAC : atomes iTunes (moov › udta › meta › ilst).
   - FLAC : commentaires Vorbis et bloc PICTURE.
   - Ogg Vorbis et Opus : commentaires Vorbis (pochette METADATA_BLOCK_PICTURE).
   Champs : titre, artiste, album, genre, année, commentaire, BPM, tonalité, pochette.
   Les tags préremplissent le morceau sans jamais écraser ce que tu as modifié
   dans la bibliothèque. La pochette devient une petite vignette (URL d'objet).
   ===================================================================== */
window.Tags=(()=>{
  const GENRES=('Blues|Classic Rock|Country|Dance|Disco|Funk|Grunge|Hip-Hop|Jazz|Metal|New Age|Oldies|Other|Pop|R&B|Rap|Reggae|Rock|Techno|Industrial|'+
    'Alternative|Ska|Death Metal|Pranks|Soundtrack|Euro-Techno|Ambient|Trip-Hop|Vocal|Jazz+Funk|Fusion|Trance|Classical|Instrumental|Acid|House|Game|'+
    'Sound Clip|Gospel|Noise|AlternRock|Bass|Soul|Punk|Space|Meditative|Instrumental Pop|Instrumental Rock|Ethnic|Gothic|Darkwave|Techno-Industrial|'+
    'Electronic|Pop-Folk|Eurodance|Dream|Southern Rock|Comedy|Cult|Gangsta|Top 40|Christian Rap|Pop/Funk|Jungle|Native American|Cabaret|New Wave|'+
    'Psychedelic|Rave|Showtunes|Trailer|Lo-Fi|Tribal|Acid Punk|Acid Jazz|Polka|Retro|Musical|Rock & Roll|Hard Rock|Folk|Folk-Rock|National Folk|Swing|'+
    'Fast Fusion|Bebop|Latin|Revival|Celtic|Bluegrass|Avantgarde|Gothic Rock|Progressive Rock|Psychedelic Rock|Symphonic Rock|Slow Rock|Big Band|Chorus|'+
    'Easy Listening|Acoustic|Humour|Speech|Chanson|Opera|Chamber Music|Sonata|Symphony|Booty Bass|Primus|Porn Groove|Satire|Slow Jam|Club|Tango|Samba|'+
    'Folklore|Ballad|Power Ballad|Rhythmic Soul|Freestyle|Duet|Punk Rock|Drum Solo|A capella|Euro-House|Dance Hall|Goa|Drum & Bass|Club-House|Hardcore|'+
    'Terror|Indie|BritPop').split('|');
  const dec={};
  const td=(bytes,enc)=>{try{const d=dec[enc]||(dec[enc]=new TextDecoder(enc));return d.decode(bytes);}catch(e){return'';}};
  const clean=s=>String(s||'').replace(/\u0000+$/,'').replace(/^﻿/,'').trim();
  const str=(u,o,n)=>{let s='';for(let i=0;i<n&&o+i<u.length;i++)s+=String.fromCharCode(u[o+i]);return s;};
  const be32=(u,o)=>((u[o]<<24)>>>0)+(u[o+1]<<16)+(u[o+2]<<8)+u[o+3];
  const le32=(u,o)=>(u[o]|(u[o+1]<<8)|(u[o+2]<<16))+((u[o+3]<<24)>>>0);
  const ss32=(u,o)=>((u[o]&127)<<21)|((u[o+1]&127)<<14)|((u[o+2]&127)<<7)|(u[o+3]&127);
  // Genre ID3 : « (17) », « 17 », « (17)Rock » ou du texte libre.
  function genreName(g){
    g=clean(g);if(!g)return'';
    const m=/^\((\d+)\)(.*)$/.exec(g);if(m)return clean(m[2])||GENRES[+m[1]]||'';
    if(/^\d+$/.test(g))return GENRES[+g]||'';
    return g.replace(/\((RX|CR)\)/g,'').trim();
  }

  /* ---------- ID3v2 ---------- */
  const ENC=['latin1','utf-16','utf-16be','utf-8'];
  const unsync=u=>{const o=[];for(let i=0;i<u.length;i++){o.push(u[i]);if(u[i]===0xFF&&u[i+1]===0)i++;}return Uint8Array.from(o);};
  // Fin d'une chaîne terminée par zéro (un octet ou deux selon l'encodage).
  function zEnd(u,o,enc){
    if(enc===1||enc===2){for(let i=o;i+1<u.length;i+=2)if(u[i]===0&&u[i+1]===0)return i;return u.length;}
    for(let i=o;i<u.length;i++)if(u[i]===0)return i;return u.length;
  }
  const txt=(u,enc,o=0,e=u.length)=>{let s=td(u.subarray(o,e),ENC[enc]||'latin1');
    // ID3v2.4 : plusieurs valeurs séparées par des zéros
    return s.split('\u0000').map(x=>clean(x)).filter(Boolean).join(', ');};
  function id3v2(u,R){
    if(u.length<10||str(u,0,3)!=='ID3')return 0;
    const ver=u[3],fl=u[5],size=ss32(u,6),end=Math.min(u.length,10+size);
    let body=u.subarray(10,end);
    if(ver<4&&(fl&0x80))body=unsync(body);
    let p=0;
    if(fl&0x40){p=ver===4?ss32(body,0):be32(body,0)+4;}
    const idLen=ver===2?3:4,hdr=ver===2?6:10;
    while(p+hdr<=body.length){
      const id=str(body,p,idLen);if(!/^[A-Z0-9]{3,4}$/.test(id))break;
      let n=ver===2?(body[p+3]<<16)|(body[p+4]<<8)|body[p+5]:ver===4?ss32(body,p+4):be32(body,p+4);
      const ff=ver===2?0:(body[p+8]<<8)|body[p+9];
      let d=body.subarray(p+hdr,Math.min(body.length,p+hdr+n));p+=hdr+n;
      if(ver===4){if(ff&0x0001)d=d.subarray(4);if(ff&0x0002)d=unsync(d);if(ff&0x000C)continue;}
      else if(ver===3&&(ff&0x00C0))continue;
      if(!d.length)continue;
      frame(id,d,R);
    }
    return end;
  }
  const T2={TT2:'TIT2',TP1:'TPE1',TAL:'TALB',TCO:'TCON',TYE:'TYER',TDA:'TDAT',COM:'COMM',TBP:'TBPM',TKE:'TKEY',PIC:'APIC'};
  function frame(id,d,R){
    const v22=id.length===3;id=T2[id]||id;const enc=d[0];
    switch(id){
      case 'TIT2':R.title=R.title||txt(d,enc,1);break;
      case 'TPE1':R.artist=R.artist||txt(d,enc,1);break;
      case 'TALB':R.album=R.album||txt(d,enc,1);break;
      case 'TCON':R.genre=R.genre||genreName(txt(d,enc,1).split(', ')[0]);break;
      case 'TYER':case 'TDRC':case 'TDOR':{const y=/\d{4}/.exec(txt(d,enc,1));if(y&&!R.year)R.year=+y[0];break;}
      case 'TBPM':{const b=parseFloat(txt(d,enc,1).replace(',','.'));if(b>0&&!R.bpm)R.bpm=b;break;}
      case 'TKEY':R.key=R.key||txt(d,enc,1);break;
      case 'COMM':{
        // langue sur 3 octets, description, puis le texte ; on préfère le commentaire sans description
        const de=zEnd(d,4,enc),te=de+(enc===1||enc===2?2:1),desc=txt(d,enc,4,de),val=txt(d,enc,te);
        if(val&&(!R.comment||(!desc&&R._cdesc))){R.comment=val;R._cdesc=!!desc;}
        break;}
      case 'TXXX':{
        const de=zEnd(d,1,enc),desc=txt(d,enc,1,de).toUpperCase(),val=txt(d,enc,de+(enc===1||enc===2?2:1));
        if((desc==='INITIALKEY'||desc==='KEY')&&!R.key)R.key=val;
        if((desc==='BPM'||desc==='TEMPO')&&!R.bpm){const b=parseFloat(val);if(b>0)R.bpm=b;}
        break;}
      case 'APIC':{
        let o=1,mime;
        if(v22){mime=str(d,1,3).toLowerCase()==='png'?'image/png':'image/jpeg';o=4;}
        else{const me=zEnd(d,1,0);mime=str(d,1,me-1).toLowerCase()||'image/jpeg';o=me+1;}
        const type=d[o];o++;const de=zEnd(d,o,enc);o=de+(enc===1||enc===2?2:1);
        pic(R,d.subarray(o),mime,type);
        break;}
    }
  }
  // Pochette : on garde la face avant (type 3) si elle existe, sinon la première image.
  function pic(R,data,mime,type){
    if(!data||data.length<8)return;
    if(R.picture&&R.picture.type===3)return;
    if(R.picture&&type!==3)return;
    if(!/^image\//.test(mime))mime=data[0]===0x89?'image/png':'image/jpeg';
    if(mime==='image/jpg')mime='image/jpeg';
    R.picture={mime,type,data:data.slice()};
  }
  function id3v1(u,R){
    if(u.length<128)return;const o=u.length-128;if(str(u,o,3)!=='TAG')return;
    const f=(a,n)=>clean(td(u.subarray(o+a,o+a+n),'latin1').split('\u0000')[0]);
    R.title=R.title||f(3,30);R.artist=R.artist||f(33,30);R.album=R.album||f(63,30);
    const y=/\d{4}/.exec(f(93,4));if(y&&!R.year)R.year=+y[0];
    R.comment=R.comment||f(97,u[o+125]===0?28:30);
    if(!R.genre&&u[o+127]<GENRES.length)R.genre=GENRES[u[o+127]];
  }

  /* ---------- MP4 / M4A ---------- */
  function atoms(u,s,e,fn){
    let p=s;
    while(p+8<=e){
      let n=be32(u,p);const t=str(u,p+4,4);let h=8;
      if(n===1){n=be32(u,p+8)*4294967296+be32(u,p+12);h=16;}else if(n===0)n=e-p;
      if(n<h||p+n>e)break;
      if(fn(t,p+h,p+n)===false)return;
      p+=n;
    }
  }
  function mp4(u,R){
    let ok=false;
    const item=(t,s,e)=>{
      if(t==='----'){
        let name='',val=null;
        atoms(u,s,e,(t2,s2,e2)=>{if(t2==='name')name=td(u.subarray(s2+4,e2),'utf-8');if(t2==='data')val=td(u.subarray(s2+8,e2),'utf-8');});
        name=name.toUpperCase();
        if((name==='INITIALKEY'||name==='KEY')&&val&&!R.key)R.key=clean(val);
        if(name==='BPM'&&val&&!R.bpm){const b=parseFloat(val);if(b>0)R.bpm=b;}
        return;
      }
      atoms(u,s,e,(t2,s2,e2)=>{
        if(t2!=='data')return;
        const kind=be32(u,s2)&0xFFFFFF,d=u.subarray(s2+8,e2),text=()=>clean(td(d,'utf-8'));
        switch(t){
          case '©nam':R.title=R.title||text();break;
          case '©ART':R.artist=R.artist||text();break;
          case 'aART':R.albumArtist=R.albumArtist||text();break;
          case '©alb':R.album=R.album||text();break;
          case '©gen':R.genre=R.genre||text();break;
          case 'gnre':if(!R.genre&&d.length>=2){const g=(d[0]<<8)|d[1];R.genre=GENRES[g-1]||'';}break;
          case '©day':{const y=/\d{4}/.exec(text());if(y&&!R.year)R.year=+y[0];break;}
          case '©cmt':R.comment=R.comment||text();break;
          case 'tmpo':if(!R.bpm&&d.length>=1){const b=d.length>=2?(d[0]<<8)|d[1]:d[0];if(b>0)R.bpm=b;}break;
          case 'covr':pic(R,d,kind===14?'image/png':kind===13?'image/jpeg':d[0]===0x89?'image/png':'image/jpeg',3);break;
        }
        return false;
      });
    };
    const meta=(s,e)=>{
      // « meta » est une full box (4 octets de version) en MP4, mais pas dans les fichiers QuickTime
      const s2=str(u,s+4,4)==='hdlr'?s:s+4;
      atoms(u,s2,e,(t,a,b)=>{if(t==='ilst'){ok=true;atoms(u,a,b,item);}});
    };
    atoms(u,0,u.length,(t,s,e)=>{
      if(t!=='moov')return;
      atoms(u,s,e,(t2,s2,e2)=>{
        if(t2==='udta')atoms(u,s2,e2,(t3,s3,e3)=>{if(t3==='meta')meta(s3,e3);});
        else if(t2==='meta')meta(s2,e2);
      });
      return false;
    });
    return ok;
  }

  /* ---------- commentaires Vorbis (FLAC, Ogg) ---------- */
  function b64(s){try{const b=atob(s.replace(/\s+/g,''));const u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;}catch(e){return null;}}
  function flacPicture(d,R){
    if(!d||d.length<32)return;
    let o=0;const type=be32(d,o);o+=4;const ml=be32(d,o);o+=4;const mime=str(d,o,ml).toLowerCase();o+=ml;
    const dl=be32(d,o);o+=4+dl+16;const n=be32(d,o);o+=4;
    pic(R,d.subarray(o,o+n),mime,type);
  }
  function vorbis(d,R){
    let o=0;if(d.length<8)return;
    const vl=le32(d,o);o+=4+vl;if(o+4>d.length)return;
    const n=le32(d,o);o+=4;
    for(let i=0;i<n&&o+4<=d.length;i++){
      const l=le32(d,o);o+=4;const s=td(d.subarray(o,o+l),'utf-8');o+=l;
      const k=s.indexOf('=');if(k<1)continue;
      const key=s.slice(0,k).toUpperCase(),v=clean(s.slice(k+1));if(!v&&key!=='METADATA_BLOCK_PICTURE')continue;
      switch(key){
        case 'TITLE':R.title=R.title||v;break;
        case 'ARTIST':R.artist=R.artist||v;break;
        case 'ALBUM':R.album=R.album||v;break;
        case 'GENRE':R.genre=R.genre||genreName(v);break;
        case 'DATE':case 'YEAR':case 'ORIGINALDATE':{const y=/\d{4}/.exec(v);if(y&&!R.year)R.year=+y[0];break;}
        case 'COMMENT':case 'DESCRIPTION':R.comment=R.comment||v;break;
        case 'BPM':case 'TEMPO':{const b=parseFloat(v.replace(',','.'));if(b>0&&!R.bpm)R.bpm=b;break;}
        case 'INITIALKEY':case 'KEY':R.key=R.key||v;break;
        case 'METADATA_BLOCK_PICTURE':flacPicture(b64(s.slice(k+1)),R);break;
      }
    }
  }
  function flac(u,R,o){
    if(str(u,o,4)!=='fLaC')return false;
    o+=4;
    for(let guard=0;o+4<=u.length&&guard<128;guard++){
      const hd=u[o],last=hd&0x80,type=hd&0x7F,n=(u[o+1]<<16)|(u[o+2]<<8)|u[o+3];o+=4;
      const d=u.subarray(o,Math.min(u.length,o+n));o+=n;
      if(type===4)vorbis(d,R);else if(type===6)flacPicture(d,R);
      if(last)break;
    }
    return true;
  }
  // Ogg : on recolle les paquets du premier flux ; le deuxième porte les commentaires.
  function ogg(u,R){
    if(str(u,0,4)!=='OggS')return false;
    let o=0,serial=null,cur=[],pk=0;
    while(o+27<=u.length&&str(u,o,4)==='OggS'){
      const ns=u[o+26],sr=le32(u,o+14),segs=u.subarray(o+27,o+27+ns);let p=o+27+ns;
      for(const L of segs){
        if(serial===null)serial=sr;
        if(sr===serial){cur.push(u.subarray(p,p+L));
          if(L<255){
            pk++;
            if(pk===2){
              const tot=cur.reduce((a,b)=>a+b.length,0),d=new Uint8Array(tot);let q=0;cur.forEach(c=>{d.set(c,q);q+=c.length;});
              if(d[0]===3&&str(d,1,6)==='vorbis')vorbis(d.subarray(7),R);
              else if(str(d,0,8)==='OpusTags')vorbis(d.subarray(8),R);
              return true;
            }
            cur=[];
          }
        }
        p+=L;
      }
      o=p;
    }
    return true;
  }

  /* ---------- point d'entrée ---------- */
  // Renvoie {title, artist, album, genre, year, comment, bpm, key, picture:{mime,type,data}} (champs absents omis).
  function parse(buf){
    const u=buf instanceof Uint8Array?buf:new Uint8Array(buf.buffer?buf.buffer:buf,buf.byteOffset||0,buf.byteLength);
    const R={};
    try{
      const end=id3v2(u,R);
      if(!flac(u,R,end)&&!ogg(u,R)&&str(u,4,4)==='ftyp')mp4(u,R);
      id3v1(u,R);
    }catch(e){console.warn('Tags',e);}
    delete R._cdesc;
    if(R.bpm&&!(R.bpm>=40&&R.bpm<=300))delete R.bpm;
    if(!R.artist&&R.albumArtist)R.artist=R.albumArtist;delete R.albumArtist;
    for(const k of Object.keys(R))if(R[k]===''||R[k]==null)delete R[k];
    return R;
  }

  /* ---------- vignettes ---------- */
  // Image réduite à 96 px (JPEG) : légère en mémoire, même pour des pochettes de plusieurs Mo.
  async function thumb(p,size=96){
    if(!p)return null;
    const blob=new Blob([p.data],{type:p.mime});
    try{
      if(typeof createImageBitmap!=='function')throw 0;
      const bm=await createImageBitmap(blob),k=Math.min(1,size/Math.max(bm.width,bm.height));
      const w=Math.max(1,Math.round(bm.width*k)),hh=Math.max(1,Math.round(bm.height*k));
      const cv=document.createElement('canvas');cv.width=w;cv.height=hh;cv.getContext('2d').drawImage(bm,0,0,w,hh);bm.close&&bm.close();
      const out=await new Promise(r=>cv.toBlob(r,'image/jpeg',.85));
      return URL.createObjectURL(out||blob);
    }catch(e){return URL.createObjectURL(blob);}
  }

  /* ---------- préremplissage ----------
     Un champ prend la valeur du tag s'il est vide, ou s'il vaut encore ce que Mixlab
     a déduit du nom du fichier. Une valeur que tu as tapée n'est jamais remplacée. */
  function fromName(file){
    const name=String(file||'').split(/[\\/]/).pop().replace(/\.[^.]+$/,''),m=/^(.+?)\s+-\s+(.+)$/.exec(name);
    return{title:m?m[2]:name,artist:m?m[1]:''};
  }
  async function apply(t,R){
    if(!t||!R)return false;
    const def=fromName(t.file||t.path),free=(k,d)=>t[k]==null||t[k]===''||(d!=null&&t[k]===d);
    let ch=false;const set=(k,v)=>{if(v!=null&&v!==''&&t[k]!==v){t[k]=v;ch=true;}};
    if(R.title&&free('title',def.title))set('title',R.title);
    if(R.artist&&free('artist',def.artist))set('artist',R.artist);
    if(R.genre&&free('genre'))set('genre',R.genre);
    if(R.comment&&free('comment'))set('comment',R.comment);
    if(R.album&&free('album'))set('album',R.album);
    if(R.year&&free('year'))set('year',R.year);
    if(R.bpm)t.tagBpm=R.bpm;
    if(R.key)t.tagKey=R.key;
    if(R.picture&&!t.art){const url=await thumb(R.picture);if(url){t.art=url;ch=true;}}
    if(ch){t.ov=null;refresh(t);}
    return ch;
  }
  // Tonalité du tag (8A, Am, F#m, 1m…) vers {pc, minor}, sinon null.
  const keyOf=s=>s&&window.LibPro&&LibPro.parseKey?LibPro.parseKey(s):null;

  /* ---------- affichage : vignette dans la liste et sur la platine ---------- */
  let rt=0;
  function refresh(t){
    clearTimeout(rt);rt=setTimeout(()=>{typeof renderTable==='function'&&renderTable();},60);
    if(typeof decks!=='undefined')decks.forEach(d=>{if(d.track===t)deckArt(d);});
  }
  function deckArt(d){
    const head=d.ui&&d.ui.title&&d.ui.title.parentElement;if(!head)return;
    let img=head.querySelector('img.dk-art');const url=d.track&&d.track.art;
    if(!url){if(img)img.remove();return;}
    if(!img){img=document.createElement('img');img.className='dk-art';img.alt='';head.prepend(img);}
    if(img.getAttribute('src')!==url)img.src=url;
  }
  function install(){
    const st=document.createElement('style');
    st.textContent='.lt td img.tart{width:18px;height:18px;object-fit:cover;border-radius:2px;vertical-align:middle;margin-right:6px}'+
      'img.dk-art{float:left;width:30px;height:30px;object-fit:cover;border-radius:3px;margin-right:8px}';
    document.head.append(st);
    if(typeof COLS!=='undefined'){
      const tc=COLS.find(c=>c.k==='title');
      if(tc&&!tc._art){const td0=tc.td;tc._art=true;tc.td=r=>{const cell=td0(r);if(r.t.art)cell.prepend(h('img',{class:'tart',src:r.t.art,alt:''}));return cell;};}
      const gi=COLS.findIndex(c=>c.k==='genre');
      if(gi>=0&&!COLS.some(c=>c.k==='album'))COLS.splice(gi+1,0,
        {k:'album',n:'Album',td:r=>h('td',{},r.t.album||''),sv:t=>t.album||''},
        {k:'year',n:'Année',td:r=>h('td',{class:'n'},r.t.year?String(r.t.year):''),sv:t=>t.year||0});
      // album et année masqués tant que tu n'as pas choisi tes colonnes
      if(window.LibPro&&LibPro.state&&store.get('libcols',null)==null){LibPro.state.hide.add('album');LibPro.state.hide.add('year');}
    }
    if(typeof Deck!=='undefined'&&!Deck.prototype._art){
      const ld=Deck.prototype.load;Deck.prototype._art=true;
      Deck.prototype.load=function(...a){const r=ld.apply(this,a);try{deckArt(this);}catch(e){}return r;};
    }
  }
  install();
  return{parse,apply,thumb,keyOf,genreName,fromName,GENRES};
})();
