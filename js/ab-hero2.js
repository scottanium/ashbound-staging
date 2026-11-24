// Ashbound HD heroes (graphics update, step 1).
// A human skeleton is posed in code; proportions, armour pieces, colours, dye slots, which equipped item shows
// which piece, and the animation curves all come from data/models-hd.json.
// Adds two tracer primitives used by ab3RenderG: k:3 round cone (tapered limb) and k:4 oriented ellipsoid (plates, cloth).
// Staging: on by default (ASHBOUND_CONFIG.STAGING); ?hd=0 or localStorage ashbound.hd=0 turns it off. Live: off unless ?hd=1.
// Reads the player's equipment (read-only) to pick visuals; never writes game state.
(function(){
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s],
dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],crs=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
nrm=a=>{let l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l]},mad=(a,b,s)=>[a[0]+b[0]*s,a[1]+b[1]*s,a[2]+b[2]*s];

// ---- tracer primitives -------------------------------------------------------------------
function hitRC(q,ro,rd){let pa=q.a,pb=q.b,ra=q.r,rb=q.r2,ba=sub(pb,pa),oa=sub(ro,pa),ob=sub(ro,pb),rr=ra-rb,
m0=dot(ba,ba),m1=dot(ba,oa),m2=dot(ba,rd),m3=dot(rd,oa),m5=dot(oa,oa),m6=dot(ob,rd),m7=dot(ob,ob),d2=m0-rr*rr,
k2=d2-m2*m2,k1=d2*m3-m1*m2+m2*rr*ra,k0=d2*m5-m1*m1+m1*rr*ra*2-m0*ra*ra,h=k1*k1-k0*k2;
if(h<0)return null;let t=(-Math.sqrt(h)-k1)/k2,y=m1-ra*rr+t*m2;
if(y>0&&y<d2)return[t,nrm(sub(mul(add(oa,mul(rd,t)),d2),mul(ba,y)))];
let h1=m3*m3-m5+ra*ra,h2=m6*m6-m7+rb*rb,best=null;
if(h1>0){let t1=-m3-Math.sqrt(h1);best=[t1,mul(add(oa,mul(rd,t1)),1/ra)]}
if(h2>0){let t2=-m6-Math.sqrt(h2);if(!best||t2<best[0])best=[t2,mul(add(ob,mul(rd,t2)),1/rb)]}
return best}
function sdRC(q,p){let a=q.a,b=q.b,r1=q.r,r2=q.r2,ba=sub(b,a),l2=dot(ba,ba),rr=r1-r2,a2=l2-rr*rr,il2=1/l2,pa=sub(p,a),y=dot(pa,ba),z=y-l2,
v=sub(mul(pa,l2),mul(ba,y)),x2=dot(v,v),y2=y*y*l2,z2=z*z*l2,k=Math.sign(rr)*rr*rr*x2;
if(Math.sign(z)*a2*z2>k)return Math.sqrt(x2+z2)*il2-r2;if(Math.sign(y)*a2*y2<k)return Math.sqrt(x2+y2)*il2-r1;
return(Math.sqrt(x2*a2*il2)+y*rr)*il2-r1}
function hitEl(q,ro,rd){let oc=sub(ro,q.a),X=q.ax,R=q.rad,o=[dot(oc,X[0])/R[0],dot(oc,X[1])/R[1],dot(oc,X[2])/R[2]],d=[dot(rd,X[0])/R[0],dot(rd,X[1])/R[1],dot(rd,X[2])/R[2]],
a=dot(d,d),b=dot(o,d),c=dot(o,o)-1,h=b*b-a*c;if(h<0)return null;let t=(-b-Math.sqrt(h))/a,p=mad(o,d,t),
n=add(add(mul(X[0],p[0]/R[0]),mul(X[1],p[1]/R[1])),mul(X[2],p[2]/R[2]));return[t,nrm(n)]}
function sdEl(q,p){let v=sub(p,q.a),X=q.ax,R=q.rad,l=[dot(v,X[0]),dot(v,X[1]),dot(v,X[2])],k0=Math.hypot(l[0]/R[0],l[1]/R[1],l[2]/R[2]),k1=Math.hypot(l[0]/(R[0]*R[0]),l[1]/(R[1]*R[1]),l[2]/(R[2]*R[2]));
return k1?k0*(k0-1)/k1:-Math.min(R[0],R[1],R[2])}
window.ab3HdHit=(q,ro,rd)=>q.k===3?hitRC(q,ro,rd):hitEl(q,ro,rd);
window.ab3HdSdf=(q,p)=>q.k===3?sdRC(q,p):sdEl(q,p);

