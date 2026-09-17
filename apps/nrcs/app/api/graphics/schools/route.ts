import { NextResponse } from "next/server";
import { getCurrentNrcsStaff } from "@/lib/auth";
import { createNrcsServerClient } from "@/lib/server";
import { uploadGeneratedImage } from "@/lib/cloudinary";
import { composeCoopLogo, legacyLogoPng, validateSchoolPng } from "@/lib/schoolLogos";
import { COOP_RECIPE, UUID_PATTERN, type SchoolIdentity } from "@/lib/graphics";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const staff = await getCurrentNrcsStaff();
  if (!staff) return NextResponse.json({error:"Unauthorized"}, {status:401});
  if (staff.profile.role === "contributor") return NextResponse.json({error:"Editors/admins only."}, {status:403});
  try {
    const body = await request.json();
    const supabase = await createNrcsServerClient();
    if (body.operation === "district") {
      const ids = Array.isArray(body.schoolIds) ? [...new Set(body.schoolIds.map(String))] : [];
      if(ids.some(id=>!UUID_PATTERN.test(String(id))) || body.defaultId && !UUID_PATTERN.test(body.defaultId)) throw new Error("Invalid school selection.");
      const {error} = await supabase.rpc("nrcs_set_district_schools", {p_district:String(body.districtKey||""),p_schools:ids,p_default:body.defaultId||null});
      if(error) throw new Error(error.message);
      return NextResponse.json({ok:true});
    }
    const id = String(body.id || "");
    if(!UUID_PATTERN.test(id)) throw new Error("Invalid identity.");
    const {data:existing,error:existingError} = await supabase.from("nrcs_school_identities").select("*").eq("id",id).maybeSingle();
    if(existingError) throw new Error(existingError.message);
    const school = existing as SchoolIdentity | null;
    if(body.operation === "import") {
      if(!school?.legacy_logo_path) throw new Error("No original logo exists for this identity.");
      if(school.logo_url) return NextResponse.json({ok:true,school});
      const file = await legacyLogoPng(school);
      const uploaded = await uploadGeneratedImage(new Blob([new Uint8Array(file)],{type:"image/png"}),`krtr/schools/${id}/legacy`);
      const {data,error} = await supabase.from("nrcs_school_identities").update({logo_url:uploaded.url}).eq("id",id).select("*").single();
      if(error) throw new Error("Cloudinary upload succeeded; retry import to save the same logo. " + error.message);
      return NextResponse.json({ok:true,school:data});
    }
    if(body.operation !== "save" && body.operation !== "regenerate") throw new Error("Unknown action.");
    const kind = body.operation === "regenerate" ? school?.kind : body.kind;
    if(!["school","coop"].includes(kind) || school && kind !== school.kind) throw new Error("Identity type cannot be changed.");
    const name = String(body.name ?? school?.name ?? "").trim();
    const mascot = String(body.mascot ?? school?.mascot ?? "").trim();
    const displayName = String(body.displayName ?? school?.display_name ?? `${name} ${mascot}`).trim();
    if(!name || !mascot || !displayName || [name,mascot,displayName].some(value=>value.length>160)) throw new Error("Name, mascot, and display name are required (maximum 160 characters).");
    let logoUrl = String(body.logoUrl ?? school?.logo_url ?? "").trim() || null;
    let recipe = school?.composition_recipe || null;
    const primaryId = kind==="coop" ? String(body.primaryId || school?.primary_school_id || "") : null;
    const partnerId = kind==="coop" ? String(body.partnerId || school?.partner_school_id || "") : null;
    if(kind==="school") {
      if(!logoUrl && !school?.legacy_logo_path) throw new Error("A school logo is required.");
      if(logoUrl && logoUrl!==school?.logo_url) await validateSchoolPng(logoUrl);
    } else {
      if(!primaryId || !partnerId || !UUID_PATTERN.test(primaryId) || !UUID_PATTERN.test(partnerId) || primaryId===partnerId) throw new Error("Choose two different schools.");
      const {data:parents,error} = await supabase.from("nrcs_school_identities").select("*").in("id",[primaryId,partnerId]).eq("kind","school");
      if(error || parents?.length!==2) throw new Error("Co-ops must reference two school identities.");
      if(body.operation==="regenerate" || !school || primaryId!==school.primary_school_id || partnerId!==school.partner_school_id) {
        const requestId = String(body.requestId||"");
        if(!UUID_PATTERN.test(requestId)) throw new Error("Invalid generation request.");
        const primary = parents.find(row=>row.id===primaryId) as SchoolIdentity;
        const partner = parents.find(row=>row.id===partnerId) as SchoolIdentity;
        const png = await composeCoopLogo(primary,partner);
        const uploaded = await uploadGeneratedImage(new Blob([new Uint8Array(png)],{type:"image/png"}),`krtr/schools/${id}/${requestId}`);
        logoUrl=uploaded.url;
        recipe={...COOP_RECIPE,primary_school_id:primaryId,partner_school_id:partnerId,primary_logo:primary.logo_url||primary.legacy_logo_path,partner_logo:partner.logo_url||partner.legacy_logo_path,legacy_preserved:false};
      }
    }
    const payload = {id,name,mascot,display_name:displayName,kind,logo_url:logoUrl,legacy_logo_path:school?.legacy_logo_path||null,primary_school_id:primaryId,partner_school_id:partnerId,composition_recipe:recipe};
    const result = school
      ? await supabase.from("nrcs_school_identities").update(payload).eq("id",id).select("*").single()
      : await supabase.from("nrcs_school_identities").insert(payload).select("*").single();
    if(result.error) throw new Error(result.error.message);
    return NextResponse.json({ok:true,school:result.data});
  } catch(error) { return NextResponse.json({error:error instanceof Error ? error.message : "Unable to save school."},{status:400}); }
}
