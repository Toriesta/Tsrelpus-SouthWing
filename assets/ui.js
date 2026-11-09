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

    /* 读者投稿：静态导航若未写死，就补在「栏目」之后 */
    const inSub = /(^|\/)submissions\//.test(location.pathname);
    if (!nav.querySelector('a[data-sub-link]')) {
      const chLink = nav.querySelector('a[href$="channels.html"]');
      const sub = document.createElement('a');
      sub.textContent = '投稿';
      sub.href = inSub ? './index.html' : rootUrl('submissions/index.html');
      sub.dataset.subLink = '1';
      if (inSub) sub.classList.add('on');
      if (chLink) chLink.after(sub); else nav.append(sub);
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

  /* 文章页：阅读 / 点赞（初期展示值，可在 .article-head 上用
     data-views / data-likes 单独指定）+ 分享按钮 */
  const fmtN = (n) => n.toLocaleString('en-US');
  const seedFor = (key) => {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
    h = h >>> 0;
    return { views: 1800 + h % 4200, likes: 120 + (h >>> 8) % 380 };
  };

  const articleHead = document.querySelector('.article-head');
  const byline = articleHead && articleHead.querySelector('.byline');
  if (byline) {
    const seed = seedFor(location.pathname);
    const views = articleHead.dataset.views ? parseInt(articleHead.dataset.views, 10) : seed.views;
    const likes = articleHead.dataset.likes ? parseInt(articleHead.dataset.likes, 10) : seed.likes;

    const stats = document.createElement('div');
    stats.className = 'stats';
    stats.title = '初期展示值，非实时统计';
    stats.innerHTML =
      '<span class="stat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.7"/></svg><b>' + fmtN(views) + '</b> 阅读</span>' +
      '<span class="stat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-9.3A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7 3.7C19 15.6 12 20 12 20Z"/></svg><b>' + fmtN(likes) + '</b> 点赞</span>' +
      '<button class="share" type="button">分享这篇</button>';
    byline.after(stats);

    const share = stats.querySelector('.share');
    const copy = () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(location.href).then(
          () => say('链接已复制，可以直接转发'),
          () => window.prompt('复制这条链接分享', location.href)
        );
      } else {
        window.prompt('复制这条链接分享', location.href);
      }
    };
    share.addEventListener('click', async () => {
      /* 桌面端优先复制链接；手机（粗指针）才调系统分享 */
      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if (navigator.share && coarse) {
        try {
          await navigator.share({ title: document.title.split('｜')[0], url: location.href });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }
      copy();
    });
  }

  /* 信息流卡片：也带阅读 / 点赞，和点进去的文章用同一套数 */
  document.querySelectorAll('.card').forEach((card) => {
    const link = card.querySelector('a[href]');
    const meta = card.querySelector('.card-meta');
    if (!link || !meta || meta.querySelector('.cstat')) return;
    let key = link.getAttribute('href');
    try { key = new URL(key, location.href).pathname; } catch (e) {}
    const s = seedFor(key);
    const el = document.createElement('span');
    el.className = 'cstat';
    el.textContent = fmtN(s.views) + ' 阅读 · ' + fmtN(s.likes) + ' 点赞';
    meta.append(el);
  });

  window.TsUi = { state: state, save: save, apply: apply, say: say, synth: 'speechSynthesis' in window ? window.speechSynthesis : null };
})();
