import type { ReactNode } from 'react';
import '@/styles/card-setup-artwork.css';

type Choice = { id: string; name: string };
export function CardSetupArtwork({ tables, decks, table, deck, disabled, onTable, onDeck, preview }: { tables: Choice[]; decks: Choice[]; table: string; deck: string; disabled?: boolean; onTable: (id: string) => void; onDeck: (id: string) => void; preview: ReactNode }) {
  return <fieldset className="card-setup-artwork" disabled={disabled}><legend>Your deck &amp; table</legend><div className="card-setup-artwork-preview" aria-hidden="true">{preview}</div><div className="card-setup-artwork-fields"><label>Card deck<select aria-label="Card deck" value={deck} onChange={event => onDeck(event.target.value)} className="rummy-input">{decks.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Table surface<select aria-label="Table surface" value={table} onChange={event => onTable(event.target.value)} className="rummy-input">{tables.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div></fieldset>;
}
