const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function fields(timestamp){return Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map(p=>[p.type,p.value]));}
export function centralTimestamp(value){
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);if(!match)throw new Error('Choose a complete Central date and time.');
 const [,y,m,d,h,min]=match;const target=Date.UTC(+y,+m-1,+d,+h,+min);let candidate=target;
 for(let n=0;n<4;n++){const p=fields(candidate);const rendered=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);candidate+=target-rendered;}
 const same=t=>{const p=fields(t);return p.year===y&&p.month===m&&p.day===d&&p.hour===h&&p.minute===min;};
 if(!same(candidate)||same(candidate-3600000)||same(candidate+3600000))throw new Error('That Central time is missing or ambiguous because of DST. Choose another time.');
 return new Date(candidate).toISOString();
}
