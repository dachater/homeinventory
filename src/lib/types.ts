export type Household = {
  id: string;
  name: string;
  default_currency: string;
};

export type Location = {
  id: string;
  household_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  archived_at: string | null;
};

export type Category = {
  id: string;
  household_id: string;
  name: string;
};

export type Tag = {
  id: string;
  household_id: string;
  name: string;
  color: string;
};

export type Item = {
  id: string;
  household_id: string;
  location_id: string | null;
  category_id: string | null;
  name: string;
  description: string | null;
  quantity: number;
  value: number | null;
  currency: string;
  purchase_date: string | null;
  purchased_from: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  barcode: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  item_tags: { tag_id: string }[];
};

// The editable columns of an item.
export type ItemFields = Omit<
  Item,
  "id" | "household_id" | "created_at" | "updated_at" | "item_tags"
>;

export type FileKind = "photo" | "receipt" | "attachment";

export type ItemFile = {
  id: string;
  household_id: string;
  item_id: string;
  kind: FileKind;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export type Member = {
  user_id: string;
  email: string;
  role: "owner" | "member";
  joined_at: string;
};

// What the middle pane is showing.
export type Selection =
  | { kind: "all" }
  | { kind: "location"; id: string | null }
  | { kind: "category"; id: string | null }
  | { kind: "tag"; id: string };