// ---- toggle -------------------------------------------------------------------------------
let hdOn=null;
function hdEnabled(){if(hdOn!==null)return hdOn;let q="",ls=null,cfg=globalThis.ASHBOUND_CONFIG||{};try{q=location.search;ls=localStorage.getItem("ashbound.hd")}catch(e){}
if(/[?&]hd=0/.test(q))hdOn=false;else if(/[?&]hd=1/.test(q))hdOn=true;else if(ls==="0"||ls==="1")hdOn=ls==="1";else if(cfg.HD_HEROES!=null)hdOn=!!cfg.HD_HEROES;else hdOn=!!cfg.STAGING;return hdOn}
window.ab3HdSet=function(on){hdOn=!!on;try{localStorage.setItem("ashbound.hd",on?"1":"0")}catch(e){}};
window.ab3HdOn=hdEnabled;

// ---- look: which visual pieces the current hero shows -------------------------------------
function dataHd(M){return(M&&M.hd)||(window.ASHBOUND_DATA&&ASHBOUND_DATA.models&&ASHBOUND_DATA.models.hd)||null}
function rarityCol(it){if(!it)return null;let id=it.tier||it.rarity,R=(window.ASHBOUND_DATA&&ASHBOUND_DATA.rarityTable&&ASHBOUND_DATA.rarityTable.ranks)||[];
let r=R.find(x=>x.id===id);return r&&r.rank>1?r.color:null}
function lookFor(H,cls){let A=window.ASHBOUND,S=A&&A.state,P=S&&S.player,C=H.classes[cls],eq=null,dye=null;
if(S&&S.mode==="play"&&P&&P.equipment&&(H.classOf[P.classId]||"warden")===cls){eq=P.equipment;dye=P.dye}
if(!dye){try{let m=/[?&]dye=([a-z_]+)/.exec(location.search);m&&(dye=m[1])}catch(e){}}
let pick=s=>{if(eq)return eq[s]||null;let id=C.starter&&C.starter[s];return id?{baseId:id,kind:(H.kinds||{})[id]||null,tier:"common"}:null};
let L={};for(let s of["weapon","offhand","helm","armor","gloves","boots"]){let it=pick(s);L[s]=it?{id:it.baseId||it.base||it.id,kind:it.kind,rc:rarityCol(it)}:null}
L.dye=dye&&H.dyes.presets[dye]?dye:C.dye;return L}
function sigOf(L){let s=k=>L[k]?L[k].id+(L[k].rc?"*"+L[k].rc.slice(1):""):"-";return[s("weapon"),s("offhand"),s("helm"),s("armor"),s("gloves"),s("boots"),L.dye].join(".")}
function derive(H,base,cls,L){let C=H.classes[cls],V=H.visuals,g={},v=(slot,it)=>it?(V[slot]&&V[slot][it.id])||null:null;
g.armor=v("armor",L.armor)||C.bare.armor;g.boots=v("boots",L.boots)||C.bare.boots;g.gloves=v("gloves",L.gloves)||C.bare.gloves;
g.helm=v("helm",L.helm)||C.bare.helm;g.weapon=v("weapon",L.weapon)||(L.weapon&&V.weaponByKind[L.weapon.kind])||null;g.offhand=v("offhand",L.offhand);
(C.always||[]).forEach((id,i)=>g["sig"+i]=id);
let wk=L.weapon?(L.weapon.kind||"sword"):"none",dye=Object.assign({},H.dyes.presets[L.dye]||{});
dye.rarA=(L.armor&&L.armor.rc)||dye.glow;dye.rarW=(L.weapon&&L.weapon.rc)||dye.glow;
return Object.assign({},base,{gear:g,wkind:wk,shield:!!g.offhand,dye,dyePreset:null,look:sigOf(L)})}
// ab3Get hook: map an old hero type to its HD type for this look (registers derived types in M.types)
window.ab3HdMap=function(t,M){if(!hdEnabled())return t;let H=dataHd(M);if(!H||!H.map||!H.map[t]||!M||!M.types)return t;
try{let base=M.types[H.map[t]];if(!base)return t;let L=lookFor(H,t),name=H.map[t]+"~"+sigOf(L);
if(!M.types[name]){let n=0;for(let k in M.types)k.includes("~")&&n++;if(n>64)for(let k in M.types)k.includes("~")&&delete M.types[k];M.types[name]=derive(H,base,t,L)}window.ab3HdLast=name;return name}catch(e){return t}};

