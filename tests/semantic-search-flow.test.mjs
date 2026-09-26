import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";

const require=createRequire(import.meta.url);
const {queryEligibility,createLoadOnce,createCoordinator}=require("../semantic-search-flow.js");

assert.equal(queryEligibility("8798789784").eligible,false);
assert.equal(queryEligibility("abc8798789784").eligible,false);
assert.equal(queryEligibility("UE5建模").eligible,true);

const appSource=await readFile(new URL("../app.js",import.meta.url),"utf8");
assert.doesNotMatch(appSource,/setTimeout\(warmSemanticSearch/,"启动代码不得保留定时语义预热");
assert.match(appSource,/hydrateDesktopState\(\);/,"启动时只恢复桌面状态");

let loads=0;
let releaseLoad;
const loader=createLoadOnce(()=>{loads+=1;return new Promise(resolve=>{releaseLoad=resolve;});});
const firstLoad=loader.prepare();
const concurrentLoad=loader.prepare();
assert.equal(firstLoad,concurrentLoad,"并发准备必须复用同一个 Promise");
assert.equal(loads,0,"加载应异步开始，避免阻塞当前事件");
await Promise.resolve();
assert.equal(loads,1);
releaseLoad({ok:true});
await firstLoad;
await loader.prepare();
assert.equal(loads,1,"模型就绪后不得重复加载");

const calls=[];
const events=[];
let releaseWarm;
const coordinator=createCoordinator({
  search:async options=>{
    calls.push(`${options.mode}:${options.query}`);
    return {engine:options.mode,count:1,results:[{id:options.query}]};
  },
  warm:()=>new Promise(resolve=>{releaseWarm=resolve;}),
  onExact:(result,options)=>events.push(`exact:${options.query}:${result.results[0].id}`),
  onPreparing:(_result,options)=>events.push(`preparing:${options.query}`),
  onHybrid:(result,options)=>events.push(`hybrid:${options.query}:${result.results[0].id}`),
  onLoadError:(error,exact,options)=>events.push(`load-error:${options.query}:${exact.results[0].id}:${error.message}`)
});

const oldQuery=coordinator.run({mode:"hybrid",query:"旧查询"});
await Promise.resolve();
await Promise.resolve();
assert.deepEqual(events,["exact:旧查询:旧查询","preparing:旧查询"],"必须先显示精确结果再等待模型");
const latestQuery=coordinator.run({mode:"hybrid",query:"最新查询"});
await Promise.resolve();
await Promise.resolve();
releaseWarm({ok:true});
await Promise.all([oldQuery,latestQuery]);
assert.ok(!events.some(event=>event.startsWith("hybrid:旧查询")),"旧查询不能覆盖新查询");
assert.ok(events.includes("hybrid:最新查询:最新查询"));
assert.equal(calls.filter(call=>call.startsWith("hybrid:")).length,1,"模型完成后只执行最新语义查询");

const beforeInvalid=calls.length;
await coordinator.run({mode:"hybrid",query:"8798789784"});
assert.deepEqual(calls.slice(beforeInvalid),["exact:8798789784"],"无意义编号只允许精确检索");

let failingLoads=0;
let retainedExact=false;
const failing=createCoordinator({
  search:async options=>({engine:options.mode,count:1,results:[{id:"exact-result"}]}),
  warm:async()=>{failingLoads+=1;throw new Error("模型不可用");},
  onExact:()=>{retainedExact=true;},
  onLoadError:(error,exact)=>{
    assert.equal(error.message,"模型不可用");
    assert.equal(exact.results[0].id,"exact-result");
  }
});
await failing.run({mode:"hybrid",query:"人物建模"});
await failing.run({mode:"hybrid",query:"角色雕塑"});
assert.equal(retainedExact,true);
assert.equal(failingLoads,1,"失败的初始化在本次运行中也不得并发或重复触发");

let exactOnlyLoads=0;
const exactOnly=createCoordinator({
  search:async options=>({engine:options.mode,count:0,results:[]}),
  warm:async()=>{exactOnlyLoads+=1;}
});
await exactOnly.run({mode:"exact",query:"人物建模"});
await exactOnly.run({mode:"hybrid",query:"8798789784"});
assert.equal(exactOnlyLoads,0,"精确检索和无意义编号不得加载模型");

const modeEvents=[];
let releaseModeWarm;
const modeSwitch=createCoordinator({
  search:async options=>({engine:options.mode,count:1,results:[{id:options.query}]}),
  warm:()=>new Promise(resolve=>{releaseModeWarm=resolve;}),
  onExact:(_result,options)=>modeEvents.push(`exact:${options.query}`),
  onHybrid:(_result,options)=>modeEvents.push(`hybrid:${options.query}`)
});
const pendingHybrid=modeSwitch.run({mode:"hybrid",query:"等待中的语义查询"});
await Promise.resolve();
await Promise.resolve();
await modeSwitch.run({mode:"exact",query:"切回精确"});
releaseModeWarm({ok:true});
await pendingHybrid;
assert.ok(modeEvents.includes("exact:切回精确"));
assert.ok(!modeEvents.includes("hybrid:等待中的语义查询"),"切回精确模式后旧语义结果不得写回");

console.log("semantic search flow tests passed");
