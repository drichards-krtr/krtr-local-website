export function centsFromInput(value) {
 const match=/^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value).trim());
 if(!match)throw new Error("Enter a nonnegative amount with at most two decimal places.");
 const cents=BigInt(match[1])*100n+BigInt((match[2]||"").padEnd(2,"0"));
 if(cents>BigInt(Number.MAX_SAFE_INTEGER))throw new Error("Amount exceeds the currency-safe range.");return Number(cents);
}
export function percentToBps(value){const bps=centsFromInput(value);if(bps>10000)throw new Error("Tax percentage must be between 0 and 100.");return bps;}
export function sumCents(rows,key){return rows.reduce((sum,row)=>sum+BigInt(row[key]||0),0n);}
export function money(value){if(value===null||value===undefined)return "Not configured";const cents=BigInt(value);const negative=cents<0n;const abs=negative?-cents:cents;return (negative?"-$":"$")+new Intl.NumberFormat("en-US").format(abs/100n)+"."+String(abs%100n).padStart(2,"0");}
export function centralTime(value){return value?new Date(value).toLocaleString("en-US",{timeZone:"America/Chicago",dateStyle:"medium",timeStyle:"short"})+" Central":"Unavailable";}
export const warningLabels={tax_not_configured:"Manager must configure tax treatment",past_launch_date:"Launch date has passed",short_production_lead_time:"Production-input lead time needs scoped approval",specials_holiday_deadline_review:"Specials deadline falls on a non-business day; explicit review required",studio_shows_not_linked:"Link the actual studio to its shows"};
