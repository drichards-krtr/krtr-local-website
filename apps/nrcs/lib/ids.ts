export const NRCS_ID_PREFIXES = {
  story: "story",
  copyStream: "copy_stream",
  copyVersion: "copy_version",
  webOutput: "web_output",
  program: "program",
  edition: "edition",
  rundown: "rundown",
  asset: "asset",
  source: "source",
  tag: "tag",
  followUp: "follow_up",
  wake: "wake",
} as const;

export type NrcsIdKind = keyof typeof NRCS_ID_PREFIXES;

export function createNrcsId(kind: NrcsIdKind) {
  return `${NRCS_ID_PREFIXES[kind]}_${crypto.randomUUID()}`;
}
