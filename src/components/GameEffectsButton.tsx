import { useGameEffects } from '@/lib/game-cues';
import { FarkleAudioIcon } from './FarkleSoundControls';

export function GameEffectsButton() {
  const { active, toggle } = useGameEffects();
  return <button type="button" aria-label="Game sound effects" aria-pressed={active}
    title={active ? 'Mute game sound effects' : 'Enable game sound effects'} onClick={toggle}>
    <FarkleAudioIcon muted={!active}/>
  </button>;
}
