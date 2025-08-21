/* Swirl The Wheel — full script (no deps) */

const canvas = document.getElementById('wheel');
const ctx     = canvas.getContext('2d', { alpha:true });

const spinBtn    = document.getElementById('spinBtn');
const resultEl   = document.getElementById('result');
const powerEl    = document.getElementById('power');
const frictionEl = document.getElementById('friction');

const flavorsBox = document.querySelector('.flavors');

const modal      = document.getElementById('winnerModal');
const winnerText = document.getElementById('winnerText');
const closeModal = document.getElementById('closeModal');

const choiceForm  = document.getElementById('choiceForm');
const choiceInput = document.getElementById('choiceInput');
const choiceList  = document.getElementById('choiceList');
const clearBtn    = document.getElementById('clearChoices');
const shuffleBtn  = document.getElementById('shuffleChoices');

/* HiDPI */
const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
resizeForDPR();

/* Palette (used to paint the swirl) */
function getFlavors(){
  const boxes = [...document.querySelectorAll('.flavors input[type=checkbox]')];
  const active = boxes.filter(b=>b.checked).map(b=>({
    name: b.parentElement.textContent.trim(),
    color: b.dataset.color
  }));
  return active.length>=2 ? active : [
    {name:'Fresa', color:'#EA4B62'},
    {name:'Limón', color:'#F7E04B'}
  ];
}
let flavors = getFlavors();
flavorsBox.addEventListener('change', ()=>{
  flavors = getFlavors();
  precomputeSegments(); // recolor segments if you display them later
  hardRedraw();
});

/* Choices (the actual decisions) */
const LS_KEY = 'swirl_choices_v1';
let choices = loadChoices();
function loadChoices(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : ["Yes","No","Maybe"];
    return Array.isArray(arr) && arr.length ? arr : ["Yes","No","Maybe"];
  }catch{ return ["Yes","No","Maybe"]; }
}
function saveChoices(){ localStorage.setItem(LS_KEY, JSON.stringify(choices)); }

renderChoices();
choiceForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const v = choiceInput.value.trim();
  if(!v) return;
  choices.push(v); saveChoices();
  choiceInput.value=''; renderChoices();
});
clearBtn.addEventListener('click', ()=>{
  choices = []; saveChoices(); renderChoices();
});
shuffleBtn.addEventListener('click', ()=>{
  for(let i=choices.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [choices[i],choices[j]]=[choices[j],choices[i]];
  }
  saveChoices(); renderChoices();
});
function renderChoices(){
  choiceList.innerHTML='';
  if(choices.length===0){
    const li=document.createElement('li'); li.textContent='No choices yet. Add some!';
    li.style.opacity=.7; choiceList.appendChild(li);
  }else{
    choices.forEach((c,idx)=>{
      const li=document.createElement('li');
      li.innerHTML=`<span>${escapeHtml(c)}</span><button title="remove" aria-label="remove">✕</button>`;
      li.querySelector('button').addEventListener('click',()=>{
        choices.splice(idx,1); saveChoices(); renderChoices();
      });
      choiceList.appendChild(li);
    });
  }
  precomputeSegments();
}

/* Spin physics */
const R = canvas.width/2 * 0.9;
const center = { x: canvas.width/2, y: canvas.height/2 + 40 };

let angle=-Math.PI/2; // pointer at 12 o’clock
let velocity=0;
let spinning=false;

spinBtn.addEventListener('click', ()=>{
  if(spinning) return;
  const power=parseFloat(powerEl.value);
  velocity = rand(0.22,0.35)*power;
  spinning = true;
  resultEl.textContent='Spinning…';
});

requestAnimationFrame(loop);
function loop(){
  if(spinning){
    angle += velocity;
    velocity *= parseFloat(frictionEl.value);
    if(velocity < 0.002){
      spinning=false; velocity=0;
      const winner = pickWinner();
      resultEl.textContent = `Winner: ${winner.name} 🎉`;
      const targetAngle = winner.start + (winner.arc/2);
      angle += shortAngleDist(angle, targetAngle);
      hardRedraw();
      openWinnerModal(winner.name);
    }
  }
  draw(angle, velocity, spinning);
  requestAnimationFrame(loop);
}

