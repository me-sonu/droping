/* Tiny dependency-free QR-like pairing display.
   For production QR scanning/generation, replace this module with a vetted QR library
   served locally (no CDN dependency). This fallback renders the pairing payload as
   a high-contrast visual code and also keeps the manual code path available. */
function renderPairingCode(container, payload) {
  container.innerHTML="";
  const canvas=document.createElement("canvas");
  canvas.width=360;canvas.height=360;canvas.style.width="100%";canvas.style.height="100%";
  const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,360,360);
  let seed=0;for(const c of payload)seed=(seed*31+c.charCodeAt(0))>>>0;
  const n=29,cell=11,off=21;ctx.fillStyle="#000";
  function rnd(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296}
  function finder(x,y){ctx.fillRect(x,y,7*cell,7*cell);ctx.fillStyle="#fff";ctx.fillRect(x+cell,y+cell,5*cell,5*cell);ctx.fillStyle="#000";ctx.fillRect(x+2*cell,y+2*cell,3*cell,3*cell)}
  finder(off,off);finder(off+(n-7)*cell,off);finder(off,off+(n-7)*cell);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const inFinder=(x<8&&y<8)||(x>=n-8&&y<8)||(x<8&&y>=n-8);
    if(inFinder)continue;
    if(rnd()>.52)ctx.fillRect(off+x*cell,off+y*cell,cell,cell);
  }
  container.appendChild(canvas);
  container.title="Pairing code: "+payload;
}