import type { Location } from "./types";

export const PATH_SEPARATOR = " → ";

export function childrenByParent(locations: Location[]) {
  const map = new Map<string | null, Location[]>();
  for (const loc of locations) {
    const list = map.get(loc.parent_id) ?? [];
    list.push(loc);
    map.set(loc.parent_id, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return map;
}

export function locationPath(id: string | null, byId: Map<string, Location>): string {
  const names: string[] = [];
  let cur = id ? byId.get(id) : undefined;
  let guard = 0;
  while (cur && guard++ < 100) {
    names.unshift(cur.name);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return names.join(PATH_SEPARATOR);
}

// The id itself plus every location nested below it.
export function descendantIds(id: string, children: Map<string | null, Location[]>): Set<string> {
  const out = new Set<string>([id]);
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const child of children.get(cur) ?? []) {
      if (!out.has(child.id)) {
        out.add(child.id);
        stack.push(child.id);
      }
    }
  }
  return out;
}

// Locations that are archived themselves or sit inside an archived location.
export function archivedIds(locations: Location[], byId: Map<string, Location>): Set<string> {
  const out = new Set<string>();
  for (const loc of locations) {
    let cur: Location | undefined = loc;
    let guard = 0;
    while (cur && guard++ < 100) {
      if (cur.archived_at) {
        out.add(loc.id);
        break;
      }
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
  }
  return out;
}

// Locations in tree order with their depth, for indented <select> options.
// Locations in `skip` (and everything below them) are left out.
export function flattenTree(children: Map<string | null, Location[]>, skip?: Set<string>) {
  const out: { loc: Location; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const loc of children.get(parent) ?? []) {
      if (skip?.has(loc.id)) continue;
      out.push({ loc, depth });
      walk(loc.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