// ---- colours ------------------------------------------------------------------------------
function hex(c){c=String(c).replace("#","");if(c.length===3)c=c.split("").map(x=>x+x).join("");let n=parseInt(c,16);if(isNaN(n))n=0x888888;return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]}
function colOf(tok,dye,pal){let k=1,t=tok;if(typeof t==="string"&&t.includes("~")){let s=t.split("~");t=s[0];k=+s[1]}
let c;if(typeof t==="string"&&t[0]==="$"){let d=dye[t.slice(1)];c=d?hex(d):[.5,.5,.5]}else c=hex(typeof t==="string"&&t[0]==="#"?t:(pal&&pal[t])||"#888888");
return k===1?c:[Math.min(1,c[0]*k),Math.min(1,c[1]*k),Math.min(1,c[2]*k)]}

// ---- pose ---------------------------------------------------------------------------------
function rotZ(v,a){let c=Math.cos(a),s=Math.sin(a);return[v[0]*c-v[1]*s,v[0]*s+v[1]*c,v[2]]}
function rotY(v,a){let c=Math.cos(a),s=Math.sin(a);return[v[0]*c+v[2]*s,v[1],-v[0]*s+v[2]*c]}
function arc(al,ab,side){return[Math.sin(al)*Math.cos(ab),side*Math.sin(ab),-Math.cos(al)*Math.cos(ab)]}
const at=(arr,i)=>Array.isArray(arr)?arr[Math.min(i,arr.length-1)]:arr||0;
function pose(T,H,M,mode,fr){
const R=H.rig[T.rig||"human"],AN=H.anim,S=T.scale||1,K=T.bulk||1,A=AN[mode]||AN.idle,n=(M.anim[mode]||{}).frames||1,ph=fr/n*Math.PI*2,sn=Math.sin(ph),cs=Math.cos(ph),i=fr,
L=k=>R[k]*S,wk=T.wkind||"sword",HD=(AN.hold||{})[wk]||{},two=!!HD.two;
let lean=A.leanBase||0,twist=0,lunge=0,bob=0,legs=[[-1,0,.06],[1,0,.06]],dflt={al:R.armHang,e:R.elbowRest,ab:R.armAbduct,w:R.wristRest},
armR=Object.assign({},dflt,HD.R||{}),armL=Object.assign({},dflt,T.shield?AN.shieldHold:(HD.L||{})),headYaw=0,headPitch=0,fall=0,kneel=0,flare=A.capeFlare||0,hipSway=0,draw=0;
if(mode==="idle"){bob=A.breathe*sn*S;armR.al+=A.armSway*sn;armL.al+=A.armSway*sn*.5;headYaw=A.look*Math.sin(ph*.5)}
else if(mode==="walk"||mode==="run"){let la=A.legSwing,kb=A.knee;legs=[[-1,la*sn,kb*Math.max(0,cs)+.06],[1,-la*sn,kb*Math.max(0,-cs)+.06]];
 bob=A.bob*Math.abs(cs)*S;twist=A.twist*sn;hipSway=A.hipSway*sn;let hr=HD.R?(two?.25:.6):1;armR.al+=(-A.armSwing*sn+(A.armFwd||0))*hr;armR.e+=A.elbow*(.5+.5*Math.max(0,-sn))*hr;
 armL.al+=(T.shield||HD.L)?A.armSwing*.35*sn:A.armSwing*sn+(A.armFwd||0);if(!T.shield&&!HD.L)armL.e+=A.elbow*(.5+.5*Math.max(0,sn));flare+=A.capeWave*Math.abs(sn)}
else if(mode==="strike"){let SK=(A.by&&A.by[wk])||A.by.sword;armR={al:at(SK.arm,i),e:at(SK.elbow,i),ab:at(SK.abduct,i),w:at(SK.wrist,i)};twist=at(SK.twist,i);lean+=at(SK.lean,i);lunge=at(SK.lunge,i)*S;
 legs=[[-1,SK.stance[0],.32],[1,SK.stance[1],.14]];if(SK.L)armL={al:at(SK.L.al,i),e:at(SK.L.e,i),ab:at(SK.L.ab,i),w:at(SK.L.w,i)};else if(two)armL={al:armR.al,e:armR.e*.85,ab:-.12,w:0};else armL.al+=at(SK.shieldPush||0,i);
 headYaw=-twist*.6;flare+=at(SK.capeKick,i);draw=at(SK.draw||0,i)}
else if(mode==="hit"){lean+=A.lean;armR.al+=A.arms;armL.al+=A.arms*.5;headPitch=A.head}
else if(mode==="death"){fall=at(A.fall,i);kneel=at(A.kneel,i);for(let l of legs)l[2]=kneel,l[1]=kneel*.5;armR.al=at(A.arm,i);armL.al=at(A.arm,i)*.7;lean+=at(A.lean,i);headPitch=at(A.head,i)}
let drop=0;for(let l of legs)drop=Math.max(drop,L("thigh")*Math.cos(l[1])+L("shin")*Math.cos(l[1]-l[2]));
let hz=drop+L("footH")+bob,Pc=[lunge,0,hz],J={},Yp=rotZ([0,1,0],hipSway);
for(let[side,a,b]of legs){let hip=add(Pc,mul(Yp,side*L("hipW")*K)),knee=mad(hip,[Math.sin(a),side*.03,-Math.cos(a)],L("thigh")),ank=mad(knee,[Math.sin(a-b),side*.02,-Math.cos(a-b)],L("shin")),
 tp=mode==="walk"||mode==="run"?Math.max(-.5,Math.min(.35,(a-b)*.6)):0,toe=mad(ank,[Math.cos(tp),side*.08,-Math.sin(tp)],L("foot"));
 if(mode!=="death"&&toe[2]<L("footH")*.35)toe[2]=L("footH")*.35;let k=side<0?"R":"L";J["hip"+k]=hip;J["knee"+k]=knee;J["ankle"+k]=ank;J["toe"+k]=toe}
const U=v=>add(Pc,rotZ(rotY(v,lean),twist)),Rd=v=>rotZ(rotY(v,lean),twist),wl=L("waist"),sl=L("spine");
J.waist=U([0,0,wl]);J.neck=U([0,0,wl+sl]);let hd=rotZ(rotY([0,0,1],headPitch-lean*.5),headYaw);J.headBase=add(J.neck,mul(Rd(hd),L("neck")));J.headTop=add(J.headBase,mul(Rd(hd),L("head")));
let arms={};
for(let side of[-1,1]){let P=side<0?armR:armL,sh=U([R.shoulderBack*S,side*L("shoulderW")*K,wl+sl-L("shoulderDrop")]),d1=Rd(arc(P.al,P.ab,side)),el=mad(sh,d1,L("upperArm")),
 d2=Rd(arc(P.al+P.e,P.ab*.6,side)),wr=mad(el,d2,L("foreArm")),d3=Rd(arc(P.al+P.e+(P.w||0),P.ab*.4,side)),k=side<0?"R":"L";
 J["shoulder"+k]=sh;J["elbow"+k]=el;J["wrist"+k]=wr;arms[k]={d1,d2,d3,P}}
return{J,arms,Yu:Rd([0,1,0]),Yp,Rd,Pc,S,K,fall,flare,legs,mode,draw}}

