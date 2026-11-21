    (()=>{
      function prepareKeyboardPhotos(){
        document.querySelectorAll(".kb-content img").forEach(image=>{
          let figure=image.closest("figure");
          if(!figure){
            figure=document.createElement("figure");
            const paragraph=image.closest("p");
            if(paragraph&&paragraph.childElementCount===1&&!paragraph.textContent.trim())paragraph.replaceWith(figure);
            else if(paragraph)paragraph.after(figure);
            else image.before(figure);
            figure.appendChild(image);
          }
          figure.classList.add("kb-photo");
          let screen=image.closest(".kb-photo-screen");
          if(!screen){
            screen=document.createElement("picture");
            screen.className="kb-photo-screen";
            image.replaceWith(screen);
            screen.appendChild(image);
          }
          const originalPath=image.getAttribute("src")||"";
          const photoMatch=new URL(originalPath,document.baseURI).pathname.match(/\/ishStuff\/keyboards\/photos\/([^/]+)$/i);
          if(photoMatch){
            const originalName=photoMatch[1];
            const extension=originalName.match(/\.(jpe?g|png)$/i)?.[1]?.toLowerCase();
            if(extension){
              const compressedExtension=extension==="jpeg"?"jpg":extension;
              let source=screen.querySelector(":scope > source[data-compressed-source]");
              if(!source){
                source=document.createElement("source");
                source.dataset.compressedSource="true";
                screen.insertBefore(source,image);
              }
              source.type=compressedExtension==="png"?"image/png":"image/jpeg";
              source.srcset=`/ishStuff/keyboards/photos/compressed/${originalName.replace(/\.[^.]+$/,"").toLowerCase()}.${compressedExtension}`;
            }
          }
          const caption=image.dataset.caption?.trim();
          if(caption&&!figure.querySelector("figcaption")){
            const label=document.createElement("figcaption");
            label.textContent=caption;
            figure.appendChild(label);
          }
          image.loading="lazy";
          image.decoding="async";
        });
        document.querySelectorAll("[data-article]").forEach(article=>{
          let group=[];
          const flush=()=>{
            if(group.length>1){
              const gallery=document.createElement("div");
              gallery.className="kb-photo-gallery";
              group[0].before(gallery);
              group.forEach(figure=>gallery.appendChild(figure));
            }
            group=[];
          };
          [...article.children].forEach(child=>{
            if(child.matches("figure.kb-photo"))group.push(child);
            else flush();
          });
          flush();
        });
      }
      const links=[...document.querySelectorAll("#keyboardNav a[data-page]")];
      const articles=[...document.querySelectorAll("[data-article]")];
      function showPage(id,updateHistory=false){
        const article=document.getElementById(id);
        const link=links.find(item=>item.dataset.page===id);
        if(!article||!link)return showPage("keyboardAbout",false);
        articles.forEach(item=>{item.hidden=item!==article;});
        links.forEach(item=>{if(item===link)item.setAttribute("aria-current","page");else item.removeAttribute("aria-current");});
        document.title=(id==="keyboardAbout"?"Keyboards":link.firstChild.textContent)+" — ishStuff";
        if(updateHistory)history.replaceState(null,"","#"+id);
      }
      links.forEach(link=>link.addEventListener("click",event=>{event.preventDefault();showPage(link.dataset.page,true);}));
      window.addEventListener("hashchange",()=>showPage(location.hash.slice(1)||"keyboardAbout"));
      prepareKeyboardPhotos();
      showPage(location.hash.slice(1)||"keyboardAbout");
    })();
