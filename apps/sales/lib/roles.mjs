export const SALES_STAFF_ROLES = ["district_manager", "regional_manager", "salesperson", "production_agent"];
export function validStaffScope(role, districtKey, regionId) {
  if (!SALES_STAFF_ROLES.includes(role)) return false;
  return role === "regional_manager" ? !!regionId && !districtKey : !!districtKey && !regionId;
}
