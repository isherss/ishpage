    (()=>{
      const links=[...document.querySelectorAll("#keyboardNav a[data-page]")];
      const articles=[...document.querySelectorAll("[data-article]")];
      function showPage(id,updateHistory=false){
        const article=document.getElementById(id);
        const link=links.find(item=>item.dataset.page===id);
        if(!article||!link)return showPage("keyboardAbout",false);
        articles.forEach(item=>{item.hidden=item!==article;});
        links.forEach(item=>{if(item===link)item.setAttribute("aria-current","page");else item.removeAttribute("aria-current");});
        document.title=(id==="keyboardAbout"?"Keyboards":link.firstChild.textContent)+" — Ish Projects";
        if(updateHistory)history.replaceState(null,"","#"+id);
      }
      links.forEach(link=>link.addEventListener("click",event=>{event.preventDefault();showPage(link.dataset.page,true);}));
      window.addEventListener("hashchange",()=>showPage(location.hash.slice(1)||"keyboardAbout"));
      showPage(location.hash.slice(1)||"keyboardAbout");
    })();
