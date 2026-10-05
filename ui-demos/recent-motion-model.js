export const controls=[
 {key:'downMs',label:'向下单张用时',min:250,max:1200,step:5,value:470,unit:'ms',group:'翻页速度'},
 {key:'upMs',label:'向上单张用时',min:250,max:1200,step:5,value:420,unit:'ms',group:'翻页速度'},
 {key:'maxAcceleration',label:'最大加速倍率',min:1,max:2,step:.05,value:2,unit:'倍',group:'翻页速度'},
 {key:'responseMs',label:'跟随响应时间',min:5,max:100,step:1,value:5,unit:'ms',group:'响应与停止'},
 {key:'settleMs',label:'回落响应时间',min:10,max:100,step:1,value:10,unit:'ms',group:'响应与停止'},
 {key:'idleMs',label:'停止判定时间',min:30,max:250,step:5,value:35,unit:'ms',group:'响应与停止'},
 {key:'sensitivity',label:'滚动灵敏度',min:.3,max:2,step:.05,value:1.6,unit:'倍',group:'滚轮阈值'},
 {key:'gestureLimit',label:'一次连续滚动最多翻页',min:1,max:6,step:1,value:1,unit:'张',group:'滚轮阈值'},
 {key:'gestureGapMs',label:'两次动作的分隔时间',min:100,max:500,step:10,value:120,unit:'ms',group:'滚轮阈值'},
 {key:'notchThreshold',label:'滚轮单格识别阈值',min:10,max:100,step:5,value:30,unit:'',group:'滚轮阈值'},
 {key:'escapePadding',label:'卡片抽出额外距离',min:0,max:150,step:2,value:14,unit:'px',group:'动作幅度'},
 {key:'tilt',label:'抬起倾斜幅度',min:0,max:12,step:.25,value:10,unit:'°',group:'动作幅度'}
];
export const defaults=Object.fromEntries(controls.map(c=>[c.key,c.value]));
export function validate(value){return Object.fromEntries(controls.map(c=>{
 const number=Number(value?.[c.key]);return [c.key,Number.isFinite(number)?Math.max(c.min,Math.min(c.max,number)):c.value];
}));}
