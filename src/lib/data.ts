import { FILES_BUCKET, supabase } from "./supabase";
import type { Category, FileKind, Item, ItemFields, ItemFile, Location, Tag } from "./types";

const PAGE = 1000;

// Throws the Supabase error, if any, and returns the response data.
function check<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

export async function fetchLocations(hid: string): Promise<Location[]> {
  return check(await supabase.from("locations").select("*").eq("household_id", hid));
}

export async function fetchCategories(hid: string): Promise<Category[]> {
  return check(await supabase.from("categories").select("*").eq("household_id", hid).order("name"));
}

export async function fetchTags(hid: string): Promise<Tag[]> {
  return check(await supabase.from("tags").select("*").eq("household_id", hid).order("name"));
}

// Loads every item in the household, a page at a time (the API caps each
// response at 1000 rows).
export async function fetchItems(hid: string): Promise<Item[]> {
  const out: Item[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows: Item[] = check(
      await supabase
        .from("items")
        .select("*, item_tags(tag_id)")
        .eq("household_id", hid)
        .order("name")
        .order("id")
        .range(from, from + PAGE - 1),
    );
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export async function saveItem(
  hid: string,
  id: string | null,
  fields: ItemFields,
  tagIds: string[],
): Promise<string> {
  let itemId = id;
  if (itemId) {
    check(await supabase.from("items").update(fields).eq("id", itemId));
    check(await supabase.from("item_tags").delete().eq("item_id", itemId));
  } else {
    const row: { id: string } = check(
      await supabase.from("items").insert({ ...fields, household_id: hid }).select("id").single(),
    );
    itemId = row.id;
  }
  if (tagIds.length) {
    check(await supabase.from("item_tags").insert(tagIds.map((tag_id) => ({ item_id: itemId, tag_id }))));
  }
  return itemId!;
}

export async function deleteItems(ids: string[]) {
  if (!ids.length) return;
  const files: { storage_path: string }[] = check(
    await supabase.from("item_files").select("storage_path").in("item_id", ids),
  );
  if (files.length) {
    const { error } = await supabase.storage.from(FILES_BUCKET).remove(files.map((f) => f.storage_path));
    if (error) throw error;
  }
  check(await supabase.from("items").delete().in("id", ids));
}

export async function moveItems(ids: string[], locationId: string | null) {
  if (!ids.length) return;
  check(await supabase.from("items").update({ location_id: locationId }).in("id", ids));
}

export async function addTagToItems(ids: string[], tagId: string) {
  if (!ids.length) return;
  check(
    await supabase
      .from("item_tags")
      .upsert(ids.map((item_id) => ({ item_id, tag_id: tagId })), { ignoreDuplicates: true }),
  );
}

export async function saveLocation(
  hid: string,
  id: string | null,
  fields: { name: string; description: string | null; parent_id: string | null },
): Promise<string> {
  if (id) {
    check(await supabase.from("locations").update(fields).eq("id", id));
    return id;
  }
  const row: { id: string } = check(
    await supabase.from("locations").insert({ ...fields, household_id: hid }).select("id").single(),
  );
  return row.id;
}

export async function setLocationArchived(id: string, archived: boolean) {
  check(
    await supabase
      .from("locations")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id),
  );
}

// Items in the deleted location move up to its parent.
export async function deleteLocation(loc: Location) {
  check(await supabase.from("items").update({ location_id: loc.parent_id }).eq("location_id", loc.id));
  check(await supabase.from("locations").delete().eq("id", loc.id));
}

export async function createCategory(hid: string, name: string): Promise<Category> {
  return check(await supabase.from("categories").insert({ household_id: hid, name }).select().single());
}

export async function createTag(hid: string, name: string, color?: string): Promise<Tag> {
  return check(
    await supabase
      .from("tags")
      .insert({ household_id: hid, name, ...(color ? { color } : {}) })
      .select()
      .single(),
  );
}

export async function fetchItemFiles(itemId: string): Promise<ItemFile[]> {
  return check(await supabase.from("item_files").select("*").eq("item_id", itemId).order("created_at"));
}

function safeFileName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_").slice(-100) || "file";
}

export async function uploadItemFile(hid: string, itemId: string, kind: FileKind, file: File) {
  const path = `${hid}/${itemId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage
    .from(FILES_BUCKET)
    .upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  const res = await supabase.from("item_files").insert({
    household_id: hid,
    item_id: itemId,
    kind,
    storage_path: path,
    file_name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
  });
  if (res.error) {
    await supabase.storage.from(FILES_BUCKET).remove([path]);
    throw res.error;
  }
}

export async function deleteItemFile(f: ItemFile) {
  const { error } = await supabase.storage.from(FILES_BUCKET).remove([f.storage_path]);
  if (error) throw error;
  check(await supabase.from("item_files").delete().eq("id", f.id));
}

export async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!paths.length) return map;
  const { data, error } = await supabase.storage.from(FILES_BUCKET).createSignedUrls(paths, 60 * 60);
  if (error) throw error;
  for (const d of data ?? []) if (d.signedUrl && d.path) map.set(d.path, d.signedUrl);
  return map;
}
