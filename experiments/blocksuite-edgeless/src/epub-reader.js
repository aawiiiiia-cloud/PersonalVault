import {readerIcon} from './reader-icons.js';
export async function mountEpubReader(item,{root,bar,signal,onNavigate,displayZoom}){
  const {default:ePub}=await import('epubjs');
  const book=ePub(await item.blob.arrayBuffer());
  const make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  const action=(host,label,run)=>{const b=make('button',label);b.type='button';b.onclick=run;host.append(b);return b;};
  const body=make('div');body.className='epub-layout';root.append(body);
  const sidebar=make('aside');sidebar.className='epub-sidebar';sidebar.setAttribute('aria-label','目录与书签');body.append(sidebar);
  const reader=make('div');reader.className='epub-reading';body.append(reader);
  const footer=make('div');footer.className='epub-footer';root.append(footer);
  const pageNumber=make('output','正在分页…');pageNumber.className='epub-page-number';pageNumber.setAttribute('aria-live','polite');
  const pageInput=make('input');pageInput.className='epub-page-input';pageInput.type='number';pageInput.min='1';pageInput.setAttribute('aria-label','跳转页码');pageInput.disabled=true;
  const rendition=book.renderTo(reader,{width:'100%',height:'100%',flow:'paginated',allowScriptedContent:false,allowPopups:false});
  let font=100,disposed=false,position,counts=new Map(),total=0,countVersion=0,counting=false,countTimer,resizeTimer,activeCounter;
  const destroyedRenditions=new WeakSet();
  const teardown=async r=>{if(!r)return;await r.started;await r.q.enqueue(()=>{if(destroyedRenditions.has(r))return;destroyedRenditions.add(r);r.destroy();});};
  const progressKey='file-reader-progress:'+item.sourceId,bookmarkKey='file-reader-bookmarks:'+item.sourceId;
  let bookmarks=[];try{bookmarks=JSON.parse(localStorage.getItem(bookmarkKey)||'[]');if(!Array.isArray(bookmarks))bookmarks=[];}catch{}
  const theme=r=>{const styles=getComputedStyle(root);r.themes.default({body:{color:styles.getPropertyValue('--file-ink').trim(),background:styles.getPropertyValue('--file-panel').trim(),'line-height':'1.8'},p:{'line-height':'1.8'},a:{color:document.documentElement.dataset.theme==='dark'?'#a5beff':'#3a57d4'}});r.themes.fontSize(font+'%');};
  const updatePages=()=>{
    const chapter=position?.start?.index,entry=counts.get(chapter);
    if(!entry||!total){pageNumber.textContent='正在分页…';return;}
    const page=Math.min(total,entry.offset+Math.max(1,position.start.displayed.page));
    pageNumber.textContent=`/ ${total}`;pageNumber.setAttribute('aria-label',`第 ${page} 页，共 ${total} 页`);
    pageNumber.dataset.current=String(page);pageNumber.dataset.total=String(total);
    if(document.activeElement!==pageInput)pageInput.value=String(page);pageInput.max=String(total);pageInput.disabled=false;
  };
  const refreshPosition=()=>{if(disposed)return;const location=rendition.currentLocation();if(location?.start){position=location;updatePages();}};
  const display=target=>rendition.display(target).then(refreshPosition);
  const turnPage=delta=>(delta<0?rendition.prev():rendition.next()).then(refreshPosition);
  const jumpPage=async value=>{
    const target=Math.max(1,Math.min(total,Number(value)||1));const entry=[...counts.entries()].find(([,info])=>target>info.offset&&target<=info.offset+info.pages);if(!entry)return;
    const [index,info]=entry;const section=book.spine.get(index);await display(section.href);
    const page=target-info.offset,layout=rendition.manager.layout;
    rendition.manager.scrollTo((page-1)*layout.pageWidth,0,true);refreshPosition();
  };
  pageInput.addEventListener('change',()=>{void jumpPage(pageInput.value);pageInput.blur();});pageInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();pageInput.dispatchEvent(new Event('change'));}});
  // Measure every chapter with the same EPUB layout, viewport and font as the
  // reader. Character-count locations cannot represent reflowed page numbers.
  const countPages=async()=>{
    if(disposed||counting)return;
    counting=true;const version=countVersion,w=reader.clientWidth,h=reader.clientHeight;
    const host=make('div');host.className='epub-pagination-measure';host.style.width=w+'px';host.style.height=h+'px';host.setAttribute('aria-hidden','true');root.append(host);
    const counter=new rendition.constructor(book,{width:w,height:h,flow:'paginated',allowScriptedContent:false,allowPopups:false});activeCounter=counter;counter.attachTo(host);theme(counter);
    try{
      await book.ready;
      const nextCounts=new Map();let nextTotal=0;
      for(const section of book.spine.spineItems){
        if(disposed||version!==countVersion)return;
        await counter.display(section.href);
        for(const content of counter.getContents())await content.document.fonts?.ready;
        for(const view of counter.manager.views.all())view.expand(true);
        const location=counter.currentLocation();
        const pages=Math.max(1,location?.start?.displayed?.total||1);
        nextCounts.set(section.index,{offset:nextTotal,pages});nextTotal+=pages;
      }
      if(!disposed&&version===countVersion){counts=nextCounts;total=nextTotal;updatePages();}
    }catch(error){if(!disposed&&version===countVersion)pageNumber.textContent='页数计算失败';}
    finally{await teardown(counter);if(activeCounter===counter)activeCounter=null;host.remove();counting=false;if(!disposed&&version!==countVersion)void countPages();}
  };
  const scheduleCount=()=>{countVersion++;counts.clear();total=0;pageInput.disabled=true;delete pageNumber.dataset.current;delete pageNumber.dataset.total;updatePages();clearTimeout(countTimer);countTimer=setTimeout(()=>void countPages(),250);};
  const setFont=value=>{font=Math.max(60,Math.min(220,value));displayZoom(font);rendition.themes.fontSize(font+'%');if(position?.start?.cfi)void display(position.start.cfi);scheduleCount();};
  const toggleSidebar=action(bar,'目录 / 书签',()=>setSidebarHidden(!sidebar.hidden));toggleSidebar.setAttribute('aria-expanded','true');
  const setSidebarHidden=hidden=>{sidebar.hidden=hidden;toggleSidebar.setAttribute('aria-expanded',String(!hidden));};
  action(bar,'A+',()=>setFont(font+10));action(bar,'A−',()=>setFont(font-10));
  const navButton=(label,kind,run)=>{const b=action(footer,'',run);b.append(readerIcon(kind));b.setAttribute('aria-label',label);b.title=label;return b;};
  navButton('第一页','first',()=>void jumpPage(1));navButton('上一页','previous',()=>void turnPage(-1));const pagePosition=make('div');pagePosition.className='epub-page-position';pagePosition.append(pageInput,pageNumber);footer.append(pagePosition);navButton('下一页','next',()=>void turnPage(1));navButton('最后一页','last',()=>void jumpPage(total));
  const sidebarHead=make('div');sidebarHead.className='epub-sidebar-head';sidebarHead.append(make('h3','目录'));const hideSidebar=action(sidebarHead,'',()=>setSidebarHidden(true));hideSidebar.append(readerIcon('hide'));hideSidebar.setAttribute('aria-label','隐藏目录与书签');hideSidebar.title='隐藏目录与书签';sidebar.append(sidebarHead);const chapters=make('nav');chapters.className='epub-chapters';sidebar.append(chapters);
  const bookmarkSection=make('details');bookmarkSection.open=true;bookmarkSection.className='epub-bookmark-section';bookmarkSection.append(make('summary','书签'));sidebar.append(bookmarkSection);const saved=make('div');saved.className='epub-bookmarks';bookmarkSection.append(saved);
  const renderBookmarks=()=>{saved.replaceChildren();if(!bookmarks.length)saved.append(make('p','暂无书签'));for(const mark of bookmarks){const row=make('div');row.className='epub-bookmark';const title=action(row,mark.label,()=>void display(mark.cfi));title.title=mark.label;const rename=action(row,'✎',()=>{const input=make('input');input.value=mark.label;input.setAttribute('aria-label','书签名称');let finished=false;const finish=save=>{if(finished)return;finished=true;if(save&&input.value.trim()){mark.label=input.value.trim();localStorage.setItem(bookmarkKey,JSON.stringify(bookmarks));}renderBookmarks();};input.onblur=()=>finish(true);input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();finish(true);}if(e.key==='Escape'){e.stopPropagation();finish(false);}};title.replaceWith(input);input.focus();input.select();});rename.setAttribute('aria-label','重命名书签');const remove=action(row,'×',()=>{bookmarks=bookmarks.filter(value=>value.cfi!==mark.cfi);localStorage.setItem(bookmarkKey,JSON.stringify(bookmarks));renderBookmarks();});remove.setAttribute('aria-label','删除书签');saved.append(row);}};
  const addBookmark=action(bar,'添加书签',()=>{if(!position?.start?.cfi)return;const cfi=position.start.cfi;if(bookmarks.some(mark=>mark.cfi===cfi))return;const chapter=[...chapters.querySelectorAll('button')].find(b=>b.dataset.section===String(position.start.index));bookmarks.push({cfi,label:(chapter?.textContent||'阅读位置')+' · 书签 '+(bookmarks.length+1)});localStorage.setItem(bookmarkKey,JSON.stringify(bookmarks));renderBookmarks();});addBookmark.prepend(readerIcon('bookmark'));addBookmark.classList.add('reader-icon-button');renderBookmarks();
  rendition.hooks.content.register(contents=>{contents.document.addEventListener('keydown',event=>{if(event.target.closest('input,select,textarea')||event.target.isContentEditable)return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();void turnPage(event.key==='ArrowLeft'?-1:1);}});});
  rendition.on('relocated',location=>{if(disposed)return;position=location;updatePages();for(const b of chapters.querySelectorAll('button'))b.classList.toggle('active',b.dataset.section===String(location.start.index));try{localStorage.setItem(progressKey,location.start.cfi);}catch{}});
  const applyTheme=()=>{theme(rendition);scheduleCount();};theme(rendition);window.addEventListener('workbench-theme-change',applyTheme);
  const observer=new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(async()=>{await rendition.started;if(disposed||!rendition.manager?.stage)return;rendition.resize(reader.clientWidth,reader.clientHeight);scheduleCount();},100);});observer.observe(reader);
  const dispose=()=>{if(disposed)return;disposed=true;countVersion++;clearTimeout(countTimer);clearTimeout(resizeTimer);observer.disconnect();window.removeEventListener('workbench-theme-change',applyTheme);root.remove();void Promise.all([teardown(rendition),teardown(activeCounter)]).finally(()=>book.destroy()).catch(console.warn);};signal.addEventListener('abort',dispose,{once:true});
  try{
    const navigation=await book.loaded.navigation;if(signal.aborted)throw new DOMException('已取消','AbortError');
    const visit=(entries,depth=0)=>{for(const chapter of entries){const b=action(chapters,chapter.label.trim(),()=>void display(chapter.href));b.style.paddingLeft=(12+depth*12)+'px';b.title=chapter.label.trim();b.dataset.href=chapter.href;const section=book.spine.get(chapter.href.split('#')[0]);if(section)b.dataset.section=String(section.index);visit(chapter.subitems||[],depth+1);}};visit(navigation.toc);
    let location;try{location=localStorage.getItem(progressKey);}catch{}
    await display(location||undefined).catch(()=>display());if(signal.aborted)throw new DOMException('已取消','AbortError');scheduleCount();
    return {destroy(){signal.removeEventListener('abort',dispose);dispose();},zoomBy(factor){setFont(font*factor);},fit(){setFont(100);},turnPage};
  }catch(error){dispose();throw error;}
}
