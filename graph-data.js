(function (global) {
  "use strict";

  const GRAPH_TYPES = new Set(["project","knowledge","source"]);
  const REFERENCE_FIELDS = ["sourceRefs","relatedRefs","projectRefs"];

  function buildGraph(state = {}) {
    const entries = Array.isArray(state.entries) ? state.entries : [];
    const tombstoneIds = new Set((state.tombstones || []).map(item => item.id));
    const areas = new Map(entries
      .filter(entry => entry.type === "area" && !entry.deletedAt && !tombstoneIds.has(entry.id))
      .map(entry => [entry.id,{ id:entry.id,title:String(entry.title || "未命名领域") }]));
    const nodes = entries
      .filter(entry => GRAPH_TYPES.has(entry.type) && !entry.deletedAt && !tombstoneIds.has(entry.id))
      .map(entry => ({
        id:String(entry.id),
        type:entry.type,
        title:String(entry.title || "未命名内容"),
        areaIds:[...new Set((entry.areaRefs || []).filter(id => areas.has(id)))],
        areas:(entry.areaRefs || []).map(id => areas.get(id)).filter(Boolean)
      }));
    const nodeIds = new Set(nodes.map(node => node.id));
    const edgeMap = new Map();
    const incomingSources = new Map(nodes.map(node => [node.id,new Set()]));
    entries.forEach(entry => {
      if (!nodeIds.has(entry.id)) return;
      REFERENCE_FIELDS.forEach(field => {
        (entry[field] || []).forEach(targetId => {
          if (!nodeIds.has(targetId) || targetId === entry.id) return;
          incomingSources.get(String(targetId)).add(String(entry.id));
          const [source,target] = [String(entry.id),String(targetId)].sort((a,b) => a.localeCompare(b));
          const key = `${source}\0${target}`;
          if (!edgeMap.has(key)) edgeMap.set(key,{ id:key,source,target,kinds:[] });
          const edge = edgeMap.get(key);
          if (!edge.kinds.includes(field)) edge.kinds.push(field);
        });
      });
    });
    const edges = [...edgeMap.values()];
    const neighbors = new Map(nodes.map(node => [node.id,new Set()]));
    edges.forEach(edge => {
      neighbors.get(edge.source).add(edge.target);
      neighbors.get(edge.target).add(edge.source);
    });
    return {
      nodes:nodes.map(node => ({
        ...node,
        incomingCount:incomingSources.get(node.id).size,
        connectionCount:neighbors.get(node.id).size
      })),
      edges,
      areas:[...areas.values()]
    };
  }

  function filterGraph(graph, { types,areaId } = {}) {
    const allowedTypes = types instanceof Set ? types : new Set(Array.isArray(types) && types.length ? types : GRAPH_TYPES);
    const nodes = graph.nodes.filter(node => allowedTypes.has(node.type) && (!areaId || node.areaIds.includes(areaId)));
    const ids = new Set(nodes.map(node => node.id));
    return { ...graph,nodes,edges:graph.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
  }

  function neighborIds(graph,id) {
    const neighbors = new Set();
    graph.edges.forEach(edge => {
      if (edge.source === id) neighbors.add(edge.target);
      if (edge.target === id) neighbors.add(edge.source);
    });
    return neighbors;
  }

  function findNodeByTitle(graph,query) {
    const needle = String(query || "").trim().toLocaleLowerCase();
    if (!needle) return null;
    return graph.nodes
      .map(node => {
        const title = node.title.toLocaleLowerCase();
        const score = title === needle ? 0 : title.startsWith(needle) ? 1 : title.includes(needle) ? 2 : 99;
        return { node,score };
      })
      .filter(item => item.score < 99)
      .sort((a,b) => a.score - b.score || a.node.title.localeCompare(b.node.title,"zh-CN"))[0]?.node || null;
  }

  function directRelations(graph,id) {
    const ids = neighborIds(graph,id);
    const byId = new Map(graph.nodes.map(node => [node.id,node]));
    return [...ids].map(neighborId => byId.get(neighborId)).filter(Boolean);
  }

  const api = { GRAPH_TYPES,REFERENCE_FIELDS,buildGraph,filterGraph,neighborIds,findNodeByTitle,directRelations };
  global.WorkbenchGraphData = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