// ---- bones --------------------------------------------------------------------------------
function frame(a,b,Yref,len){let d=sub(b,a),l=len||Math.hypot(d[0],d[1],d[2])||1,u=nrm(d),Y=nrm(sub(Yref,mul(u,dot(Yref,u)))),f=crs(Y,u);return{a,u,len:l,Y,f}}
function frameU(a,u,Yref,len){return frame(a,add(a,u),Yref,len)}
function bones(P,R){const J=P.J,S=P.S,B={},Y=P.Yu,Yp=P.Yp;
B.pelvis=frame(P.Pc,J.waist,Yp);B.spine=frame(J.waist,J.neck,Y);B.neck=frame(J.neck,J.headBase,Y);B.head=frame(J.headBase,J.headTop,Y);
for(let k of["R","L"]){let A=P.arms[k];
 B["upperArm"+k]=frame(J["shoulder"+k],J["elbow"+k],Y);B["foreArm"+k]=frame(J["elbow"+k],J["wrist"+k],Y);B["hand"+k]=frameU(J["wrist"+k],A.d3,Y,R.hand*S);
 B["shoulder"+k]=frameU(J["shoulder"+k],nrm(add(mul(P.Rd([0,0,-1]),.7),mul(A.d1,.3))),Y,R.upperArm*S*.5);
 B["thigh"+k]=frame(J["hip"+k],J["knee"+k],Yp);B["shin"+k]=frame(J["knee"+k],J["ankle"+k],Yp);B["foot"+k]=frame(J["ankle"+k],J["toe"+k],Yp)}
let h=B.handR;B.weapon=frameU(add(h.a,mul(h.u,h.len*.55)),P.arms.R.d3,Y,1);
let fa=B.foreArmL;B.offhand=frameU(mad(fa.a,fa.u,fa.len*.55),P.Rd([0,0,1]),nrm(add(mul(Y,.45),P.Rd([1,0,0]))),1);
let hl=B.handL,up=nrm(add(P.Rd([0,0,1]),mul(P.arms.L.d2,-.25)));B.bow=frameU(add(hl.a,mul(hl.u,hl.len*.5)),up,P.Rd([0,1,0]),1);
return B}

