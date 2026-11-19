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
  /**
   * Text of a form field or comment drawn on the page. Where the text sits
   * inside the field is unknown, so a match covers the whole field.
   */
  whole?: boolean;
}

export interface PageText {
  items: TextItem[];
  width: number;
  height: number;
  /** Pictures on the page (text inside them cannot be read). */
  images?: number;
  /** Form fields, signatures, stamps and drawings on the page. */
  marks?: number;
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
  note?: string;
}

export interface ManualBox {
  id: string;
  page: number;
  rect: Rect;
}
