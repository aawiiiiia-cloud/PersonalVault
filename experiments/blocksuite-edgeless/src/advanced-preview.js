import '../../../card-markdown.js';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {mountEpubReader} from './epub-reader.js';
import {readerIcon} from './reader-icons.js';
const pdfResources=new URL('../pdf-resources/',import.meta.url).href;

const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
const button=(bar,label,action)=>{const element=node('button',label);element.type='button';element.onclick=action;bar.append(element);return element;};
const select=(bar,options,action)=>{const element=node('select');for(const [value,label] of options){const option=node('option',label);option.value=value;element.append(option);}element.onchange=()=>action(element.value);bar.append(element);return element;};
const search=(bar,action)=>{const input=node('input');input.type='search';input.placeholder='搜索内容';input.oninput=()=>action(input.value);bar.append(input);return input;};
const checkAbort=signal=>{if(signal.aborted)throw new DOMException('已取消','AbortError');};
const displayZoom=value=>{const output=document.querySelector('#zoom-value');if(output)output.value=Math.round(value)+'%';};
function runWorker(payload,signal){return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./preview-worker.js',import.meta.url),{type:'module'});
  const close=()=>{worker.terminate();signal.removeEventListener('abort',abort);};
  const abort=()=>{close();reject(new DOMException('已取消','AbortError'));};
  signal.addEventListener('abort',abort,{once:true});
  worker.onmessage=({data})=>{close();data.error?reject(new Error(data.error)):resolve(data);};worker.onerror=event=>{close();reject(new Error(event.message));};worker.postMessage(payload);if(signal.aborted)abort();
});}
const psdCache=new WeakMap();
export async function psdPreview(blob,signal){
  if(psdCache.has(blob))return psdCache.get(blob);
  const result=await runWorker({type:'psd',buffer:await blob.arrayBuffer()},signal);psdCache.set(blob,result.blob);return result.blob;
}
function decode(buffer,encoding){
  if(encoding)return new TextDecoder(encoding).decode(buffer);
  const bytes=new Uint8Array(buffer);if(bytes[0]===255&&bytes[1]===254)return new TextDecoder('utf-16le').decode(buffer);
  try{return new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{return new TextDecoder('gb18030').decode(buffer);}
}
export async function mountFilePreview(item,{container,signal,companions=[],loadFile=file=>Promise.resolve(file.blob),onNavigate=()=>{}}){
  const root=node('section');root.className='file-preview';root.dataset.kind=item.kind;container.append(root);
  const bar=node('div');bar.className='file-toolbar';root.append(bar);
  const status=node('span');status.className='file-status';
  const destroy=()=>root.remove();
  if(item.kind==='audio'){
    const body=node('div');body.className='audio-reading';body.append(node('h2',item.name));
    const audio=node('audio');audio.controls=true;audio.preload='metadata';const url=URL.createObjectURL(item.blob);audio.src=url;body.append(audio);
    select(bar,[['1','1×'],['0.5','0.5×'],['0.75','0.75×'],['1.25','1.25×'],['1.5','1.5×'],['2','2×']],value=>audio.playbackRate=Number(value));
    const loop=button(bar,'循环：关闭',()=>{audio.loop=!audio.loop;loop.textContent=`循环：${audio.loop?'开启':'关闭'}`;});
    audio.onerror=()=>status.textContent='此音频编码无法播放，请使用系统应用打开';bar.append(status);root.append(body);
    return {destroy(){audio.pause();audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);destroy();}};
  }
  if(['text','markdown'].includes(item.kind)){
    const buffer=await item.blob.arrayBuffer();checkAbort(signal);
    const scroll=node('div');scroll.className='document-scroll';root.append(scroll);
    let encoding='',raw=item.kind==='text',fontSize=16,query='';
    const paint=()=>{
      displayZoom(fontSize/16*100);
      const content=node(raw?'pre':'article');content.className=raw?'text-reading':'markdown-reading';content.style.fontSize=fontSize+'px';
      const text=decode(buffer,encoding);
      if(raw){content.textContent=text;if(query){const offset=text.toLowerCase().indexOf(query.toLowerCase());if(offset>=0){content.replaceChildren(document.createTextNode(text.slice(0,offset)),node('mark',text.slice(offset,offset+query.length)),document.createTextNode(text.slice(offset+query.length)));}}}
      else content.innerHTML=window.WorkbenchCardMarkdown.render(text);
      scroll.replaceChildren(content);if(query){const walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT);let part;while((part=walker.nextNode())){if(part.textContent.toLowerCase().includes(query.toLowerCase())){const range=document.createRange();range.selectNodeContents(part);document.getSelection().removeAllRanges();document.getSelection().addRange(range);part.parentElement.scrollIntoView({block:'center'});break;}}}
    };
    select(bar,[['','自动编码'],['utf-8','UTF-8'],['gb18030','GB18030'],['utf-16le','UTF-16']],value=>{encoding=value;paint();});
    if(item.kind==='markdown'){const toggle=button(bar,'查看原文',()=>{raw=!raw;toggle.textContent=raw?'排版阅读':'查看原文';paint();});}
    search(bar,value=>{query=value;paint();});button(bar,'A−',()=>{fontSize=Math.max(12,fontSize-2);paint();});button(bar,'A+',()=>{fontSize=Math.min(32,fontSize+2);paint();});paint();
    return {destroy,zoomBy(factor){fontSize=Math.max(12,Math.min(32,fontSize*factor));paint();},fit(){fontSize=16;paint();},turnPage(delta){scroll.scrollBy({top:delta*Math.max(1,scroll.clientHeight-40),behavior:'smooth'});}};
  }
  if(['csv','tsv'].includes(item.kind)){
    const buffer=await item.blob.arrayBuffer();checkAbort(signal);
    let encoding='',delimiter=item.kind==='tsv'?'\t':'',rows=[],filtered=[],page=0,header=true,sortColumn=-1,ascending=true;
    const scroll=node('div');scroll.className='document-scroll';root.append(scroll);
    const paint=()=>{
      const table=node('table');table.className='csv-reading';const headings=header?rows[0]||[]:Array.from({length:rows[0]?.length||0},(_,i)=>String(i+1));const thead=node('thead'),tr=node('tr');
      headings.forEach((heading,column)=>{const th=node('th',heading);th.onclick=()=>{ascending=sortColumn===column?!ascending:true;sortColumn=column;filtered.sort((a,b)=>String(a[column]||'').localeCompare(String(b[column]||''),'zh-CN',{numeric:true})*(ascending?1:-1));paint();};tr.append(th);});thead.append(tr);table.append(thead);
      const tbody=node('tbody');for(const row of filtered.slice(page*100,(page+1)*100)){const tr=node('tr');for(const value of row)tr.append(node('td',value));tbody.append(tr);}table.append(tbody);scroll.replaceChildren(table);status.textContent=`${filtered.length} 行 · ${page+1}/${Math.max(1,Math.ceil(filtered.length/100))} 页`;
    };
    const filter=value=>{filtered=rows.slice(header?1:0).filter(row=>!value||row.join('\t').toLowerCase().includes(value.toLowerCase()));page=0;paint();};
    let query='',parseVersion=0;const parse=async()=>{const version=++parseVersion;const parsed=await runWorker({type:'csv',text:decode(buffer,encoding),delimiter},signal);checkAbort(signal);if(version!==parseVersion)return;rows=parsed.rows;filter(query);};
    select(bar,[['','自动编码'],['utf-8','UTF-8'],['gb18030','GB18030']],value=>{encoding=value;void parse().catch(error=>status.textContent=error.message);});
    select(bar,[['','自动分隔符'],[',','逗号'],['\t','制表符'],[';','分号']],value=>{delimiter=value;void parse().catch(error=>status.textContent=error.message);});
    const headerButton=button(bar,'首行：表头',()=>{header=!header;headerButton.textContent=header?'首行：表头':'首行：数据';filter(query);});
    search(bar,value=>{query=value;filter(query);});button(bar,'上一页',()=>{page=Math.max(0,page-1);paint();});button(bar,'下一页',()=>{page=Math.min(Math.max(0,Math.ceil(filtered.length/100)-1),page+1);paint();});bar.append(status);await parse();return {destroy};
  }
  if(item.kind==='pdf'){
    const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
    const data=new Uint8Array(await item.blob.arrayBuffer());checkAbort(signal);
    const task=pdfjs.getDocument({data,isEvalSupported:false,cMapUrl:pdfResources+'cmaps/',cMapPacked:true,standardFontDataUrl:pdfResources+'standard_fonts/',wasmUrl:pdfResources+'wasm/'});
    signal.addEventListener('abort',()=>{void task.destroy();},{once:true});
    task.onPassword=(update,reason)=>{const password=window.prompt(reason===2?'密码不正确，请重新输入 PDF 密码':'请输入 PDF 密码');if(password===null){void task.destroy();}else update(password);};
    const pdf=await task.promise;checkAbort(signal);let page=1,scale=1,renderTask=null,sequence=0,textLayer=null;
    const scroll=node('div');scroll.className='document-scroll';const host=node('div');host.className='pdf-page';scroll.append(host);root.append(scroll);
    const pageInput=node('input');pageInput.type='number';pageInput.min='1';pageInput.max=pdf.numPages;pageInput.value='1';
    const paint=async()=>{const version=++sequence;renderTask?.cancel();textLayer?.cancel();const p=await pdf.getPage(page);if(version!==sequence||signal.aborted)return;displayZoom(scale*100);const viewport=p.getViewport({scale});const canvas=node('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);host.style.width=viewport.width+'px';host.style.height=viewport.height+'px';host.replaceChildren(canvas);pageInput.value=String(page);status.textContent=`共 ${pdf.numPages} 页 · ${Math.round(scale*100)}%`;
      renderTask=p.render({canvasContext:canvas.getContext('2d'),viewport});try{await renderTask.promise;}catch(error){if(error.name==='RenderingCancelledException')return;throw error;}if(version!==sequence||signal.aborted)return;
      const layer=node('div');layer.className='textLayer';layer.style.setProperty('--total-scale-factor',scale);host.append(layer);textLayer=new pdfjs.TextLayer({textContentSource:await p.getTextContent(),container:layer,viewport});await textLayer.render();
    };
    const move=delta=>{page=Math.max(1,Math.min(pdf.numPages,page+delta));void paint().catch(error=>status.textContent=error.message);};
    const footer=node('div');footer.className='file-toolbar file-page-footer epub-footer';root.append(footer);
    const nav=(label,kind,run)=>{const b=button(footer,'',run);b.append(readerIcon(kind));b.setAttribute('aria-label',label);b.title=label;};
    nav('第一页','first',()=>{page=1;void paint();});nav('上一页','previous',()=>move(-1));const pagePosition=node('div');pagePosition.className='epub-page-position';pageInput.className='epub-page-input';pageInput.setAttribute('aria-label','跳转页码');pagePosition.append(pageInput,node('span',`/ ${pdf.numPages}`));footer.append(pagePosition);pageInput.onchange=()=>{page=Math.max(1,Math.min(pdf.numPages,Number(pageInput.value)||1));void paint();pageInput.blur();};nav('下一页','next',()=>move(1));nav('最后一页','last',()=>{page=pdf.numPages;void paint();});
    button(bar,'A+',()=>{scale=Math.min(5,scale*1.1);void paint();});button(bar,'A−',()=>{scale=Math.max(.2,scale/1.1);void paint();});
    const query=search(bar,()=>{});button(bar,'查找',async()=>{if(!query.value)return;status.textContent='正在查找…';for(let offset=0;offset<pdf.numPages;offset++){checkAbort(signal);const candidate=(page-1+offset)%pdf.numPages+1;const text=(await (await pdf.getPage(candidate)).getTextContent()).items.map(i=>i.str||'').join(' ');if(text.toLowerCase().includes(query.value.toLowerCase())){page=candidate;await paint();status.textContent+=' · 找到匹配';return;}}status.textContent='未找到匹配';});bar.append(status);
    const fit=async()=>{const p=await pdf.getPage(page);scale=Math.min(2,Math.max(.1,(scroll.clientWidth-48)/p.getViewport({scale:1}).width));await paint();};await fit();
    return {destroy(){sequence++;renderTask?.cancel();textLayer?.cancel();void task.destroy();destroy();},fit:()=>void fit(),zoomBy(factor){scale=Math.max(.2,Math.min(5,scale*factor));void paint();},turnPage:move};
  }
  if(item.kind==='epub'){
    return mountEpubReader(item,{root,bar,signal,onNavigate,displayZoom});
  }
  if(item.kind==='model'){
    const THREE=await import('three');const {OrbitControls}=await import('three/addons/controls/OrbitControls.js');
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.01,10000),renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(2,devicePixelRatio));
    const host=node('div');host.className='model-reading';host.append(renderer.domElement);root.append(host);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;const urls=new Map(),prepared=new Map();const manager=new THREE.LoadingManager();
    const findFile=name=>companions.find(file=>file.name===decodeURIComponent(name.replaceAll('\\','/').split('/').pop()));
    const prepare=async name=>{if(name.startsWith('data:'))return;const file=findFile(name);if(!file)throw new Error('缺少模型配套文件：'+name);if(!file.saved&&!file.blob)prepared.set(file.name,await loadFile(file,signal));};
    manager.setURLModifier(url=>{if(url.startsWith('data:')||url.startsWith('blob:'))return url;const name=decodeURIComponent(url.replaceAll('\\','/').split('/').pop()),file=findFile(name);if(!file)throw new Error('缺少模型配套文件：'+name);if(file.saved){if(!file.url)throw new Error('模型配套文件缺失：'+name);return file.url;}const blob=file.blob||prepared.get(file.name);if(!blob)throw new Error('模型配套文件未能读取：'+name);if(!urls.has(name))urls.set(name,URL.createObjectURL(blob));return urls.get(name);});
    scene.add(new THREE.HemisphereLight(0xffffff,0x445566,3));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(4,8,5);scene.add(light);
    const extension=item.name.split('.').pop().toLowerCase(),buffer=await item.blob.arrayBuffer();let model;
    try{
      if(extension==='obj'){
        const {OBJLoader}=await import('three/addons/loaders/OBJLoader.js');const loader=new OBJLoader(manager),text=decode(buffer);
        const mtlName=text.match(/^mtllib\s+(.+)$/m)?.[1]?.trim();
        if(mtlName){const file=findFile(mtlName);if(!file)throw new Error('缺少模型配套文件：'+mtlName);const mtl=await (await loadFile(file,signal)).text();for(const match of mtl.matchAll(/^\s*(?:map_\w+|bump|disp)\s+(.+)$/gm))await prepare(match[1].trim().split(/\s+/).pop());const {MTLLoader}=await import('three/addons/loaders/MTLLoader.js');loader.setMaterials(new MTLLoader(manager).parse(mtl,''));}
        model=loader.parse(text);
      }
      else if(extension==='stl'){const {STLLoader}=await import('three/addons/loaders/STLLoader.js');model=new THREE.Mesh(new STLLoader(manager).parse(buffer),new THREE.MeshStandardMaterial({color:0x9eaed0,roughness:.6}));}
      else if(extension==='fbx'){for(const file of companions.filter(file=>file.kind==='image'&&!file.saved&&!file.blob))await prepare(file.name);const {FBXLoader}=await import('three/addons/loaders/FBXLoader.js');model=new FBXLoader(manager).parse(buffer,'');}
      else {let json;if(extension==='gltf')json=JSON.parse(decode(buffer));else {const view=new DataView(buffer);if(view.byteLength>=20&&view.getUint32(16,true)===0x4e4f534a)json=JSON.parse(decode(buffer.slice(20,20+view.getUint32(12,true))));}for(const resource of [...json?.buffers||[],...json?.images||[]])if(resource.uri)await prepare(resource.uri);const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');const result=await new GLTFLoader(manager).parseAsync(extension==='gltf'?decode(buffer):buffer,'');model=result.scene;}
      checkAbort(signal);scene.add(model);
    }catch(error){controls.dispose();renderer.dispose();renderer.forceContextLoss();for(const url of urls.values())URL.revokeObjectURL(url);throw error;}
    const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),radius=Math.max(size.x,size.y,size.z,.01);
    const fit=()=>{camera.aspect=Math.max(.1,host.clientWidth/Math.max(1,host.clientHeight));camera.near=radius/1000;camera.far=radius*100;camera.position.copy(center).add(new THREE.Vector3(1, .7,1).normalize().multiplyScalar(radius*2.4/Math.min(1,camera.aspect)));camera.updateProjectionMatrix();controls.target.copy(center);controls.update();};
    const resize=()=>{renderer.setSize(host.clientWidth,Math.max(1,host.clientHeight));camera.aspect=host.clientWidth/Math.max(1,host.clientHeight);camera.updateProjectionMatrix();};
    const observer=new ResizeObserver(resize);observer.observe(host);resize();fit();let animation;
    const render=()=>{animation=requestAnimationFrame(render);controls.update();renderer.render(scene,camera);};render();
    button(bar,'恢复视角',fit);const wire=button(bar,'线框：关闭',()=>{let enabled=false;model.traverse(mesh=>{if(mesh.isMesh){for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){material.wireframe=!material.wireframe;enabled=material.wireframe;}}});wire.textContent=`线框：${enabled?'开启':'关闭'}`;});status.textContent='拖动旋转 · 右键平移 · 滚轮缩放';bar.append(status);
    return {fit,zoomBy(factor){camera.position.sub(controls.target).divideScalar(factor).add(controls.target);controls.update();},destroy(){cancelAnimationFrame(animation);observer.disconnect();controls.dispose();model.traverse(mesh=>{mesh.geometry?.dispose();for(const material of Array.isArray(mesh.material)?mesh.material:mesh.material?[mesh.material]:[]){for(const value of Object.values(material))if(value?.isTexture)value.dispose();material.dispose();}});renderer.dispose();renderer.forceContextLoss();for(const url of urls.values())URL.revokeObjectURL(url);destroy();}};
  }
  throw new Error('暂不支持此文件预览');
}
