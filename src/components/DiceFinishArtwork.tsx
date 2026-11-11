import type { CollectionDice } from '@/lib/d6-collections';
/** Lightweight vector finishes share the same six-face cube and pip geometry. */
export function DiceFinishArtwork({design:d,id}:{design:CollectionDice;id:string}) {
 const key=d.motif,ink=d.accent;
 const seedMarks=Array.from({length:15},(_,i)=>({x:7+(i*17%46),y:8+(i*23%45)}));
 return <g clipPath={`url(#${id}-clip)`} aria-hidden="true" data-finish={key}>
  <defs><clipPath id={`${id}-clip`}><rect x="2" y="2" width="56" height="56" rx="9"/></clipPath>
   <pattern id={`${id}-weave`} width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 1h5M1 0v5" stroke={ink} strokeWidth=".6" opacity=".5"/></pattern>
   <linearGradient id={`${id}-rainbow`} x2="1" y2="1"><stop stopColor="#ef5469"/><stop offset=".2" stopColor="#f4b441"/><stop offset=".4" stopColor="#b8d852"/><stop offset=".6" stopColor="#41c7bb"/><stop offset=".8" stopColor="#557be0"/><stop offset="1" stopColor="#d66ac9"/></linearGradient>
  </defs>
  {d.collection==='rainbow'&&<>{key==='spectrum'&&<rect width="60" height="60" fill={`url(#${id}-rainbow)`}/>}<path d="M6 17Q30-1 54 12V5H6Z" fill="#fff" opacity=".2"/><rect x="3" y="3" width="54" height="54" rx="9" stroke={ink} strokeWidth="2" fill="none"/><path d="M6 49q24 8 48 0" fill="none" stroke="#fff" opacity=".22" strokeWidth="2"/></>}
  {d.collection==='dessert'&&<>
   {key==='chocolate'&&<>{[5,22,39].map(x=>[5,22,39].map(y=><g key={`${x}:${y}`}><rect x={x} y={y} width="16" height="16" rx="2" fill="#49271c" stroke="#d9a47a" strokeWidth=".6"/><path d={`M${x+2} ${y+13}v-11h11`} stroke="#bb8868" fill="none"/></g>))}</>}
   {key==='cookie'&&<>{seedMarks.map(({x,y},i)=><path key={i} d={`m${x} ${y} 3-1 2 3-2 3-3-1Z`} fill="#663a26"/>)}<rect x="4" y="4" width="52" height="52" rx="15" fill="none" stroke="#f4d4a4" strokeWidth="2"/></>}
   {['waffle','pie'].includes(key)&&<>{Array.from({length:8},(_,i)=><g key={i} transform={key==='pie'?'rotate(45 30 30)':undefined}><path d={`M${i*9-8} 0v60M0 ${i*9-8}h60`} stroke={key==='waffle'?'#a57435':'#e9c18b'} strokeWidth={key==='waffle'?2.5:4}/></g>)}<rect x="4" y="4" width="52" height="52" rx="9" fill="none" stroke="#fff1bd" strokeWidth="1.5"/></>}
   {key==='cupcake'&&<><path d="M0 38h60v22H0Z" fill="#c75b91"/>{[6,16,26,36,46,56].map(x=><path key={x} d={`M${x} 40v20`} stroke="#f5b2d1" strokeWidth="2"/>)}<path d="M0 14Q8 0 17 7Q28-2 35 6Q48-1 60 13V37Q54 43 47 36Q39 43 31 36Q21 43 15 36Q6 42 0 36Z" fill="#fff1e3"/>{seedMarks.slice(0,9).map(({x,y},i)=><path key={i} d={`m${x} ${5+y%26} 3 2`} stroke={['#be5e96','#69aaa5','#d8a331'][i%3]} strokeWidth="1.3"/>)}</>}
   {key==='cake'&&<>{[9,24,39,54].map(y=><path key={y} d={`M0 ${y}h60`} stroke="#fff0cd" strokeWidth="6"/>)}<path d="M0 5q6 9 12 0q6 9 12 0q6 9 12 0q6 9 12 0q6 9 12 0" fill="none" stroke="#c4426a" strokeWidth="4"/></>}
   {key==='sundae'&&<><path d="M0 0h60v20H0Z" fill="#f3ddbb"/><path d="M0 20h60v20H0Z" fill="#e4a5bd"/><path d="M0 40h60v20H0Z" fill="#865444"/>{seedMarks.slice(0,7).map(({x,y},i)=><circle key={i} cx={x} cy={4+y%12} r="1" fill="#9a6739"/>)}</>}
   {key==='sandwich'&&<><path d="M0 22h60v17H0Z" fill="#ffefd5"/>{seedMarks.map(({x,y},i)=><circle key={i} cx={x} cy={y<22?y:y+14} r="1.1" fill="#38251e"/>)}<path d="M4 4h52M4 56h52" stroke="#c08b65" strokeWidth="2"/></>}
  </>}
  {d.collection==='fruit'&&<>
   <path d="M27 8q0-7 5-8" stroke="#6a502a" strokeWidth="2" fill="none"/><path d="M30 6Q33-1 43 2Q39 10 30 6Z" fill="#4a7f37"/>
   {['kiwi','orange','lemon'].includes(key)&&<><circle cx="30" cy="32" r="27" fill="none" stroke={ink} strokeWidth="3"/>{Array.from({length:10},(_,i)=><path key={i} d="M30 32 30 6" transform={`rotate(${i*36} 30 32)`} stroke={key==='kiwi'?'#eef1bd':'#fff4bf'} strokeWidth="1.2"/>)}<circle cx="30" cy="32" r="5" fill={ink}/>{key==='kiwi'&&Array.from({length:12},(_,i)=><ellipse key={i} cx="30" cy="15" rx=".9" ry="1.7" fill="#405329" transform={`rotate(${i*30} 30 32)`}/>)}</>}
   {key==='strawberry'&&<>{seedMarks.map(({x,y},i)=><ellipse key={i} cx={x} cy={y} rx=".8" ry="1.5" fill="#ffd7a2"/>)}<path d="m16 1 5 8 8-5 7 6 8-9" fill="#43804b"/></>}
   {key==='melon'&&<><path d="M0 48h60v12H0Z" fill="#4e8d5b"/><path d="M0 48h60" stroke="#e2e8a6" strokeWidth="3"/>{seedMarks.slice(0,10).map(({x,y},i)=><ellipse key={i} cx={x} cy={10+y%33} rx=".8" ry="1.8" fill="#6d3836"/>)}</>}
   {['apple','pear','cherry'].includes(key)&&<><path d="M7 16Q5 35 13 46" fill="none" stroke="#fffbd3" opacity=".3" strokeWidth="3"/>{seedMarks.map(({x,y},i)=><circle key={i} cx={x} cy={y} r=".5" fill={ink} opacity=".55"/>)}{key==='cherry'&&<path d="M30 8q-9-6-16 4m16-4q6-6 14 2" stroke="#466b36" strokeWidth="1.5" fill="none"/>}</>}
  </>}
  {d.collection==='fabric'&&<>
    <rect x="2" y="2" width="56" height="56" fill={`url(#${id}-weave)`}/>
    {['plaid','tartan'].includes(key)&&<>{[9,30,51].map(n=><g key={n}><path d={`M${n} 0v60M0 ${n}h60`} stroke={ink} strokeWidth="8" opacity=".65"/><path d={`M${n+5} 0v60M0 ${n+5}h60`} stroke="#f8dbb2" strokeWidth=".8" opacity=".8"/></g>)}</>}
    {key==='knit'&&<>{Array.from({length:5},(_,i)=><path key={i} d={`m0 ${i*12+5} 6-4 6 4 6-4 6 4 6-4 6 4 6-4 6 4 6-4 6 4`} fill="none" stroke="#f5e2ce" strokeWidth="2"/>)}</>}
    {key==='weave'&&<>{Array.from({length:6},(_,i)=><path key={i} d={`m-10 ${i*12} 20-12 20 12 20-12 20 12`} fill="none" stroke={ink} strokeWidth="4"/>)}</>}
    {['silk','brocade'].includes(key)&&<>{[[10,10],[30,30],[50,10],[10,50],[50,50]].map(([x,y],i)=><g key={i} transform={`translate(${x} ${y})`}><path d="M0-8Q10 0 0 8Q-10 0 0-8ZM-6 0H6" stroke={ink} strokeWidth=".7" fill="none"/><circle r="1.7" fill={ink}/></g>)}</>}
    <rect x="5" y="5" width="50" height="50" rx="6" fill="none" stroke={ink} strokeWidth=".7" strokeDasharray={key==='denim'?'2 1':'1 2'}/>
  </>}
  {d.collection==='animal'&&<>
   {key==='cow'&&<>{[[5,20],[49,30],[8,50],[45,8]].map(([x,y],i)=><path key={i} d={`m${x} ${y}q-5-9 3-9q12 0 8 9q-2 9-11 0Z`} fill={ink}/>)}</>}
   {key==='cat'&&<>{[10,30,50].map(x=><path key={x} d={`m${x} 1 3 10 3-10`} fill="#ae683c"/>)}<path d="m6 4 5 7-8 1m51-8-5 7 8 1" fill="#ecbe9f"/></>}
   {key==='tuxedo'&&<path d="m22 2 8 9 8-9v58H22Z" fill="#e9e4d9"/>}
   {key==='pony'&&<path d="M25 0q-8 12 2 19q7-9 11-13V0Z" fill={ink}/>}
   {key==='mouse'&&<><circle cx="8" cy="7" r="7" fill={ink}/><circle cx="52" cy="7" r="7" fill={ink}/></>}
   {key==='pig'&&<><path d="m3 3 14 1-8 9m48-10-14 1 8 9" fill="#c56f8e"/><ellipse cx="30" cy="9" rx="6" ry="4" fill="#e486a5"/><path d="M28 8v2m4-2v2" stroke="#8e425f"/></>}
   {key==='sheep'&&<>{Array.from({length:14},(_,i)=><circle key={i} cx={8+i*13%47} cy={6+i*23%49} r="5" fill="none" stroke="#c7bea5" strokeWidth=".8"/>)}<path d="M21 0q9 16 18 0Z" fill="#56504a"/></>}
   {key==='chick'&&<><path d="m26 3 4-5 4 5m-8 4 4 5 4-5" fill="#d7972f"/><path d="M4 26q7 6 0 15m52-15q-7 6 0 15" fill="none" stroke="#d9b55e" strokeWidth="2"/></>}
   {['cat','tuxedo','pony','mouse'].includes(key)&&<><circle cx="24" cy="7" r="1.2" fill={d.pip}/><circle cx="36" cy="7" r="1.2" fill={d.pip}/><path d="m28 10 2 2 2-2" fill="#d87f93"/>{['cat','tuxedo','mouse'].includes(key)&&<path d="m22 10-5-1m5 3-5 1m21-3 5-1m-5 3 5 1" stroke={d.pip} strokeWidth=".5"/>}</>}
   <ellipse cx="30" cy="35" rx="21" ry="23" fill={key==='tuxedo'?'#f3ead9':d.light} opacity=".3"/>
  </>}
  {d.collection==='material'&&<>
   {key==='marble'&&<>{[0,20,40].map(n=><path key={n} d={`M${n-20} 0q38 16 21 29t35 31M${n-18} 0q38 16 21 29t35 31`} fill="none" stroke={ink} strokeWidth=".8"/>)}</>}
   {key==='wood'&&<>{Array.from({length:10},(_,i)=><path key={i} d={`M${i*7-5} 0q13 18 1 30t0 30`} fill="none" stroke={ink} strokeWidth={i%3?'.5':'1.2'}/>)}<ellipse cx="34" cy="32" rx="6" ry="11" fill="none" stroke={ink}/></>}
   {key==='steel'&&<>{Array.from({length:16},(_,i)=><path key={i} d={`m${i%4*16+2} ${Math.floor(i/4)*16+3} 6-3m-6 5 6-3`} stroke="#dce4e9" strokeWidth="2.5" strokeLinecap="round"/>)}</>}
   {key==='water'&&<>{Array.from({length:7},(_,i)=><path key={i} d={`M-5 ${i*10}q10-9 20 0t20 0t20 0t20 0`} fill="none" stroke={ink} strokeWidth="1.7" opacity=".6"/>)}</>}
   {key==='gold'&&<>{Array.from({length:24},(_,i)=><path key={i} d={`M${i*3} 0v60`} stroke="#fff9c5" opacity=".25" strokeWidth=".6"/>)}</>}
   {['leather','copper'].includes(key)&&<>{Array.from({length:40},(_,i)=><circle key={i} cx={3+i*17%54} cy={3+i*29%54} r={key==='copper'?2:'.6'} fill={ink} opacity=".4"/>)}{key==='leather'&&<rect x="5" y="5" width="50" height="50" rx="7" fill="none" stroke="#f7d3a0" strokeWidth=".7" strokeDasharray="2 1.5"/>}</>}
   {key==='glass'&&<><path d="M6 35 35 6h15L6 50Zm15 20L55 21v9L30 55Z" fill="#f2ffff" opacity=".4"/><rect x="4" y="4" width="52" height="52" rx="9" fill="none" stroke="#f4ffff" strokeWidth="2" opacity=".8"/></>}
  </>}
  {d.collection==='sport'&&<>
   {key==='baseball'&&<>{[6,54].map(x=><g key={x}><path d={`M${x} 0q18 30 0 60`} fill="none" stroke="#a94949"/>{[6,14,22,30,38,46,54].map(y=><path key={y} d={`m${x+8} ${y} 4 3m-4-3 2-3`} stroke="#a94949" strokeWidth="1"/>)}</g>)}</>}
   {key==='basketball'&&<><path d="M0 30h60M30 0v60M4 0q38 30 0 60M56 0Q18 30 56 60" fill="none" stroke="#503425" strokeWidth="1.8"/></>}
   {['football','rugby'].includes(key)&&<><path d="M5 0v60M55 0v60" stroke={ink} strokeWidth="4"/><path d="M30 5v50" stroke={ink} strokeWidth="1.7"/>{[10,18,26,34,42,50].map(y=><path key={y} d={`M26 ${y}h8`} stroke={ink} strokeWidth="1.4"/>)}</>}
   {key==='tennis'&&<path d="M-1 5q35 25 0 50M61 5Q26 30 61 55" fill="none" stroke="#f9f7cc" strokeWidth="3"/>}
   {key==='golf'&&<>{Array.from({length:25},(_,i)=><circle key={i} cx={6+i%5*12} cy={6+Math.floor(i/5)*12} r="2.5" stroke={ink} strokeWidth=".6" fill="none"/>)}</>}
   {key==='soccer'&&<><path d="m30 16 14 10-5 17H21l-5-17Z" fill="#334052"/>{[0,72,144,216,288].map(n=><path key={n} d="m30 16-6-16m20 26 16-2" transform={`rotate(${n} 30 30)`} stroke="#334052" strokeWidth="1.2"/>)}</>}
   {key==='bowling'&&<>{[0,20,40].map(n=><path key={n} d={`M${n-5} 0Q${n+40} 30 ${n-5} 60`} fill="none" stroke={ink} opacity=".65" strokeWidth="4"/>)}<circle cx="30" cy="9" r="2" fill="#251a49"/></>}
  </>}
 </g>;
}
