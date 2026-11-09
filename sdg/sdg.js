// SDG 여권 공용 스크립트(모든 페이지가 같이 쓴다): 반 코드·별명, 도장 찍기, 도장 알림.
// <script src="/sdg-worlds/sdg/sdg.js"></script> 를 넣으면 window.SDG 가 생긴다.
(function () {
  const KEY = 'sdg.passport';
  const NO_SERVER = true;   // tools/build_pages.js가 true로 바꾼다: 여권 서버가 없는 곳에서는 도장을 이 기기에만 모은다
  const STAMPS = 'sdg.stamps';
  let goalsP = null;
  const css = `
  .sdg-toast{position:fixed;left:50%;top:calc(14px + env(safe-area-inset-top,0px));transform:translate(-50%,-16px);z-index:99;display:flex;gap:10px;align-items:center;
    padding:10px 16px 10px 10px;border-radius:14px;background:rgba(14,10,24,.92);color:#fff;font:600 14px/1.35 system-ui,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;
    box-shadow:0 10px 30px rgba(0,0,0,.35);opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;max-width:min(92vw,460px)}
  .sdg-toast.on{opacity:1;transform:translate(-50%,0)}
  .sdg-toast b{display:grid;place-items:center;min-width:42px;height:42px;border-radius:10px;font:800 17px/1 system-ui,sans-serif;color:#fff}
  .sdg-toast small{display:block;opacity:.75;font-weight:500}
  .sdg-modal{position:fixed;inset:0;z-index:100;display:grid;place-items:center;background:rgba(5,3,12,.62);padding:16px}
  .sdg-modal form{width:min(380px,100%);display:grid;gap:12px;padding:22px;border-radius:18px;background:#15112a;color:#f2ecff;border:1px solid rgba(255,255,255,.1);
    font:15px/1.5 system-ui,"Malgun Gothic","Apple SD Gothic Neo",sans-serif}
  .sdg-modal h2{margin:0;font-size:20px}.sdg-modal p{margin:0;color:#b3a9cf;font-size:13px}
  .sdg-modal label{display:grid;gap:4px;font-size:13px;font-weight:650}
  .sdg-modal input{font:inherit;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:#0d0a1c;color:inherit}
  .sdg-modal .row{display:flex;gap:8px;justify-content:flex-end}
  .sdg-modal button{font:inherit;font-weight:750;padding:10px 16px;border-radius:10px;border:0;cursor:pointer}
  .sdg-modal .ok{background:#ffd23f;color:#120d22}.sdg-modal .no{background:transparent;color:#b3a9cf}
  .sdg-modal .err{color:#ff8a9a;min-height:1.2em}`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  function me() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function setMe(v) { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch (e) {} }
  function myStamps() { try { return JSON.parse(localStorage.getItem(STAMPS) || '{}'); } catch (e) { return {}; } }
  function goals() { return goalsP || (goalsP = fetch('/sdg-worlds/sdg/goals.json').then((r) => r.json())); }

  let toastEl = null, toastTimer = 0;
  async function toast(n, title, sub) {
    const g = (await goals()).goals[n - 1];
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'sdg-toast'; document.body.appendChild(toastEl); }
    toastEl.innerHTML = `<b style="background:${g.color}">${n}</b><div>${title}<small>${sub || 'SDG ' + n + ' · ' + g.name}</small></div>`;
    toastEl.classList.add('on'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 3600);
  }

  // 여권 만들기 창. 실제 이름이 아니라 별명만 받는다.
  // 도장 요청이 겹쳐도(세계 완료 알림이 두 번 오는 등) 창은 하나만 띄우고 같은 결과를 나눠 준다
  let joining = null;
  function join(reason) { return joining || (joining = openJoin(reason).finally(() => { joining = null; })); }
  function openJoin(reason) {
    return new Promise((resolve) => {
      const m = document.createElement('div'); m.className = 'sdg-modal';
      const cur = me() || {};
      m.innerHTML = `<form><h2>SDG 여권 만들기</h2><p>${reason || '공간을 돌아다니며 SDG 17개 목표 도장을 모아요.'} 실제 이름 대신 <b>별명</b>을 써 주세요.</p>
        <label>반 코드 <input name="cls" required maxlength="16" placeholder="예: 3A" value="${cur.cls || ''}"></label>
        <label>별명 <input name="nick" required maxlength="12" placeholder="예: 바람돌이" value="${cur.nick || ''}"></label>
        <div class="err"></div><div class="row"><button type="button" class="no">나중에</button><button class="ok">여권 만들기</button></div></form>`;
      document.body.appendChild(m);
      const f = m.querySelector('form');
      f.cls.focus();
      m.querySelector('.no').onclick = () => { m.remove(); resolve(null); };
      f.onsubmit = async (e) => {
        e.preventDefault();
        const r = NO_SERVER ? null : await fetch('/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cls: f.cls.value, nick: f.nick.value }) });
        const j = NO_SERVER ? { cls: f.cls.value.trim().toUpperCase(), nick: f.nick.value.trim(), stamps: myStamps() } : await r.json();
        if (r && !r.ok) { m.querySelector('.err').textContent = j.error; return; }
        setMe({ cls: j.cls, nick: j.nick }); m.remove(); resolve(j);
        window.dispatchEvent(new CustomEvent('sdg:passport', { detail: j }));
      };
    });
  }

  async function passport() {
    const who = me(); if (!who) return null;
    if (NO_SERVER) return { ...who, stamps: myStamps() };
    const r = await fetch(`/api/passport?cls=${encodeURIComponent(who.cls)}&nick=${encodeURIComponent(who.nick)}`);
    if (r.status === 404) { setMe(null); return null; }
    return r.json();
  }

  // 도장 찍기: 여권이 없으면 만들기 창을 띄운다. 새 도장이면 알림.
  async function stamp(n, via, title) {
    let who = me();
    if (!who) { const j = await join(`SDG ${n} 도장을 받으려면 여권이 필요해요.`); if (!j) return { new: false }; who = me(); }
    if (NO_SERVER) {
      const stamps = myStamps(), isNew = !stamps[n];
      if (isNew) { stamps[n] = { via, at: Date.now() }; try { localStorage.setItem(STAMPS, JSON.stringify(stamps)); } catch (e) {} }
      const j = { new: isNew, stamps };
      if (isNew) { toast(n, title || `SDG ${n} 도장을 받았어요!`); window.dispatchEvent(new CustomEvent('sdg:passport', { detail: j })); }
      return j;
    }
    const r = await fetch('/api/stamp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cls: who.cls, nick: who.nick, goal: n, via }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 404) { setMe(null); return stamp(n, via, title); }
    if (j.new) { toast(n, title || `SDG ${n} 도장을 받았어요!`); window.dispatchEvent(new CustomEvent('sdg:passport', { detail: j })); }
    return j;
  }

  window.SDG = { me, setMe, goals, toast, join, passport, stamp };
})();
