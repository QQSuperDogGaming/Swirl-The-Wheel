// --- Learning map ---------------------------------------------------------
// 1) We draw a spiral-striped disk on <canvas>.
// 2) We spin it by keeping a global angle and multiplying by velocity.
// 3) "Swirl" look comes from drawing MANY thin wedges per frame (temporal
//    blending via motion + alpha gives the creamy lolly blur).
// 4) Flavor winner = segment under the top pointer when speed reaches rest.
// --------------------------------------------------------------------------

const canvas = document.getElementById('wheel');
const ctx = canvas.getContext('2d');
const spinBtn = document.getElementById('spinBtn');
const resultEl = document.getElementById('result');
const powerEl  = document.getElementById('power');
const frictionEl = document.getElementById('friction');

const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
resizeForDPR();

// Read active flavors from the checkboxes (color + label)
function getFlavors() {
  const boxes = [...document.querySelectorAll('.flavors input[type=checkbox]')];
  const active = boxes.filter(b=>b.checked).map(b=>({
    name: b.parentElement.textContent.trim(),
    color: b.dataset.color
  }));
  // Minimum 2 segments to make sense visually
  return active.length >= 2 ? active : [
    {name:'Fresa', color:'#EA4B62'},
    {name:'Limón', color:'#F7E04B'}
  ];
}

let flavors = getFlavors();
document.querySelector('.flavors').addEventListener('change', ()=>{
  flavors = getFlavors();
  // Instant redraw so the slices update without spinning
  draw(0, 0);
});

const R = canvas.width/2 * 0.9; // radius of candy (leave margin)
const center = { x: canvas.width/2, y: canvas.height/2 + 40 }; // shift up a bit for stick

// Spin physics
let angle = -Math.PI/2;   // 12 o'clock under pointer
let velocity = 0;         // radians per frame
let spinning = false;
let lastWinner = null;

// Kick off the loop
requestAnimationFrame(loop);

spinBtn.addEventListener('click', ()=>{
  if (spinning) return;
  const power = parseFloat(powerEl.value);       // user control
  const base = rand(0.22, 0.35) * power;         // initial velocity
  velocity = base;
  spinning = true;
  lastWinner = null;
  resultEl.textContent = 'Spinning…';
});

function loop(){
  if (spinning) {
    angle += velocity;
    // friction (close to 1; lower = faster stop)
    const f = parseFloat(frictionEl.value);
    velocity *= f;

    // snap to a stop when very slow
    if (velocity < 0.002) {
      spinning = false;
      velocity = 0;
      const winner = pickWinner();
      lastWinner = winner;
      resultEl.textContent = `Winner: ${winner.name} 🎉`;
      // Center it perfectly under the pointer so it feels “locked”
      const targetAngle = winner.start + (winner.arc/2);
      const delta = shortAngleDist(angle, targetAngle);
      angle += delta; // small nudge for visual satisfaction
    }
  }

  // Draw current frame
  draw(angle, velocity);
  requestAnimationFrame(loop);
}

// ---------------------- Drawing -------------------------------------------

