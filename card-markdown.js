(function (global) {
  "use strict";

  const escapeHtml=value=>String(value || "").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const RICH_PREFIX="<!-- knowledge-workbench-rich-v1 -->\n";
  const BLOCK_TAGS=new Set(["p","div","h1","h2","h3","h4","ul","ol","li","blockquote","pre"]);
  const INLINE_TAGS=new Set(["strong","b","em","i","u","s","del","code","span","font","a","br"]);
  const FONT_SIZE_MAP={1:10,2:13,3:16,4:18,5:24,6:30,7:36};
  function fontSizePx(value) {
    const source=String(value || "").trim().toLowerCase();
    const legacy=FONT_SIZE_MAP[Number(source)];
    if(legacy) return legacy;
    const pixels=source.match(/^(\d{1,2})(?:px)?$/);
    return pixels && Number(pixels[1])>=10 && Number(pixels[1])<=48 ? Number(pixels[1]) : 0;
  }
  function colorHex(value) {
    const source=String(value || "").trim();
    const hex=source.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if(hex) return "#"+(hex[1].length===3 ? [...hex[1]].map(digit=>digit+digit).join("") : hex[1]).toLowerCase();
    const rgb=source.match(/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/i);
    if(!rgb || rgb.slice(1,4).some(part=>Number(part)>255)) return "";
    return "#"+rgb.slice(1,4).map(part=>Number(part).toString(16).padStart(2,"0")).join("");
  }
  function sanitizeRichHtml(source,doc=global.document) {
    if(!doc?.createElement) return "";
    const template=doc.createElement("template");
    template.innerHTML=String(source || "");
    function clean(node) {
      if(node.nodeType===3) return escapeHtml(node.nodeValue.replaceAll("\u200b",""));
      if(node.nodeType!==1) return "";
      const tag=node.tagName.toLowerCase();
      if(["script","style","iframe","svg","math","object","embed","video","audio"].includes(tag)) return "";
      if(tag==="img") {
        const assetId=String(node.getAttribute("data-asset-id") || "");
        const assetPath=String(node.getAttribute("data-asset-path") || "").replaceAll("\\","/");
        const safePath=/^文件\/图片\/(?!.*(?:^|\/)\.\.(?:\/|$))[^<>"\r\n]+$/u.test(assetPath) ? ` data-asset-path="${escapeHtml(assetPath)}"` : "";
        const width=String(node.style.width || "").match(/^(\d{2,4})px$/);
        const safeWidth=width && Number(width[1])>=80 && Number(width[1])<=1600 ? ` style="width:${Number(width[1])}px"` : "";
        return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(assetId)
          ? `<img data-asset-id="${assetId.toLowerCase()}"${safePath} alt="${escapeHtml(node.getAttribute("alt") || "插入的图片")}"${safeWidth}>` : "";
      }
      const children=[...node.childNodes].map(clean).join("");
      if(!BLOCK_TAGS.has(tag) && !INLINE_TAGS.has(tag)) return children;
      if(tag==="br") return "<br>";
      const actualTag=tag==="font" ? "span" : tag==="b" ? "strong" : tag==="i" ? "em" : tag==="s" ? "del" : tag;
      let attributes="";
      if(actualTag==="div" && node.hasAttribute("data-image-row")) {
        attributes=' data-image-row="true"';
        const layout=node.getAttribute("data-image-layout");
        if(["full","left","right","inline"].includes(layout)) attributes+=` data-image-layout="${layout}"`;
        if(node.hasAttribute("data-image-paired")) attributes+=' data-image-paired="true"';
      }
      if(actualTag==="div" && node.hasAttribute("data-image-group")) attributes=' data-image-group="true"';
      if(tag==="a") {
        const href=safeUrl(node.getAttribute("href") || "");
        if(!href) return children;
        attributes=` href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"`;
      }
      if(actualTag==="span") {
        if(node.hasAttribute("data-image-text")) {
          if(!children.trim()) return "";
          attributes+=' data-image-text="true"';
        }
        const plainHref=safeUrl(node.getAttribute("data-plain-href") || "");
        if(plainHref) attributes+=` data-plain-href="${escapeHtml(plainHref)}"`;
      }
      const color=colorHex(node.style.color || (tag==="font" ? node.getAttribute("color") : ""));
      const background=colorHex(node.style.backgroundColor);
      const size=fontSizePx(node.style.fontSize || (tag==="font" ? node.getAttribute("size") : ""));
      const textBlock=["p","h1","h2","h3","h4","li","blockquote"].includes(actualTag) || (actualTag==="div" && !node.hasAttribute("data-image-row") && !node.hasAttribute("data-image-group"));
      const lineHeight=["1.4","1.65","2.2"].includes(node.style.lineHeight) && textBlock ? node.style.lineHeight : "";
      const style=[color && `color:${color}`,background && `background-color:${background}`,size && `font-size:${size}px`,lineHeight && `line-height:${lineHeight}`].filter(Boolean).join(";");
      if(style) attributes+=` style="${style}"`;
      const wrapped=`<${actualTag}${attributes}>${children}</${actualTag}>`;
      if(node.style?.fontWeight && (node.style.fontWeight==="bold" || Number(node.style.fontWeight)>=600)) return `<strong>${wrapped}</strong>`;
      if(node.style?.fontStyle==="italic") return `<em>${wrapped}</em>`;
      if(node.style?.textDecorationLine?.includes("underline")) return `<u>${wrapped}</u>`;
      return wrapped;
    }
    return [...template.content.childNodes].map(clean).join("");
  }
  function safeUrl(value) {
    try {
      const url=new URL(value);
      return ["http:","https:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  }
  function inline(value) {
    const tokens=[];
    const stash=html=>{const key="\uE000"+tokens.length+"\uE001";tokens.push(html);return key;};
    let html=escapeHtml(value);
    html=html.replace(/`([^`]+)`/g,(_,code)=>stash("<code>"+code+"</code>"));
    html=html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,(whole,label,url)=>{
      const href=safeUrl(url.replaceAll("&amp;","&"));
      return href ? stash('<a href="'+escapeHtml(href)+'" target="_blank" rel="noopener noreferrer">'+label+"</a>") : whole;
    });
    html=html.replace(/\*\*([^*\n]+)\*\*/g,"<strong>$1</strong>");
    html=html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g,"$1<em>$2</em>");
    html=html.replace(/~~([^~\n]+)~~/g,"<del>$1</del>");
    return html.replace(/\uE000(\d+)\uE001/g,(_,index)=>tokens[Number(index)]);
  }
  function render(value) {
    if(String(value || "").startsWith(RICH_PREFIX)) return sanitizeRichHtml(String(value).slice(RICH_PREFIX.length));
    const lines=String(value || "").replace(/\r\n?/g,"\n").split("\n");
    const html=[];
    let list=null,paragraph=[];
    const flushParagraph=()=>{if(paragraph.length){html.push("<p>"+paragraph.map(inline).join("<br>")+"</p>");paragraph=[];}};
    const closeList=()=>{if(list){html.push("</"+list+">");list=null;}};
    for(let index=0;index<lines.length;index++){
      const line=lines[index];
      if(/^\s*```/.test(line)){
        flushParagraph();closeList();
        const code=[];
        while(++index<lines.length && !/^\s*```/.test(lines[index])) code.push(lines[index]);
        html.push("<pre><code>"+escapeHtml(code.join("\n"))+"</code></pre>");
        continue;
      }
      if(!line.trim()){flushParagraph();closeList();continue;}
      const heading=line.match(/^\s{0,3}(#{1,4})\s+(.+)$/);
      if(heading){flushParagraph();closeList();const level=heading[1].length;html.push("<h"+level+">"+inline(heading[2])+"</h"+level+">");continue;}
      const bullet=line.match(/^\s*[-*+]\s+(.+)$/),numbered=line.match(/^\s*\d+\.\s+(.+)$/);
      if(bullet||numbered){
        flushParagraph();
        const kind=bullet?"ul":"ol";
        if(list!==kind){closeList();html.push("<"+kind+">");list=kind;}
        html.push("<li>"+inline((bullet||numbered)[1])+"</li>");
        continue;
      }
      const quote=line.match(/^\s*>\s?(.*)$/);
      if(quote){flushParagraph();closeList();html.push("<blockquote>"+inline(quote[1])+"</blockquote>");continue;}
      closeList();paragraph.push(line);
    }
    flushParagraph();closeList();
    return html.join("");
  }
  function serializeRich(source,doc=global.document) {
    const clean=sanitizeRichHtml(source,doc).trim();
    return clean ? RICH_PREFIX+clean : "";
  }
  function plainText(value) {
    const source=String(value || "");
    if(!source.startsWith(RICH_PREFIX)) return source;
    return source.slice(RICH_PREFIX.length).replace(/<\/(?:p|div|h[1-4]|li|blockquote)>/gi,"\n").replace(/<br\s*\/?\s*>/gi,"\n").replace(/<[^>]+>/g,"").replace(/&(?:amp|lt|gt|quot|#39);/g,entity=>({"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&#39;":"'"}[entity])).trim();
  }
  function insert(text,start,end,action){
    const source=String(text || ""),selected=source.slice(start,end);
    const wrap={bold:["**","**"],italic:["*","*"],strike:["~~","~~"],code:["`","`"],link:["[","](https://)"]};
    let replacement,cursorStart,cursorEnd;
    if(wrap[action]){
      const [before,after]=wrap[action];
      replacement=before+(selected || (action==="link"?"链接文字":"文字"))+after;
      cursorStart=start+before.length;cursorEnd=cursorStart+(selected || (action==="link"?"链接文字":"文字")).length;
    } else {
      const prefix={h1:"# ",h2:"## ",h3:"### ",bullet:"- ",numbered:"1. ",quote:"> "}[action];
      if(!prefix)return {value:source,start,end};
      const lineStart=source.lastIndexOf("\n",Math.max(0,start-1))+1;
      return {value:source.slice(0,lineStart)+prefix+source.slice(lineStart),start:start+prefix.length,end:end+prefix.length};
    }
    return {value:source.slice(0,start)+replacement+source.slice(end),start:cursorStart,end:cursorEnd};
  }
  const api={render,insert,serializeRich,plainText,RICH_PREFIX};
  global.WorkbenchCardMarkdown=api;
  if(typeof module!=="undefined" && module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
