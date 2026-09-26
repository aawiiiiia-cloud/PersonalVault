(function (global) {
  "use strict";

  const POSITION_KEY = "knowledge-workbench-graph-node-positions";
  const TYPE_COLORS = {
    project:[35,39,48],
    knowledge:[74,108,247],
    source:[143,169,197]
  };

  function clamp(value,min=0,max=1) {
    return Math.max(min,Math.min(max,value));
  }

  function nodeInfluence(node) {
    const connections=Number(node?.connectionCount);
    if (Number.isFinite(connections)) return Math.max(0,connections);
    return Math.max(0,Number(node?.incomingCount) || 0);
  }

  function nodeRadius(node,{ selected=false }={}) {
    return Math.min(20,5.5 + Math.sqrt(nodeInfluence(node)) * 3.2 + (selected ? 1 : 0));
  }

  function nodeColor(type,connectionCount=0) {
    const base=TYPE_COLORS[type] || [100,116,139];
    const count=Math.max(0,Number(connectionCount) || 0);
    const influence=clamp(Math.log2(count+1)/3);
    const tone=clamp(-.26+influence*.62,-.26,.34);
    const channels=tone < 0
      ? base.map(channel=>channel+(255-channel)*Math.abs(tone))
      : base.map(channel=>channel*(1-tone));
    return `rgb(${channels.map(channel=>Math.round(channel)).join(",")})`;
  }

  function labelPresentation(scale) {
    const progress=clamp((Number(scale)-.32)/.58);
    return {
      opacity:Math.pow(progress,1.35),
      fontSize:7.5 + progress * 3.5,
      maxCharacters:Math.max(8,Math.round(8 + progress * 10))
    };
  }

  function labelVerticalOffset(radius,fontSize,hoverProgress=0) {
    return Number(radius)+Math.max(5,Number(fontSize)*.42)+clamp(Number(hoverProgress) || 0)*6;
  }

  function nodeScaleForZoom(scale) {
    return clamp(Math.pow(Math.max(.01,Number(scale) || 1),.85),.28,2.7);
  }

  function entranceSpringProgress(progress) {
    const value=clamp(Number(progress) || 0);
    if (value === 0 || value === 1) return value;
    return 1-Math.exp(-6*value)*Math.cos(4.5*value);
  }

  function hoverNodeScale(progress) {
    return 1+clamp(Number(progress) || 0)*.14;
  }

  function wheelDeltaPixels(deltaY,deltaMode=0,pageSize=800) {
    const multiplier=deltaMode === 1 ? 16 : deltaMode === 2 ? Math.max(1,Number(pageSize) || 800) : 1;
    return clamp((Number(deltaY) || 0)*multiplier,-240,240);
  }

  function wheelZoomTarget(camera,x,y,deltaY,deltaMode=0,pageSize=800) {
    const current={ x:Number(camera?.x) || 0,y:Number(camera?.y) || 0,scale:Math.max(.01,Number(camera?.scale) || 1) };
    const anchor={ x:(x-current.x)/current.scale,y:(y-current.y)/current.scale };
    const scale=clamp(current.scale*Math.exp(-wheelDeltaPixels(deltaY,deltaMode,pageSize)*.00135),.2,3);
    return { x:x-anchor.x*scale,y:y-anchor.y*scale,scale };
  }

  function createGraphCanvas(canvas,{ onSelect=()=>{},storage=global.localStorage }={}) {
    const context = canvas.getContext("2d");
    let graph = { nodes:[],edges:[] };
    let positions = new Map();
    let selectedId = null;
    let hoveredId = null;
    let camera = { x:0,y:0,scale:1 };
    let pointer = null;
    let width = 1;
    let height = 1;
    let initialized = false;
    let persisted = {};
    let inertiaFrame = null;
    let emphasisId = null;
    let emphasisProgress = 0;
    let emphasisFrame = null;
    let entranceProgress = 1;
    let entranceOrigin = null;
    let entranceFrame = null;
    let entranceRunCount = 0;
    let zoomFrame = null;
    let zoomTarget = null;
    let zoomPreviousTime = 0;
    try { persisted = JSON.parse(storage?.getItem(POSITION_KEY) || "{}"); } catch {}

    function cancelInertia() {
      if (inertiaFrame !== null) global.cancelAnimationFrame(inertiaFrame);
      inertiaFrame=null;
    }

    function cancelZoomAnimation(commit=false,redraw=false) {
      if (zoomFrame !== null) global.cancelAnimationFrame(zoomFrame);
      zoomFrame=null;
      if (commit && zoomTarget) camera={ ...zoomTarget };
      zoomTarget=null;
      zoomPreviousTime=0;
      if (redraw) draw();
    }

    function animateZoom() {
      if (zoomFrame !== null || !zoomTarget) return;
      const step=now => {
        if (!zoomTarget) { zoomFrame=null; return; }
        const elapsed=zoomPreviousTime ? Math.min(40,now-zoomPreviousTime) : 16.67;
        zoomPreviousTime=now;
        const blend=1-Math.exp(-elapsed/58);
        camera.x+=(zoomTarget.x-camera.x)*blend;
        camera.y+=(zoomTarget.y-camera.y)*blend;
        camera.scale+=(zoomTarget.scale-camera.scale)*blend;
        draw();
        const settled=Math.abs(zoomTarget.x-camera.x)<.08 && Math.abs(zoomTarget.y-camera.y)<.08 && Math.abs(zoomTarget.scale-camera.scale)<.0002;
        if (settled) {
          camera={ ...zoomTarget };
          zoomTarget=null;
          zoomFrame=null;
          zoomPreviousTime=0;
          draw();
          return;
        }
        zoomFrame=global.requestAnimationFrame(step);
      };
      zoomFrame=global.requestAnimationFrame(step);
    }

    function cancelEmphasisAnimation() {
      if (emphasisFrame !== null) global.cancelAnimationFrame(emphasisFrame);
      emphasisFrame=null;
    }

    function finishEntrance(redraw=true) {
      if (entranceFrame !== null) global.cancelAnimationFrame(entranceFrame);
      entranceFrame=null;
      entranceProgress=1;
      entranceOrigin=null;
      if (redraw) draw();
    }

    function playEntrance() {
      finishEntrance(false);
      entranceRunCount+=1;
      if (!graph.nodes.length || global.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { draw(); return; }
      entranceProgress=0;
      entranceOrigin=worldPoint(width/2,height/2);
      const startedAt=global.performance.now();
      const duration=920;
      draw();
      const step=now => {
        entranceProgress=clamp((now-startedAt)/duration);
        draw();
        if (entranceProgress < 1) { entranceFrame=global.requestAnimationFrame(step); return; }
        entranceFrame=null;
        entranceOrigin=null;
      };
      entranceFrame=global.requestAnimationFrame(step);
    }

    function animateEmphasis(target) {
      cancelEmphasisAnimation();
      const from=emphasisProgress;
      const startedAt=global.performance.now();
      const duration=target > from ? 190 : 260;
      const step=now => {
        const progress=clamp((now-startedAt)/duration);
        const eased=1-Math.pow(1-progress,3);
        emphasisProgress=from+(target-from)*eased;
        draw();
        if (progress < 1) { emphasisFrame=global.requestAnimationFrame(step); return; }
        emphasisFrame=null;
        emphasisProgress=target;
        if (target === 0) emphasisId=null;
      };
      emphasisFrame=global.requestAnimationFrame(step);
    }

    function setHovered(id) {
      if (id === hoveredId) return;
      hoveredId=id;
      canvas.style.cursor=id ? "pointer" : "grab";
      if (id) {
        if (emphasisId !== id) emphasisProgress=0;
        emphasisId=id;
        draw();
        animateEmphasis(1);
      } else {
        animateEmphasis(0);
      }
    }

    function startPanInertia(velocityX,velocityY) {
      cancelInertia();
      let vx=Math.max(-18,Math.min(18,velocityX * .38));
      let vy=Math.max(-18,Math.min(18,velocityY * .38));
      if (Math.hypot(vx,vy) < .35) return;
      let previous=global.performance.now();
      const step=now => {
        const frameScale=Math.min(2,(now-previous)/16.67 || 1);
        previous=now;
        camera.x+=vx*frameScale;
        camera.y+=vy*frameScale;
        const friction=Math.pow(.82,frameScale);
        vx*=friction;
        vy*=friction;
        draw();
        if (Math.hypot(vx,vy) < .08) { inertiaFrame=null; return; }
        inertiaFrame=global.requestAnimationFrame(step);
      };
      inertiaFrame=global.requestAnimationFrame(step);
    }

    function hashNumber(value) {
      let hash = 2166136261;
      for (const character of String(value)) hash = Math.imul(hash ^ character.charCodeAt(0),16777619);
      return (hash >>> 0) / 4294967295;
    }

    function initializePositions(nodes,edges) {
      const degree = new Map(nodes.map(node => [node.id,0]));
      edges.forEach(edge => {
        degree.set(edge.source,(degree.get(edge.source) || 0) + 1);
        degree.set(edge.target,(degree.get(edge.target) || 0) + 1);
      });
      const connected = nodes.filter(node => degree.get(node.id));
      const isolated = nodes.filter(node => !degree.get(node.id));
      connected.sort((a,b) => degree.get(b.id) - degree.get(a.id) || a.id.localeCompare(b.id));
      connected.forEach((node,index) => {
        if (positions.has(node.id)) return;
        const saved = persisted[node.id];
        if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) positions.set(node.id,{ x:saved.x,y:saved.y });
        else {
          const angle = index * 2.3999632297;
          const radius = 42 * Math.sqrt(index + 1);
          positions.set(node.id,{ x:Math.cos(angle) * radius,y:Math.sin(angle) * radius });
        }
      });
      const nodeById = new Map(nodes.map(node => [node.id,node]));
      for (let iteration = 0; iteration < Math.min(180,80 + nodes.length); iteration += 1) {
        const force = new Map(connected.map(node => [node.id,{ x:0,y:0 }]));
        const cells = new Map();
        connected.forEach(node => {
          const point = positions.get(node.id);
          const key = `${Math.floor(point.x/120)},${Math.floor(point.y/120)}`;
          if (!cells.has(key)) cells.set(key,[]);
          cells.get(key).push(node);
        });
        connected.forEach(node => {
          const point = positions.get(node.id);
          const cellX = Math.floor(point.x/120), cellY = Math.floor(point.y/120);
          for (let x = cellX - 1; x <= cellX + 1; x += 1) for (let y = cellY - 1; y <= cellY + 1; y += 1) {
            (cells.get(`${x},${y}`) || []).forEach(other => {
              if (other.id <= node.id) return;
              const otherPoint = positions.get(other.id);
              let dx = point.x - otherPoint.x, dy = point.y - otherPoint.y;
              let distanceSquared = dx*dx + dy*dy;
              if (distanceSquared < 1) {
                const angle = hashNumber(`${node.id}:${other.id}`) * Math.PI * 2;
                dx = Math.cos(angle); dy = Math.sin(angle); distanceSquared = 1;
              }
              if (distanceSquared > 22500) return;
              const strength = 900 / distanceSquared;
              const distance = Math.sqrt(distanceSquared);
              const fx = dx / distance * strength, fy = dy / distance * strength;
              force.get(node.id).x += fx; force.get(node.id).y += fy;
              force.get(other.id).x -= fx; force.get(other.id).y -= fy;
            });
          }
        });
        edges.forEach(edge => {
          if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) return;
          const a = positions.get(edge.source), b = positions.get(edge.target);
          const dx = b.x-a.x, dy = b.y-a.y;
          const distance = Math.max(1,Math.hypot(dx,dy));
          const strength = (distance - 105) * 0.008;
          const fx = dx / distance * strength, fy = dy / distance * strength;
          force.get(edge.source).x += fx; force.get(edge.source).y += fy;
          force.get(edge.target).x -= fx; force.get(edge.target).y -= fy;
        });
        connected.forEach(node => {
          if (persisted[node.id]) return;
          const point = positions.get(node.id), movement = force.get(node.id);
          point.x += Math.max(-6,Math.min(6,movement.x - point.x * 0.002));
          point.y += Math.max(-6,Math.min(6,movement.y - point.y * 0.002));
        });
      }
      const outerRadius = Math.max(190,70 * Math.sqrt(Math.max(connected.length,1)));
      isolated.forEach((node,index) => {
        if (positions.has(node.id)) return;
        const saved = persisted[node.id];
        if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) positions.set(node.id,{ x:saved.x,y:saved.y });
        else {
          const angle = (index / Math.max(isolated.length,1)) * Math.PI * 2 - Math.PI/2;
          positions.set(node.id,{ x:Math.cos(angle) * outerRadius,y:Math.sin(angle) * outerRadius });
        }
      });
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(global.devicePixelRatio || 1,2);
      width = Math.max(1,rect.width);
      height = Math.max(1,rect.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio,0,0,ratio,0,0);
      draw();
    }

    function screenPoint(point) {
      return { x:point.x * camera.scale + camera.x,y:point.y * camera.scale + camera.y };
    }

    function worldPoint(x,y) {
      return { x:(x-camera.x)/camera.scale,y:(y-camera.y)/camera.scale };
    }

    function neighbors(id) {
      return global.WorkbenchGraphData?.neighborIds(graph,id) || new Set();
    }

    function entranceState(node) {
      if (entranceProgress >= 1 || !entranceOrigin) return { motion:1,nodeOpacity:1,labelOpacity:1 };
      const influence=Math.min(1,nodeInfluence(node)/6);
      const delay=(1-influence)*.045+hashNumber(node.id)*.085;
      const local=clamp((entranceProgress-delay)/(1-delay));
      return {
        motion:entranceSpringProgress(local),
        nodeOpacity:clamp(local/.32),
        labelOpacity:clamp((local-.2)/.55)
      };
    }

    function renderedWorldPoint(node,state=entranceState(node)) {
      const point=positions.get(node.id);
      if (!point || state.motion === 1 || !entranceOrigin) return point;
      const angle=hashNumber(`${node.id}:angle`)*Math.PI*2;
      const spread=(8+hashNumber(`${node.id}:spread`)*18)/Math.max(camera.scale,.2);
      const start={ x:entranceOrigin.x+Math.cos(angle)*spread,y:entranceOrigin.y+Math.sin(angle)*spread };
      return {
        x:start.x+(point.x-start.x)*state.motion,
        y:start.y+(point.y-start.y)*state.motion
      };
    }

    function draw() {
      context.clearRect(0,0,width,height);
      const activeId = emphasisId;
      const activeNeighbors = activeId ? neighbors(activeId) : new Set();
      const emphasis=activeId ? emphasisProgress : 0;
      const labelStyle=labelPresentation(camera.scale);
      context.save();
      const zoomNodeScale=nodeScaleForZoom(camera.scale);
      const nodeById=new Map(graph.nodes.map(node=>[node.id,node]));
      context.lineWidth = clamp(camera.scale,.45,1.6);
      graph.edges.forEach(edge => {
        const sourceNode=nodeById.get(edge.source),targetNode=nodeById.get(edge.target);
        if (!sourceNode || !targetNode) return;
        const sourceEntrance=entranceState(sourceNode),targetEntrance=entranceState(targetNode);
        const a=renderedWorldPoint(sourceNode,sourceEntrance),b=renderedWorldPoint(targetNode,targetEntrance);
        if (!a || !b) return;
        const highlighted = activeId && (edge.source === activeId || edge.target === activeId);
        const edgeTarget=highlighted ? .82 : .16;
        const entranceAlpha=Math.min(sourceEntrance.nodeOpacity,targetEntrance.nodeOpacity)*clamp((entranceProgress-.03)/.48);
        context.globalAlpha = (.3+(edgeTarget-.3)*emphasis)*entranceAlpha;
        context.strokeStyle = highlighted ? "#4a6cf7" : "#a4abba";
        context.beginPath();
        const start = screenPoint(a), end = screenPoint(b);
        context.moveTo(start.x,start.y); context.lineTo(end.x,end.y); context.stroke();
      });
      graph.nodes.forEach(node => {
        const nodeEntrance=entranceState(node);
        const point = renderedWorldPoint(node,nodeEntrance); if (!point) return;
        const screen = screenPoint(point);
        const related = !activeId || node.id === activeId || activeNeighbors.has(node.id);
        const isolated = neighbors(node.id).size === 0;
        context.globalAlpha = (1+((related ? 1 : .36)-1)*emphasis)*nodeEntrance.nodeOpacity;
        context.fillStyle = nodeColor(node.type,nodeInfluence(node));
        context.beginPath();
        const nodeHover=node.id === activeId ? emphasis : 0;
        const radius=nodeRadius(node,{ selected:node.id === selectedId })*zoomNodeScale*hoverNodeScale(nodeHover);
        context.arc(screen.x,screen.y,radius,0,Math.PI*2);
        if (nodeHover > 0) {
          context.shadowColor=`rgba(29,31,38,${(.2*nodeHover).toFixed(3)})`;
          context.shadowBlur=10*nodeHover;
          context.shadowOffsetY=2.5*nodeHover;
        }
        context.fill();
        context.shadowColor="transparent";
        context.shadowBlur=0;
        context.shadowOffsetY=0;
        if (node.id === selectedId) {
          context.strokeStyle = "#1d1f26"; context.lineWidth = clamp(2*zoomNodeScale,.8,3.5); context.stroke();
        } else if (isolated) {
          context.strokeStyle = "#ffffff"; context.lineWidth = clamp(2*zoomNodeScale,.8,3.5); context.stroke();
        }
        if (labelStyle.opacity > .015) {
          const hoverAlpha=.92+((related ? .92 : .34)-.92)*emphasis;
          context.globalAlpha = labelStyle.opacity * hoverAlpha * nodeEntrance.labelOpacity;
          context.fillStyle = "#474c59";
          context.font = `${labelStyle.fontSize.toFixed(2)}px 'Microsoft YaHei', sans-serif`;
          context.textAlign = "center";
          context.textBaseline = "top";
          const label = node.title.length > labelStyle.maxCharacters ? `${node.title.slice(0,labelStyle.maxCharacters)}…` : node.title;
          const labelHover=nodeHover;
          context.fillText(label,screen.x,screen.y+labelVerticalOffset(radius,labelStyle.fontSize,labelHover));
        }
      });
      context.restore();
    }

    function hitNode(x,y) {
      let match = null, best = Infinity;
      graph.nodes.forEach(node => {
        const point=renderedWorldPoint(node); if (!point) return;
        const screen=screenPoint(point);
        const distance=Math.hypot(screen.x-x,screen.y-y);
        const nodeHover=node.id === emphasisId ? emphasisProgress : 0;
        const radius=nodeRadius(node,{ selected:node.id === selectedId })*nodeScaleForZoom(camera.scale)*hoverNodeScale(nodeHover);
        if (distance < Math.max(8,radius+5) && distance < best) { match=node; best=distance; }
      });
      return match;
    }

    function selectNode(id) {
      selectedId = graph.nodes.some(node => node.id === id) ? id : null;
      onSelect(selectedId ? graph.nodes.find(node => node.id === selectedId) : null,graph);
      draw();
    }

    function fitView() {
      finishEntrance(false);
      cancelInertia();
      cancelZoomAnimation();
      if (!graph.nodes.length) { camera={ x:width/2,y:height/2,scale:1 }; draw(); return; }
      const points = graph.nodes.map(node => positions.get(node.id)).filter(Boolean);
      const minX=Math.min(...points.map(point=>point.x)), maxX=Math.max(...points.map(point=>point.x));
      const minY=Math.min(...points.map(point=>point.y)), maxY=Math.max(...points.map(point=>point.y));
      const spanX=Math.max(120,maxX-minX+120), spanY=Math.max(120,maxY-minY+120);
      const scale=Math.max(.28,Math.min(1.35,Math.min(width/spanX,height/spanY)));
      camera={ x:width/2-((minX+maxX)/2)*scale,y:height/2-((minY+maxY)/2)*scale,scale };
      draw();
    }

    function focusNode(id) {
      const point = positions.get(id);
      if (!point) return false;
      finishEntrance(false);
      cancelInertia();
      cancelZoomAnimation();
      camera.scale = Math.max(camera.scale,1);
      camera.x = width/2-point.x*camera.scale;
      camera.y = height/2-point.y*camera.scale;
      selectNode(id);
      return true;
    }

    function savePosition(id) {
      const point = positions.get(id); if (!point) return;
      persisted[id] = { x:Math.round(point.x*100)/100,y:Math.round(point.y*100)/100 };
      try { storage?.setItem(POSITION_KEY,JSON.stringify(persisted)); } catch {}
    }

    canvas.addEventListener("wheel",event => {
      event.preventDefault();
      finishEntrance(false);
      cancelInertia();
      const rect=canvas.getBoundingClientRect(), x=event.clientX-rect.left, y=event.clientY-rect.top;
      zoomTarget=wheelZoomTarget(zoomTarget || camera,x,y,event.deltaY,event.deltaMode,height);
      animateZoom();
    },{ passive:false });
    canvas.addEventListener("pointerdown",event => {
      finishEntrance(false);
      cancelInertia();
      cancelZoomAnimation(true,true);
      canvas.focus({ preventScroll:true });
      const rect=canvas.getBoundingClientRect(), x=event.clientX-rect.left, y=event.clientY-rect.top;
      const node=hitNode(x,y);
      pointer={ id:event.pointerId,mode:node?"node":"pan",nodeId:node?.id||null,lastX:x,lastY:y,moved:false,velocityX:0,velocityY:0 };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove",event => {
      const rect=canvas.getBoundingClientRect(), x=event.clientX-rect.left, y=event.clientY-rect.top;
      if (pointer?.id === event.pointerId) {
        const dx=x-pointer.lastX, dy=y-pointer.lastY;
        if (Math.abs(dx)+Math.abs(dy)>2) pointer.moved=true;
        if (pointer.mode === "pan") {
          camera.x+=dx; camera.y+=dy;
          pointer.velocityX=pointer.velocityX*.6+dx*.4;
          pointer.velocityY=pointer.velocityY*.6+dy*.4;
        }
        else {
          const point=positions.get(pointer.nodeId); point.x+=dx/camera.scale; point.y+=dy/camera.scale;
        }
        pointer.lastX=x; pointer.lastY=y; draw(); return;
      }
      const next=hitNode(x,y)?.id||null;
      if (next!==hoveredId) setHovered(next);
    });
    const endPointer = event => {
      if (pointer?.id !== event.pointerId) return;
      const completed=pointer;
      if (pointer.mode === "node") {
        if (!pointer.moved) selectNode(selectedId === pointer.nodeId ? null : pointer.nodeId);
        else savePosition(pointer.nodeId);
      } else if (!pointer.moved) {
        selectNode(null);
      }
      pointer=null;
      if (completed.mode === "pan" && completed.moved) startPanInertia(completed.velocityX,completed.velocityY);
    };
    canvas.addEventListener("pointerup",endPointer);
    canvas.addEventListener("pointercancel",endPointer);
    canvas.addEventListener("pointerleave",()=>{ if(!pointer&&hoveredId) setHovered(null); });
    canvas.addEventListener("keydown",event=>{
      if (event.key !== "Escape") return;
      selectNode(null);
      setHovered(null);
    });

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    return {
      setGraph(nextGraph) {
        finishEntrance(false);
        cancelInertia();
        cancelZoomAnimation();
        graph=nextGraph || { nodes:[],edges:[] };
        if (hoveredId && !graph.nodes.some(node=>node.id===hoveredId)) setHovered(null);
        initializePositions(graph.nodes,graph.edges);
        if (selectedId && !graph.nodes.some(node=>node.id===selectedId)) selectNode(null);
        const firstRender=!initialized;
        initialized=true;
        resize();
        if (firstRender) fitView();
      },
      resetView:fitView,
      focusNode,
      selectNode,
      playEntrance,
      resize,
      getState:()=>({
        camera:{...camera},selectedId,hoveredId,nodeCount:graph.nodes.length,edgeCount:graph.edges.length,
        inertiaActive:inertiaFrame !== null,zoomAnimating:zoomFrame !== null,zoomTarget:zoomTarget ? {...zoomTarget} : null,
        emphasisProgress,emphasisAnimating:emphasisFrame !== null,
        entranceActive:entranceFrame !== null,entranceProgress,entranceRunCount,
        viewport:{ width,height },
        selectedScreen:(()=>{
          const node=selectedId ? graph.nodes.find(item=>item.id===selectedId) : null;
          const point=node ? renderedWorldPoint(node) : null;
          return point ? screenPoint(point) : null;
        })()
      }),
      destroy(){ finishEntrance(false); cancelInertia(); cancelZoomAnimation(); cancelEmphasisAnimation(); observer.disconnect(); }
    };
  }

  const api = { createGraphCanvas,POSITION_KEY,TYPE_COLORS,nodeInfluence,nodeRadius,nodeColor,labelPresentation,labelVerticalOffset,nodeScaleForZoom,entranceSpringProgress,hoverNodeScale,wheelDeltaPixels,wheelZoomTarget };
  global.WorkbenchGraphCanvas = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
