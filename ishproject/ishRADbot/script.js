(function(){
      const byId=id=>document.getElementById(id);
      const refresh=byId("radRefresh");
      const lookupForm=byId("radLookupForm"),lookupInput=byId("radLookupName");
      const defaultNameTag="ish#7419";
      const error=byId("radError");
      const chartColors=["#39ff78","#27f5f5","#ffce5c","#f785ff","#ff7777","#87aaff","#d6ff68","#ffa66b","#86e0cb","#c8a4ff"];
      let raidEvents=[],chartRaidEvents=[],chartModel=null;
      let raidCatalog=[];
      const activeRaidSeries=new Set();
      let allTimeSort={key:"raid",direction:1};
      let forceRefreshNext=false;
      let latestData=null,backgroundRefreshRunning=false;
      function readSavedName(){const entry=document.cookie.split(";").map(value=>value.trim()).find(value=>value.startsWith("ishradbotGuardian="));if(!entry)return defaultNameTag;try{return decodeURIComponent(entry.slice("ishradbotGuardian=".length));}catch(ignored){return defaultNameTag;}}
      function saveName(name){document.cookie="ishradbotGuardian="+encodeURIComponent(name)+"; Max-Age=31536000; Path=/ishproject/ishRADbot; SameSite=Lax"+(location.protocol==="https:"?"; Secure":"");}
      let currentNameTag=readSavedName();lookupInput.value=currentNameTag;
      const builtInRaidCatalog=["Leviathan","Eater of Worlds","Spire of Stars","Last Wish","Scourge of the Past","Crown of Sorrow","Garden of Salvation","Deep Stone Crypt","Vault of Glass","Vow of the Disciple","King's Fall","Root of Nightmares","Crota's End","Salvation's Edge","The Desert Perpetual","The Desert Perpetual (Epic)"];
      function apiUrl(force,presenceOnly=false,spanOverride=null){const query=new URLSearchParams({name:currentNameTag});if(force)query.set("refresh","1");if(presenceOnly)query.set("presence","1");const span=spanOverride||byId("radSpanSelect").value;if(!presenceOnly&&span==="alltime")query.set("allTime","1");else if(!presenceOnly&&span==="monthly")query.set("history","monthly");else if(!presenceOnly&&span==="custom"){query.set("timeframe","custom");query.set("startDate",byId("radStartDate").value);query.set("endDate",byId("radEndDate").value);}return "/ishproject/ishRADbot/api.php?"+query.toString();}
      function addCell(row,text,tag){const cell=document.createElement(tag||"td");cell.textContent=text;row.appendChild(cell);return cell;}
      function dateLabel(day){const date=new Date(day+"T12:00:00Z");return date.toLocaleDateString(undefined,{weekday:"short",month:"numeric",day:"numeric",timeZone:"UTC"});}
      function centralDay(timestamp){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date(timestamp*1000));const value=Object.fromEntries(parts.map(part=>[part.type,part.value]));let date=new Date(Date.UTC(Number(value.year),Number(value.month)-1,Number(value.day)));if(Number(value.hour)<3)date.setUTCDate(date.getUTCDate()-1);return date.toISOString().slice(0,10);}
      function dateRange(span){const today=centralDay(Date.now()/1000);let start,end=today;const available=raidEvents.map(event=>centralDay(event.timestamp));if(span==="daily")start=today;else if(span==="weekly"){start=shiftDay(today,-6);}else if(span==="alltime"){start=available.length?available.reduce((left,right)=>left<right?left:right):today;}else if(span==="monthly"){const monday=weekStart(today);start=shiftDay(monday,-28);end=shiftDay(monday,6);}else{start=byId("radStartDate").value;end=byId("radEndDate").value;}if(span!=="alltime"&&span!=="monthly"&&span!=="custom"&&available.length){const earliest=available.reduce((left,right)=>left<right?left:right);if(start<earliest)start=earliest;}return {start,end};}
      function shiftDay(day,amount){const date=new Date(day+"T12:00:00Z");date.setUTCDate(date.getUTCDate()+amount);return date.toISOString().slice(0,10);}
      function weekStart(day){const weekday=new Date(day+"T12:00:00Z").getUTCDay();return shiftDay(day,-((weekday+6)%7));}
      function hasCustomDates(){const start=byId("radStartDate").value,end=byId("radEndDate").value;return !!start&&!!end&&start<=end;}
      function historyMatches(span){if(!latestData)return false;if(span==="alltime")return !!latestData.allTimeHistory;if(span==="monthly")return !!latestData.monthlyHistory;if(span==="custom")return !!latestData.customHistory&&latestData.customStartDate===byId("radStartDate").value&&latestData.customEndDate===byId("radEndDate").value;return !latestData.allTimeHistory&&!latestData.monthlyHistory&&!latestData.customHistory;}
      function raidInfo(rawName){const original=String(rawName||"").trim();let name=original.replace(/^Leviathan\s*:\s*/i,"").replace(/^Pantheon\s*[:\-–—]?\s*/i,"").replace(/\bCustomize\b/ig,"").replace(/\(\s*\)|\[\s*\]/g,"").replace(/\s*[-:–—]+\s*$/g,"").trim(),difficulty="N";if(/^Epic\s*:\s*The Desert Perpetual$/i.test(name)||/^The Desert Perpetual\s*:\s*Epic$/i.test(name))name="The Desert Perpetual (Epic)";const marker=name.match(/\s*(?:\(|\[|:|-)?\s*(prestige|master|expert|normal|standard)(?:\s*(?:mode|difficulty))?\s*(?:\)|\])?\s*$/i);if(marker){difficulty=/prestige|master|expert/i.test(marker[1])?"P":"N";name=name.slice(0,marker.index).trim().replace(/[:\-–—]+$/,"" ).trim();}return {name:name||original||"Unknown raid",difficulty};}
      function raidNamesAvailable(){return [...new Set([...builtInRaidCatalog,...raidCatalog,...raidEvents.map(event=>raidInfo(event.raid).name)].map(name=>raidInfo(name).name))].sort((a,b)=>a.localeCompare(b));}
      function eventsInRange(start,end,raid){return raidEvents.filter(event=>raidInfo(event.raid).name===raid&&centralDay(event.timestamp)>=start&&centralDay(event.timestamp)<=end);}
      function addSortHeader(row,label,key){const cell=addCell(row,"","th"),button=document.createElement("button");button.type="button";button.className="rad-sort-button";button.textContent=label+(allTimeSort.key===key?(allTimeSort.direction===1?" ▲":" ▼"):"");button.setAttribute("aria-label","Sort by "+label);button.addEventListener("click",()=>{if(allTimeSort.key===key)allTimeSort.direction*=-1;else allTimeSort={key,direction:key==="raid"?1:-1};renderTable();});cell.appendChild(button);}
      function durationLabel(seconds){if(!Number.isFinite(seconds)||seconds<=0)return "Duration unavailable";const hours=Math.floor(seconds/3600),minutes=Math.floor((seconds%3600)/60),remaining=seconds%60;return (hours?hours+"h ":"")+(hours?String(minutes).padStart(2,"0"):minutes)+"m "+String(remaining).padStart(2,"0")+"s";}
      function renderChart(){
        const svg=byId("radChart"),legend=byId("radChartLegend");svg.replaceChildren();legend.replaceChildren();
        const tooltip=byId("radChartTooltip"),chartWrap=byId("radChartWrap");tooltip.hidden=true;
        function showPointTooltip(point){const svgRect=svg.getBoundingClientRect(),wrapRect=chartWrap.getBoundingClientRect();const scaleX=svgRect.width/960,scaleY=svgRect.height/360;tooltip.textContent=String(point.count);tooltip.style.left=Math.max(4,Math.min(wrapRect.width-80,(svgRect.left-wrapRect.left)+point.x*scaleX+10))+"px";tooltip.style.top=Math.max(4,(svgRect.top-wrapRect.top)+point.y*scaleY-34)+"px";tooltip.hidden=false;}
        const today=centralDay(Date.now()/1000),days=Array.from({length:7},(_,index)=>shiftDay(today,index-6));
        if(!chartModel||chartModel.days.join(",")!==days.join(",")){
          const byRaid=new Map(),totals=Array(7).fill(0);
          chartRaidEvents.forEach(event=>{const dayIndex=days.indexOf(centralDay(event.timestamp));if(dayIndex<0)return;const name=raidInfo(event.raid).name;if(!byRaid.has(name))byRaid.set(name,Array(7).fill(0));byRaid.get(name)[dayIndex]++;totals[dayIndex]++;});
          chartModel={days,names:[...byRaid.keys()].sort((a,b)=>a.localeCompare(b)),byRaid,totals};
        }
        const names=chartModel.names;
        const w=960,h=360,left=58,right=22,top=22,bottom=54,plotW=w-left-right,plotH=h-top-bottom;
        const totals=chartModel.totals;const max=Math.max(1,...totals);const step=max<=4?1:Math.ceil(max/4);const yMax=Math.max(step,Math.ceil(max/step)*step);
        for(let value=0;value<=yMax;value+=step){const y=top+plotH-(value/yMax)*plotH;const grid=document.createElementNS("http://www.w3.org/2000/svg","line");grid.setAttribute("x1",left);grid.setAttribute("x2",w-right);grid.setAttribute("y1",y);grid.setAttribute("y2",y);grid.setAttribute("class","rad-grid");svg.appendChild(grid);const label=document.createElementNS("http://www.w3.org/2000/svg","text");label.setAttribute("x",left-12);label.setAttribute("y",y+4);label.setAttribute("text-anchor","end");label.textContent=String(value);svg.appendChild(label);}
        const axis=document.createElementNS("http://www.w3.org/2000/svg","line");axis.setAttribute("x1",left);axis.setAttribute("x2",w-right);axis.setAttribute("y1",top+plotH);axis.setAttribute("y2",top+plotH);axis.setAttribute("class","rad-axis");svg.appendChild(axis);
        days.forEach((day,index)=>{const x=left+(index/(days.length-1))*plotW;const label=document.createElementNS("http://www.w3.org/2000/svg","text");label.setAttribute("x",x);label.setAttribute("y",h-25);label.setAttribute("text-anchor","middle");label.textContent=dateLabel(day);svg.appendChild(label);});
        const totalPoints=days.map((day,index)=>({day,count:totals[index],x:left+(index/(days.length-1))*plotW,y:top+plotH-(totals[index]/yMax)*plotH}));
        const totalLine=document.createElementNS("http://www.w3.org/2000/svg","polyline");totalLine.setAttribute("points",totalPoints.map(point=>point.x+","+point.y).join(" "));totalLine.setAttribute("class","rad-series rad-total-series");totalLine.setAttribute("stroke",chartColors[0]);svg.appendChild(totalLine);
        totalPoints.forEach(point=>{const circle=document.createElementNS("http://www.w3.org/2000/svg","circle");circle.setAttribute("cx",point.x);circle.setAttribute("cy",point.y);circle.setAttribute("r","5");circle.setAttribute("fill",chartColors[0]);circle.setAttribute("class","rad-point rad-total-point");const title=document.createElementNS("http://www.w3.org/2000/svg","title");title.textContent=String(point.count);circle.appendChild(title);svg.appendChild(circle);const value=document.createElementNS("http://www.w3.org/2000/svg","text");value.setAttribute("x",point.x);value.setAttribute("y",Math.max(top+13,point.y-11));value.setAttribute("text-anchor","middle");value.setAttribute("class","rad-value");value.textContent=String(point.count);svg.appendChild(value);});
        const totalItem=document.createElement("li"),totalSwatch=document.createElement("span");totalSwatch.className="rad-legend-swatch";totalSwatch.style.backgroundColor=chartColors[0];totalItem.append(totalSwatch,document.createTextNode("All raids total"));legend.appendChild(totalItem);
        names.forEach((name,seriesIndex)=>{const color=chartColors[(seriesIndex+1)%chartColors.length];const item=document.createElement("li"),button=document.createElement("button"),swatch=document.createElement("span");button.type="button";button.className="rad-legend-toggle";button.setAttribute("aria-pressed",activeRaidSeries.has(name)?"true":"false");swatch.className="rad-legend-swatch";swatch.style.backgroundColor=color;button.append(swatch,document.createTextNode(name));button.addEventListener("click",()=>{if(activeRaidSeries.has(name))activeRaidSeries.delete(name);else activeRaidSeries.add(name);renderChart();});item.appendChild(button);legend.appendChild(item);if(!activeRaidSeries.has(name))return;const dailyCounts=chartModel.byRaid.get(name),points=days.map((day,index)=>{const count=dailyCounts[index];return {day,count,x:left+(index/(days.length-1))*plotW,y:top+plotH-(count/yMax)*plotH};});const line=document.createElementNS("http://www.w3.org/2000/svg","polyline");line.setAttribute("points",points.map(point=>point.x+","+point.y).join(" "));line.setAttribute("class","rad-series");line.setAttribute("stroke",color);svg.appendChild(line);points.forEach(point=>{const circle=document.createElementNS("http://www.w3.org/2000/svg","circle");circle.setAttribute("cx",point.x);circle.setAttribute("cy",point.y);circle.setAttribute("r","7");circle.setAttribute("fill",color);circle.setAttribute("class","rad-point");circle.setAttribute("tabindex","0");circle.setAttribute("aria-label",name+": "+point.count+" clear"+(point.count===1?"":"s")+" on "+dateLabel(point.day));const title=document.createElementNS("http://www.w3.org/2000/svg","title");title.textContent=String(point.count);circle.appendChild(title);circle.addEventListener("pointerenter",()=>showPointTooltip(point));circle.addEventListener("pointerleave",()=>{tooltip.hidden=true;});circle.addEventListener("focus",()=>showPointTooltip(point));circle.addEventListener("blur",()=>{tooltip.hidden=true;});svg.appendChild(circle);});});
        byId("radChartWrap").hidden=chartRaidEvents.length===0;
      }
      function renderTable(){
        const head=byId("radTableHead"),body=byId("radTableBody");head.replaceChildren();body.replaceChildren();
        const span=byId("radSpanSelect").value;
        const {start,end}=dateRange(span),valid=!!start&&!!end&&start<=end;
        const raidNames=raidNamesAvailable();
        let rows=raidNames.filter(raid=>span==="alltime"||(valid&&eventsInRange(start,end,raid).length>0));
        if(span==="alltime"){
          rows.sort((a,b)=>{const countA=raidEvents.filter(event=>raidInfo(event.raid).name===a).length,countB=raidEvents.filter(event=>raidInfo(event.raid).name===b).length;return allTimeSort.key==="raid"?a.localeCompare(b)*allTimeSort.direction:(countA-countB)*allTimeSort.direction||a.localeCompare(b);});
          const heading=document.createElement("tr");addSortHeader(heading,"Raid","raid");addSortHeader(heading,"All-time clears","clears");head.appendChild(heading);
          let grandTotal=0;
          rows.forEach(raid=>{const count=raidEvents.filter(event=>raidInfo(event.raid).name===raid).length;grandTotal+=count;const row=document.createElement("tr");addCell(row,raid);addCell(row,String(count)).className="rad-total";body.appendChild(row);});
          if(rows.length>0){const totalRow=document.createElement("tr");totalRow.className="rad-grand-total";addCell(totalRow,"All raids total");addCell(totalRow,String(grandTotal)).className="rad-total";body.appendChild(totalRow);}
          byId("radTableScroll").hidden=rows.length===0;byId("radNoRaids").hidden=rows.length>0;return;
        }
        if(span==="custom"){
          if(!valid){byId("radTableScroll").hidden=true;byId("radNoRaids").hidden=true;return;}
          rows=rows.filter(raid=>eventsInRange(start,end,raid).length>0);
          const heading=document.createElement("tr");addCell(heading,"Raid","th");addCell(heading,"Custom clears","th");head.appendChild(heading);
          let grandTotal=0;
          rows.forEach(raid=>{const count=eventsInRange(start,end,raid).length, row=document.createElement("tr");grandTotal+=count;addCell(row,raid);addCell(row,String(count)).className="rad-count";body.appendChild(row);});
          if(rows.length>0){const totalRow=document.createElement("tr");totalRow.className="rad-grand-total";addCell(totalRow,"All raids total");addCell(totalRow,String(grandTotal)).className="rad-total";body.appendChild(totalRow);}
          byId("radTableScroll").hidden=rows.length===0;byId("radNoRaids").hidden=rows.length>0;return;
        }
        if(span==="monthly"){
          const latestMonday=weekStart(centralDay(Date.now()/1000)),weeks=Array.from({length:5},(_,index)=>shiftDay(latestMonday,-28+index*7));
          const heading=document.createElement("tr");addCell(heading,"Raid","th");weeks.forEach(week=>addCell(heading,"Week of "+dateLabel(week),"th"));addCell(heading,"Total","th");head.appendChild(heading);
          const weekTotals=weeks.map(()=>0);let grandTotal=0;
          rows=rows.filter(raid=>eventsInRange(start,end,raid).length>0);
          rows.forEach(raid=>{const row=document.createElement("tr");addCell(row,raid);let raidTotal=0;weeks.forEach((week,index)=>{const nextWeek=shiftDay(week,7),count=raidEvents.filter(event=>raidInfo(event.raid).name===raid&&centralDay(event.timestamp)>=week&&centralDay(event.timestamp)<nextWeek).length;raidTotal+=count;weekTotals[index]+=count;addCell(row,String(count)).className=count===0?"rad-zero":"rad-count";});grandTotal+=raidTotal;addCell(row,String(raidTotal)).className="rad-total";body.appendChild(row);});
          if(rows.length>0){const totalRow=document.createElement("tr");totalRow.className="rad-grand-total";addCell(totalRow,"All raids total");weekTotals.forEach(count=>addCell(totalRow,String(count)).className="rad-total");addCell(totalRow,String(grandTotal)).className="rad-total";body.appendChild(totalRow);}
          byId("radTableScroll").hidden=rows.length===0;byId("radNoRaids").hidden=rows.length>0;return;
        }
        const periodDays=[];if(valid){let cursor=start;while(cursor<=end&&periodDays.length<367){periodDays.push(cursor);cursor=shiftDay(cursor,1);}}
        const heading=document.createElement("tr");addCell(heading,"Raid","th");periodDays.forEach(day=>addCell(heading,dateLabel(day),"th"));addCell(heading,"Total","th");head.appendChild(heading);
        const totalsByDay=periodDays.map(()=>0);let grandTotal=0;
        rows.forEach(raid=>{const events=valid?eventsInRange(start,end,raid):[];const row=document.createElement("tr");addCell(row,raid);let total=0;periodDays.forEach((day,index)=>{const count=events.filter(event=>centralDay(event.timestamp)===day).length;total+=count;totalsByDay[index]+=count;addCell(row,String(count)).className=count===0?"rad-zero":"rad-count";});grandTotal+=total;addCell(row,String(total)).className="rad-total";body.appendChild(row);});
        if(rows.length>0){const totalRow=document.createElement("tr");totalRow.className="rad-grand-total";addCell(totalRow,"All raids total");totalsByDay.forEach(count=>addCell(totalRow,String(count)).className="rad-total");addCell(totalRow,String(grandTotal)).className="rad-total";body.appendChild(totalRow);}
        byId("radTableScroll").hidden=!valid||rows.length===0;byId("radNoRaids").hidden=rows.length>0;
      }
      function render(data){
        latestData=data;
        if(data.historyWarning){error.textContent=data.historyWarning;error.hidden=false;}
        byId("radPlayer").textContent=data.player?.displayName||"ish#7419";
        const status=byId("radStatus");
        const normalizedStatus=(data.status||"").toLowerCase();
        status.textContent=data.status||"Status unavailable";
        status.dataset.state=normalizedStatus==="offline"?"offline":(normalizedStatus.includes("orbit")?"orbit":(normalizedStatus.startsWith("online")?"online":(normalizedStatus.includes("activity")?"activity":"unknown")));
        const activity=byId("radActivity");
        const inActivity=normalizedStatus==="in an activity";
        activity.hidden=!data.activityName&&!inActivity;
        activity.textContent=data.activityName?"Activity: "+data.activityName:(inActivity?"Activity details unavailable from Bungie.":"");
        const party=byId("radParty");party.replaceChildren();
        const partyNames=Array.isArray(data.partyMembers)?data.partyMembers:[];
        partyNames.forEach(name=>{if(typeof name!=="string"||!name.trim())return;const item=document.createElement("li");item.textContent=name;party.appendChild(item);});
        byId("radPartyEmpty").hidden=party.children.length>0;
        byId("radPartyEmpty").textContent=party.children.length?"":"its empty";
        const recent=data.recentActivity, recentPlayers=byId("radRecentPlayers");recentPlayers.replaceChildren();
        if(recent&&recent.name){
          byId("radRecentName").textContent=recent.name;byId("radRecentName").hidden=false;
          byId("radRecentMeta").textContent=durationLabel(Number(recent.durationSeconds));byId("radRecentMeta").hidden=false;
          const startedAt=recent.startedAt?new Date(recent.startedAt):null,startedLabel=startedAt&&!Number.isNaN(startedAt.getTime())?startedAt.toLocaleString():"Start time unavailable";
          byId("radRecentStarted").textContent="Started "+startedLabel;byId("radRecentStarted").hidden=false;
          (Array.isArray(recent.players)?recent.players:[]).forEach(name=>{if(typeof name!=="string"||!name.trim())return;const item=document.createElement("li");item.textContent=name;recentPlayers.appendChild(item);});
          recentPlayers.hidden=recentPlayers.children.length===0;byId("radRecentEmpty").textContent=recentPlayers.children.length?"":"Guardian names were not included in this raid report.";byId("radRecentEmpty").hidden=recentPlayers.children.length>0;
        }else{
          byId("radRecentName").hidden=true;byId("radRecentMeta").hidden=true;byId("radRecentStarted").hidden=true;recentPlayers.hidden=true;byId("radRecentEmpty").textContent="No recent raid report details were returned.";byId("radRecentEmpty").hidden=false;
        }
        raidEvents=Array.isArray(data.raidEvents)?data.raidEvents:[];if(!data.customHistory){chartRaidEvents=raidEvents;chartModel=null;}raidCatalog=Array.isArray(data.raidCatalog)?data.raidCatalog.map(name=>raidInfo(name).name):[];
        const raidNames=raidNamesAvailable();
        const hasRaids=raidNames.length>0;byId("radRaidControls").hidden=!hasRaids;
        renderChart();renderTable();
        byId("radRaidLoading").hidden=true;
        byId("radUpdated").textContent=data.updatedAt?"Updated "+new Date(data.updatedAt).toLocaleString():"";
      }
      async function load(){
        if(byId("radSpanSelect").value==="custom"&&!hasCustomDates()){renderTable();return;}
        refresh.disabled=true;refresh.textContent="Loading…";error.hidden=true;byId("radRaidLoading").hidden=false;byId("radRaidLoading").textContent="Loading player and raid data…";
        try{const force=forceRefreshNext,span=byId("radSpanSelect").value;forceRefreshNext=false;const response=await fetch(apiUrl(force),{cache:"no-store",headers:{"Accept":"application/json"}});const data=await response.json();if(!response.ok)throw new Error(data.error||"Bungie data is unavailable.");if(force&&span==="custom"){try{const chartResponse=await fetch(apiUrl(true,false,"weekly"),{cache:"no-store",headers:{"Accept":"application/json"}});if(chartResponse.ok){const chartData=await chartResponse.json();chartRaidEvents=Array.isArray(chartData.raidEvents)?chartData.raidEvents:[];chartModel=null;}}catch(ignored){}}render(data);}
        catch(reason){error.textContent=reason.message||"Bungie data is unavailable.";error.hidden=false;byId("radRaidLoading").hidden=true;byId("radPartyEmpty").textContent="Fireteam data is unavailable.";byId("radStatus").textContent="Status unavailable";byId("radStatus").dataset.state="unknown";byId("radRecentName").hidden=true;byId("radRecentMeta").hidden=true;byId("radRecentStarted").hidden=true;byId("radRecentPlayers").hidden=true;byId("radRecentEmpty").textContent="Recent activity data is unavailable.";}
        finally{refresh.disabled=false;refresh.textContent="Refresh";}
      }
      async function refreshInBackground(){
        if(backgroundRefreshRunning||document.visibilityState!=="visible"||!latestData)return;
        backgroundRefreshRunning=true;
        try{const response=await fetch(apiUrl(true,true),{cache:"no-store",headers:{"Accept":"application/json"}});if(!response.ok)return;const data=await response.json();if(!data.presenceOnly)return;latestData={...latestData,...data};const normalized=String(data.status||"").toLowerCase(),status=byId("radStatus");status.textContent=data.status||"Status unavailable";status.dataset.state=normalized==="offline"?"offline":(normalized.includes("orbit")?"orbit":(normalized.startsWith("online")?"online":(normalized.includes("activity")?"activity":"unknown")));const activity=byId("radActivity"),inActivity=normalized==="in an activity";activity.hidden=!data.activityName&&!inActivity;activity.textContent=data.activityName?"Activity: "+data.activityName:(inActivity?"Activity details unavailable from Bungie.":"");const party=byId("radParty");party.replaceChildren();(Array.isArray(data.partyMembers)?data.partyMembers:[]).forEach(name=>{if(typeof name!=="string"||!name.trim())return;const item=document.createElement("li");item.textContent=name;party.appendChild(item);});byId("radPartyEmpty").textContent=party.children.length?"":"its empty";byId("radPartyEmpty").hidden=party.children.length>0;byId("radUpdated").textContent=data.updatedAt?"Updated "+new Date(data.updatedAt).toLocaleString():"";}
        catch(ignored){}
        finally{backgroundRefreshRunning=false;}
      }
      lookupForm.addEventListener("submit",event=>{event.preventDefault();const name=lookupInput.value.trim();if(!lookupForm.reportValidity())return;currentNameTag=name;lookupInput.value=name;saveName(name);forceRefreshNext=true;load();});
      refresh.addEventListener("click",()=>{forceRefreshNext=true;load();});
      byId("radSpanSelect").addEventListener("change",()=>{const span=byId("radSpanSelect").value,custom=span==="custom";byId("radStartWrap").hidden=!custom;byId("radEndWrap").hidden=!custom;if(custom&&!hasCustomDates()){renderTable();return;}if(!historyMatches(span)){load();return;}renderTable();});
      ["radStartDate","radEndDate"].forEach(id=>byId(id).addEventListener("change",()=>{if(byId("radSpanSelect").value!=="custom")return;if(!hasCustomDates()){renderTable();return;}if(!historyMatches("custom")){load();return;}renderTable();}));
      load();
      window.setInterval(refreshInBackground,30000);
    })();
