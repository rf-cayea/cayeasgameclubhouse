/** Loopback-only QA with fictional users and an isolated SQLite DB. Never imported by the app. */
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {TestD1} from './d1';
import {EconomyStore} from '../../server/economy';
import {CollectiblesStore} from '../../server/collectibles';
import {ECONOMY_CATALOG} from '../../src/lib/economy-protocol';
import type {AlbumState,CardStars} from '../../src/lib/collectibles';
const db=new TestD1(),economy=new EconomyStore(db),cards=new CollectiblesStore(db),ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
for(const[i,id]of ids.entries()){const actor={principal:`member:${id}`};await economy.ensureMember(actor,{wallet:{points:2000,owned:[],equipped:{}},awards:[]});db.sqlite.prepare('INSERT INTO social_profiles(user_id,gamer_name,name_key,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,`Tester${i}`,`tester${i}`,1,1);const data:AlbumState={cards:i?{'hh-02':2}:{'hh-01':3,'hh-06':1},packs:([1,2,3,4]as CardStars[]).map(stars=>({id:randomUUID(),stars,source:'Isolated QA fixture',createdAt:1})),crates:0,ultraMisses:0,recent:[]};db.sqlite.prepare('INSERT INTO collectible_albums(user_id,data,revision) VALUES(?,?,0)').run(id,JSON.stringify(data));}
const server=createServer(async(req,res)=>{try{const token=req.headers.authorization?.replace(/^Bearer /,''),id=token?JSON.parse(Buffer.from(token.split('.')[1]??'','base64url').toString()).sub:null;if(!ids.includes(id)){res.writeHead(401);res.end('{}');return;}const actor={principal:`member:${id}`},chunks:Buffer[]=[];for await(const c of req)chunks.push(c);const command=req.method==='POST'?JSON.parse(Buffer.concat(chunks).toString()):null;let data;if(req.url==='/api/collectibles'){data=command?{receipt:await cards.command(actor,command),album:await cards.read(actor),wallet:await economy.wallet(actor)}:await cards.read(actor);}else if(req.url==='/api/economy/catalog')data={items:ECONOMY_CATALOG};else if(req.url==='/api/economy')data=command?await economy.command(actor,command):await economy.read(actor);else{res.writeHead(404);res.end('{}');return;}res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}catch(e){res.writeHead((e as{status?:number}).status??500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:(e as Error).message}));}});
server.listen(8812,'127.0.0.1',()=>console.log('Fictional collectible QA API ready on 8812'));
process.on('SIGTERM',()=>server.close(()=>{db.sqlite.close();process.exit(0);}));
