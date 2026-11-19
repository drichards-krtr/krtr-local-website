import {getSalesIdentity} from "@/lib/auth";
import {createSalesAdminClient} from "@/lib/admin";
import {uploadRecipe,verifiedCloudinaryResource,privateImageBytes} from "@/lib/asset-media";
import {inspectAssetImage} from "@/lib/asset-media-core.mjs";
export const runtime="nodejs";
export async function POST(request:Request){
 const identity=await getSalesIdentity();if(!identity)return Response.json({error:"Sign in with active Sales access."},{status:401});
 const raw=await request.text();if(raw.length>4000)return Response.json({error:"Upload request too large."},{status:413});
 let input;try{input=JSON.parse(raw);}catch{return Response.json({error:"Invalid upload request."},{status:400});}
 const {supabase,user}=identity;
 try{
 if(input.action==="begin"){
 const {data,error}=await supabase.rpc("sales_begin_asset_upload",{p_asset:input.assetId,p_purpose:input.purpose,p_id:input.uploadId});if(error)return Response.json({error:error.message},{status:403});
 return Response.json(uploadRecipe(data),{headers:{"Cache-Control":"no-store"}});
 }
 if(input.action!=="complete")return Response.json({error:"Unknown upload action."},{status:400});
 const {data:u,error}=await supabase.from("sales_media_uploads").select("asset_id,public_id,purpose").eq("id",input.uploadId).eq("actor_id",user.id).single();if(error)return Response.json({error:"Upload unavailable."},{status:403});
 const {data:a,error:assetError}=await supabase.from("sales_assets").select("kind").eq("id",u.asset_id).single();if(assetError)return Response.json({error:"Asset unavailable."},{status:403});
 const resource=await verifiedCloudinaryResource(u.public_id);const bytes=await privateImageBytes(u.public_id,resource.format);const m=await inspectAssetImage(bytes,a.kind,u.purpose);
 const {data:id,error:registrationError}=await createSalesAdminClient().rpc("sales_register_asset_media",{p_upload:input.uploadId,p_actor:user.id,p_cloudinary_id:resource.asset_id,p_cloudinary_version:String(resource.version),p_format:m.format,p_width:m.width,p_height:m.height,p_transparent:m.transparent,p_sha256:m.sha256});if(registrationError)return Response.json({error:registrationError.message},{status:400});
 return Response.json({id},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:"Upload failed. Retry with the same file or contact your salesperson."},{status:400});}
}
