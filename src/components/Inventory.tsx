"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCategories, fetchItems, fetchLocations, fetchTags } from "@/lib/data";
import { errorMessage } from "@/lib/format";
import { childrenByParent, descendantIds, locationPath } from "@/lib/tree";
import type { Category, Household, Item, Location, Selection, Tag } from "@/lib/types";
import ItemDetail from "./ItemDetail";
import ItemForm from "./ItemForm";
import ItemList from "./ItemList";
import LocationForm from "./LocationForm";
import Settings from "./Settings";
import Sidebar, { type SidebarMode } from "./Sidebar";

export type InventoryData = {
  household: Household;
  locations: Location[];
  categories: Category[];
  tags: Tag[];
  items: Item[];
  locationById: Map<string, Location>;
  children: Map<string | null, Location[]>;
  categoryById: Map<string, Category>;
  tagById: Map<string, Tag>;
};

type Pane = "sidebar" | "list" | "detail";

type ItemFormState = { id: string | null; preset?: Partial<Item> };
type LocationFormState = { location: Location | null; parentId: string | null };

export default function Inventory({
  household,
  households,
  userId,
  email,
  onSwitchHousehold,
  onHouseholdsChanged,
}: {
  household: Household;
  households: Household[];
  userId: string;
  email: string;
  onSwitchHousehold: (id: string) => void;
  onHouseholdsChanged: () => void;
}) {
  const hid = household.id;
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mode, setMode] = useState<SidebarMode>("locations");
  const [selection, setSelection] = useState<Selection>({ kind: "all" });
  const [includeSub, setIncludeSub] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [pane, setPane] = useState<Pane>("sidebar");

  const [itemForm, setItemForm] = useState<ItemFormState | null>(null);
  const [locationForm, setLocationForm] = useState<LocationFormState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const reload = useCallback(
    async (what: { locations?: boolean; categories?: boolean; tags?: boolean; items?: boolean } = {}) => {
      const all = Object.keys(what).length === 0;
      try {
        await Promise.all([
          (all || what.locations) && fetchLocations(hid).then(setLocations),
          (all || what.categories) && fetchCategories(hid).then(setCategories),
          (all || what.tags) && fetchTags(hid).then(setTags),
          (all || what.items) && fetchItems(hid).then(setItems),
        ]);
        setLoadError(null);
      } catch (e) {
        setLoadError(errorMessage(e));
      } finally {
        setLoaded(true);
      }
    },
    [hid],
  );

  useEffect(() => {
    // Loads asynchronously; state is only set once the requests return.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  // Pick up changes made on other devices when the tab regains focus.
  useEffect(() => {
    const onFocus = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [reload]);

  const data: InventoryData = useMemo(
    () => ({
      household,
      locations,
      categories,
      tags,
      items,
      locationById: new Map(locations.map((l) => [l.id, l])),
      children: childrenByParent(locations),
      categoryById: new Map(categories.map((c) => [c.id, c])),
      tagById: new Map(tags.map((t) => [t.id, t])),
    }),
    [household, locations, categories, tags, items],
  );

  const searching = query.trim().length > 0;

  const { listItems, title } = useMemo(() => {
    if (searching) {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      const hay = (it: Item) =>
        [
          it.name,
          it.description,
          it.notes,
          it.brand,
          it.model,
          it.serial_number,
          it.barcode,
          it.purchased_from,
          locationPath(it.location_id, data.locationById),
          it.category_id ? data.categoryById.get(it.category_id)?.name : "",
          ...it.item_tags.map((t) => data.tagById.get(t.tag_id)?.name),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
      return {
        listItems: items.filter((it) => {
          const h = hay(it);
          return words.every((w) => h.includes(w));
        }),
        title: `Search: “${query.trim()}”`,
      };
    }
    switch (selection.kind) {
      case "all":
        return { listItems: items, title: "All items" };
      case "location": {
        if (selection.id === null) {
          return { listItems: items.filter((i) => !i.location_id), title: "(unspecified)" };
        }
        const ids = includeSub ? descendantIds(selection.id, data.children) : new Set([selection.id]);
        return {
          listItems: items.filter((i) => i.location_id && ids.has(i.location_id)),
          title: data.locationById.get(selection.id)?.name ?? "Location",
        };
      }
      case "category":
        return {
          listItems: items.filter((i) => i.category_id === selection.id),
          title: selection.id ? (data.categoryById.get(selection.id)?.name ?? "Category") : "(no category)",
        };
      case "tag":
        return {
          listItems: items.filter((i) => i.item_tags.some((t) => t.tag_id === selection.id)),
          title: data.tagById.get(selection.id)?.name ?? "Tag",
        };
    }
  }, [searching, query, selection, includeSub, items, data]);

  const selectedItem = items.find((i) => i.id === selectedItemId) ?? null;

  function select(sel: Selection) {
    setSelection(sel);
    setQuery("");
    setPane("list");
  }

  function openItem(id: string) {
    setSelectedItemId(id);
    setPane("detail");
  }

  function addItem() {
    const preset: Partial<Item> = { currency: household.default_currency };
    if (!searching) {
      if (selection.kind === "location") preset.location_id = selection.id;
      if (selection.kind === "category") preset.category_id = selection.id;
      if (selection.kind === "tag") preset.item_tags = [{ tag_id: selection.id }];
    }
    setItemForm({ id: null, preset });
  }

  const currentLocation =
    !searching && selection.kind === "location" && selection.id ? data.locationById.get(selection.id) : undefined;

  if (!loaded) {
    return <div className="flex h-full items-center justify-center text-muted">Loading inventory…</div>;
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <div className={`${pane === "sidebar" ? "flex" : "hidden"} w-full shrink-0 md:flex md:w-72 lg:w-80`}>
        <Sidebar
          data={data}
          mode={mode}
          onModeChange={setMode}
          selection={searching ? null : selection}
          onSelect={select}
          query={query}
          onQuery={(q) => {
            setQuery(q);
            if (q) setPane("list");
          }}
          onAddLocation={(parentId) => setLocationForm({ location: null, parentId })}
          onEditLocation={(loc) => setLocationForm({ location: loc, parentId: loc.parent_id })}
          onSettings={() => setSettingsOpen(true)}
        />
      </div>

      <div className={`${pane === "list" ? "flex" : "hidden"} w-full shrink-0 md:flex md:w-80 lg:w-96`}>
        <ItemList
          data={data}
          title={title}
          items={listItems}
          showPaths={searching || selection.kind !== "location" || (includeSub && !!currentLocation)}
          selectedId={selectedItemId}
          onOpen={openItem}
          onAdd={addItem}
          onBack={() => setPane("sidebar")}
          location={currentLocation}
          onEditLocation={currentLocation ? () => setLocationForm({ location: currentLocation, parentId: currentLocation.parent_id }) : undefined}
          includeSub={includeSub}
          onIncludeSub={selection.kind === "location" && selection.id && !searching ? setIncludeSub : undefined}
          onChanged={() => reload({ items: true })}
        />
      </div>

      <div className={`${pane === "detail" ? "flex" : "hidden"} min-w-0 flex-1 md:flex`}>
        {selectedItem ? (
          <ItemDetail
            key={selectedItem.id}
            data={data}
            item={selectedItem}
            onBack={() => setPane("list")}
            onEdit={() => setItemForm({ id: selectedItem.id })}
            onDuplicate={() =>
              setItemForm({ id: null, preset: { ...selectedItem, name: `${selectedItem.name} (copy)` } })
            }
            onDeleted={() => {
              setSelectedItemId(null);
              setPane("list");
              reload({ items: true });
            }}
            onShowLocation={(id) => {
              setMode("locations");
              select({ kind: "location", id });
            }}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">
            {loadError ? <span className="text-danger">{loadError}</span> : "Select an item"}
          </div>
        )}
      </div>

      {itemForm && (
        <ItemForm
          data={data}
          itemId={itemForm.id}
          initial={itemForm.id ? (items.find((i) => i.id === itemForm.id) ?? itemForm.preset) : itemForm.preset}
          onClose={() => setItemForm(null)}
          onSaved={async (id) => {
            setItemForm(null);
            await reload({ items: true, categories: true, tags: true });
            openItem(id);
          }}
        />
      )}
      {locationForm && (
        <LocationForm
          data={data}
          location={locationForm.location}
          parentId={locationForm.parentId}
          onClose={() => setLocationForm(null)}
          onSaved={async (id) => {
            setLocationForm(null);
            await reload({ locations: true });
            setMode("locations");
            select({ kind: "location", id });
          }}
          onDeleted={async (parentId) => {
            setLocationForm(null);
            await reload({ locations: true, items: true });
            select(parentId ? { kind: "location", id: parentId } : { kind: "all" });
            setPane("sidebar");
          }}
        />
      )}
      {settingsOpen && (
        <Settings
          data={data}
          households={households}
          userId={userId}
          email={email}
          onClose={() => setSettingsOpen(false)}
          onReload={reload}
          onSwitchHousehold={(id) => {
            setSettingsOpen(false);
            onSwitchHousehold(id);
          }}
          onHouseholdsChanged={onHouseholdsChanged}
        />
      )}
    </div>
  );
}
