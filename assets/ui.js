/* 天枢南翼 · 阅读设置：状态持久化 + 导航入口 */
(function () {
  const KEY = 'tsui';
  const root = document.documentElement;
  const state = { fs: '1', theme: 'light', rate: 1 };

  try {
    const old = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (old && typeof old === 'object') {
      if (old.fs === '1' || old.fs === '2' || old.fs === '3') state.fs = old.fs;
      else if (old.big) state.fs = '2';
      if (old.theme === 'light' || old.theme === 'dark' || old.theme === 'auto') state.theme = old.theme;
      else if (old.night) state.theme = 'dark';
      if (typeof old.rate === 'number') state.rate = old.rate;
    }
  } catch (e) {}

  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function apply() {
    root.classList.toggle('big', state.fs === '2');
    root.classList.toggle('xbig', state.fs === '3');
    const dark = state.theme === 'dark' || (state.theme === 'auto' && mq && mq.matches);
    root.classList.toggle('night', dark);
  }
  apply();
  if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (state.theme === 'auto') apply(); });

  /* 提示条 */
  const toast = document.createElement('div');
  toast.className = 'uitoast';
  toast.setAttribute('role', 'status');
  document.body.append(toast);
  let timer = 0;
  function say(msg) {
    toast.textContent = msg;
    toast.classList.add('on');
    clearTimeout(timer);
    timer = setTimeout(() => toast.classList.remove('on'), 1800);
  }

  /* 导航入口：按当前脚本位置推算站点根目录 */
  const nav = document.querySelector('.nav');
  const src = document.currentScript ? document.currentScript.src : '';
  const rootUrl = (name) => (src ? new URL('../' + name, src).href : name);
  if (nav && nav.parentNode) {
    const link = document.createElement('a');
    link.className = 'setlink';
    link.textContent = '阅读设置';
    link.href = rootUrl('settings.html');
    if (/(^|\/)settings\.html$/.test(location.pathname)) link.classList.add('on');
    nav.append(link);

    /* 谷子地图：静态页若未写死，就补在「游戏」之后 */
    if (!nav.querySelector('a[href$="offline.html"]')) {
      const gamesLink = nav.querySelector('a[href$="games.html"]');
      if (gamesLink) {
        const map = document.createElement('a');
        map.textContent = '谷子地图';
        map.href = rootUrl('offline.html');
        gamesLink.after(map);
      }
    } else if (/(^|\/)offline\.html$/.test(location.pathname)) {
      nav.querySelector('a[href$="offline.html"]').classList.add('on');
    }

    /* 农历日历：静态页若未写死，就补在「十镇」之后 */
    if (!nav.querySelector('a[href$="calendar.html"]')) {
      const townsLink = nav.querySelector('a[href$="towns.html"]');
      if (townsLink) {
        const cal = document.createElement('a');
        cal.textContent = '农历';
        cal.href = rootUrl('calendar.html');
        if (/(^|\/)calendar\.html$/.test(location.pathname)) cal.classList.add('on');
        townsLink.after(cal);
      }
    } else if (/(^|\/)calendar\.html$/.test(location.pathname)) {
      nav.querySelector('a[href$="calendar.html"]').classList.add('on');
    }

    /* 小说：静态页若未写死，就补在「谷子地图」之后（没有则补在「游戏」之后） */
    const isNovel = /(^|\/)novel(\.html|\/)/.test(location.pathname);
    if (!nav.querySelector('a[href$="novel.html"]')) {
      const before = nav.querySelector('a[href$="offline.html"]') || nav.querySelector('a[href$="games.html"]');
      const nv = document.createElement('a');
      nv.textContent = '小说';
      nv.href = rootUrl('novel.html');
      if (isNovel) nv.classList.add('on');
      if (before) before.after(nv); else nav.append(nv);
    } else if (isNovel) {
      nav.querySelector('a[href$="novel.html"]').classList.add('on');
    }

    /* 手机端导航是单行横滑，把当前栏目先滚到中间——
       不然打开一页，看导航不知道自己站在哪一栏 */
    const centerActive = () => {
      if (nav.scrollWidth <= nav.clientWidth + 4) return;
      const cur = nav.querySelector('a.on');
      if (!cur) return;
      const nr = nav.getBoundingClientRect();
      const cr = cur.getBoundingClientRect();
      nav.scrollLeft += (cr.left - nr.left) - (nr.width - cr.width) / 2;
    };
    requestAnimationFrame(centerActive);
    /* 字体加载完字宽会变，再对一次 */
    window.addEventListener('load', centerActive);
  }

  window.TsUi = { state: state, save: save, apply: apply, say: say, synth: 'speechSynthesis' in window ? window.speechSynthesis : null };
})();
