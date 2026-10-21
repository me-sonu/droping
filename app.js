const $=s=>document.querySelector(s);
const views=["homeView","createView","joinView","verifyView","dashboardView","settingsView","privacyView"];
const state={role:null,session:null,peerId:null,ws:null,peer:null,deviceName:"My Device",verified:false,cryptoKey:null,localJwk:null,peerJwk:null,timeout:15};
const CHUNK=48*1024;

function show(id){views.forEach(v=>$("#"+v).classList.toggle("active",v===id));scrollTo(0,0)}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("show"),3200)}
function setStatus(s){$("#headerStatusText").textContent=s}
function randomCode(){const a="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let s="";const r=new Uint32Array(6);crypto.getRandomValues(r);for(const n of r)s+=a[n%a.length];return s}
function deviceInfo(){const ua=navigator.userAgent;return /Android/i.test(ua)?"Android Phone":/iPhone|iPad/i.test(ua)?"iPhone/iPad":/Mac/i.test(ua)?"Mac":/Windows/i.test(ua)?"Windows Laptop":"Browser Device"}
function wsUrl(){const p=location.protocol==="https:"?"wss":"ws";return `${p}://${location.host}/ws`}
function connectWS(){
  if(state.ws?.readyState===1)return;
  state.ws=new WebSocket(wsUrl());
  state.ws.onopen=()=>{state.ws.send(JSON.stringify({type:"hello"}))};
  state.ws.onmessage=async e=>{try{await handleSignal(JSON.parse(e.data))}catch(err){console.error(err);toast(err.message||"Connection error")}};
  state.ws.onerror=()=>toast("Signaling server is unavailable. Start the server and reload.");
  state.ws.onclose=()=>{if(state.role)setStatus("Signaling disconnected")};
}
function sendSignal(msg){if(state.ws?.readyState===1)state.ws.send(JSON.stringify(msg));else toast("Signaling server is not connected.")}
async function createSession(){
  state.role="host";state.deviceName=$("#deviceName").value.trim()||deviceInfo();state.timeout=+$("#timeoutSelect").value;
  connectWS(); await waitWS();
  const code=randomCode();state.session=code;state.peerId=null;state.verified=false;
  sendSignal({type:"create",code,deviceName:state.deviceName,timeout:state.timeout});
  $("#sessionCode").textContent=code;renderPairingCode($("#qr"),JSON.stringify({v:1,c:code}));
  startTimer(state.timeout*60);show("createView");setStatus("Waiting for device");
}
function joinSession(code){
  code=code.trim().toUpperCase();if(!/^[A-Z0-9]{6}$/.test(code)){toast("Enter the 6-character pairing code.");return}
  state.role="guest";state.deviceName=$("#deviceName").value.trim()||deviceInfo();state.session=code;
  connectWS();waitWS().then(()=>{sendSignal({type:"join",code,deviceName:state.deviceName});setStatus("Connecting");toast("Pairing request sent.")});
}
function waitWS(){return new Promise((resolve,reject)=>{let n=0;const f=()=>{if(state.ws?.readyState===1)resolve();else if(n++>40)reject(new Error("Signaling server timeout."));else setTimeout(f,100)}});}

async function handleSignal(m){
  if(m.type==="created"){state.peerId=m.hostId;return}
  if(m.type==="peer-joined"){state.peerId=m.peerId;$("#peerDeviceName").textContent="Peer: "+m.deviceName;await beginPeer(true);return}
  if(m.type==="signal"){await state.peer.handle(m.data);return}
  if(m.type==="peer-left"){toast("The other device disconnected.");setStatus("Disconnected");return}
  if(m.type==="error"){toast(m.message);return}
  if(m.type==="joined"){state.peerId=m.hostId;$("#peerDeviceName").textContent="Peer: "+m.deviceName;await beginPeer(false);return}
}
async function beginPeer(host){
  state.localJwk=await SecureCrypto.publicKeyJwk();
  state.peer=new SecurePeer({signal:data=>sendSignal({type:"signal",to:state.peerId,data}),onState:peerState,onMessage:handleData});
  await state.peer.start(host,state.peerId);
  sendSignal({type:"crypto",to:state.peerId,data:{jwk:state.localJwk}});
}
async function peerState(s){
  if(s==="connected"){
    setStatus("Connected");$("#connectionMode").textContent="Encrypted P2P";
    $("#connectionDetail").textContent="WebRTC DataChannel is active.";
    if(state.role==="host") showVerify(); 
  } else if(s==="closed"||s==="failed"){toast("Connection lost. You can reconnect by creating a new session.");setStatus("Disconnected")}
}
async function handleCrypto(m){
  state.peerJwk=m.jwk;state.cryptoKey=await SecureCrypto.derive(state.peerJwk);
  const fp=await SecureCrypto.fingerprint(state.localJwk,state.peerJwk);
  state.fingerprint=fp;
  sendSignal({type:"fingerprint",to:state.peerId,data:{fp}});
  showVerify();
}
async function showVerify(){const fp=state.fingerprint||"WAITING";$("#fingerprint").textContent=fp;show("verifyView")}
function verify(){state.verified=true;sendSignal({type:"verified",to:state.peerId});show("dashboardView");toast("Secure connection verified.");}
function sendControl(obj){state.peer.send(JSON.stringify({kind:"control",...obj}))}
async function sendFile(file){
  if(!state.verified){toast("Verify the connection first.");return}
  const id=crypto.randomUUID();const row=document.createElement("div");row.className="transfer-item";row.id="out-"+id;
  row.innerHTML=`<div class="transfer-top"><span class="transfer-name">${escapeHTML(file.name)}</span><span class="transfer-meta">0%</span></div><div class="transfer-meta">${formatBytes(file.size)}</div><div class="progress"><i></i></div>`;
  $("#outgoingList").prepend(row);const bar=row.querySelector("i"),pct=row.querySelector(".transfer-top .transfer-meta");
  sendControl({action:"file-start",id,name:file.name,size:file.size,type:file.type});
  let offset=0;while(offset<file.size){
    const buf=await file.slice(offset,offset+CHUNK).arrayBuffer();
    const enc=await SecureCrypto.encryptChunk(state.cryptoKey,buf);
    sendControl({action:"chunk",id,iv:enc.iv,data:enc.data});
    offset+=buf.byteLength;const p=Math.round(offset/file.size*100);bar.style.width=p+"%";pct.textContent=p+"%";
    await new Promise(r=>setTimeout(r,0));
  }
  sendControl({action:"file-end",id});pct.textContent="Complete";bar.style.width="100%";
}
const incoming=new Map();
async function handleData(raw){
  let msg;try{msg=JSON.parse(raw)}catch{return}
  if(msg.kind!=="control")return;
  if(msg.action==="crypto"){await handleCrypto(msg);return}
  if(msg.action==="fingerprint"){state.fingerprint=msg.fp;$("#fingerprint").textContent=msg.fp;showVerify();return}
  if(msg.action==="verified"){state.verified=true;show("dashboardView");toast("Peer verified the connection.");return}
  if(msg.action==="file-start"){
    incoming.set(msg.id,{...msg,chunks:[],received:0});
    renderIncoming(msg.id);
  }
  if(msg.action==="chunk"){
    const f=incoming.get(msg.id);if(!f)return;
    const data=await SecureCrypto.decryptChunk(state.cryptoKey,msg.iv,msg.data);f.chunks.push(data);f.received+=data.byteLength;updateIncoming(msg.id);
  }
  if(msg.action==="file-end")finishIncoming(msg.id);
}
function renderIncoming(id){const f=incoming.get(id);const empty=$("#incomingList").classList.contains("empty");if(empty){$("#incomingList").innerHTML="";$("#incomingList").classList.remove("empty")}
  const row=document.createElement("div");row.className="transfer-item";row.id="in-"+id;row.innerHTML=`<div class="transfer-top"><span class="transfer-name">${escapeHTML(f.name)}</span><span class="transfer-meta">0%</span></div><div class="transfer-meta">${formatBytes(f.size)}</div><div class="progress"><i></i></div><div class="mini-actions"><button class="btn secondary" data-accept="${id}">Accept</button><button class="btn secondary" data-reject="${id}">Reject</button></div>`;$("#incomingList").prepend(row);$("#incomingCount").textContent=incoming.size}
function updateIncoming(id){const f=incoming.get(id),row=$("#in-"+id);if(!row)return;const p=Math.round(f.received/f.size*100);row.querySelector("i").style.width=p+"%";row.querySelector(".transfer-top .transfer-meta").textContent=p+"%"}
function finishIncoming(id){const f=incoming.get(id),row=$("#in-"+id);if(!row)return;f.done=true;updateIncoming(id);if(!$("#approvalToggle").checked)downloadIncoming(id)}
function downloadIncoming(id){const f=incoming.get(id);if(!f)return;const blob=new Blob(f.chunks,{type:f.type||"application/octet-stream"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000);toast("File saved: "+f.name);$("#in-"+id)?.remove();incoming.delete(id);$("#incomingCount").textContent=incoming.size}
function rejectIncoming(id){incoming.delete(id);$("#in-"+id)?.remove();$("#incomingCount").textContent=incoming.size}
function formatBytes(n){if(!n)return"0 B";const u=["B","KB","MB","GB"];const i=Math.min(Math.floor(Math.log(n)/Math.log(1024)),u.length-1);return(n/1024**i).toFixed(i?1:0)+" "+u[i]}
function escapeHTML(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function startTimer(sec){clearInterval(state.timer);let left=sec;const tick=()=>{const m=String(Math.floor(left/60)).padStart(2,"0"),s=String(left%60).padStart(2,"0");$("#timer").textContent=`${m}:${s}`;if(left--<=0){clearInterval(state.timer);toast("Session expired.");setStatus("Expired")}};tick();state.timer=setInterval(tick,1000)}
function stop(){clearInterval(state.timer);state.peer?.close();state.ws?.close();state.role=null;state.session=null;state.verified=false;show("homeView");setStatus("Ready")}

$("#createBtn").onclick=createSession;$("#joinBtn").onclick=()=>show("joinView");
$("#manualJoinBtn").onclick=()=>joinSession($("#manualCode").value);
$("#regenBtn").onclick=createSession;
$("#verifyBtn").onclick=verify;$("#rejectVerifyBtn").onclick=stop;$("#disconnectBtn").onclick=stop;
$("#chooseFilesBtn").onclick=()=>$("#fileInput").click();$("#chooseFolderBtn").onclick=()=>$("#folderInput").click();
$("#fileInput").onchange=e=>[...e.target.files].forEach(sendFile);$("#folderInput").onchange=e=>[...e.target.files].forEach(sendFile);
$("#dropzone").ondragover=e=>{e.preventDefault();$("#dropzone").classList.add("drag")};$("#dropzone").ondragleave=()=>$("#dropzone").classList.remove("drag");$("#dropzone").ondrop=e=>{e.preventDefault();$("#dropzone").classList.remove("drag");[...e.dataTransfer.files].forEach(sendFile)};
document.addEventListener("click",e=>{const nav=e.target.closest("[data-nav]");if(nav)show(nav.dataset.nav);if(e.target.matches("[data-back]"))show("homeView");if(e.target.matches("[data-accept]"))downloadIncoming(e.target.dataset.accept);if(e.target.matches("[data-reject]"))rejectIncoming(e.target.dataset.reject)});
$("#scanBtn").onclick=()=>toast("Camera QR scanning needs a real QR decoder. Use the manual 6-character code fallback, or install the optional local QR decoder described in README.");
$("#deviceName").value=deviceInfo();$("#myDeviceName").textContent=deviceInfo();$("#myDeviceIcon").textContent=/Phone|iPhone|Tablet/i.test(deviceInfo())?"📱":"💻";
setStatus("Ready");