/* Drawing — swirly lollipop */
function draw(globalAngle, vel, isSpinning){
  const {width,height}=canvas;

  // Persistence of vision while spinning
  if(isSpinning){
    ctx.globalCompositeOperation='source-over';
    ctx.fillStyle='rgba(255,249,232,0.18)'; // raise to 0.22 for stronger trails
    ctx.fillRect(0,0,width,height);
  }else{
    ctx.clearRect(0,0,width,height);
  }

  // Candy rim
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.beginPath(); ctx.arc(0,0,R+10,0,Math.PI*2);
  ctx.fillStyle='#f6d86b'; ctx.fill();
  ctx.lineWidth = 6*DPR; ctx.strokeStyle='#201c1a'; ctx.stroke();
  ctx.restore();

  // Spiral stripes (the “swirl”)
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(globalAngle);

  const colors = getFlavors().map(s=>s.color);
  const turns = 11;
  const thetaMax = Math.PI*2*turns;
  const bandWidth = 0.62;
  const a = 6;
  const b = (R-10) / thetaMax;

  const smear = clamp(vel*65, 0, 0.65);
  ctx.globalAlpha = 0.92 - smear*0.35;

  const step = 0.016; // smaller = smoother
  const drift = smear*10 + vel*40; // band drift for extra creaminess

  for(let theta=0; theta<thetaMax; theta+=step){
    const next=theta+step;
    const r1=a+b*theta, r2=a+b*next;

    const bandIndex = Math.floor((theta + drift) / bandWidth) % colors.length;
    ctx.fillStyle = colors[mod(bandIndex, colors.length)];

    ctx.beginPath();
    ctx.moveTo(r1*Math.cos(theta), r1*Math.sin(theta));
    ctx.lineTo(r1*Math.cos(next),  r1*Math.sin(next));
    ctx.lineTo(r2*Math.cos(next),  r2*Math.sin(next));
    ctx.lineTo(r2*Math.cos(theta), r2*Math.sin(theta));
    ctx.closePath(); ctx.fill();
  }

  // Mask to circle
  ctx.globalCompositeOperation='destination-in';
  ctx.beginPath(); ctx.arc(0,0,R,0,Math.PI*2); ctx.fill();

  // Outline + center cap
  ctx.globalCompositeOperation='source-over';
  ctx.lineWidth=4*DPR; ctx.strokeStyle='#201c1a';
  ctx.beginPath(); ctx.arc(0,0,R,0,Math.PI*2); ctx.stroke();

  ctx.fillStyle='#fff9e8'; ctx.strokeStyle='#201c1a'; ctx.lineWidth=3*DPR;
  ctx.beginPath(); ctx.arc(0,0,R*0.18,0,Math.PI*2); ctx.fill(); ctx.stroke();

  ctx.fillStyle='#EA4B62';
  ctx.font = `${Math.round(R*0.12)}px system-ui, sans-serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('SPIN', 0, 0);

  ctx.restore();
}

/* Clean clear when we stop / change palette */
function hardRedraw(){
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.setTransform(DPR,0,0,DPR,0,0);
  draw(angle, 0, false);
}

/* Winner detection uses CHOICES mapped to equal angular segments */
let segments=[];
precomputeSegments();
function precomputeSegments(){
  const list = choices.length ? choices.slice() : ["—"];
  const arc = (Math.PI*2) / list.length;
  segments = list.map((name,i)=>({
    name,
    color: getFlavors()[i % getFlavors().length].color,
    start: -Math.PI/2 + i*arc,
    arc
  }));
}
function pickWinner(){
  if(!segments.length) precomputeSegments();
  const a = norm(angle);
  for(const s of segments){
    const start = norm(s.start), end = norm(s.start + s.arc);
    const hit = start < end ? (a>=start && a<end) : (a>=start || a<end);
    if(hit) return s;
  }
  return segments[0];
}

/* Modal */
function openWinnerModal(text){
  winnerText.textContent = text;
  modal.setAttribute('aria-hidden','false');
}
closeModal.addEventListener('click', ()=> modal.setAttribute('aria-hidden','true'));
modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.setAttribute('aria-hidden','true'); });

/* Utils */
function rand(min,max){return Math.random()*(max-min)+min}
function clamp(v,min,max){return Math.min(max,Math.max(min,v))}
function mod(n,m){return ((n % m) + m) % m}
function norm(a){ const t=a%(Math.PI*2); return t<0 ? t+Math.PI*2 : t; }
function shortAngleDist(from,to){
  let d = norm(to) - norm(from);
  if(d> Math.PI) d-= Math.PI*2;
  if(d<-Math.PI) d+= Math.PI*2;
  return d;
}
function escapeHtml(s){ return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) }
function resizeForDPR(){
  const cssW = parseInt(canvas.getAttribute('width')||720,10);
  const cssH = parseInt(canvas.getAttribute('height')||720,10);
  canvas.width  = Math.round(cssW * DPR);
  canvas.height = Math.round(cssH * DPR);
  canvas.style.width  = cssW+'px';
  canvas.style.height = cssH+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
