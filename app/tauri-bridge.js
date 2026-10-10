'use strict';
/* =====================================================================
   Mixlab · pont vers l'application Tauri
   Dans l'appli, expose la même API que l'ancienne version Electron
   (window.mixlabNative) et un navigator.requestMIDIAccess branché sur
   le MIDI natif, car les WebView de macOS et de Linux n'ont pas Web MIDI.
   Dans un navigateur, ce fichier ne fait rien.
   ===================================================================== */
(()=>{
  const T=window.__TAURI__;if(!T||!T.core)return;
  const inv=T.core.invoke;

  window.mixlabNative={
    platform:'tauri',
    pickFiles:()=>inv('pick_files'),
    pickFolder:()=>inv('pick_folder'),
    readFile:path=>inv('read_file',{path}),
    exists:path=>inv('exists',{path}),
    // Un fichier glissé depuis l'explorateur arrive comme un File du navigateur :
    // il est lu directement, sans chemin à retenir.
    droppedPath:async()=>null,
    loadLibrary:()=>inv('library_load'),
    saveLibrary:json=>inv('library_save',{json}),
    // Bibliothèque pro : collections d'autres logiciels, exports, liens d'achat.
    pickLibraryFile:()=>inv('pick_library_file'),
    allowPaths:paths=>inv('allow_paths',{paths}),
    saveText:(name,text)=>inv('save_export',{name,text}),
    openShop:url=>inv('open_shop',{url}),
  };

  /* ---------- MIDI ---------- */
  let access=null;
  function makeInput(p){return{id:p.id,name:p.name,manufacturer:'',type:'input',state:'connected',onmidimessage:null};}
  function makeOutput(p){return{id:p.id,name:p.name,manufacturer:'',type:'output',state:'connected',send:data=>{inv('midi_send',{port:p.id,data:Array.from(data)});}};}
  async function open(){
    const r=await inv('midi_open');
    const keep=new Map([...access.inputs].map(([id,i])=>[id,i.onmidimessage]));
    access.inputs=new Map(r.inputs.map(p=>{const i=makeInput(p);i.onmidimessage=keep.get(p.id)||null;return[p.id,i];}));
    access.outputs=new Map(r.outputs.map(p=>[p.id,makeOutput(p)]));
  }
  async function request(){
    if(access)return access;
    access={inputs:new Map(),outputs:new Map(),sysexEnabled:false,onstatechange:null};
    await T.event.listen('midi',e=>{
      const i=access.inputs.get(e.payload.port);
      if(i&&i.onmidimessage)i.onmidimessage({data:new Uint8Array(e.payload.data),target:i});
    });
    await open();
    // Contrôleur branché ou débranché : on rouvre les ports et on prévient l'interface.
    let sig=await inv('midi_signature');
    setInterval(async()=>{
      const s=await inv('midi_signature');if(s===sig)return;sig=s;
      await open();if(access.onstatechange)access.onstatechange({});
    },2000);
    return access;
  }
  Object.defineProperty(navigator,'requestMIDIAccess',{value:request,configurable:true});
})();
