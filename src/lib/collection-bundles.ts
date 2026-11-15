import { NAUTICAL_BUNDLES } from './nautical-sets';
import { CARROM_MANDALA_BUNDLES } from './carrom-mandalas';
export const collectionBundle = (id:string) => [...NAUTICAL_BUNDLES,...CARROM_MANDALA_BUNDLES].find(bundle=>bundle.id===id);
