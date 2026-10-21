const http=require("http");
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const {WebSocketServer}=require("ws");

const PORT=Number(process.env.PORT||8787);
const CLIENT=path.join(__dirname,"..","client");
const sessions=new Map();

function id(){return crypto.randomBytes(16).toString("base64url")}
function json(ws,obj){if(ws.readyState===1)ws.send(JSON.stringify(obj))}
function cleanup(code){const s=sessions.get(code);if(!s)return;for(const ws of [s.host,s.peer]){try{ws?.close()}catch{}}sessions.delete(code)}
function safeName(s){return String(s||"Device").slice(0,32).replace(/[^\w .'-]/g,"")||"Device"}

const server=http.createServer((req,res)=>{
  let p=new URL(req.url,`http://${req.headers.host}`).pathname;
  if(p==="/ws"){res.writeHead(426);return res.end("WebSocket endpoint");}
  if(p==="/health"){res.writeHead(200,{"content-type":"application/json"});return res.end(JSON.stringify({ok:true,sessions:sessions.size}))}
  if(p==="/")p="/index.html";
  const file=path.normalize(path.join(CLIENT,p));
  if(!file.startsWith(CLIENT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end("Not found")}
  const ext=path.extname(file);const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json"};
  res.writeHead(200,{"Content-Type":types[ext]||"application/octet-stream","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Cache-Control":"no-store","Content-Security-Policy":"default-src 'self'; connect-src 'self' ws: wss: https:; img-src 'self' data: blob:; style-src 'self'; script-src 'self'"});
  fs.createReadStream(file).pipe(res);
});
const wss=new WebSocketServer({server,path:"/ws"});
wss.on("connection",(ws)=>{
  ws._id=id();ws._rate={t:Date.now(),n:0};
  ws.on("message",(buf)=>{
    const now=Date.now();if(now-ws._rate.t>1000){ws._rate={t:now,n:0}}if(++ws._rate.n>30)return;
    let m;try{m=JSON.parse(buf.toString())}catch{return}
    if(typeof m.type!=="string")return;
    if(m.type==="create"){
      const code=String(m.code||"").toUpperCase();if(!/^[A-Z0-9]{6}$/.test(code))return json(ws,{type:"error",message:"Invalid pairing code"});
      if(sessions.has(code))return json(ws,{type:"error",message:"Code collision. Generate a new code."});
      const timeout=Math.max(1,Math.min(30,Number(m.timeout)||15))*60*1000;
      sessions.set(code,{host:ws,hostId:ws._id,peer:null,expires:Date.now()+timeout,deviceName:safeName(m.deviceName)});
      ws._session=code;json(ws,{type:"created",hostId:ws._id});
      ws._expiry=setTimeout(()=>cleanup(code),timeout);return;
    }
    if(m.type==="join"){
      const code=String(m.code||"").toUpperCase(),s=sessions.get(code);
      if(!s||s.expires<Date.now())return json(ws,{type:"error",message:"Session expired or not found"});
      if(s.peer)return json(ws,{type:"error",message:"This session already has a device connected"});
      s.peer=ws;ws._session=code;ws._role="peer";
      json(ws,{type:"joined",hostId:s.hostId,deviceName:s.deviceName});
      json(s.host,{type:"peer-joined",peerId:ws._id,deviceName:safeName(m.deviceName)});
      return;
    }
    if(m.type==="signal"){
      const s=sessions.get(ws._session);if(!s)return;
      const target=(m.to===s.hostId?s.host:s.peer);if(target)json(target,{type:"signal",data:m.data});
      return;
    }
    if(m.type==="crypto"||m.type==="fingerprint"||m.type==="verified"){
      const s=sessions.get(ws._session);if(!s)return;
      const target=ws===s.host?s.peer:s.host;if(target)json(target,{type:m.type,data:m.data});
      return;
    }
  });
  ws.on("close",()=>{
    const code=ws._session,s=sessions.get(code);if(!s)return;
    const other=ws===s.host?s.peer:s.host;
    if(other)json(other,{type:"peer-left"});
    if(ws===s.host)cleanup(code);else s.peer=null;
  });
});
server.listen(PORT,()=>console.log(`SecureDrop running at http://localhost:${PORT}`));
process.on("SIGINT",()=>{for(const s of sessions.values())cleanup(s.host?Array.from(sessions.entries()).find(([,x])=>x===s)?.[0]:"");server.close(()=>process.exit(0))});