function draw(globalAngle, vel){
  const {width, height} = canvas;
  ctx.clearRect(0,0,width,height);

  // BACKING DISC (like a candy edge)
  ctx.save();
  ctx.translate(center.x, center.y);

  // Outer rim
  ctx.beginPath();
  ctx.arc(0,0,R+10,0,Math.PI*2);
  ctx.fillStyle = '#f6d86b';
  ctx.fill();
  ctx.lineWidth = 6 * DPR;
  ctx.strokeStyle = '#201c1a';
  ctx.stroke();
  ctx.restore();

  // Spiral “cream” — we draw a logarithmic spiral with banded colors.
  // r = a + b*theta ; we step theta in small increments and fill thin quads.
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(globalAngle);

  const segs = flavorGeometry();
  const colors = segs.map(s=>s.color);

  // Spiral params
  const turns = 11;             // how many revolutions inside the candy
  const thetaMax = Math.PI * 2 * turns;
  const bandWidth = 0.65;       // radians per color band along the spiral
  const a = 6;                  // inner radius offset
  const b = (R-10) / thetaMax;  // growth rate so spiral reaches rim

  // “Creamy” effect: blend a little with alpha depending on speed
  const smear = clamp(vel*60, 0, 0.55);
  ctx.globalAlpha = 0.92 - smear*0.4;

  // Draw many tiny wedges as we march along the spiral
  const step = 0.018; // smaller = smoother (perf tradeoff)
  for (let theta=0; theta<thetaMax; theta+=step) {
    const next = theta + step;

    const r1 = a + b*theta;
    const r2 = a + b*next;

    // Pick a color band based on theta; rotate palette for more motion.
    const bandIndex = Math.floor((theta + (smear*9)) / bandWidth) % colors.length;
    ctx.fillStyle = colors[mod(bandIndex, colors.length)];

    ctx.beginPath();
    // inner edge
    ctx.moveTo(r1*Math.cos(theta), r1*Math.sin(theta));
    ctx.lineTo(r1*Math.cos(next),  r1*Math.sin(next));
    // outer edge
    ctx.lineTo(r2*Math.cos(next),  r2*Math.sin(next));
    ctx.lineTo(r2*Math.cos(theta), r2*Math.sin(theta));
    ctx.closePath();
    ctx.fill();
  }

  // Mask everything to a circle (clean edge)
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  ctx.arc(0,0,R,0,Math.PI*2);
  ctx.fill();

  // Back to normal blending for outline
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineWidth = 4 * DPR;
  ctx.strokeStyle = '#201c1a';
  ctx.beginPath();
  ctx.arc(0,0,R,0,Math.PI*2);
  ctx.stroke();

  // Optional center cap (like a sticker)
  ctx.fillStyle = '#fff9e8';
  ctx.strokeStyle = '#201c1a';
  ctx.lineWidth = 3 * DPR;
  ctx.beginPath();
  ctx.arc(0,0, R*0.18, 0, Math.PI*2);
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = '#EA4B62';
  ctx.font = `${Math.round(R*0.12)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SPIN', 0, 0);

  ctx.restore();

  // Debug: draw top pointer line (hidden under CSS triangle)
  // ctx.beginPath(); ctx.moveTo(center.x, center.y - R - 14);
  // ctx.lineTo(center.x, center.y - R - 30); ctx.stroke();
}

// Build segment geometry for winner detection (not drawn as wedges;
// we just need start angle + arc length for each flavor around the rim)
function flavorGeometry(){
  const list = getFlavors();
  const arc = (Math.PI*2) / list.length;
  // Start at -90° so pointer at 12 o’clock corresponds to angle= -PI/2
  return list.map((f,i)=>({
    ...f,
    start: -Math.PI/2 + i*arc, // absolute angle in world space
    arc
  }));
}

// Compute which segment sits under the pointer (12 o’clock) for current angle
function pickWinner(){
  const segs = flavorGeometry();
  // Normalize global rotation to [0, 2π)
  const a = norm(angle);
  // Pointer points to world angle = -PI/2; convert rotation into rim position
  // The segment whose range contains 'a' is the winner.
  for (const s of segs){
    let start = norm(s.start);
    let end = norm(s.start + s.arc);
    // Handle wrap-around elegantly
    const hit = start < end
      ? (a >= start && a < end)
      : (a >= start || a < end);
    if (hit) return s;
  }
  return segs[0];
}

// ---------------------- Utilities -----------------------------------------
function rand(min,max){return Math.random()*(max-min)+min}
function clamp(v,min,max){return Math.min(max,Math.max(min,v))}
function mod(n,m){return ((n % m) + m) % m}
function norm(a){
  const t = a % (Math.PI*2);
  return t < 0 ? t + Math.PI*2 : t;
}
function shortAngleDist(from, to){
  let diff = norm(to) - norm(from);
  if (diff > Math.PI) diff -= Math.PI*2;
  if (diff < -Math.PI) diff += Math.PI*2;
  return diff;
}

function resizeForDPR(){
  const w = canvas.width, h = canvas.height;
  canvas.width = Math.round(w * DPR);
  canvas.height = Math.round(h * DPR);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  // Scale drawing so 1 unit = 1 CSS pixel
  const c = canvas.getContext('2d');
  c.setTransform(DPR,0,0,DPR,0,0);
}
