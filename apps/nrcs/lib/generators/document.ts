import generic from "./generic";
import sports from "./sports";
import weather from "./weather";
import type { GraphicBuilder, SchoolIdentity } from "../graphics";

function scriptJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
// Retain the original drawing functions. Only host integration, loading, and export handling change.
export function generatorDocument(builder: GraphicBuilder, schools: SchoolIdentity[], defaultId: string | null) {
  let source = { generic, sports, weather }[builder];
  if (builder === "sports") {
    const map = Object.fromEntries(schools.map(school => [school.display_name, school.logo_url || school.legacy_logo_path || ""]));
    const defaultName = schools.find(school => school.id === defaultId)?.display_name || schools[0]?.display_name || "";
    source = source.replace('<script src="config.js"></script>', `<script>window.KRTR_SCHOOL_MASCOTS=${scriptJson(map)};window.KRTR_SCHOOL_ALIASES={};</script>`)
      .replace('const PRIMARY_DEFAULT = "Union Knights";', `const PRIMARY_DEFAULT = ${scriptJson(defaultName)};`)
      .replace('loadImage("mascots/"+file)', "loadImage(file)")
      .replace("img.src=src;", 'img.crossOrigin="anonymous"; img.src=src;');
  }
  if (builder === "weather") source = source.replace(/https:\/\/www.weather.gov\/images\/nws\/newicons\/([a-z]+)\.png/g, "/api/graphics/weather-icon?name=$1");
  source = source.replace(/(async )?function draw\(\)/, "$1function renderOriginal()");
  const queue = `
let renderQueue = Promise.resolve();
function draw() {
  const next = renderQueue.then(() => renderOriginal());
  renderQueue = next.catch(error => console.error("Graphic rendering failed", error));
  return next;
}
`;
  source = source.replace('canvas.getContext("2d");', 'canvas.getContext("2d");' + queue);
  const guideStart = builder === "generic" ? "exporting=true;" : "";
  const guideEnd = builder === "generic" ? "exporting=false; await draw();" : "";
  const bridge = `
<script>
const parentOrigin = window.parent.location.origin;
async function captureGraphic() {
  ${guideStart}
  try {
    await draw();
    const blob = await new Promise((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not create PNG.")), "image/png"));
    const settings = {};
    document.querySelectorAll("input,select,textarea").forEach(field => { if(field.id) settings[field.id] = field.type === "checkbox" ? field.checked : field.value; });
    ${builder === "sports" ? 'settings.mode=mode; settings.site=site;' : ""}
    ${builder === "generic" ? 'settings.theme=theme; settings.reservePhoto=reservePhoto;' : ""}
    return { blob, settings };
  } finally { ${guideEnd} }
}
const exportButton = document.getElementById("export");
const oldExportButton = exportButton.cloneNode(true);
exportButton.replaceWith(oldExportButton);
oldExportButton.textContent = "Download PNG";
oldExportButton.addEventListener("click", async () => {
  oldExportButton.disabled = true;
  try {
    const {blob} = await captureGraphic();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "krtr-${builder}-" + canvas.width + "x" + canvas.height + ".png";
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    window.parent.postMessage({ type: "graphic-status", message: "PNG downloaded." }, parentOrigin);
  } catch(error) { window.parent.postMessage({type:"graphic-error", message:error.message}, parentOrigin); }
  finally { oldExportButton.disabled = false; }
});
window.addEventListener("message", async event => {
  if(event.source !== window.parent || event.origin !== parentOrigin || event.data?.type !== "capture-graphic") return;
  try { window.parent.postMessage({type:"graphic-captured", ...(await captureGraphic())}, parentOrigin); }
  catch(error) { window.parent.postMessage({type:"graphic-error", message:error.message}, parentOrigin); }
});
</script>`;
  source = source.replace("</body>", bridge + "</body>");
  // These host UI changes do not alter canvas drawing coordinates, colors, or typography.
  source = source.replace(/<p class="intro">[\s\S]*?<\/p>/, "")
    .replace(/<p>Enter the forecast[\s\S]*?<\/p>/, "")
    .replace(/<div class="note">[\s\S]*?<\/div>/g, "")
    .replace("</style>", ".section{border-radius:8px} canvas{width:100%;height:auto;object-fit:contain} @media(max-width:600px){.controls{padding:12px}.row{grid-template-columns:1fr}.previewWrap{padding:12px}} </style>");
  return source;
}
