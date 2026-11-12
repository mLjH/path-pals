// Path Pals engine: pure functions, shared by the game, the level generator and the tests.
// Grid legend: . floor, S start (the animals list gives type and facing), G shared goal, R rock, T tree, P poo,
// g a goal that belongs to one character (that character's "goal": {x,y} in the animals list).
// A character finishes on G or on its own g. It walks straight over anyone else's g.
const DIRS={up:{dx:0,dy:-1,rot:0},right:{dx:1,dy:0,rot:90},down:{dx:0,dy:1,rot:180},left:{dx:-1,dy:0,rot:270}};
const K=(x,y)=>x+','+y;
const isGoalFor=(L,a,x,y)=>a.goal?(a.goal.x===x&&a.goal.y===y):cellAt(L,x,y)==='G';
function build(def){
  const cells=def.grid.map(r=>r.split('').map(c=>c==='S'?'.':c));
  return {...def,cells,rows:cells.length,cols:cells[0].length};
}
function cellAt(L,x,y){ if(x<0||y<0||x>=L.cols||y>=L.rows) return 'X'; return L.cells[y][x]; }
function blocked(c){ return c==='R'||c==='T'||c==='P'||c==='X'; }
function isTappable(L,x,y){
  if(cellAt(L,x,y)!=='.') return false;
  if(L.animals.some(a=>a.x===x&&a.y===y)) return false;
  return L.tappable?L.tappable.includes(K(x,y)):true;
}
// get(x,y) returns a direction, null for empty, or undefined for "not decided yet" (solver only)
function walk(L,a,get){
  let x=a.x,y=a.y,dir=a.dir;
  const path=[{x,y,dir}];
  const seen=new Set([K(x,y)+dir]);
  for(let n=0;n<300;n++){
    const d=DIRS[dir],nx=x+d.dx,ny=y+d.dy,c=cellAt(L,nx,ny);
    if(blocked(c)) return {path,result:'bump',bump:{x:nx,y:ny,dir}};
    x=nx;y=ny;
    if(isGoalFor(L,a,x,y)){ path.push({x,y,dir}); return {path,result:'win'}; }
    const g=isTappable(L,x,y)?get(x,y):null;
    if(g===undefined) return {path,result:'undecided',at:{x,y}};
    if(g) dir=g;
    path.push({x,y,dir});
    const s=K(x,y)+dir;
    if(seen.has(s)) return {path,result:'loop'};
    seen.add(s);
  }
  return {path,result:'loop'};
}
function solve(L,maxK=8){
  function rec(assign,left){
    let at=null;
    for(const a of L.animals){
      const r=walk(L,a,(x,y)=>{ if(!isTappable(L,x,y)) return null; return assign[K(x,y)]; });
      if(r.result==='undecided'){ at=r.at; break; }
      if(r.result!=='win') return null;
    }
    if(!at) return Object.assign({},assign);
    const k=K(at.x,at.y);
    assign[k]=null;
    let s=rec(assign,left);
    if(s) return s;
    if(left>0){
      for(const d of L.allowed){ assign[k]=d; s=rec(assign,left-1); if(s) return s; }
    }
    delete assign[k];
    return null;
  }
  for(let k=0;k<=maxK;k++){
    const s=rec({},k);
    if(s){ const out={}; for(const key in s) if(s[key]) out[key]=s[key]; return out; }
  }
  return null;
}
// First tile along the ideal route where the player's arrow differs from the plan.
function hintFor(L,get,sol){
  for(const a of L.animals){
    const r=walk(L,a,(x,y)=>sol[K(x,y)]||null);
    for(let i=1;i<r.path.length;i++){
      const p=r.path[i];
      if(!isTappable(L,p.x,p.y)) continue;
      const want=sol[K(p.x,p.y)]||null,have=get(p.x,p.y)||null;
      if(want!==have) return {x:p.x,y:p.y,dir:want};
    }
  }
  return null;
}
// ---------- hints that build on the child's own board ----------
// Cheapest route for one character, where changing a square costs far more than walking.
// Walking along a square the child already set is cheapest of all, so the route sticks to the child's plan.
const EDIT=10000, STEP_OWN=1, STEP_FREE=10;
function routeFor(L,a,val,locked,dirs){
  const d0=DIRS[a.dir],sx=a.x+d0.dx,sy=a.y+d0.dy;
  if(blocked(cellAt(L,sx,sy))) return null;
  const sk=(x,y,d)=>x+','+y+','+d;
  const dist=new Map(),prev=new Map(),done=new Set();
  const start=sk(sx,sy,a.dir);
  dist.set(start,0); prev.set(start,null);
  const info=new Map([[start,{x:sx,y:sy,d:a.dir}]]);
  while(true){
    let best=null,bc=Infinity;
    for(const [k,c] of dist) if(!done.has(k)&&c<bc){ bc=c; best=k; }
    if(best===null) return null;
    done.add(best);
    const {x,y,d}=info.get(best);
    if(isGoalFor(L,a,x,y)){
      // Walk back, collecting what each square must hold. A square used twice must agree with itself.
      const sets=new Map(),used=new Map(),keys=new Set();
      for(let k=best;k;k=prev.get(k).from){
        const p=prev.get(k); if(!p) break;
        keys.add(p.key);
        const want=p.set===undefined?'keep':p.set;
        if(used.has(p.key)&&used.get(p.key)!==want) return null;
        used.set(p.key,want);
        if(p.set!==undefined) sets.set(p.key,p.set);
      }
      return {sets,keys};
    }
    const key=K(x,y),canEdit=isTappable(L,x,y)&&!locked.has(key);
    const cur=isTappable(L,x,y)?val(x,y):null, eff=cur||d;
    const opts=[[eff,undefined,cur?STEP_OWN:STEP_FREE]];
    if(canEdit){
      for(const o of dirs) if(o!==eff) opts.push([o,o,EDIT+STEP_FREE]);
      if(eff!==d) opts.push([d,dirs.includes(d)?d:null,EDIT+STEP_FREE]);   // straighten a turn
    }
    for(const [o,set,cost] of opts){
      const nx=x+DIRS[o].dx,ny=y+DIRS[o].dy;
      if(blocked(cellAt(L,nx,ny))) continue;
      const nk=sk(nx,ny,o),nc=bc+cost;
      if(!done.has(nk)&&nc<(dist.has(nk)?dist.get(nk):Infinity)){
        dist.set(nk,nc); info.set(nk,{x:nx,y:ny,d:o}); prev.set(nk,{from:best,key,set});
      }
    }
  }
}
function permutations(a){ return a.length<2?[a]:a.flatMap((v,i)=>permutations(a.filter((_,j)=>j!==i)).map(p=>[v,...p])); }
// The smallest change to the child's board that gets every character to the goal, keeping their arrows
// wherever possible. Returns the first square to change, in walking order: {x,y,dir} (dir null = clear it).
// Returns null when the board already wins, or when no fix was found (the game then falls back to hintFor).
function fixFor(L,get,dirs){
  dirs=dirs||L.allowed;
  const cur=(x,y)=>get(x,y)||null;
  if(L.animals.every(a=>walk(L,a,cur).result==='win')) return null;
  for(const order of permutations(L.animals.map((_,i)=>i))){
    const board=new Map(),locked=new Set();
    const val=(x,y)=>{ const k=K(x,y); return board.has(k)?board.get(k):cur(x,y); };
    let ok=true;
    for(const i of order){
      const r=routeFor(L,L.animals[i],val,locked,dirs);
      if(!r){ ok=false; break; }
      r.sets.forEach((v,k)=>board.set(k,v));
      r.keys.forEach(k=>locked.add(k));
    }
    if(!ok||!L.animals.every(a=>walk(L,a,val).result==='win')) continue;
    let first=null;
    L.animals.forEach(a=>{
      const p=walk(L,a,val).path;
      for(let s=1;s<p.length;s++){
        const {x,y}=p[s],k=K(x,y);
        if(board.has(k)&&board.get(k)!==cur(x,y)){ if(!first||s<first.s) first={s,x,y,dir:board.get(k)}; break; }
      }
    });
    if(first) return {x:first.x,y:first.y,dir:first.dir};
  }
  return null;
}
if(typeof module!=='undefined'&&module.exports) module.exports={DIRS,K,build,cellAt,blocked,isTappable,isGoalFor,walk,solve,hintFor,fixFor};