// ---- pieces -------------------------------------------------------------------------------
const LIMB=/^(thigh|shin|foot|upperArm|foreArm|hand|shoulder)$/;
function pt(F,sp,s,S){return add(add(add(F.a,mul(F.u,(sp[0]||0)*F.len)),mul(F.f,(sp[1]||0)*S)),mul(F.Y,(sp[2]||0)*S*s))}
function axes(F,s,rot){let f=F.f,o=mul(F.Y,s),u=F.u;if(rot){let D=Math.PI/180,[tl,yw,rl]=rot;
 if(tl){let c=Math.cos(tl*D),n=Math.sin(tl*D);[f,u]=[add(mul(f,c),mul(u,n)),sub(mul(u,c),mul(f,n))]}
 if(yw){let c=Math.cos(yw*D),n=Math.sin(yw*D);[f,o]=[add(mul(f,c),mul(o,n)),sub(mul(o,c),mul(f,n))]}
 if(rl){let c=Math.cos(rl*D),n=Math.sin(rl*D);[o,u]=[add(mul(o,c),mul(u,n)),sub(mul(u,c),mul(o,n))]}}
return[f,o,u]}
function emit(out,pc,F,s,S,K,cm){let k=pc.s,kk=pc.nobulk?1:K,r=(pc.r||.1)*S*kk,c=cm(pc.p);
if(k==="sph"){let a=pt(F,pc.c,s,S);out.push({k:1,a,b:a,r,col:c.col,mat:c.mat})}
else if(k==="cap")out.push({k:0,a:pt(F,pc.a,s,S),b:pt(F,pc.e,s,S),r,col:c.col,mat:c.mat});
else if(k==="cone"){let r2=(pc.r2??pc.r)*S*kk,a=pt(F,pc.a,s,S),b=pt(F,pc.e,s,S);if(Math.hypot(...sub(b,a))<=Math.abs(r-r2)+1e-3)b=mad(a,F.u,Math.abs(r-r2)+.01);out.push({k:3,a,b,r,r2,R:Math.max(r,r2),col:c.col,mat:c.mat})}
else if(k==="ell"){let ax=axes(F,s,pc.rot),rad=pc.rad.map((x,j)=>x*S*(j<2?kk:1)),a=pt(F,pc.c,s,S);out.push({k:4,a,b:a,ax,rad,r:Math.max(...rad),col:c.col,mat:c.mat})}
else if(k==="disk"){let ax=axes(F,s,pc.rot),a=pt(F,pc.c,s,S);out.push({k:2,a,b:a,n:ax[{f:0,o:1,u:2}[pc.n||"f"]],r,col:c.col,mat:c.mat})}}
function drape(out,pc,B,P,S,K,cm){let F=B[pc.b],top=pt(F,pc.c,1,S),Y=F.Y,fwd=nrm(crs(Y,[0,0,1])),fl=(pc.flare||0)+(pc.flareScale||0)*P.flare;
if(pc.follow==="legs"){let m=0;for(let l of P.legs)m=Math.max(m,(pc.dir||1)*l[1]);fl+=Math.max(0,m)*(pc.followK||.7)}
let segs=pc.segs||2,len=pc.len*S,w=pc.w*S*K,th=(pc.th||.06)*S,c=cm(pc.p),p0=top,a0=fl*.35,lap=pc.seglap||.62;
for(let k=0;k<segs;k++){let a=a0+(fl-a0)*(k+1)/segs,dir=nrm(add(mul([0,0,-1],Math.cos(a)),mul(fwd,(pc.dir||1)*Math.sin(a)))),seg=len/segs,cen=mad(p0,dir,seg*.5),
 o=Y,f=nrm(crs(o,dir)),ww=w*(1+(pc.widen||0)*k/(Math.max(1,segs-1)));out.push({k:4,a:cen,b:cen,ax:[f,o,dir],rad:[th,ww,seg*lap],r:Math.max(ww,seg*lap),col:c.col,mat:c.mat});p0=mad(p0,dir,seg)}}
