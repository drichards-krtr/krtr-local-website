import {createHash} from 'node:crypto';
import sharp from 'sharp';
export const MAX_ASSET_BYTES=8*1024*1024;
export function cloudinaryCredentials(env){
 const clean=x=>(x||'').trim().replace(/^["'`]+|["'`]+$/g,'');let url;
 try{const parsed=new URL(clean(env.CLOUDINARY_URL));if(parsed.protocol==='cloudinary:')url=parsed;}catch{}
 const cloudName=clean(env.CLOUDINARY_CLOUD_NAME)||url?.hostname;const apiKey=clean(env.CLOUDINARY_API_KEY)||(url?decodeURIComponent(url.username):'');const apiSecret=clean(env.CLOUDINARY_API_SECRET)||(url?decodeURIComponent(url.password):'');
 if(!cloudName||!/^[a-zA-Z0-9_-]+$/.test(cloudName)||!apiKey||!apiSecret)throw new Error('Configure the shared Cloudinary account on Sales first.');
 return {cloudName,apiKey,apiSecret};
}
export function signCloudinary(parameters,secret){return createHash('sha256').update(Object.keys(parameters).filter(k=>parameters[k]!==undefined).sort().map(k=>k+'='+parameters[k]).join('&')+secret).digest('hex');}
export function privateImageUrl(credentials,publicId,format,now=Date.now()){
 const params={public_id:publicId,format,type:'authenticated',timestamp:String(Math.floor(now/1000)),expires_at:String(Math.floor(now/1000)+120),attachment:'false'};
 return `https://api.cloudinary.com/v1_1/${credentials.cloudName}/image/download?`+new URLSearchParams({...params,api_key:credentials.apiKey,signature:signCloudinary(params,credentials.apiSecret)});
}
export async function inspectAssetImage(bytes,kind,purpose='artwork'){
 if(!bytes.length||bytes.length>MAX_ASSET_BYTES)throw new Error('Choose an image up to 8 MB.');
 const input=sharp(bytes,{limitInputPixels:16000000,failOn:'warning'});const m=await input.metadata();
 if(!['png','jpeg','webp'].includes(m.format)||!m.width||!m.height||(m.pages||1)>1)throw new Error('Use a static PNG, JPEG or WebP image.');
 const stats=await input.stats();const transparent=!!m.hasAlpha&&!stats.isOpaque;
 const dimensions={banner:[1800,200],display:[1080,1160],social:[1080,1080],logo:[500,500]};
 const expected=dimensions[kind];if(purpose==='artwork'&&(!expected||m.width!==expected[0]||m.height!==expected[1]||(kind==='logo'&&!transparent)))throw new Error('Artwork must match its required source dimensions; logo bugs need a transparent background.');
 return {format:m.format==='jpeg'?'jpg':m.format,width:m.width,height:m.height,transparent,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export async function boundedImageBytes(response){
 if(!response.ok||!response.body)throw new Error('Private image could not be retrieved.');
 const reader=response.body.getReader();const chunks=[];let length=0;
 for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>MAX_ASSET_BYTES){await reader.cancel();throw new Error('Image exceeds 8 MB.');}chunks.push(value);}
 return Buffer.concat(chunks);
}
