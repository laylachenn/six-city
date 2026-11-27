// Clothes shops, shoe shops and barbers: what each sells, prices, and which pieces you own. No page code, so it can be
// unit-tested (node --test tests/). The page (src/game/13-homes.js) adds these to the outfit lists; anything with an id
// is locked in the wardrobe and the character creator until you've bought it.

// slot: top | bottom | jacket | shoes | hair (hair colour). Tops and bottoms carry the same shape fields as the base lists.
export const CATALOG = [
  { id: 'hoodie', slot: 'top', n: 'Grey hoodie', c: 0x8c8f96, sl: .97, crop: false, acc: 0xffffff, price: 65 },
  { id: 'jersey', slot: 'top', n: 'Six City jersey', c: 0x1d3f8f, sl: .3, crop: false, acc: 0xe8303f, price: 120 },
  { id: 'turtle', slot: 'top', n: 'Black turtleneck', c: 0x15161a, sl: .97, crop: false, acc: 0x15161a, price: 90 },
  { id: 'flannel', slot: 'top', n: 'Red flannel', c: 0xa8262c, sl: .97, crop: false, acc: 0x1b1b1f, price: 70 },
  { id: 'silk', slot: 'top', n: 'Emerald silk top', c: 0x157a5a, sl: .3, crop: true, acc: 0xe8d9b0, price: 160 },
  { id: 'track', slot: 'bottom', n: 'Track pants', c: 0x1c1d22, den: 0, sh: 0, price: 55 },
  { id: 'cargo', slot: 'bottom', n: 'Olive cargos', c: 0x5b5e3a, den: 0, sh: 0, price: 80 },
  { id: 'plaid', slot: 'bottom', n: 'Plaid skirt', c: 0x8e2430, den: 0, sh: 2, price: 75 },
  { id: 'leather', slot: 'bottom', n: 'Leather trousers', c: 0x121214, den: 0, sh: 0, price: 210 },
  { id: 'denimj', slot: 'jacket', n: 'Denim jacket', c: 0x4d6a92, price: 140 },
  { id: 'leatherj', slot: 'jacket', n: 'Leather jacket', c: 0x18181b, price: 380 },
  { id: 'varsity', slot: 'jacket', n: 'Varsity jacket', c: 0x23315e, price: 220 },
  { id: 'puffer', slot: 'jacket', n: 'Red puffer', c: 0xc8202c, price: 450 },
  { id: 'trench', slot: 'jacket', n: 'Camel trench coat', c: 0xb08a5a, price: 520 },
  { id: 'gold', slot: 'shoes', n: 'Gold', c: 0xd4af37, price: 140 },
  { id: 'lime', slot: 'shoes', n: 'Lime', c: 0x9be23a, price: 90 },
  { id: 'lilacs', slot: 'shoes', n: 'Lilac', c: 0xb7a6e8, price: 90 },
  { id: 'platinum', slot: 'hair', n: 'Platinum', c: 0xe8e0cf, price: 85 },
  { id: 'blue', slot: 'hair', n: 'Electric blue', c: 0x2a6bff, price: 85 },
  { id: 'lilac', slot: 'hair', n: 'Lilac', c: 0xb79ce8, price: 85 },
  { id: 'red', slot: 'hair', n: 'Fire red', c: 0xd8301e, price: 85 },
  { id: 'mint', slot: 'hair', n: 'Mint', c: 0x8fe3c0, price: 85 },
];
export const byId = id => CATALOG.find(i => i.id === id) || null;
export const CUT_PRICE = 30, BEARD_PRICE = 15;

// which slots a shop sells, by its interior kind
export const SELLS = { fashion: ['top', 'bottom', 'jacket', 'shoes'], shoes: ['shoes'], barber: ['hair'], beauty: ['hair'] };
export const SLOT_NAME = { top: 'Tops', bottom: 'Bottoms', jacket: 'Jackets', shoes: 'Shoes', hair: 'Hair colour' };
export const sells = kind => SELLS[kind] || [];
export const stock = (kind, slot) => sells(kind).includes(slot) ? CATALOG.filter(i => i.slot === slot) : [];

export const owns = (closet, item) => !item || !item.id || (closet || []).includes(item.id);

// buying: returns the new closet (never mutates) or why not
export function buy(closet, id, cash) {
  const it = byId(id); closet = closet || [];
  if (!it) return { ok: false, why: 'Not sold here' };
  if (closet.includes(id)) return { ok: false, why: 'You already own it' };
  if (cash < it.price) return { ok: false, why: `You need $${it.price - cash} more` };
  return { ok: true, cost: it.price, closet: [...closet, id] };
}

// the next piece in a list you're allowed to wear (dir ±1), skipping ones you don't own; -1 in an optional slot means none
export function nextOwned(list, cur, dir, closet, optional = false) {
  const n = list.length, lo = optional ? -1 : 0, span = n - lo;
  let i = cur ?? lo;
  for (let k = 0; k < span; k++) { i = ((i - lo + dir) % span + span) % span + lo; if (i === -1 || owns(closet, list[i])) return i; }
  return cur ?? lo;
}
