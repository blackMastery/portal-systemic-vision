import { createClient } from "@supabase/supabase-js";

export type Landmark = {
  name: string;
  aliases: string[];
  lat: number;
  lng: number;
  area: string;
  zone: string;
};

const CACHE_TTL_MS = 60_000;

let cachedList: Landmark[] | null = null;
let cachedAt = 0;

export async function fetchLandmarksCached(): Promise<Landmark[]> {
  const now = Date.now();
  if (cachedList !== null && now - cachedAt < CACHE_TTL_MS) {
    return cachedList;
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for cost-estimate landmarks",
    );
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .from("cost_estimate_landmarks")
    .select("name, aliases, lat, lng, area, zone_code");

  if (error) {
    throw new Error(`Landmarks load failed: ${error.message}`);
  }

  const rows = data ?? [];
  const list: Landmark[] = rows.map((row) => ({
    name: row.name as string,
    aliases: (row.aliases as string[]) ?? [],
    lat: row.lat as number,
    lng: row.lng as number,
    area: row.area as string,
    zone: row.zone_code as string,
  }));

  cachedList = list;
  cachedAt = now;
  return list;
}
