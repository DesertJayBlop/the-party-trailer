// ---------- Calendar ----------
// Generates ~12 months of availability. Mostly booked with occasional
// 5-day windows of availability so the business looks in high demand.

const calLabel = document.getElementById('calLabel');
const calGrid  = document.getElementById('calGrid');
const dateSelect = document.getElementById('dateSelect');

const START = new Date(); START.setDate(1); START.setHours(0,0,0,0);
let viewMonth = new Date(START.getFullYear(), START.getMonth(), 1);

// Deterministic PRNG so availability is stable per load.
function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
const rand = mulberry32(42);

// Build availability map for 12 months.
const availability = {}; // yyyy-mm-dd -> 'available' | 'limited' | 'booked'
(function seed(){
  const start = new Date(START);
  const end = new Date(START.getFullYear(), START.getMonth()+12, 0);

  // Default: everything booked.
  for (let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
    availability[key(d)] = 'booked';
  }

  // Carve out a 5-day available window every ~18-26 days.
  let cursor = new Date(start);
  cursor.setDate(cursor.getDate() + 10); // skip immediate dates
  while (cursor <= end){
    const windowStart = new Date(cursor);
    for (let i=0;i<5;i++){
      const d = new Date(windowStart); d.setDate(d.getDate()+i);
      if (d>end) break;
      // Fri/Sat in the window: 70% chance "Last trailer" instead of fully available.
      const day = d.getDay();
      const isWeekend = day===5 || day===6;
      availability[key(d)] = isWeekend && rand()<0.7 ? 'limited' : 'available';
    }
    // Also sprinkle a few random single "limited" days outside windows
    for (let i=0;i<3;i++){
      const off = Math.floor(rand()*14)+6;
      const d = new Date(windowStart); d.setDate(d.getDate()+off);
      if (d<=end && availability[key(d)]==='booked' && rand()<0.5){
        availability[key(d)] = 'limited';
      }
    }
    const jump = 18 + Math.floor(rand()*9); // 18-26 days
    cursor.setDate(cursor.getDate() + jump);
  }

  // Past days (shouldn't exist since start=today's month) marked past.
  const today = new Date(); today.setHours(0,0,0,0);
  for (let d=new Date(start); d<today; d.setDate(d.getDate()+1)){
    availability[key(d)] = 'past';
  }
})();

function key(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}
function monthLabel(d){
  return d.toLocaleDateString('en-NZ',{month:'long',year:'numeric'});
}

function renderCalendar(){
  calLabel.textContent = monthLabel(viewMonth);
  calGrid.innerHTML = '';
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const last  = new Date(viewMonth.getFullYear(), viewMonth.getMonth()+1, 0);
  // Monday-start grid.
  let lead = (first.getDay()+6)%7;
  for (let i=0;i<lead;i++){
    const pad = document.createElement('div');
    pad.className='day pad';
    calGrid.appendChild(pad);
  }
  for (let n=1;n<=last.getDate();n++){
    const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), n);
    const st = availability[key(d)] || 'booked';
    const cell = document.createElement('div');
    cell.className = `day ${st}`;
    cell.innerHTML = `<span class="num">${n}</span><span class="st">${
      st==='available' ? 'Open' :
      st==='limited'   ? 'Last 1' :
      st==='past'      ? '—' : 'Booked'
    }</span>`;
    if (st==='available' || st==='limited'){
      cell.style.cursor='pointer';
      cell.title='Select this date in the booking form';
      cell.addEventListener('click',()=>{
        document.getElementById('book').scrollIntoView({behavior:'smooth'});
        const want = key(d);
        for (const opt of dateSelect.options){
          if (opt.value===want){ dateSelect.value=want; break; }
        }
      });
    }
    calGrid.appendChild(cell);
  }
}

document.getElementById('calPrev').addEventListener('click',()=>{
  const min = new Date(START.getFullYear(), START.getMonth(), 1);
  if (viewMonth > min){
    viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth()-1, 1);
    renderCalendar();
  }
});
document.getElementById('calNext').addEventListener('click',()=>{
  const max = new Date(START.getFullYear(), START.getMonth()+11, 1);
  if (viewMonth < max){
    viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth()+1, 1);
    renderCalendar();
  }
});
renderCalendar();

// Populate date select with available/limited days only.
(function fillDates(){
  const options = [];
  const sorted = Object.keys(availability).sort();
  for (const k of sorted){
    const st = availability[k];
    if (st==='available' || st==='limited'){
      const d = new Date(k);
      const label = d.toLocaleDateString('en-NZ',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
      options.push(`<option value="${k}">${label}${st==='limited'?' · last trailer':''}</option>`);
    }
  }
  dateSelect.insertAdjacentHTML('beforeend', options.join(''));
})();

// ---------- Form ----------
function submitBooking(e){
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form).entries());
  const msg = document.getElementById('formMsg');
  msg.textContent = `Thanks ${data.name.split(' ')[0]} — enquiry received for ${data.date} at our ${data.location} depot. We'll be in touch within 2 business hours to confirm and collect your $100 deposit.`;
  form.reset();
  return false;
}

// Footer year
document.getElementById('yr').textContent = new Date().getFullYear();
