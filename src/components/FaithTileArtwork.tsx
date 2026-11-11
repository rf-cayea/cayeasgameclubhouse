import { CLASSIC_FAITH_SKIN, faithSkin } from '@/lib/faith-skins';
import { FAITH_ATLASES, faithMotif } from '@/lib/faith-art';

/** A portrait crop from the collection's locally hosted painting atlas. */
export function FaithTileArtwork({ collection, type, labelled = false, skin = CLASSIC_FAITH_SKIN }: { collection: number; type: number; labelled?: boolean; skin?: string }) {
  const finish = faithSkin(skin);
  const column = type % 5, row = Math.floor(type / 5) + (collection % 2) * 2;
  return <svg className="faith-painted-art" viewBox="0 0 100 150" role={labelled ? 'img' : undefined}
    aria-label={labelled ? faithMotif(collection, type) : undefined} aria-hidden={labelled ? undefined : true}
    data-artwork={`${collection}-${type}`} data-skin={finish?.id ?? CLASSIC_FAITH_SKIN} focusable="false">
    <image className="faith-base-painting" href={`/faith-art/${FAITH_ATLASES[Math.floor(collection / 2)]}.webp`} x={-column * 100} y={-row * 150} width="500" height="600" preserveAspectRatio="none" />
    {finish && <image className="faith-skin-frame" href={'art' in finish ? finish.art : "/faith-art/store-skin-frames.webp"} x={'art' in finish ? 0 : -finish.frame * 100} y="0" width={'art' in finish ? 100 : 300} height="150" preserveAspectRatio="none" />}
  </svg>;
}
