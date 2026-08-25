import { NextResponse } from "next/server";

export type NrcsApiReceipt = {
  ok: boolean;
  requestId: string;
  status: "accepted" | "rejected" | "failed";
  message?: string;
};

export function createNrcsRequestId(prefix = "nrcs") {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function nrcsJson(receipt: NrcsApiReceipt, init?: ResponseInit) {
  return NextResponse.json(receipt, init);
}
