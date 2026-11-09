import {IMAGE_LIMITS} from '../lib/site-defaults.mjs';
export async function prepareImage(file:File,slot:string){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('PNG·JPG·WebP 사진만 선택해주세요. SVG 파일은 사용할 수 없습니다.');
 if(file.size>10*1024*1024)throw new Error('원본 사진은 10MB 이하로 준비해주세요.');
 const url=URL.createObjectURL(file),image=new Image();image.src=url;
 try{
  await image.decode();if(!image.naturalWidth||!image.naturalHeight)throw new Error('사진을 읽지 못했습니다. 다른 파일을 선택해주세요.');
  const maximum=slot==='campus'?1920:slot==='wordmark'||slot==='catalog'?1200:640;
  let scale=Math.min(1,maximum/image.naturalWidth,(slot==='wordmark'?640:maximum)/image.naturalHeight);
  const canvas=document.createElement('canvas');let blob:Blob|null=null;
  for(let step=0;step<6;step++){
   canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   const context=canvas.getContext('2d');if(!context)throw new Error('이 브라우저에서는 사진 변환을 사용할 수 없습니다.');context.drawImage(image,0,0,canvas.width,canvas.height);
   blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',Math.max(.55,.9-step*.07)));
   if(blob&&blob.size<=(IMAGE_LIMITS[slot]||196608))break;scale*=.8;
  }
  if(!blob||blob.size>(IMAGE_LIMITS[slot]||196608))throw new Error('사진 크기를 줄이지 못했습니다. 더 작은 사진을 선택해주세요.');
  const bytes=new Uint8Array(await blob.arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return{mime:blob.type,base64:btoa(raw)};
 }finally{URL.revokeObjectURL(url)}
}
