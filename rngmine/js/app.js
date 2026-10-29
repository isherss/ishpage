(function(){
  "use strict";
  var R=window.RNGU;
  var PUZZLE_INFO=window.RNGMINE_PUZZLE_INFO||[];
  function puzzleOdds(id,fallback){ var puzzle=PUZZLE_INFO.find?PUZZLE_INFO.find(function(item){return item.id===id;}):null; return puzzle&&Number.isFinite(puzzle.oddsDenominator)&&puzzle.oddsDenominator>0?puzzle.oddsDenominator:fallback; }
  var FREE=0, PER=40, KEY="rngdle-mine-v3", OWNER_KEY="rngmine-state-owner", GUEST_KEY=KEY+"-guest", LOGIN_LAYOUT_KEY="rngmine-login-layout", GUEST_BOOST_KEY="rngmine-guest-boost", DYN_ODDS=puzzleOdds("dyn",15), WIRE_ODDS=puzzleOdds("wires",10), VERITY_ODDS=puzzleOdds("verity",30), DBL_ODDS=puzzleOdds("double",25), CZ_ODDS=puzzleOdds("captcha",20), CZ_MS=5000, DB_MS=20000, WIRE_MS=5000, VY_MS=15000, DYN_MS=15000, DYN_PROBLEMS=3;
  var REDUCED=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function $(id){return document.getElementById(id);}
  function fmt(n){return Number(n).toLocaleString("en-US");}
  var LABELS={trash:"Trash",common:"Common",uncommon:"Uncommon",rare:"Rare",epic:"Epic",anomaly:"Anomaly",mythic:"Mythic"};

  /* ---------- scoring: badges, EP, rarity and percentiles come from the rule data in rngdle_calculator ---------- */
  function analyze(n){
    var r=R.analyze(n), subsOf={}, mains=[];
    r.badges.forEach(function(h){ if(h.scoring) mains.push(h); });
    var byFam={}; mains.forEach(function(h){ if(h.family) byFam[h.family]=h; });
    var groups=mains.map(function(h){ return {main:h,subs:[]}; });
    var idxOf={}; groups.forEach(function(g){ idxOf[g.main.id]=g; });
    r.badges.forEach(function(h){ if(!h.scoring&&h.family&&byFam[h.family]) idxOf[byFam[h.family].id].subs.push(h); });
    groups.forEach(function(g){ g.subs.sort(function(a,b){ return b.ep-a.ep; }); });
    groups.sort(function(a,b){ return (a.main.ep-b.main.ep)||(a.main.id<b.main.id?-1:1); });
    return {n:n,total:r.total,count:r.badges.length,groups:groups};
  }
  function tierOf(total){ return R.cardRarity(total); }
  function pctOf(total){ return R.percentile(total); }
  function topText(p){
    var t=100-p; if(t>=10) return t.toFixed(0); if(t>=1) return t.toFixed(1);
    if(t>=0.01) return t.toFixed(2); return t.toFixed(4);
  }
  function pctLine(total){ var p=Number(pctOf(total)); if(!Number.isFinite(p)) p=0; p=Math.max(0,Math.min(100,p)); var bottom=Math.round(p), top=Math.round(100-p); return bottom<=top?{cls:"bottom",txt:"Bottom "+Math.max(1,bottom)+"%"}:{cls:"top",txt:"Top "+topText(p)+"%"}; }
  function famName(f){ return f?f.charAt(0)+f.slice(1).toLowerCase().replace(/_/g," "):"Stand-alone"; }

  /* ---------- state ---------- */
  function dayKey(){ var d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
  function fresh(){ return {day:dayKey(),used:0,bonus:0,progress:0,hitsLeft:0,dyn:null,wire:null,vy:null,dbl:null,cz:null,testMinigame:false,starterRoll:1,starterRollGranted:false,coalTotal:0,lifetime:0,history:[],found:{},best:null}; }
  function normalizeState(o){
    var s=Object.assign(fresh(),o||{});
    if(!o||o.starterRoll===undefined) s.starterRoll=0;
    if(!o||o.starterRollGranted===undefined) s.starterRollGranted=true;
    if(o&&o.bonus===undefined){ var c=o.coalToday||0; s.bonus=Math.floor(c/PER); s.progress=c%PER; }
    delete s.coalToday;
    return s;
  }
  function load(){
    try{ var r=localStorage.getItem(KEY); if(r){ var o=JSON.parse(r); if(o&&typeof o==="object") return normalizeState(o); } }catch(e){}
    return fresh();
  }
  var state=load();
  var authUser=null, authDisplayName="", authNameColor="#27F549", authCsrf="", accountStateReady=false, remoteSaveTimer=0, remoteSaveChain=Promise.resolve(), accountServiceAvailable=true, guestBoostEnabled=false;
  try{ guestBoostEnabled=sessionStorage.getItem(GUEST_BOOST_KEY)==="1"; }catch(e){}
  function setSyncStatus(text,error){ var el=$("accountSync"); if(!el) return; el.textContent=text; el.hidden=!text; el.classList.toggle("error",!!error); }
  function apiRequest(action,options){
    options=options||{}; options.credentials="same-origin";
    options.headers=Object.assign({"Accept":"application/json"},options.headers||{});
    return fetch("api.php?action="+encodeURIComponent(action),options).then(function(response){
      return response.json().catch(function(){return {};}).then(function(body){
        if(!response.ok) throw new Error(body.error||"Account request failed.");
        return body;
      });
    });
  }
  function remoteSaveNow(keepalive){
    if(!authUser||!authCsrf||!accountStateReady) return Promise.resolve();
    var snapshot=JSON.stringify(state), body=JSON.stringify({csrf:authCsrf,state:JSON.parse(snapshot)});
    remoteSaveChain=remoteSaveChain.catch(function(){}).then(function(){
      return apiRequest("state",{method:"PUT",headers:{"Content-Type":"application/json"},body:body,keepalive:!!keepalive});
    }).then(function(){setSyncStatus("Synced",false);},function(error){setSyncStatus("Sync offline",true);throw error;});
    return remoteSaveChain;
  }
  function queueRemoteSave(){
    if(!authUser||!accountStateReady) return;
    setSyncStatus("Syncing",false);
    clearTimeout(remoteSaveTimer);
    remoteSaveTimer=setTimeout(function(){remoteSaveNow().catch(function(){});},350);
  }
  function save(){
    try{ localStorage.setItem(KEY,JSON.stringify(state)); }catch(e){}
    if(authUser) queueRemoteSave();
  }
  function saveLocalForUser(username){
    try{localStorage.setItem(KEY,JSON.stringify(state));localStorage.setItem(OWNER_KEY,username);}catch(e){}
  }
  function setAccountUI(){
    $("loginBtn").hidden=!!authUser;
    $("logoutBtn").hidden=!authUser;
    $("accountUser").hidden=!authUser;
    $("accountUser").textContent=authUser?authDisplayName:"";
    $("accountUser").style.color=authUser?authNameColor:"";
    if(authUser){ guestBoostEnabled=false; try{sessionStorage.removeItem(GUEST_BOOST_KEY);}catch(e){} }
    var guestBoostBtn=$("guestBoostBtn");
    guestBoostBtn.hidden=!!authUser;
    guestBoostBtn.setAttribute("aria-pressed",guestBoostEnabled?"true":"false");
    guestBoostBtn.textContent="God mode: "+(guestBoostEnabled?"On":"Off");
    guestBoostBtn.title=guestBoostEnabled?"Unlimited rolls and one-hit coal are on for this guest session":"Toggle unlimited rolls and one-hit coal for this guest session";
    if(!authUser) setSyncStatus(accountServiceAvailable?"":"Unavailable",!accountServiceAvailable);
    else setSyncStatus(accountServiceAvailable?"Cloud save":"Offline cache",!accountServiceAvailable);
  }
  function clearAccountCache(){
    try{
      localStorage.removeItem(KEY);localStorage.removeItem(OWNER_KEY);localStorage.removeItem(GUEST_KEY);
    }catch(e){}
    state=fresh();
  }
  function restoreAccountState(remoteState){
    var owner="";
    try{owner=localStorage.getItem(OWNER_KEY)||"";}catch(e){}
    if(remoteState&&typeof remoteState==="object"){
      state=normalizeState(remoteState);
      saveLocalForUser(authUser);
      return Promise.resolve();
    }
    state=owner&&owner.toLowerCase()===authUser.toLowerCase()?load():fresh();
    saveLocalForUser(authUser);
    return remoteSaveNow();
  }
  function initializeAccounts(){
    var owner="";
    try{owner=localStorage.getItem(OWNER_KEY)||"";}catch(e){}
    return apiRequest("session",{method:"GET"}).then(function(session){
      accountServiceAvailable=true;
      if(!session.authenticated){
        accountStateReady=false;
        if(owner) clearAccountCache();
        return;
      }
      authUser=session.username; authDisplayName=session.displayName||session.username; authNameColor=session.nameColor||"#27F549"; authCsrf=session.csrf;
      return apiRequest("state",{method:"GET"}).then(function(result){
        accountStateReady=true;
        return restoreAccountState(result.state);
      });
    }).catch(function(error){
      accountServiceAvailable=false;
      accountStateReady=false;
      if(authUser&&owner&&owner.toLowerCase()!==authUser.toLowerCase()) clearAccountCache();
      setSyncStatus("Account offline",true);
    }).then(function(){
      document.documentElement.classList.remove("auth-check");
      if(!state.starterRollGranted) document.documentElement.classList.add("first-visit");
      else document.documentElement.classList.remove("first-visit");
      setAccountUI();
      boot();
    });
  }
  function clearFailedGameProgress(){ if(state.testMinigame){ state.testMinigame=false; } else { state.progress=0; } }
  function showPracticeClose(id){ $(id).hidden=!state.testMinigame; }
  function closePracticeMinigame(kind){
    if(!state.testMinigame) return;
    pending=[];
    if(kind==="dyn") endDyn();
    else if(kind==="wires") closeWires();
    else if(kind==="verity") closeVerity();
    else if(kind==="double") closeDouble();
    else if(kind==="captcha") closeCaptcha();
    state.testMinigame=false;
    save(); updateUI();
  }
  var busy=false, msg="", cancelReveal=null, lastShare="";

  function bonusEarned(){ return state.bonus; }
  function allowed(){ return FREE+(state.starterRoll||0)+bonusEarned(); }
  /* Kept as a test switch; normal play uses the persistent mined-roll bank. */
  var TEST_INFINITE_ROLLS=false;
  function left(){ return TEST_INFINITE_ROLLS||(!authUser&&guestBoostEnabled)?Infinity:allowed()-state.used; }
  function capped(){ return false; }
  function ensureDay(){
    var k=dayKey();
    if(state.day!==k){
      state.day=k; save(); showLatest(); return true;
    }
    return false;
  }

  /* ---------- rendering ---------- */
  var hero=$("hero"), displayEl=$("display"), metaEl=$("meta"), epPill=$("epPill"), bdEl=$("bd"), bdList=$("bdList");
  function showQ(){ displayEl.innerHTML='<div class="qmarks" aria-label="No roll yet">??????</div>'; }
  function buildNumber(str){
    displayEl.innerHTML=""; var box=document.createElement("div"); box.className="numbox"; box.setAttribute("aria-label",fmt(Number(str)));
    var ds=[]; for(var i=0;i<str.length;i++){ var s=document.createElement("span"); s.className="d"; s.setAttribute("aria-hidden","true"); box.appendChild(s); ds.push(s); }
    displayEl.appendChild(box); return ds;
  }
  function buildGroup(g,n,animate){
    var h=g.main, s=String(n);
    var grp=document.createElement("div"); grp.className="group"+(animate?" in":""); grp.dataset.tag=h.rarity;
    var card=document.createElement("div"); card.className="bcard";
    var head=document.createElement("div"); head.className="bhead";
    var em=document.createElement("span"); em.textContent=h.emoji; em.setAttribute("aria-hidden","true");
    var nm=document.createElement("span"); nm.className="bname"; nm.textContent=h.name;
    var tg=document.createElement("span"); tg.className="btag"; tg.textContent=LABELS[h.rarity]||h.rarity;
    var ep=document.createElement("span"); ep.className="bep"; ep.textContent="+"+fmt(h.ep)+" EP";
    head.appendChild(em); head.appendChild(nm); head.appendChild(tg); head.appendChild(ep);
    var ds=document.createElement("p"); ds.className="bdesc"; ds.textContent=h.description;
    var tiles=document.createElement("div"); tiles.className="tiles";
    for(var k=0;k<s.length;k++){ var t=document.createElement("span"); t.className="mt"; t.textContent=s[k]; tiles.appendChild(t); }
    var od=document.createElement("p"); od.className="bodds"; od.textContent="Found in "+h.probability+" of rolls";
    card.appendChild(head); card.appendChild(ds); card.appendChild(tiles); card.appendChild(od); grp.appendChild(card);
    g.subs.forEach(function(sb){
      var row=document.createElement("div"); row.className="sub";
      var l=document.createElement("span"); l.textContent="└ "+sb.emoji+" "+sb.name;
      var r=document.createElement("span"); r.textContent="(Earned)"; row.appendChild(l); row.appendChild(r); grp.appendChild(row);
    });
    return grp;
  }
  function groupSize(g){ return 1+g.subs.length; }
  function setCount(n){ $("bdCount").textContent=n+(n===1?" badge earned":" badges earned"); }
  function setMeta(total){
    $("tierPill").textContent=LABELS[tierOf(total)];
    var pl=pctLine(total), pt=$("pctTxt"); pt.className="pct "+pl.cls; pt.textContent=pl.txt;
    metaEl.hidden=false;
  }
  function shareText(n,total){ return "RNGmine: I rolled "+n+" for "+fmt(total)+" EP ("+LABELS[tierOf(total)]+", "+pctLine(total).txt.toLowerCase()+")"; }
  function renderStatic(n){ document.documentElement.classList.remove("first-visit"); document.body.classList.remove("has-roll"); document.body.classList.add("awaiting-continue"); $("continueBtn").hidden=false;
    var a=analyze(n), str=String(n), ds=buildNumber(str);
    ds.forEach(function(s,i){ s.textContent=str[i]; });
    hero.dataset.tier=tierOf(a.total); $("tagline").hidden=true;
    setMeta(a.total);
    epPill.textContent=fmt(a.total)+" EP"; epPill.hidden=false;
    $("lifeN").textContent=fmt(state.lifetime)+" EP"; $("life").hidden=false;
    lastShare=shareText(n,a.total);
    bdList.innerHTML="";
    a.groups.slice().reverse().forEach(function(g){ bdList.appendChild(buildGroup(g,n,false)); });
    if(a.count) setCount(a.count); else $("bdCount").textContent="No badges this time. Plain numbers happen.";
    bdEl.hidden=false;
    return a;
  }
  function renderPlaceholder(){ document.body.classList.remove("has-roll","awaiting-continue"); $("continueBtn").hidden=true;
    hero.dataset.tier="none"; showQ(); $("tagline").hidden=false; metaEl.hidden=true; epPill.hidden=true;
    $("life").hidden=state.lifetime<=0; $("lifeN").textContent=fmt(state.lifetime)+" EP"; bdEl.hidden=true; bdList.innerHTML="";
  }
  function showLatest(){
    var e=state.history[0];
    if(e){ renderStatic(e.n); } else { renderPlaceholder(); }
    renderHist();
  }
  function renderHist(){
    var ol=$("hist"); ol.innerHTML="";
    state.history.slice(0,10).forEach(function(e){
      var t=tierOf(e.total), li=document.createElement("li");
      li.innerHTML='<span class="h-n"></span><span class="h-t"></span><span class="h-d"></span>';
      li.children[0].textContent=String(e.n);
      li.children[1].textContent=LABELS[t]+" · "+fmt(e.total)+" EP"; li.children[1].style.color="var(--t-"+t+")";
      li.children[2].textContent=e.day===state.day?"Today":e.day;
      ol.appendChild(li);
    });
    $("histNone").hidden=state.history.length>0;
    $("best").textContent=state.best?"Best: "+state.best.n+" · "+fmt(state.best.total)+" EP":"";
  }
  function renderBook(){
    var host=$("book"), openFamilies={};
    host.querySelectorAll(".fam[data-family]").forEach(function(item){openFamilies[item.dataset.family]=item.open;});
    host.innerHTML="";
    var fams={}, order=[], found=0;
    R.BADGES.forEach(function(b){ var k=b.family||"_"; if(!fams[k]){ fams[k]=[]; order.push(k); } fams[k].push(b); if(state.found[b.id]) found++; });
    order.sort(function(a,b){ return a==="_"?-1:b==="_"?1:(a<b?-1:1); });
    $("bookCount").textContent=found+" of "+R.BADGES.length+" found";
    order.forEach(function(f){
      var wrap=document.createElement("details"); wrap.className="fam"; wrap.dataset.family=f;
      wrap.open=Object.prototype.hasOwnProperty.call(openFamilies,f)?openFamilies[f]:true;
      var h=document.createElement("summary"); h.className="fam-title"; h.textContent=f==="_"?"Stand-alone":famName(f)+" family"; wrap.appendChild(h);
      fams[f].slice().sort(function(x,y){return x.ep-y.ep;}).forEach(function(d){
        var got=!!state.found[d.id], row=document.createElement("div"); row.className="brow"+(got?"":" miss");
        row.innerHTML='<span class="ck"></span><span class="nm"><span class="n"></span><small></small></span><span class="pts"></span>';
        row.children[0].textContent=got?"✓":"";
        row.querySelector(".n").textContent=d.emoji+" "+d.name;
        row.querySelector("small").textContent=d.description+" · "+d.probability+" of rolls";
        row.children[2].textContent="+"+fmt(d.ep)+" EP";
        wrap.appendChild(row);
      });
      host.appendChild(wrap);
    });
  }
  function updateUI(){
    var l=left(), into=state.progress;
    $("rollsLeft").textContent=l===Infinity?"∞":Math.max(l,0);
    $("rollsLabel").textContent=l===1?"roll left":"rolls left";
    $("barFill").style.width=(into/PER*100)+"%";
    $("progText").textContent=into+" / "+PER+" coal to your next roll";
    $("progText2").textContent=bonusEarned()+" rolls earned lifetime";
    $("coalCount").textContent=fmt(state.coalTotal)+" coal all-time";
    var gb=$("genBtn"); gb.disabled=busy||l<=0;
    gb.textContent="Generate";
    $("coal").disabled=!state.starterRollGranted||dyn.active||busy||wire.active||vy.active||db.active||cz.active;
    ensureHits();
    $("mineNote").textContent="";
  }

  /* ---------- the roll: reels stop left to right, then badges land from least rare to most rare ---------- */
  function bigTier(t){ return t==="epic"||t==="anomaly"||t==="mythic"; }
  function playReveal(n,a,done){
    var str=String(n), ds=buildNumber(str), start=performance.now(), tier=tierOf(a.total);
    var stops=[], last=[], isLocked=[], lockedCount=0, raf=0, cnt=0, timers=[], dead=false, i;
    var BASE=[1900,3000,4200,5400,6600,8400];   /* pacing taken from the reference recording */
    for(i=0;i<ds.length;i++){ stops.push(i<BASE.length?BASE[i]:BASE[5]+(i-5)*1200); last.push(0); isLocked.push(false); ds[i].classList.add("spin"); ds[i].textContent="?"; }
    hero.dataset.tier="none"; $("tagline").hidden=true; metaEl.hidden=true; epPill.textContent="??? EP"; epPill.hidden=false; $("life").hidden=true;
    bdEl.hidden=true; bdList.innerHTML="";
    document.body.classList.remove("has-roll","awaiting-continue"); $("continueBtn").hidden=true; document.body.classList.add("rolling"); hero.classList.add("rolling");
    function stopAll(){ dead=true; cancelAnimationFrame(raf); cancelAnimationFrame(cnt); timers.forEach(clearTimeout); document.body.classList.remove("rolling"); hero.classList.remove("rolling"); }
    cancelReveal=function(){ stopAll(); cancelReveal=null; renderStatic(n); done(); };
    function frame(now){
      if(dead) return;
      var t=now-start;
      for(var k=0;k<ds.length;k++){
        if(isLocked[k]) continue;
        if(t>=stops[k]){
          ds[k].textContent=str[k]; ds[k].classList.remove("spin","slow"); ds[k].classList.add("lock");
          isLocked[k]=true; lockedCount++;
        } else {
          if(t<350) continue;
          var remaining=stops[k]-t, delay=remaining<1500?70+(1-remaining/1500)*220:70;
          if(now-last[k]>=delay){
            var cur=ds[k].textContent, nx;
            if(k>=ds.length-2&&remaining<1500){   /* last digits tease values near the real one */
              var tg=+str[k]; do{ nx=String(Math.max(0,Math.min(9,tg+Math.floor(Math.random()*5)-2))); }while(nx===cur);
            } else { do{ nx=String(Math.floor(Math.random()*10)); }while(nx===cur); }
            ds[k].textContent=nx; last[k]=now; ds[k].classList.toggle("slow",delay>140);
          }
        }
      }
      if(lockedCount<ds.length) raf=requestAnimationFrame(frame);
      else timers.push(setTimeout(revealBadges,650));
    }
    raf=requestAnimationFrame(frame);
    function countTo(from,to,dur){
      cancelAnimationFrame(cnt);
      var s=performance.now();
      (function f(now){ var p=Math.min((now-s)/dur,1); epPill.textContent=fmt(Math.round(from+(to-from)*p))+" EP"; if(p<1&&!dead) cnt=requestAnimationFrame(f); })(s);
    }
    function revealBadges(){
      var list=a.groups, idx=0, running=0, shown=0, gap=Math.max(260,Math.min(800,9000/Math.max(list.length,1)));
      epPill.textContent="0 EP"; epPill.hidden=false; bdEl.hidden=false;
      if(document.documentElement.classList.contains("first-visit")) bdEl.classList.add("first-roll-reveal");
      setCount(0);
      try{ bdEl.scrollIntoView({block:"nearest",behavior:"smooth"}); }catch(e){}
      if(!list.length){ $("bdCount").textContent="No badges this time. Plain numbers happen."; timers.push(setTimeout(conclude,1000)); return; }
      (function next(){
        if(dead) return;
        var g=list[idx], el=buildGroup(g,n,true); bdList.insertBefore(el,bdList.firstChild);
        countTo(running,running+g.main.ep,Math.min(500,gap)); running+=g.main.ep;
        shown+=groupSize(g); idx++; setCount(shown);
        timers.push(setTimeout(idx<list.length?next:function(){ timers.push(setTimeout(conclude,900)); },gap));
      })();
    }
    function conclude(){
      if(dead) return;
      stopAll(); cancelReveal=null; bdEl.classList.remove("first-roll-reveal"); document.documentElement.classList.remove("first-visit"); document.body.classList.remove("has-roll"); document.body.classList.add("awaiting-continue"); $("continueBtn").hidden=false;
      hero.dataset.tier=tier; setMeta(a.total);
      epPill.textContent=fmt(a.total)+" EP";
      $("lifeN").textContent=fmt(state.lifetime)+" EP"; $("life").hidden=false;
      lastShare=shareText(n,a.total);
      if(bigTier(tier)){ hero.classList.remove("flash"); void hero.offsetWidth; hero.classList.add("flash"); }
      try{ hero.scrollIntoView({block:"nearest",behavior:"smooth"}); }catch(e){}
      done();
    }
  }
  function doRoll(){
    if(busy){ if(cancelReveal) cancelReveal(); return; }
    ensureDay();
    if(left()<=0) return;
    busy=true; msg="";
    state.used++;
    state.starterRollGranted=true;
    var n=Math.floor(1000001*Math.random());
    var a=analyze(n), tier=tierOf(a.total);
    state.lifetime=(state.lifetime||0)+a.total;
    state.history.unshift({n:n,total:a.total,day:state.day});
    state.history=state.history.slice(0,40);
    a.groups.forEach(function(g){ state.found[g.main.id]=1; g.subs.forEach(function(s){ state.found[s.id]=1; }); });
    if(!state.best||a.total>state.best.total) state.best={n:n,total:a.total};
    save();
    function done(){
      busy=false; renderHist(); renderBook();
      msg="Rolled "+n+": "+fmt(a.total)+" EP, "+LABELS[tier]+".";
      updateUI();
    }
    if(REDUCED){ renderStatic(n); done(); return; }
    updateUI();
    playReveal(n,a,done);
  }
  $("continueBtn").addEventListener("click",function(){ document.body.classList.remove("awaiting-continue","rolling"); hero.classList.remove("rolling"); document.body.classList.add("has-roll"); $("continueBtn").hidden=true; requestAnimationFrame(function(){ layoutCoal(); }); });
  $("shareBtn").addEventListener("click",function(){
    var b=$("shareBtn");
    function ok(){ b.classList.add("copied"); b.setAttribute("aria-label","Copied"); b.title="Copied"; setTimeout(function(){b.classList.remove("copied"); b.setAttribute("aria-label","Share result"); b.title="Share result";},1500); }
    function fail(){ msg=lastShare; updateUI(); }
    try{ navigator.clipboard.writeText(lastShare).then(ok,fail); }catch(e){ fail(); }
  });

  /* ---------- coal: each piece takes 5 to 20 hits, and mining one can light a dynamite fuse ---------- */
  var coal=$("coal"), mine=$("mine"), coalHits=$("coalHits"), pos={fx:0.5,fy:0.5};
  function rollHits(){ return !authUser&&guestBoostEnabled?1:5+Math.floor(Math.random()*16); }
  function ensureHits(){ if(!(state.hitsLeft>0)) state.hitsLeft=rollHits(); }
  function showHits(){ ensureHits(); }
  function bounds(){ return {w:Math.max(mine.clientWidth-coal.offsetWidth,0),h:Math.max(mine.clientHeight-coal.offsetHeight,0)}; }
  function layoutCoal(){ var b=bounds(); coal.style.left=(pos.fx*b.w)+"px"; coal.style.top=(pos.fy*b.h)+"px"; }
  function moveCoal(){
    var b=bounds(), ox=pos.fx*b.w, oy=pos.fy*b.h, minD=Math.min(120,Math.hypot(b.w,b.h)/3), fx, fy, tries=0;
    do{ fx=Math.random(); fy=Math.random(); tries++; } while(tries<14&&Math.hypot(fx*b.w-ox,fy*b.h-oy)<minD);
    pos.fx=fx; pos.fy=fy; layoutCoal();
  }
  function floater(){
    var el=document.createElement("span"); el.className="plus"; el.textContent="+1 coal";
    el.style.left=(coal.offsetLeft+coal.offsetWidth/2-24)+"px"; el.style.top=(coal.offsetTop+4)+"px";
    mine.appendChild(el); setTimeout(function(){ if(el.parentNode)el.parentNode.removeChild(el); },750);
  }
  coal.addEventListener("click",function(){
    ensureDay();
    if(dyn.active||busy||wire.active||vy.active||db.active||cz.active) return;
    ensureHits(); state.hitsLeft--;
    if(!REDUCED){ try{ coal.animate([{transform:"scale(.8)"},{transform:"scale(1)"}],{duration:140,easing:"ease-out"}); }catch(e){} }
    var lit=false, wired=false, vyd=false, dbd=false, czd=false;
    if(state.hitsLeft<=0){
      state.coalTotal++; state.progress++; msg="";
      $("coalCount").textContent=fmt(state.coalTotal)+" coal all-time";
      if(!REDUCED) floater();
      if(state.progress>=PER){
        state.progress=0; state.bonus++;
        msg="Bonus roll earned. You have "+left()+" available.";
        var box=$("rollsBox"); box.classList.remove("pulse"); void box.offsetWidth; box.classList.add("pulse");
      }
      $("barFill").style.width=(state.progress/PER*100)+"%";
      $("progText").textContent=state.progress+" / "+PER+" coal to your next roll";
      state.hitsLeft=rollHits();
      moveCoal();
      lit=Math.random()<1/DYN_ODDS;
      wired=Math.random()<1/WIRE_ODDS;
      vyd=Math.random()<1/VERITY_ODDS;
      dbd=Math.random()<1/DBL_ODDS;
      czd=Math.random()<1/CZ_ODDS;
      updateUI();
    }
    save(); showHits();
    pending=[]; if(wired) pending.push("wires"); if(vyd) pending.push("verity"); if(dbd) pending.push("double"); if(czd) pending.push("captcha"); if(lit) pending.push("dyn");
    runNext();
  });

  /* ---------- dynamite: three quick sums in 30 seconds, or the coal progress resets ---------- */
  var dyn={active:false,timer:0,probs:[],idx:0,end:0};
  var dynEl=$("dyn"), dynQ=$("dynQ"), dynIn=$("dynIn"), dynBar=$("dynBar"), dynStep=$("dynStep"), dynTime=$("dynTime"), dynForm=$("dynForm");
  function ri(lo,hi){ return lo+Math.floor(Math.random()*(hi-lo+1)); }
  /* addition and subtraction use numbers up to 2 digits, and answers are never negative */
  function makeProb(){
    var a, b;
    if(ri(0,1)===0){ a=ri(2,99); b=ri(2,99); return {a:a,b:b,op:"+",ans:a+b}; }
    a=ri(10,99); b=ri(2,a); return {a:a,b:b,op:"−",ans:a-b};
  }
  function newProbs(){ var o=[]; for(var i=0;i<DYN_PROBLEMS;i++) o.push(makeProb()); return o; }
  function fixProb(p){ return (Array.isArray(p)||p.op==="×")?makeProb():p; }
  function showProblem(){
    var p=dyn.probs[dyn.idx];
    dynQ.textContent=p.a+" "+p.op+" "+p.b+" =";
    dynStep.textContent="Problem "+(dyn.idx+1)+" of "+DYN_PROBLEMS;
    dynIn.value="";
  }
  function dynTick(){
    var rem=dyn.end-Date.now();
    if(rem<=0){ explode(); return; }
    dynBar.style.width=(rem/DYN_MS*100)+"%";
    dynTime.textContent=Math.ceil(rem/1000)+"s";
    dynEl.classList.toggle("urgent",rem<6000);
  }
  function startDynamite(resume){
    if(resume){ dyn.probs=resume.probs.map(fixProb); dyn.idx=resume.idx; dyn.end=resume.end; }
    else { dyn.probs=newProbs(); dyn.idx=0; dyn.end=Date.now()+DYN_MS; state.dyn={probs:dyn.probs,idx:0,end:dyn.end}; save(); }
    dyn.active=true; document.body.classList.add("dyn-on"); dynEl.hidden=false; dynEl.classList.remove("urgent"); showPracticeClose("dynClose");
    showProblem(); dynTick(); clearInterval(dyn.timer); dyn.timer=setInterval(dynTick,100);
    msg="Dynamite! Solve all "+DYN_PROBLEMS+" problems to defuse it."; updateUI();
    try{ dynIn.focus({preventScroll:true}); }catch(e){}
  }
  function endDyn(){ clearInterval(dyn.timer); document.body.classList.remove("dyn-on"); dyn.active=false; state.dyn=null; dynEl.hidden=true; }
  function defuse(){ endDyn(); msg="Dynamite defused. Your coal is safe."; save(); updateUI(); runNext(); }
  function explode(){
    var testFailed=!!state.testMinigame;
    endDyn(); clearFailedGameProgress(); pending=[]; msg=testFailed?"BOOM. Test game failed; coal progress was kept.":"BOOM. The dynamite went off and your coal progress reset to 0. Bonus rolls you already earned are safe.";
    save(); updateUI();
    if(!REDUCED){ mine.classList.remove("boom"); void mine.offsetWidth; mine.classList.add("boom"); }
  }
  dynForm.addEventListener("submit",function(e){
    e.preventDefault();
    if(!dyn.active) return;
    var p=dyn.probs[dyn.idx], v=parseInt(dynIn.value,10);
    if(v===p.ans){
      dyn.idx++;
      if(dyn.idx>=DYN_PROBLEMS) defuse();
      else { state.dyn.idx=dyn.idx; save(); showProblem(); try{ dynIn.focus({preventScroll:true}); }catch(e2){} }
    } else explode();
  });
  /* ---------- wires: drag each cut wire to its matching color, one wrong match blows the bomb ---------- */
  var WCOL=[{c:"#e53935",s:"circle"},{c:"#2563eb",s:"x"},{c:"#f5c518",s:"tri"},{c:"#d81fc8",s:"star"}];
  var WROWS=[80,160,240,320];
  var wire={active:false,left:[],right:[],done:[],drag:null,locked:false,end:0,timer:0};
  var wiresEl=$("wires"), wsvg=$("wireSvg"), wcount=$("wireCount");
  function shuffle(a){ a=a.slice(); for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)), t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
  var WDECOR=
    '<g fill="none" stroke-linecap="round" opacity=".6">'+
    '<path d="M80 110 C150 140 200 125 222 96" stroke="#7a1a1a" stroke-width="8"/>'+
    '<path d="M80 150 C150 180 210 170 240 90" stroke="#8a6d0a" stroke-width="8"/>'+
    '<path d="M80 200 C190 230 215 170 226 120" stroke="#050607" stroke-width="8"/>'+
    '<path d="M80 270 C190 285 215 240 228 110" stroke="#1c2f7a" stroke-width="8"/>'+
    '<path d="M240 0 C238 120 252 260 232 400" stroke="#1c2f7a" stroke-width="7"/>'+
    '<path d="M262 0 C275 140 262 300 270 400" stroke="#8a6d0a" stroke-width="7"/>'+
    '<path d="M250 0 C262 100 245 300 250 400" stroke="#7a1a1a" stroke-width="6"/>'+
    '<path d="M320 100 C290 150 280 190 330 215" stroke="#7a1a1a" stroke-width="8"/>'+
    '<path d="M320 175 C280 215 290 280 335 300" stroke="#1c2f7a" stroke-width="8"/>'+
    '<path d="M320 255 C290 300 295 330 330 345" stroke="#050607" stroke-width="8"/>'+
    '</g>'+
    '<g fill="#8b9098" stroke="#2a2d31" stroke-width="2"><rect x="226" y="52" width="30" height="16" rx="6"/><rect x="246" y="22" width="30" height="16" rx="6"/></g>';
  function sym(kind,cx,cy){
    var st='fill="none" stroke="#12141a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"';
    if(kind==="circle") return '<circle cx="'+cx+'" cy="'+cy+'" r="6.5" '+st+'/>';
    if(kind==="x") return '<path d="M'+(cx-6)+' '+(cy-6)+'L'+(cx+6)+' '+(cy+6)+'M'+(cx+6)+' '+(cy-6)+'L'+(cx-6)+' '+(cy+6)+'" '+st+'/>';
    if(kind==="tri") return '<path d="M'+cx+' '+(cy-7)+'L'+(cx+7)+' '+(cy+6)+'L'+(cx-7)+' '+(cy+6)+'Z" '+st+'/>';
    var pts=[]; for(var k=0;k<10;k++){ var a=-Math.PI/2+k*Math.PI/5, r=k%2?3.4:8; pts.push((cx+r*Math.cos(a)).toFixed(1)+","+(cy+r*Math.sin(a)).toFixed(1)); }
    return '<polygon points="'+pts.join(" ")+'" '+st+'/>';
  }
  function tip(x,y){
    return '<rect x="'+x+'" y="'+(y-9)+'" width="16" height="18" rx="3" fill="url(#cu)" stroke="#4a280e" stroke-width="1.5"/>'+
      '<path d="M'+(x+3)+' '+(y+9)+'L'+(x+8)+' '+(y-9)+'M'+(x+7)+' '+(y+9)+'L'+(x+12)+' '+(y-9)+'M'+(x+11)+' '+(y+9)+'L'+(x+16)+' '+(y-9)+'" stroke="#5c3112" stroke-width="1.4"/>';
  }
  function wstroke(d,col){
    return '<path d="'+d+'" fill="none" stroke="rgba(0,0,0,.6)" stroke-width="15" stroke-linecap="round"/>'+
      '<path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="10" stroke-linecap="round"/>'+
      '<path d="'+d+'" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="3" stroke-linecap="round" transform="translate(0,-2)"/>';
  }
  function wpath(x1,y1,x2,y2){ var dx=Math.max(40,Math.abs(x2-x1)*0.5); return "M"+x1+" "+y1+" C"+(x1+dx)+" "+y1+" "+(x2-dx)+" "+y2+" "+x2+" "+y2; }
  function drawWires(){
    var s='<defs><linearGradient id="cu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9ad66"/><stop offset="1" stop-color="#9a5a28"/></linearGradient>'+
      '<radialGradient id="bgw" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="#26282d"/><stop offset="1" stop-color="#0d0e10"/></radialGradient></defs>'+
      '<rect width="400" height="400" fill="url(#bgw)"/>'+WDECOR+
      '<rect x="0" y="0" width="34" height="400" fill="#3b3f45"/><rect x="366" y="0" width="34" height="400" fill="#3b3f45"/>';
    var i, k, n=0;
    for(i=0;i<4;i++){
      var y=WROWS[i], col=WCOL[wire.left[i]], j=wire.done[i];
      if(j>=0){ n++; s+=wstroke(wpath(78,y,322,WROWS[j]),col.c); }
    }
    if(wire.drag){ var d=wire.drag, c=WCOL[wire.left[d.i]]; s+=wstroke(wpath(78,WROWS[d.i],d.x,d.y),c.c)+'<circle cx="'+d.x+'" cy="'+d.y+'" r="9" fill="url(#cu)" stroke="#4a280e" stroke-width="1.5"/>'; }
    for(i=0;i<4;i++){
      var yy=WROWS[i], cl=WCOL[wire.left[i]], cr=WCOL[wire.right[i]], ok=wire.done[i]>=0;
      s+='<rect x="8" y="'+(yy-26)+'" width="26" height="8" rx="2" fill="'+(ok?"#34d399":"#4a4d52")+'"/>';
      s+='<rect data-side="L" data-row="'+i+'" data-col="'+wire.left[i]+'" x="8" y="'+(yy-13)+'" width="54" height="26" rx="3" fill="'+cl.c+'" stroke="rgba(0,0,0,.55)" stroke-width="1.5"/>'+sym(cl.s,30,yy)+tip(62,yy);
      s+='<rect data-side="R" data-row="'+i+'" data-col="'+wire.right[i]+'" x="338" y="'+(yy-13)+'" width="54" height="26" rx="3" fill="'+cr.c+'" stroke="rgba(0,0,0,.55)" stroke-width="1.5"/>'+sym(cr.s,370,yy)+tip(322,yy);
    }
    wsvg.innerHTML=s; wcount.textContent=n+" / 4";
  }
  function toSvg(e){ var r=wsvg.getBoundingClientRect(); return {x:(e.clientX-r.left)*400/r.width, y:(e.clientY-r.top)*400/r.height}; }
  function rowNear(y){ for(var i=0;i<4;i++) if(Math.abs(y-WROWS[i])<38) return i; return -1; }
  function startWires(resume){
    if(resume){ wire.left=resume.left; wire.right=resume.right; wire.done=resume.done; wire.end=resume.end||(Date.now()+WIRE_MS); }
    else { wire.left=shuffle([0,1,2,3]); wire.right=shuffle([0,1,2,3]); wire.done=[-1,-1,-1,-1]; wire.end=Date.now()+WIRE_MS; state.wire={left:wire.left,right:wire.right,done:wire.done,end:wire.end}; save(); }
    wire.active=true; wire.locked=false; wire.drag=null; showPracticeClose("wireClose");
    wiresEl.classList.remove("blast","ok"); wiresEl.hidden=false; drawWires(); updateUI();
    wireTick(); clearInterval(wire.timer); wire.timer=setInterval(wireTick,50);
  }
  function wireTick(){
    if(!wire.active||wire.locked) return;
    var rem=wire.end-Date.now();
    if(rem<=0){ $("wireTime").textContent="0.0s"; $("wireBar").style.width="0%"; wireBoom(); return; }
    $("wireTime").textContent=(rem/1000).toFixed(1)+"s";
    $("wireBar").style.width=(rem/WIRE_MS*100)+"%";
    wiresEl.classList.toggle("urgent",rem<2000);
  }
  function closeWires(){ clearInterval(wire.timer); wiresEl.classList.remove("urgent"); wire.active=false; wire.drag=null; wire.locked=false; wiresEl.hidden=true; wiresEl.classList.remove("blast","ok"); state.wire=null; }
  function wireBoom(){
    clearInterval(wire.timer); wire.locked=true; wire.drag=null; drawWires(); pending=[];
    wiresEl.classList.add("blast");
    setTimeout(function(){
      if(!wire.active) return;
      closeWires(); clearFailedGameProgress(); save(); updateUI();
      if(!REDUCED){ mine.classList.remove("boom"); void mine.offsetWidth; mine.classList.add("boom"); }
    },REDUCED?0:600);
  }
  function wireDone(){
    clearInterval(wire.timer); wire.locked=true; wiresEl.classList.add("ok");
    setTimeout(function(){
      if(!wire.active) return;
      closeWires(); save(); updateUI();
      runNext();
    },REDUCED?0:800);
  }
  wsvg.addEventListener("pointerdown",function(e){
    if(!wire.active||wire.locked) return;
    var pt=toSvg(e), i=rowNear(pt.y);
    if(i<0||pt.x>110||wire.done[i]>=0) return;
    wire.drag={i:i,x:pt.x,y:pt.y};
    try{ wsvg.setPointerCapture(e.pointerId); }catch(err){}
    e.preventDefault(); drawWires();
  });
  wsvg.addEventListener("pointermove",function(e){
    if(!wire.drag) return;
    var pt=toSvg(e); wire.drag.x=Math.max(0,Math.min(400,pt.x)); wire.drag.y=Math.max(0,Math.min(400,pt.y)); drawWires();
  });
  function wireRelease(e){
    if(!wire.drag||wire.locked) return;
    var d=wire.drag; wire.drag=null;
    if(e.type==="pointercancel"){ drawWires(); return; }
    var pt=toSvg(e), j=pt.x>250?rowNear(pt.y):-1;
    if(j<0){ drawWires(); return; }
    if(wire.right[j]===wire.left[d.i]){
      wire.done[d.i]=j; save(); drawWires();
      if(wire.done.every(function(v){ return v>=0; })) wireDone();
    } else { wireBoom(); }
  }
  wsvg.addEventListener("pointerup",wireRelease);
  wsvg.addEventListener("pointercancel",wireRelease);

  /* ---------- statue puzzle: outside statues show two shapes, each inside room needs the missing one ---------- */
  var VY_ROUNDS=1, VSH=[{c:"#38bdf8"},{c:"#fbbf24"},{c:"#fb7185"}], VNAMES=["Left","Middle","Right"];
  var vy={timer:0,end:0,active:false,round:0,room:[],out:[],pend:null,chg:null,locked:false}, pending=[];
  var vyEl=$("vy"), vyOut=$("vyOut"), vyIn=$("vyIn"), vyRound=$("vyRound");
  function runNext(){
    var e=pending.shift();
    if(e==="wires") startWires(); else if(e==="verity") startVerity(); else if(e==="double") startDouble(); else if(e==="captcha") startCaptcha(); else if(e==="dyn") startDynamite(); else { state.testMinigame=false; save(); updateUI(); }
  }
  function glyph(k,s){
    var st='fill="'+VSH[k].c+'" stroke="rgba(0,0,0,.6)" stroke-width="3" stroke-linejoin="round"', body, hl='fill="rgba(255,255,255,.38)"';
    if(k===0) body='<circle cx="24" cy="24" r="17" '+st+'/><ellipse cx="18" cy="17" rx="6" ry="4" '+hl+'/>';
    else if(k===1) body='<rect x="8" y="8" width="32" height="32" rx="3" '+st+'/><rect x="11" y="11" width="26" height="6" rx="2" '+hl+'/>';
    else body='<path d="M24 6 L42 40 L6 40 Z" '+st+'/><path d="M24 12 L30 24 L22 24 Z" '+hl+'/>';
    return '<svg viewBox="0 0 48 48" width="'+s+'" height="'+s+'" aria-hidden="true">'+body+'</svg>';
  }
  /* one solid per statue: the room's missing shape picks the solid that casts the other two as shadows */
  function glyph3(missing){
    var sh='<ellipse cx="32" cy="60" rx="24" ry="3.6" fill="rgba(0,0,0,.4)"/>', ln='stroke="rgba(0,0,0,.4)" stroke-width="1.4" stroke-linejoin="round"', body;
    if(missing===3) body='<defs><radialGradient id="g3s" cx=".35" cy=".3"><stop offset="0" stop-color="#e0f2fe"/><stop offset=".6" stop-color="#38bdf8"/><stop offset="1" stop-color="#0c4a6e"/></radialGradient></defs><circle cx="32" cy="34" r="22" fill="url(#g3s)" '+ln+'/>';
    else if(missing===4) body='<path d="M10 22 L32 12 L54 22 L32 32 Z" fill="#fde68a" '+ln+'/><path d="M10 22 L32 32 L32 56 L10 46 Z" fill="#f59e0b" '+ln+'/><path d="M32 32 L54 22 L54 46 L32 56 Z" fill="#b45309" '+ln+'/>';
    else if(missing===5) body=
      '<path d="M32 7 L55 45 L9 45 Z" fill="#e34d70"/>'+
      '<path d="M32 7 L9 45 L32 57 Z" fill="#fb7185"/><path d="M32 7 L32 57 L55 45 Z" fill="#be123c"/>'+
      '<path d="M32 7 L9 45 L32 57 L55 45 Z M32 7 L32 57" '+ln+' fill="none"/>'+
      '<path d="M9 45 L55 45" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="1.4" stroke-dasharray="3 2" stroke-linecap="square"/>';
    else if(missing===0) body=
      '<path d="M32 6 L54 42 L32 27 Z" fill="#9a4d16"/><path d="M32 6 L32 27 L10 42 Z" fill="#c87527"/>'+
      '<path d="M32 6 L10 42 L32 56 Z" fill="#fdba74"/><path d="M32 6 L32 56 L54 42 Z" fill="#b8540b"/>'+
      '<path d="M32 6 L10 42 L32 56 L54 42 Z M32 6 L32 56" '+ln+' fill="none"/>'+
      '<path d="M32 6 L32 27 M32 27 L10 42 M32 27 L54 42" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="1.4" stroke-dasharray="3 2" stroke-linecap="square"/>';
    else if(missing===2) body='<defs><linearGradient id="g3c" x1="0" x2="1"><stop offset="0" stop-color="#bbf7d0"/><stop offset=".5" stop-color="#4ade80"/><stop offset="1" stop-color="#14532d"/></linearGradient></defs>'+
      '<path d="M12 18 L12 46 A20 7.5 0 0 0 52 46 L52 18 Z" fill="url(#g3c)" '+ln+'/><ellipse cx="32" cy="18" rx="20" ry="7.5" fill="#d9fbe5" '+ln+'/>';
    else body='<defs><linearGradient id="g3n" x1="0" x2="1"><stop offset="0" stop-color="#ddd6fe"/><stop offset=".5" stop-color="#a78bfa"/><stop offset="1" stop-color="#4c2a9a"/></linearGradient></defs>'+
      '<path d="M32 4 L11 46 A21 7.5 0 0 0 53 46 Z" fill="url(#g3n)" '+ln+'/>';
    return '<svg class="vy-solid" viewBox="0 0 64 64" aria-hidden="true">'+sh+body+'</svg>';
  }
  function missing(pr){ return pr[0]===pr[1]?3+pr[0]:3-pr[0]-pr[1]; }  /* 0 square pyramid, 1 cone, 2 cylinder, 3 sphere, 4 cube, 5 triangular pyramid */
  function drawVy(){
    $("vyRound").textContent="Round "+(vy.round+1)+" / "+VY_ROUNDS;
    var o="", n="", k;
    for(k=0;k<3;k++){
      var pd=vy.pend&&vy.pend.k===k;
      n+='<div class="vy-room" data-room="'+k+'" data-shape="'+vy.room[k]+'"><div class="vy-glyphs">'+glyph(vy.room[k],40)+'</div><span>'+VNAMES[k]+'</span></div>';
      o+='<div class="vy-ostat vy-stat'+(pd?" sel":"")+'" data-stat="'+k+'" data-solid="'+missing(vy.out[k])+'" data-shapes="'+vy.out[k].join(",")+'"><div class="vy-solids'+(vy.chg&&vy.chg.indexOf(k)>=0?" chg":"")+'">'+glyph3(missing(vy.out[k]))+'</div>'+
        '<div class="vy-pcs" style="min-height:26px">'+(pd?'<i>'+glyph(vy.pend.shape,24)+'</i>':'')+'</div><span>'+VNAMES[k]+'</span></div>';
    }
    vyOut.innerHTML=o; vyIn.innerHTML=n;
    var pal=""; for(k=0;k<3;k++) pal+='<button type="button" class="vy-opt" data-shape="'+k+'" aria-label="'+["circle","square","triangle"][k]+'">'+glyph(k,38)+'</button>';
    $("vyPal").innerHTML=pal;
  }
  function newPuzzle(){
    vy.room=shuffle([0,1,2]);
    var pool, g=0;
    do { pool=shuffle([0,0,1,1,2,2]); g++; vy.out=[[pool[0],pool[1]],[pool[2],pool[3]],[pool[4],pool[5]]]; }
    while(g<50&&!vy.out.some(function(pr,k){ return pr.indexOf(vy.room[k])>=0; }));
    if(!vy.out.some(function(pr,k){ return pr.indexOf(vy.room[k])>=0; })) vy.out=[[vy.room[0],vy.room[1]],[vy.room[1],vy.room[2]],[vy.room[2],vy.room[0]]];
    vy.pend=null; vy.locked=false;
    vy.end=Date.now()+VY_MS; state.vy={round:vy.round,room:vy.room,out:vy.out,end:vy.end}; save(); drawVy();
  }
  function startVerity(resume){
    if(resume&&resume.room&&resume.out){ vy.round=resume.round; vy.room=resume.room; vy.out=resume.out; vy.end=resume.end||(Date.now()+VY_MS); vy.pend=null; vy.locked=false; }
    else { vy.round=0; newPuzzle(); }
    vy.active=true; vyEl.classList.remove("blast","ok","urgent"); vyEl.hidden=false; showPracticeClose("vyClose"); drawVy(); updateUI();
    vyTick(); clearInterval(vy.timer); vy.timer=setInterval(vyTick,50);
  }
  function vyTick(){
    if(!vy.active||vy.locked) return;
    var rem=Math.max(0,vy.end-Date.now());
    $("vyTime").textContent=(rem/1000).toFixed(1)+"s"; $("vyBar").style.width=(rem/VY_MS*100)+"%";
    vyEl.classList.toggle("urgent",rem<=5000);
    if(rem<=0) verityBoom();
  }
  function closeVerity(){ clearInterval(vy.timer); vy.active=false; vy.locked=false; vyEl.hidden=true; vyEl.classList.remove("blast","ok"); state.vy=null; }
  function verityBoom(){
    vy.locked=true; vyEl.classList.add("blast");
    setTimeout(function(){
      if(!vy.active) return;
      closeVerity(); clearFailedGameProgress(); pending=[]; save(); updateUI();
      if(!REDUCED){ mine.classList.remove("boom"); void mine.offsetWidth; mine.classList.add("boom"); }
    },REDUCED?0:600);
  }
  /* drag a 2D shape from the tray into a statue. Right shape in the right statue swaps it in; anything else blows the bomb. */
  var vyDrag=null;
  function vyStatAt(x,y){ var el=document.elementFromPoint(x,y); return el&&el.closest?el.closest(".vy-stat"):null; }
  $("vyPal").addEventListener("pointerdown",function(e){
    var b=e.target.closest(".vy-opt"); if(!b||!vy.active||vy.locked) return;
    e.preventDefault();
    var g=document.createElement("div"); g.className="vy-ghost"; g.innerHTML=glyph(+b.dataset.shape,52);
    g.style.left=e.clientX+"px"; g.style.top=e.clientY+"px"; document.body.appendChild(g);
    vyDrag={shape:+b.dataset.shape,ghost:g,id:e.pointerId};
    try{ b.setPointerCapture(e.pointerId); }catch(_){}
  });
  $("vyPal").addEventListener("pointermove",function(e){
    if(!vyDrag) return;
    vyDrag.ghost.style.left=e.clientX+"px"; vyDrag.ghost.style.top=e.clientY+"px";
    var st=vyStatAt(e.clientX,e.clientY);
    [].forEach.call(vyOut.querySelectorAll(".vy-stat"),function(x){ x.classList.toggle("over",x===st); });
  });
  function vyEnd(e,drop){
    if(!vyDrag) return;
    var d=vyDrag; vyDrag=null; d.ghost.remove();
    [].forEach.call(vyOut.querySelectorAll(".vy-stat"),function(x){ x.classList.remove("over"); });
    if(!drop||!vy.active||vy.locked) return;
    var st=vyStatAt(e.clientX,e.clientY); if(!st) return;
    var k=+st.dataset.stat, X=d.shape;
    /* a shape dragged into a statue that does not hold it blows the bomb */
    if(vy.out[k].indexOf(X)<0){ verityBoom(); return; }
    if(!vy.pend||vy.pend.k===k){ vy.pend={k:k,shape:X}; drawVy(); return; }
    /* second drag in another statue: the two shapes trade places */
    var A=vy.pend.k, XA=vy.pend.shape; vy.pend=null;
    var pa=vy.out[A].slice(), pb=vy.out[k].slice();
    pa[pa.indexOf(XA)]=X; pb[pb.indexOf(X)]=XA;
    vy.out[A]=pa; vy.out[k]=pb; vy.chg=[A,k]; save(); drawVy(); vy.chg=null;
  }
  $("vyLock").addEventListener("click",function(){
    if(!vy.active||vy.locked) return;
    if(!vy.out.every(function(pr,i){ return pr.indexOf(vy.room[i])<0; })){ verityBoom(); return; }
    vy.round++; vy.locked=true; vyEl.classList.add("ok");
    if(vy.round>=VY_ROUNDS) setTimeout(function(){ if(!vy.active) return; closeVerity(); save(); updateUI(); runNext(); },REDUCED?0:800);
    else setTimeout(function(){ if(!vy.active) return; vyEl.classList.remove("ok"); newPuzzle(); },REDUCED?0:700);
  });
  $("vyPal").addEventListener("pointerup",function(e){ vyEnd(e,true); });
  $("vyPal").addEventListener("pointercancel",function(e){ vyEnd(e,false); });


  /* ---------- double break: see phase 1 orbs, work out how many of each element appear across both phases, in 20 seconds ---------- */
  var DBE=[{n:"Solar",c:"#fb923c",d:"#9a3412"},{n:"Void",c:"#a855f7",d:"#4c1d95"},{n:"Arc",c:"#38bdf8",d:"#0c4a6e"}];
  function dbNext(e){ return e===1?0:(e===0?2:1); }   /* void -> solar -> arc -> void */
  var db={active:false,o:[],end:0,timer:0,locked:false}, dbEl=$("db");
  function orb(e,sz){
    var c=DBE[e], g="gdb"+e, sym;
    if(e===0) sym='<circle cx="20" cy="20" r="5" fill="#fff7ed"/><g stroke="#fff7ed" stroke-width="2.4" stroke-linecap="round"><path d="M20 8v4M20 28v4M8 20h4M28 20h4M11.5 11.5l2.8 2.8M25.7 25.7l2.8 2.8M28.5 11.5l-2.8 2.8M14.3 25.7l-2.8 2.8"/></g>';
    else if(e===1) sym='<path d="M20 9a11 11 0 1 0 11 11 7 7 0 1 0-7 7 3.4 3.4 0 1 0-3.4-3.4" fill="none" stroke="#f3e8ff" stroke-width="2.6" stroke-linecap="round"/>';
    else sym='<path d="M23 7L13 22h7l-3 11 11-16h-7z" fill="#f0f9ff" stroke="#0c4a6e" stroke-width="1" stroke-linejoin="round"/>';
    return '<svg viewBox="0 0 40 40" width="'+sz+'" height="'+sz+'" aria-hidden="true"><defs><radialGradient id="'+g+'" cx=".35" cy=".3"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".35" stop-color="'+c.c+'"/><stop offset="1" stop-color="'+c.d+'"/></radialGradient></defs><circle cx="20" cy="20" r="18" fill="url(#'+g+')" stroke="rgba(0,0,0,.5)" stroke-width="1.5"/>'+sym+'</svg>';
  }
  function argosSvg(){
    return '<svg class="db-argos" viewBox="0 0 240 190" aria-hidden="true"><defs><linearGradient id="gcr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset=".5" stop-color="#bfe3ff" stop-opacity=".55"/><stop offset="1" stop-color="#7aa7d9" stop-opacity=".45"/></linearGradient><radialGradient id="gcg" cx=".5" cy=".5"><stop offset="0" stop-color="#bfe3ff" stop-opacity=".5"/><stop offset="1" stop-color="#bfe3ff" stop-opacity="0"/></radialGradient></defs>'+
      '<ellipse cx="120" cy="112" rx="110" ry="80" fill="url(#gcg)"/>'+
      '<polygon points="120,40 40,108 120,182 200,108" fill="url(#gcr)" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>'+
      '<path d="M120 40 L120 182 M40 108 L200 108 M120 40 L78 108 L120 182 L162 108 Z" fill="none" stroke="#fff" stroke-width="1.6" opacity=".8"/>'+
      '<path d="M120 118 v-16 M110 128 l10-10 10 10 M112 138 h16 M108 150 l12-8 12 8" fill="none" stroke="#5b6b85" stroke-width="2.2" stroke-linecap="round" opacity=".75"/></svg>';
  }
  function dbCounts(){
    var c=[0,0,0]; db.o.forEach(function(e){ c[e]++; c[dbNext(e)]++; }); return c;   /* phase 1 orbs plus the same orbs after they change */
  }
  function dbDraw(){
    var pos=[[104,0],[0,64],[208,64]];
    $("dbScene").innerHTML=argosSvg()+db.o.map(function(e,i){ return orb(e,32).replace('<svg ','<svg style="left:'+pos[i][0]+'px;top:'+pos[i][1]+'px" '); }).join("");
  }
  function dbRoll(){ return [0,0,0].map(function(){ return Math.floor(Math.random()*3); }); }
  function startDouble(resume){
    if(resume&&resume.o){ db.o=resume.o; db.end=resume.end||(Date.now()+DB_MS); }
    else { db.o=dbRoll(); db.end=Date.now()+DB_MS; state.dbl={o:db.o,end:db.end}; save(); }
    $("dbIn").value=""; db.locked=false; db.active=true; dbEl.classList.remove("blast","ok","urgent"); dbEl.hidden=false; showPracticeClose("dbClose"); dbDraw(); updateUI(); try{ $("dbIn").focus({preventScroll:true}); }catch(_){}
    dbTick(); clearInterval(db.timer); db.timer=setInterval(dbTick,50);
  }
  function dbTick(){
    if(!db.active||db.locked) return;
    var rem=Math.max(0,db.end-Date.now());
    $("dbTime").textContent=(rem/1000).toFixed(1)+"s"; $("dbBar").style.width=(rem/DB_MS*100)+"%";
    dbEl.classList.toggle("urgent",rem<=5000);
    if(rem<=0) dblBoom();
  }
  function closeDouble(){ clearInterval(db.timer); db.active=false; db.locked=false; dbEl.hidden=true; dbEl.classList.remove("blast","ok","urgent"); state.dbl=null; }
  function dblBoom(){
    db.locked=true; dbEl.classList.add("blast");
    setTimeout(function(){
      if(!db.active) return;
      closeDouble(); clearFailedGameProgress(); pending=[]; save(); updateUI();
      if(!REDUCED){ mine.classList.remove("boom"); void mine.offsetWidth; mine.classList.add("boom"); }
    },REDUCED?0:600);
  }
  /* "1a 2s 3v": count then letter (s solar, v void, a arc), any order, missing elements count as 0 */
  function dbParse(t){
    var c=[0,0,0], L={s:0,v:1,a:2}, rest=t.toLowerCase().replace(/(\d+)\s*([sva])/g,function(_,n,l){ c[L[l]]+=+n; return " "; });
    return (/^[\s,]*$/.test(rest)&&t.trim()) ? c : null;
  }
  function dbSubmit(){
    if(!db.active||db.locked) return;
    var g=dbParse($("dbIn").value);
    if(!g){ var i=$("dbIn"); i.classList.remove("bad"); void i.offsetWidth; i.classList.add("bad"); return; }
    if(g.join()!==dbCounts().join()){ dblBoom(); return; }
    db.locked=true; dbEl.classList.add("ok");
    setTimeout(function(){ if(!db.active) return; closeDouble(); save(); updateUI(); runNext(); },REDUCED?0:800);
  }
  $("dbGo").addEventListener("click",dbSubmit);
  $("dbIn").addEventListener("keydown",function(e){ if(e.key==="Enter"){ e.preventDefault(); dbSubmit(); } });


  /* ---------- captcha: read the warped code and type it within 20 seconds ---------- */
  var czEl=$("cz"), cz={active:false,code:"",seed:0,end:0,timer:0,locked:false};
  function rng(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; var t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  function czDraw(){
    var cv=$("czImg"), g=cv.getContext("2d"), r=rng(cz.seed), W=cv.width, H=cv.height, i;
    var bg=g.createLinearGradient(0,0,W,H); bg.addColorStop(0,"#e8ecf1"); bg.addColorStop(1,"#cfd6df"); g.fillStyle=bg; g.fillRect(0,0,W,H);
    for(i=0;i<260;i++){ g.fillStyle="rgba("+(r()*120|0)+","+(r()*120|0)+","+(r()*120|0)+","+(.12+r()*.25)+")"; g.fillRect(r()*W,r()*H,1+r()*2.4,1+r()*2.4); }
    for(i=0;i<5;i++){ g.strokeStyle="rgba("+(r()*140|0)+","+(r()*140|0)+","+(r()*140|0)+",.45)"; g.lineWidth=1+r()*1.6; g.beginPath(); g.moveTo(0,r()*H); g.bezierCurveTo(W*.3,r()*H,W*.6,r()*H,W,r()*H); g.stroke(); }
    var fonts=["Georgia,serif","'Courier New',monospace","Verdana,sans-serif","'Trebuchet MS',sans-serif"], n=cz.code.length, step=(W-50)/n;
    for(i=0;i<n;i++){
      g.save(); g.translate(30+i*step+step/2*0.8,H/2+(r()-.5)*18); g.rotate((r()-.5)*.8); g.transform(1,(r()-.5)*.3,(r()-.5)*.4,1,0,0);
      g.font="bold "+(40+r()*18|0)+"px "+fonts[r()*fonts.length|0]; g.textAlign="center"; g.textBaseline="middle";
      g.fillStyle="rgb("+(r()*90|0)+","+(r()*90|0)+","+(r()*110|0)+")"; g.fillText(cz.code[i],0,0);
      g.strokeStyle="rgba(255,255,255,.35)"; g.lineWidth=1; g.strokeText(cz.code[i],0,0); g.restore();
    }
    for(i=0;i<4;i++){ g.strokeStyle="rgba("+(r()*100|0)+","+(r()*100|0)+","+(r()*100|0)+",.75)"; g.lineWidth=1.5+r()*1.5; g.beginPath(); g.moveTo(r()*W*.2,r()*H); g.lineTo(W*.8+r()*W*.2,r()*H); g.stroke(); }
  }
  function czCode(){ var A="ABCDEFGHJKLMNPQRTUVWXY2346789", c=""; for(var i=0;i<5;i++) c+=A[Math.floor(Math.random()*A.length)]; return c; }
  function startCaptcha(resume){
    if(resume&&resume.code){ cz.code=resume.code; cz.seed=resume.seed; cz.end=resume.end||(Date.now()+CZ_MS); }
    else { cz.code=czCode(); cz.seed=Math.floor(Math.random()*1e9); cz.end=Date.now()+CZ_MS; state.cz={code:cz.code,seed:cz.seed,end:cz.end}; save(); }
    cz.locked=false; cz.active=true; $("czIn").value=""; czEl.classList.remove("blast","ok","urgent"); czEl.hidden=false; showPracticeClose("czClose"); czDraw(); updateUI();
    try{ $("czIn").focus({preventScroll:true}); }catch(_){}
    czTick(); clearInterval(cz.timer); cz.timer=setInterval(czTick,50);
  }
  function czTick(){
    if(!cz.active||cz.locked) return;
    var rem=Math.max(0,cz.end-Date.now());
    $("czTime").textContent=(rem/1000).toFixed(1)+"s"; $("czBar").style.width=(rem/CZ_MS*100)+"%";
    czEl.classList.toggle("urgent",rem<=2000);
    if(rem<=0) czBoom();
  }
  function closeCaptcha(){ clearInterval(cz.timer); cz.active=false; cz.locked=false; czEl.hidden=true; czEl.classList.remove("blast","ok","urgent"); state.cz=null; }
  function czBoom(){
    cz.locked=true; czEl.classList.add("blast");
    setTimeout(function(){
      if(!cz.active) return;
      closeCaptcha(); clearFailedGameProgress(); pending=[]; save(); updateUI();
      if(!REDUCED){ mine.classList.remove("boom"); void mine.offsetWidth; mine.classList.add("boom"); }
    },REDUCED?0:600);
  }
  function czSubmit(){
    if(!cz.active||cz.locked) return;
    var v=$("czIn").value.replace(/\s+/g,"").toUpperCase();
    if(!v){ var i=$("czIn"); i.classList.remove("bad"); void i.offsetWidth; i.classList.add("bad"); return; }
    if(v!==cz.code){ czBoom(); return; }
    cz.locked=true; czEl.classList.add("ok");
    setTimeout(function(){ if(!cz.active) return; closeCaptcha(); save(); updateUI(); runNext(); },REDUCED?0:700);
  }
  $("czGo").addEventListener("click",czSubmit);
  $("czIn").addEventListener("keydown",function(e){ if(e.key==="Enter"){ e.preventDefault(); czSubmit(); } });
  [["dynClose","dyn"],["wireClose","wires"],["vyClose","verity"],["dbClose","double"],["czClose","captcha"]].forEach(function(pair){
    $(pair[0]).addEventListener("click",function(){ closePracticeMinigame(pair[1]); });
  });

  /* TEMPORARY TEST SWITCH: set to false to hide the minigame test buttons */
  var TEST_BUTTONS=true;
  $("testBar").hidden=!TEST_BUTTONS;
  $("testBar").addEventListener("click",function(e){
    var b=e.target.closest("button[data-t]"); if(!b||!TEST_BUTTONS) return;
    ensureDay();
    if(busy||dyn.active||wire.active||vy.active||db.active||cz.active) return;
    pending=[]; state.testMinigame=true; save();
    if(b.dataset.t==="wires") startWires(); else if(b.dataset.t==="verity") startVerity(); else if(b.dataset.t==="double") startDouble(); else if(b.dataset.t==="captcha") startCaptcha(); else startDynamite();
  });
  function jumpTo(el,block){ try{ el.scrollIntoView({behavior:REDUCED?"auto":"smooth",block:block}); }catch(e){ el.scrollIntoView(); } }

  var leaderboardData=null, leaderboardMetric="bestRoll";
  var leaderboardLabels={bestRoll:"Best roll",totalEp:"Total EP",coalMined:"Coal mined"};
  function renderLeaderboard(){
    var status=$("leaderboardStatus"), rows=$("leaderboardRows"), metric=leaderboardMetric;
    rows.innerHTML="";
    if(leaderboardData===null){status.textContent="Loading leaderboard...";return;}
    if(!leaderboardData.length){status.textContent="No account scores yet.";return;}
    var leaders=leaderboardData.slice().sort(function(a,b){
      var primary=metric==="bestRoll"?(b.bestRollEp-a.bestRollEp):metric==="coalMined"?(b.coalMined-a.coalMined):(b.totalEp-a.totalEp);
      return primary||(b.totalEp-a.totalEp)||(b.bestRollEp-a.bestRollEp)||(b.coalMined-a.coalMined)||String(a.username).localeCompare(String(b.username));
    }).slice(0,100);
    leaders.forEach(function(leader,index){
      var tr=document.createElement("tr");
      function cell(className,text){var td=document.createElement("td");td.className=className;td.textContent=text;tr.appendChild(td);return td;}
      cell("leaderboard-rank","#"+(index+1));
      var miner=cell("leaderboard-miner",leader.displayName||leader.username);miner.style.setProperty("--leader-name-color",leader.nameColor||"#27F549");
      var score=cell(metric==="bestRoll"?"leaderboard-best":"leaderboard-score","");
      if(metric==="bestRoll"){
        if(leader.bestRoll===null||leader.bestRoll===undefined){score.textContent="—";}
        else{
          var number=document.createElement("b"), meta=document.createElement("small"), rarity=tierOf(leader.bestRollEp);
          number.className="leaderboard-best-number";number.dataset.rarity=rarity;number.textContent=fmt(leader.bestRoll);
          meta.className="leaderboard-best-meta";
          meta.textContent=(LABELS[rarity]||rarity)+" · "+fmt(leader.bestRollEp)+" EP · "+pctLine(leader.bestRollEp).txt;
          score.appendChild(number);score.appendChild(meta);
        }
      }else if(metric==="totalEp") score.textContent=fmt(leader.totalEp)+" EP";
      else score.textContent=fmt(leader.coalMined);
      rows.appendChild(tr);
    });
    status.textContent=leaders.length+" miner"+(leaders.length===1?"":"s")+" · RANKED BY "+leaderboardLabels[metric].toUpperCase();
  }
  function renderPuzzleInfo(){
    var list=$("puzzleInfoList");
    list.innerHTML="";
    PUZZLE_INFO.forEach(function(puzzle){
      var card=document.createElement("article"), head=document.createElement("div"), title=document.createElement("h2"), odds=document.createElement("span"), label=document.createElement("span"), text=document.createElement("p"), pct=100/puzzle.oddsDenominator;
      card.className="puzzle-info-card";
      head.className="puzzle-info-card-head";
      title.textContent=puzzle.name;
      odds.className="puzzle-info-odds";
      odds.textContent="1 in "+puzzle.oddsDenominator+" · "+(pct<1?pct.toFixed(2):pct.toFixed(1))+"% per coal";
      label.className="puzzle-info-label";
      label.textContent="How to solve";
      text.className="puzzle-info-solution";
      text.textContent=puzzle.solution;
      head.appendChild(title);head.appendChild(odds);card.appendChild(head);card.appendChild(label);card.appendChild(text);list.appendChild(card);
    });
  }
  function loadLeaderboard(force){
    var status=$("leaderboardStatus");
    if(leaderboardData&&!force){renderLeaderboard();return;}
    status.textContent="Loading leaderboard..."; $("leaderboardRows").innerHTML="";
    apiRequest("leaderboard",{method:"GET"}).then(function(result){
      leaderboardData=Array.isArray(result.leaders)?result.leaders:[];
      renderLeaderboard();
    }).catch(function(error){status.textContent=error.message||"Leaderboard unavailable.";});
  }
  function selectLeaderboardMetric(metric){
    if(!leaderboardLabels[metric]) return;
    leaderboardMetric=metric;
    document.querySelectorAll(".leaderboard-tab[data-metric]").forEach(function(tab){
      var active=tab.dataset.metric===metric;
      tab.classList.toggle("active",active);tab.setAttribute("aria-selected",active?"true":"false");
      if(active) $("leaderboardTableWrap").setAttribute("aria-labelledby",tab.id);
    });
    $("leaderboardValueHeading").textContent=leaderboardLabels[metric];
    renderLeaderboard();
  }
  var topTabButtons=Array.prototype.slice.call(document.querySelectorAll(".top-tab[aria-controls]"));
  function selectTopTab(selectedTab){
    topTabButtons.forEach(function(tab){
      var active=tab===selectedTab, panel=$(tab.getAttribute("aria-controls"));
      tab.classList.toggle("active",active);
      tab.setAttribute("aria-selected",active?"true":"false");
      panel.hidden=!active;
    });
    if(selectedTab.id==="leaderboardTab"){
      if(authUser&&accountStateReady) remoteSaveNow().catch(function(){}).then(function(){loadLeaderboard(true);});
      else loadLeaderboard();
    }else if(selectedTab.id==="rollsTab") renderHist();
    else if(selectedTab.id==="badgesTab") renderBook();
    else if(selectedTab.id==="puzzleInfoTab") renderPuzzleInfo();
  }
  topTabButtons.forEach(function(tab){tab.addEventListener("click",function(){selectTopTab(tab);});});
  document.querySelectorAll(".leaderboard-tab[data-metric]").forEach(function(tab){
    tab.addEventListener("click",function(){selectLeaderboardMetric(tab.dataset.metric);});
  });
  $("leaderboardRefresh").addEventListener("click",function(){loadLeaderboard(true);});


  function closeProfile(){ $("profileMenu").hidden=true; $("accountUser").setAttribute("aria-expanded","false"); }
  function openProfile(){
    if(!authUser) return;
    $("profileDisplayName").value=authDisplayName||authUser;
    $("profileColorPicker").value=authNameColor;
    $("profileColorHex").value=authNameColor;
    $("profileMessage").textContent=""; $("profileMessage").classList.remove("error");
    $("profileMenu").hidden=false; $("accountUser").setAttribute("aria-expanded","true");
    setTimeout(function(){$("profileDisplayName").focus();},0);
  }
  function closeLogin(){ $("loginOverlay").hidden=true; $("loginForm").reset(); $("loginMessage").textContent=""; }
  $("accountUser").addEventListener("click",function(){if($("profileMenu").hidden) openProfile();else closeProfile();});
  $("profileCancel").addEventListener("click",closeProfile);
  document.addEventListener("click",function(e){if(!e.target.closest("#accountBar")) closeProfile();});
  $("profileColorPicker").addEventListener("input",function(){$("profileColorHex").value=this.value.toUpperCase();});
  $("profileColorHex").addEventListener("input",function(){if(/^#[0-9a-fA-F]{6}$/.test(this.value)) $("profileColorPicker").value=this.value;});
  $("profileForm").addEventListener("submit",function(e){
    e.preventDefault();
    var button=$("profileSave"), message=$("profileMessage");
    button.disabled=true; message.classList.remove("error"); message.textContent="Saving profile...";
    apiRequest("profile",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({csrf:authCsrf,displayName:$("profileDisplayName").value,nameColor:$("profileColorHex").value})}).then(function(profile){
      authDisplayName=profile.displayName; authNameColor=profile.nameColor; setAccountUI();
      message.textContent="Profile saved."; leaderboardData=null;
      if(!$('leaderboardPanel').hidden) loadLeaderboard(true);
    }).catch(function(error){message.classList.add("error");message.textContent=error.message||"Profile could not be saved.";}).finally(function(){button.disabled=false;});
  });
  $("loginBtn").addEventListener("click",function(){
    $("loginMessage").textContent=""; $("loginOverlay").hidden=false;
    setTimeout(function(){ $("loginUsername").focus(); },0);
  });
  $("loginCancel").addEventListener("click",closeLogin);
  $("loginOverlay").addEventListener("click",function(e){ if(e.target===$("loginOverlay")) closeLogin(); });
  document.addEventListener("keydown",function(e){ if(e.key==="Escape"){if(!$("loginOverlay").hidden) closeLogin();closeProfile();} });
  $("loginForm").addEventListener("submit",function(e){
    e.preventDefault();
    var button=$("loginSubmit"), message=$("loginMessage");
    button.disabled=true; message.textContent="Connecting...";
    apiRequest("login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:$("loginUsername").value,password:$("loginPassword").value})}).then(function(){
      try{
        localStorage.removeItem(KEY);
        localStorage.removeItem(OWNER_KEY);
        localStorage.removeItem(GUEST_KEY);
        sessionStorage.setItem(LOGIN_LAYOUT_KEY,"1");
      }catch(err){}
      location.reload();
    }).catch(function(error){ message.textContent=error.message||"Unable to log in."; button.disabled=false; });
  });
  $("logoutBtn").addEventListener("click",async function(){
    var button=$("logoutBtn"); button.disabled=true; setSyncStatus("Saving...",false);
    try{
      clearTimeout(remoteSaveTimer); remoteSaveTimer=0;
      await remoteSaveNow();
      await apiRequest("logout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({csrf:authCsrf})});
      try{localStorage.removeItem(KEY);localStorage.removeItem(GUEST_KEY);localStorage.removeItem(OWNER_KEY);}catch(err){}
      authUser=null; authCsrf="";
      accountStateReady=false;
      location.reload();
    }catch(error){ button.disabled=false; setSyncStatus(error.message||"Logout failed",true); }
  });
  window.addEventListener("pagehide",function(){
    if(!authUser) return;
    clearTimeout(remoteSaveTimer); remoteSaveTimer=0;
    remoteSaveNow(true).catch(function(){});
  });

  document.addEventListener("click",function(e){
    if(!busy||!cancelReveal) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    cancelReveal();
  },true);

  $("genBtn").addEventListener("click",doRoll);
  $("guestBoostBtn").addEventListener("click",function(){
    if(authUser) return;
    guestBoostEnabled=!guestBoostEnabled;
    try{ if(guestBoostEnabled) sessionStorage.setItem(GUEST_BOOST_KEY,"1"); else sessionStorage.removeItem(GUEST_BOOST_KEY); }catch(e){}
    state.hitsLeft=rollHits();
    setAccountUI(); save(); updateUI();
  });
  window.addEventListener("resize",layoutCoal);
  document.addEventListener("visibilitychange",function(){ if(!document.hidden&&ensureDay()) updateUI(); });
  setInterval(function(){ if(ensureDay()) updateUI(); },60000);

  /* ---------- boot after the server account state has been restored ---------- */
  function boot(){
    var showMineOnLogin=false;
    try{showMineOnLogin=sessionStorage.getItem(LOGIN_LAYOUT_KEY)==="1";sessionStorage.removeItem(LOGIN_LAYOUT_KEY);}catch(e){}
    if(!state.starterRollGranted) document.documentElement.classList.add("first-visit");
    else document.documentElement.classList.remove("first-visit");
    ensureDay(); showLatest();
    if(showMineOnLogin&&state.history.length){
      document.body.classList.remove("awaiting-continue","rolling");
      document.body.classList.add("has-roll");
      $("continueBtn").hidden=true;
    }
    renderBook(); ensureHits(); showHits();
    pos={fx:Math.random(),fy:Math.random()}; layoutCoal();
    if(state.dyn){
      if(Date.now()>=state.dyn.end){ state.dyn=null; var testFailed=!!state.testMinigame; clearFailedGameProgress(); msg=testFailed?"BOOM. Test game failed; coal progress was kept.":"BOOM. The dynamite went off while you were away and your coal progress reset to 0."; save(); updateUI(); }
      else startDynamite(state.dyn);
    } else if(state.wire){ startWires(state.wire); }
    else if(state.vy){ startVerity(state.vy); }
    else if(state.dbl){ startDouble(state.dbl); }
    else if(state.cz){ startCaptcha(state.cz); }
    else updateUI();
  }
  initializeAccounts();
})();
