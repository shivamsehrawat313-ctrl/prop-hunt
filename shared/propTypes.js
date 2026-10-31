// Models and matching previews are kept in a URL-safe public directory.
// Cart has no preview image, but is normalized to the same disguise width.
export const PROP_TYPES = [
  { id: 'barrel', label: 'Barrel', model: '/props-models/barrel.glb', preview: '/props-models/barrel.png' },
  { id: 'box', label: 'Box', model: '/props-models/box-open.glb', preview: '/props-models/box-open.png' },
  { id: 'bucket', label: 'Bucket', model: '/props-models/bucket.glb', preview: '/props-models/bucket.png' },
  { id: 'rock', label: 'Sandstone', model: '/props-models/rock-sand-a.glb', preview: '/props-models/rock-sand-a.png' },
  { id: 'tent', label: 'Tent', model: '/props-models/tent_smallOpen.glb', preview: '/props-models/tent_smallOpen_SW.png' },
  { id: 'cart', label: 'Cart', model: '/props-models/cart.glb', preview: null },
];
