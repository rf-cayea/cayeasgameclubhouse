let audio:AudioContext|undefined,voice:SpeechSynthesisUtterance|undefined;
export function primeWinnerAudio(){try{if(typeof AudioContext==='undefined')return;audio??=new AudioContext();void audio.resume().catch(()=>{});}catch{/* Browser audio is optional. */}}
export function stopWinnerVoice(){if(voice&&typeof speechSynthesis!=='undefined'){speechSynthesis.cancel();voice=undefined;}}
export function playWinnerAudio(){
 if(document.hidden)return;
 primeWinnerAudio();
 if(audio?.state==='running'){
  const c=audio;
  [523.25,659.25,783.99,1046.5].forEach((hz,i)=>{const t=c.currentTime+i*.11,o=c.createOscillator(),g=c.createGain();o.type='triangle';o.frequency.value=hz;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.055,t+.015);g.gain.exponentialRampToValueAtTime(.0001,t+.6);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+.65);});
 }
 if(typeof speechSynthesis!=='undefined'&&typeof SpeechSynthesisUtterance!=='undefined'){
  stopWinnerVoice();
  const line=new SpeechSynthesisUtterance('Winner');
  const voices=speechSynthesis.getVoices().filter(v=>v.lang.startsWith('en'));
  line.voice=voices.find(v=>/Google US English|Microsoft.*(David|Guy|Ryan)|Daniel|Alex/i.test(v.name))??voices.find(v=>v.lang==='en-US')??voices[0]??null;
  line.lang=line.voice?.lang??'en-US';line.pitch=.75;line.rate=.85;line.volume=.95;voice=line;
  line.onend=line.onerror=()=>{if(voice===line)voice=undefined;};
  try{speechSynthesis.speak(line);}catch{voice=undefined;}
 }
}
export function winnerSoundsOff(){try{return localStorage.getItem('clubhouse-winner-muted')==='true'||localStorage.getItem('clubhouse-table-effects')==='off';}catch{return false;}}
