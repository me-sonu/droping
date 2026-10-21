class SecurePeer {
  constructor({signal, onState, onMessage}) {
    this.signal=signal; this.onState=onState; this.onMessage=onMessage;
    this.pc=null; this.dc=null; this.isHost=false; this.key=null; this.localJwk=null; this.peerJwk=null;
  }
  async start(host, peerId) {
    this.isHost=host;
    this.pc=new RTCPeerConnection({iceServers: window.SECUREDROP_TURN_SERVERS||[]});
    this.pc.onicecandidate=e=>{if(e.candidate)this.signal({type:"candidate",candidate:e.candidate})};
    this.pc.onconnectionstatechange=()=>this.onState(this.pc.connectionState);
    if(host) {
      this.dc=this.pc.createDataChannel("securedrop",{ordered:true});
      this.bindDC();
      const offer=await this.pc.createOffer();await this.pc.setLocalDescription(offer);
      await this.waitIce();
      this.signal({type:"offer",sdp:this.pc.localDescription});
    } else {
      this.pc.ondatachannel=e=>{this.dc=e.channel;this.bindDC()};
    }
    this.onState("connecting");
  }
  bindDC(){
    this.dc.binaryType="arraybuffer";
    this.dc.onopen=()=>this.onState("connected");
    this.dc.onclose=()=>this.onState("closed");
    this.dc.onerror=()=>this.onState("error");
    this.dc.onmessage=e=>this.onMessage(e.data);
  }
  async waitIce(){if(this.pc.iceGatheringState==="complete")return;await new Promise(r=>{const t=setTimeout(r,2500);this.pc.addEventListener("icegatheringstatechange",()=>{if(this.pc.iceGatheringState==="complete"){clearTimeout(t);r()}})})}
  async handle(msg){
    if(msg.type==="offer"){
      await this.pc.setRemoteDescription(msg.sdp);
      const ans=await this.pc.createAnswer();await this.pc.setLocalDescription(ans);await this.waitIce();
      this.signal({type:"answer",sdp:this.pc.localDescription});
    } else if(msg.type==="answer") await this.pc.setRemoteDescription(msg.sdp);
    else if(msg.type==="candidate"&&msg.candidate) {try{await this.pc.addIceCandidate(msg.candidate)}catch{}}
  }
  send(data){if(!this.dc||this.dc.readyState!=="open")throw new Error("Connection is not ready.");this.dc.send(data)}
  close(){try{this.dc?.close()}catch{}try{this.pc?.close()}catch{}}
}