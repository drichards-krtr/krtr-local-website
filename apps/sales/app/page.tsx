import { redirect } from "next/navigation";
import { getSalesSupabaseEnv } from "@/lib/env";
export default function Home() { redirect(getSalesSupabaseEnv() ? "/dashboard" : "/setup"); }
