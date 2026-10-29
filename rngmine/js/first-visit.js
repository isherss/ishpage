(function(){
  var root=document.documentElement;
  try{
    if(localStorage.getItem("rngmine-state-owner")){
      root.classList.add("auth-check");
      return;
    }
    var raw=localStorage.getItem("rngdle-mine-v3");
    if(!raw){ root.classList.add("first-visit"); return; }
    var saved=JSON.parse(raw);
    if(!saved||typeof saved!=="object"||saved.starterRollGranted===false) root.classList.add("first-visit");
  }catch(e){
    root.classList.add("first-visit");
  }
})();
