/* Application-level encryption helpers. Private keys never leave this browser. */
const SecureCrypto = (() => {
  let keyPair = null;
  async function init() {
    if (!crypto.subtle) throw new Error("Web Crypto API is unavailable.");
    keyPair = await crypto.subtle.generateKey(
      {name:"ECDH", namedCurve:"P-256"},
      true, ["deriveKey","deriveBits"]
    );
    return keyPair;
  }
  async function publicKeyJwk() {
    if (!keyPair) await init();
    return crypto.subtle.exportKey("jwk", keyPair.publicKey);
  }
  async function derive(peerJwk) {
    if (!keyPair) await init();
    const peer = await crypto.subtle.importKey("jwk", peerJwk,{name:"ECDH",namedCurve:"P-256"},false,[]);
    return crypto.subtle.deriveKey(
      {name:"ECDH",public:peer}, keyPair.privateKey,
      {name:"AES-GCM",length:256}, false, ["encrypt","decrypt"]
    );
  }
  function randomBytes(n=16){const a=new Uint8Array(n);crypto.getRandomValues(a);return a}
  function base64url(buf){let s="";new Uint8Array(buf).forEach(b=>s+=String.fromCharCode(b));return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
  async function fingerprint(localJwk, peerJwk){
    const raw = new TextEncoder().encode(JSON.stringify({a:localJwk,b:peerJwk}));
    const hash=await crypto.subtle.digest("SHA-256",raw);
    const hex=[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();
    return hex.slice(0,12).match(/.{1,4}/g).join("-");
  }
  async function encryptChunk(key, data){
    const iv=randomBytes(12);
    const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,data);
    return {iv:base64url(iv),data:base64url(cipher)};
  }
  async function decryptChunk(key, ivB64, dataB64){
    const dec=s=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
    return crypto.subtle.decrypt({name:"AES-GCM",iv:dec(ivB64)},key,dec(dataB64));
  }
  return {init,publicKeyJwk,derive,fingerprint,encryptChunk,decryptChunk,base64url};
})();