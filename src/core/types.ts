/** A rectangle in page units (PDF points), origin at the top-left of the page. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One piece of text as PDF.js reports it, with its box on the page. */
export interface TextItem {
  /** Text in logical (reading) order. */
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** True when the base direction of the piece is right-to-left. */
  rtl: boolean;
  font: string;
}

export interface PageText {
  items: TextItem[];
  width: number;
  height: number;
  /** True when the text was read from the page picture (a scan or photo). */
  ocr?: boolean;
}

export type DetailField = 'name' | 'id' | 'phone' | 'account' | 'email' | 'address' | 'other';

export type Details = Record<DetailField, string[]>;

export const FIELD_KIND: Record<DetailField, string> = {
  name: 'Name',
  id: 'ID number',
  phone: 'Phone',
  account: 'Bank account',
  email: 'Email',
  address: 'Address',
  other: 'Custom',
};

export interface Finding {
  id: string;
  page: number;
  /** 'details' = matched what the user typed; 'found' = suggested by a detector. */
  source: 'details' | 'found';
  kind: string;
  /** The text as it appears in the document. */
  text: string;
  /** Groups occurrences of the same value. */
  key: string;
  rects: Rect[];
  note?: 'short' | 'fuzzy';
  /** Not hidden until the user decides (uncertain match). */
  review?: boolean;
}

export interface ManualBox {
  id: string;
  page: number;
  rect: Rect;
}
