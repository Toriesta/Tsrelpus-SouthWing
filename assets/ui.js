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
  const siteRoot = src ? src.slice(0, src.lastIndexOf('/assets/') + 1) : '';
  const rootUrl = (name) => (siteRoot ? siteRoot + name : name);
  if (nav && nav.parentNode) {
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

  /* 文章页：分享按钮。站内没装统计，也就不摆阅读量、点赞数 */
  const articleHead = document.querySelector('.article-head');
  const byline = articleHead && articleHead.querySelector('.byline');
  if (byline) {
    const stats = document.createElement('div');
    stats.className = 'stats';
    stats.innerHTML = '<button class="share" type="button">分享这篇</button>';
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

  /* 热点速览：底部固定滚动条，可关闭，关掉后记住 */
  (function ticker() {
    if (/(^|\/)listen\.html$/.test(location.pathname)) return;
    if (document.querySelector('.np')) return;
    try { if (localStorage.getItem(KEY + '_tick') === '0') return; } catch (e) {}

    const items = [
      ['2026-11-09/news.html', '招工 7000 起，四人间'],
      ['gossip.html#rocket', '长征十二号 04:24 发射'],
      ['gossip.html#caixun', '六合彩 26/118 已开奖'],
      ['gossip.html', '南翼八卦 20 条'],
      ['novel/007-jin-jing-du-xia.html', '小说｜度夏'],
      ['observations/002-miao-yu-rizi.html', '庙不是景点，是日程表']
    ];

    const bar = document.createElement('div');
    bar.className = 'tick';
    bar.setAttribute('role', 'complementary');
    bar.setAttribute('aria-label', '热点速览');
    bar.innerHTML =
      '<span class="tick-lab"><i></i>热点速览</span>' +
      '<div class="tick-view"><div class="tick-track"></div></div>' +
      '<button class="tick-x" type="button" aria-label="关闭热点速览">×</button>';

    const track = bar.querySelector('.tick-track');
    const group = () => {
      const g = document.createElement('div');
      g.className = 'tick-g';
      items.forEach(([href, text], i) => {
        const a = document.createElement('a');
        a.href = rootUrl(href);
        a.innerHTML = '<i>' + (i + 1) + '</i>' + text;
        g.append(a);
      });
      return g;
    };
    /* 放两份，滚动到 -50% 时正好接上，循环无缝 */
    track.append(group(), group());

    bar.querySelector('.tick-x').addEventListener('click', () => {
      bar.remove();
      document.documentElement.classList.remove('has-tick');
      try { localStorage.setItem(KEY + '_tick', '0'); } catch (e) {}
    });

    document.body.append(bar);
    document.documentElement.classList.add('has-tick');
  })();

  /* 页脚：全站统一的次级入口，不占顶部导航 */
  (function footMeta() {
    const foot = document.querySelector('footer.foot');
    if (!foot || foot.querySelector('[data-foot-meta]')) return;
    const here = location.pathname;
    const items = [
      ['观察 001', 'observations/001-shi-zhen-chanye.html'],
      ['来源核验', 'sources.html'],
      ['关于本刊', 'about.html'],
      ['AI 用法', 'ai.html'],
      ['投稿', 'submissions/index.html'],
      ['阅读设置', 'settings.html'],
      ['规则与合规', 'legal.html']
    ];
    const box = document.createElement('span');
    box.className = 'foot-meta';
    box.dataset.footMeta = '1';
    items.forEach(([label, href]) => {
      const a = document.createElement('a');
      a.textContent = label;
      a.href = rootUrl(href);
      if (here.endsWith('/' + href)) a.classList.add('on');
      box.append(a);
    });
    foot.append(box);
  })();

  window.TsUi = { state: state, save: save, apply: apply, say: say, synth: 'speechSynthesis' in window ? window.speechSynthesis : null };
})();