// bow string: tip to tip, pulled to the right hand while drawing
function bowString(out,pc,B,P,S,cm){let F=B.bow,c=cm(pc.p),t1=pt(F,pc.top,1,S),t2=pt(F,pc.bot,1,S),r=(pc.r||.025)*S;
if(P.draw>0){let h=B.handR.a;out.push({k:0,a:t1,b:h,r,col:c.col,mat:c.mat},{k:0,a:h,b:t2,r,col:c.col,mat:c.mat});
 if(pc.arrow){let ca=cm(pc.arrow),tip=mad(h,nrm(sub(F.a,h)),Math.hypot(...sub(F.a,h))+.5*S);out.push({k:0,a:h,b:tip,r:.03*S,col:ca.col,mat:ca.mat})}}
else out.push({k:0,a:t1,b:t2,r,col:c.col,mat:c.mat})}

window.ab3Human=function(T,M,pal,mode,fr){
const H=M.hd,R=H.rig[T.rig||"human"],S=T.scale||1,K=T.bulk||1,P=pose(T,H,M,mode,fr),B=bones(P,R),out=[];
const dye=Object.assign({},(H.dyes.presets[T.dyePreset])||{},T.dye||{}),parts=Object.assign({},H.parts||{},T.parts||{}),cache={};
const cm=p=>cache[p]||(cache[p]=(()=>{let d=parts[p]||["#888888","cloth"];return{col:colOf(d[0],dye,pal),mat:d[1]}})());
let lists=[],hidden=new Set;
for(let id of Object.values(T.gear||{})){let g=id&&H.gear[id];if(!g)continue;lists.push(g);(g.hides||[]).forEach(x=>hidden.add(x))}
let body=H.gear[T.body||"body_human"];if(body)lists.unshift(body);
for(let g of lists)for(let pc of g.pieces){if(pc.g&&hidden.has(pc.g))continue;if(pc.when&&!pc.when.includes(mode))continue;if(pc.shield!=null&&pc.shield!==!!T.shield)continue;
 if(pc.s==="drape"){drape(out,pc,B,P,S,K,cm);continue}if(pc.s==="string"){bowString(out,pc,B,P,S,cm);continue}
 if(LIMB.test(pc.b)){let sides=pc.side==="R"?["R"]:pc.side==="L"?["L"]:["R","L"];for(let k of sides)emit(out,pc,B[pc.b+k],k==="R"?-1:1,S,K,cm)}
 else{let F=B[pc.b];if(!F)continue;emit(out,pc,F,1,S,K,cm);if(pc.mirror)emit(out,pc,F,-1,S,K,cm)}}
if(P.fall){let c=Math.cos(P.fall),s=Math.sin(P.fall),rot=v=>[v[0]*c-v[2]*s,v[1],v[0]*s+v[2]*c];
 for(let q of out){q.a=rot(q.a);q.b=q.k===1||q.k===4||q.k===2?q.a:rot(q.b);if(q.n)q.n=rot(q.n);if(q.ax)q.ax=q.ax.map(rot)}
 let mn=1e9;for(let q of out){let rr=q.R||q.r;mn=Math.min(mn,q.a[2]-rr,q.b[2]-rr)}mn+=.15*S;if(mn<0)for(let q of out){q.a=[q.a[0],q.a[1],q.a[2]-mn];q.b=q.k===1||q.k===4||q.k===2?q.a:[q.b[0],q.b[1],q.b[2]-mn]}}
return out};
})();
