import {readPsd,initializeCanvas} from 'ag-psd';
import Papa from 'papaparse';
initializeCanvas((w,h)=>new OffscreenCanvas(w,h),(w,h)=>new ImageData(w,h));
self.onmessage=async({data})=>{
  try{
    if(data.type==='csv'){
      const parsed=Papa.parse(data.text,{skipEmptyLines:'greedy',delimiter:data.delimiter||''});
      if(parsed.errors.some(error=>error.type==='Quotes'))throw new Error('CSV 引号格式不正确');
      self.postMessage({rows:parsed.data});
    }else{
      const psd=readPsd(data.buffer,{skipLayerImageData:true,skipThumbnail:true,useImageData:true});
      const image=psd.imageData;
      if(!image)throw new Error('PSD 未保存合成预览图，请在 Photoshop 中启用最大兼容性后保存');
      const canvas=new OffscreenCanvas(image.width,image.height),context=canvas.getContext('2d');
      const pixels=image.data instanceof Uint8ClampedArray?image.data:Uint8ClampedArray.from(image.data,value=>image.data instanceof Float32Array?value*255:image.data instanceof Uint16Array?value/257:value);
      context.putImageData(new ImageData(pixels,image.width,image.height),0,0);
      self.postMessage({blob:await canvas.convertToBlob({type:'image/png'})});
    }
  }catch(error){self.postMessage({error:error.message});}
};
