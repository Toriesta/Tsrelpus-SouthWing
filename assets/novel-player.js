/* 天枢南翼 · 小说听书播放器
   页面要求：body 带 novel-page；正文容器 id="np-body"；每一回是 section.np；
   页面里放一个 id="np-start" 的「开始听书」按钮即可。播放条由本脚本生成。
   特点：分句朗读（避开长句被浏览器截断）、逐段高亮、回目跳转、倍速、
   进度拖动、断点续听（localStorage）。 */
(function () {
  if (window.__tsNovelPlayer) return;
  window.__tsNovelPlayer = true;
  if (!document.body || !document.body.classList.contains('novel-page')) return;

  var bodyEl = document.getElementById('np-body');
  if (!bodyEl) return;

  var synth = window.speechSynthesis;
  var MAX = 90; /* 单句上限：太长会被部分浏览器截断 */
  var CHUNK_GAP = 120;
  var CHAPTER_GAP = 420;

  /* ---------- 回目与分句 ---------- */
  function chunksOf(text) {
    if (!text) return [''];
    var sents = text.match(/[^。！？；…\n]+[。！？；…]+|[^。！？；…\n]+$/g) || [text];
    var out = [];
    sents.forEach(function (s) {
      s = s.trim();
      if (!s) return;
      var rest = s;
      while (rest.length > MAX) {
        var cut = -1;
        for (var i = MAX - 1; i > 24; i--) {
          if ('，、,：'.indexOf(rest.charAt(i)) >= 0) { cut = i; break; }
        }
        if (cut < 0) cut = MAX - 1;
        out.push(rest.slice(0, cut + 1));
        rest = rest.slice(cut + 1);
      }
      if (rest) out.push(rest);
    });
    return out.length ? out : [''];
  }

  var chapters = [].slice.call(bodyEl.querySelectorAll('section.np')).map(function (sec, i) {
    var h2 = sec.querySelector('h2');
    var title = sec.getAttribute('data-title') ||
      (h2 ? h2.innerText : '第 ' + (i + 1) + ' 回');
    title = title.replace(/\s+/g, ' ').trim();
    var paras = [].slice.call(sec.querySelectorAll('p')).map(function (p) {
      var t = p.innerText.replace(/\s+/g, ' ').trim();
      return { el: p, text: t, chunks: chunksOf(t) };
    });
    return { el: sec, h2: h2, title: title, paras: paras };
  });

  if (!chapters.length) return;
  chapters.forEach(function (ch, i) {
    if (ch.h2) { ch.h2.title = '从这一回开头听'; }
  });

  /* ---------- 断点 ---------- */
  var bookId = (document.querySelector('article[id]') || {}).id || 'novel';

  /* App 内没有 speechSynthesis：收起「开始听书」，把「划着听」指向当前这一回 */
  var isApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ||
    /Android.*;\s*wv\)/.test(navigator.userAgent);
  if (isApp) {
    var startEl = document.getElementById('np-start');
    if (startEl) startEl.hidden = true;
    var listenEl = document.getElementById('np-listen');
    if (listenEl) {
      var syncListen = function () {
        var best = -1, bestTop = -Infinity;
        chapters.forEach(function (ch, i) {
          var r = ch.el.getBoundingClientRect();
          if (r.top <= 150 && r.top > bestTop) { bestTop = r.top; best = i; }
        });
        if (best < 0) best = 0;
        listenEl.href = '../listen.html?book=' + encodeURIComponent(bookId) + '&ch=' + (best + 1);
        listenEl.title = '从第 ' + (best + 1) + ' 回开始，一屏一回划着听';
      };
      syncListen();
      var ticking = false;
      window.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () { ticking = false; syncListen(); });
      }, { passive: true });
    }
    return;
  }

  var KEY = 'tsnp:' + bookId;
  var RATE_KEY = 'tsnp-rate';
  var st = { ch: 0, p: 0, c: 0, playing: false, started: false, ended: false, rate: 1 };

  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && chapters[saved.ch]) {
      st.ch = saved.ch;
      st.p = Math.min(Math.max(0, Number(saved.p) || 0), chapters[st.ch].paras.length - 1);
    }
    var r = Number(localStorage.getItem(RATE_KEY));
    if (r >= 0.5 && r <= 2) st.rate = r;
  } catch (e) {}

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ ch: st.ch, p: st.p })); } catch (e) {}
  }

  /* ---------- 朗读 ---------- */
  var voice = null;
  function pickVoice() {
    if (!synth || !synth.getVoices) return;
    var list = synth.getVoices();
    voice = null;
    for (var i = 0; i < list.length; i++) {
      if (!/^zh/i.test(list[i].lang)) continue;
      if (!voice) voice = list[i];
      if (/^zh[-_]CN/i.test(list[i].lang) && /Xiaoxiao|Huihui|Yaoyao|Tingting|Meijia|Female/i.test(list[i].name)) {
        voice = list[i];
        break;
      }
    }
  }
  pickVoice();
  if (synth && synth.addEventListener) synth.addEventListener('voiceschanged', pickVoice);

  var token = 0;
  var lastKey = '';

  function stopVoice() {
    token++;
    if (!synth) return;
    try { synth.cancel(); } catch (e) {}
  }

  function speak() {
    if (!synth) {
      alert('这个浏览器不支持听书。请用 Chrome、Edge 或 Safari。');
      return;
    }
    var ch = chapters[st.ch];
    var para = ch && ch.paras[st.p];
    if (!para) return;
    if (st.c >= para.chunks.length) st.c = 0;

    var u = new SpeechSynthesisUtterance(para.chunks[st.c]);
    u.lang = 'zh-CN';
    u.rate = st.rate;
    u.pitch = 1;
    if (voice) u.voice = voice;

    var my = ++token;
    u.onstart = function () {
      if (my !== token) return;
      st.playing = true;
      st.started = true;
      st.ended = false;
      mark();
      ui();
    };
    u.onend = function () {
      if (my !== token) return;
      next();
    };
    u.onerror = function (ev) {
      if (my !== token) return;
      if (ev && ev.error && /interrupted|cancel/i.test(ev.error)) return;
      next();
    };

    synth.speak(u);
    st.playing = true;
    st.started = true;
    st.ended = false;
    save();
    mark();
    ui();
  }

  function next() {
    var ch = chapters[st.ch];
    var para = ch.paras[st.p];
    if (st.c < para.chunks.length - 1) {
      st.c++;
      setTimeout(function () { if (st.playing) speak(); }, CHUNK_GAP);
      return;
    }
    if (st.p < ch.paras.length - 1) {
      st.p++;
      st.c = 0;
      save();
      setTimeout(function () { if (st.playing) speak(); }, CHUNK_GAP);
      return;
    }
    if (st.ch < chapters.length - 1) {
      st.ch++;
      st.p = 0;
      st.c = 0;
      save();
      setTimeout(function () { if (st.playing) speak(); }, CHAPTER_GAP);
      return;
    }
    st.playing = false;
    st.ended = true;
    ui();
  }

  /* ---------- 播放条 ---------- */
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
      }
    }
    if (text != null) n.textContent = text;
    return n;
  }

  var wrap = el('div', { class: 'np-player', role: 'region', 'aria-label': '听书播放器', hidden: 'hidden' });
  var range = el('input', { class: 'npb-range', type: 'range', min: '1', max: '1', step: '1', value: '1', 'aria-label': '本回进度' });
  var bar = el('div', { class: 'np-player-in' });
  var playBtn = el('button', { type: 'button', class: 'npb-play', 'data-state': 'paused' }, '播放');
  var meta = el('div', { class: 'npb-meta' });
  var metaTitle = el('b', null, '—');
  var metaSub = el('span', null, '—');
  meta.appendChild(metaTitle);
  meta.appendChild(metaSub);
  var ctrl = el('div', { class: 'npb-ctrl' });
  var prevBtn = el('button', { type: 'button', class: 'npb-btn' }, '上一回');
  var nextBtn = el('button', { type: 'button', class: 'npb-btn' }, '下一回');
  var RATES = [0.8, 1, 1.25, 1.5];
  function rateLabel(r) { return (r === 1 ? '1.0' : String(r)) + '×'; }
  var rateBtn = el('button', {
    type: 'button', class: 'npb-btn npb-rate',
    'aria-label': '语速 ' + rateLabel(st.rate) + '，点一下切换'
  }, rateLabel(st.rate));
  var tocBtn = el('button', { type: 'button', class: 'npb-btn' }, '目录');
  var closeBtn = el('button', { type: 'button', class: 'npb-btn' }, '收起');
  ctrl.appendChild(prevBtn);
  ctrl.appendChild(nextBtn);
  ctrl.appendChild(rateBtn);
  ctrl.appendChild(tocBtn);
  ctrl.appendChild(closeBtn);

  bar.appendChild(playBtn);
  bar.appendChild(meta);
  bar.appendChild(ctrl);

  var toc = el('div', { class: 'npb-toc', hidden: 'hidden' });
  var tocH = el('div', { class: 'npb-toc-h' });
  var tocH1 = el('span', null, '目录 · 共 ' + chapters.length + ' 回');
  var tocH2 = el('span', null, '点一回，从那回开头听');
  tocH.appendChild(tocH1);
  tocH.appendChild(tocH2);
  var tocOl = el('ol');
  var tocButtons = chapters.map(function (ch, i) {
    var li = el('li');
    var b = el('button', { type: 'button' });
    b.appendChild(el('i', null, (i + 1 < 10 ? '0' : '') + (i + 1)));
    var nb = el('b', null, ch.title);
    b.appendChild(nb);
    li.appendChild(b);
    tocOl.appendChild(li);
    b.addEventListener('click', function () {
      go(i, 0, st.playing);
    });
    return b;
  });
  toc.appendChild(tocH);
  toc.appendChild(tocOl);

  wrap.appendChild(range);
  wrap.appendChild(bar);
  wrap.appendChild(toc);
  document.body.appendChild(wrap);

  var startBtn = document.getElementById('np-start');
  var copyBtn = document.getElementById('np-copy');
  var listenLink = document.getElementById('np-listen');
  var listenBook = '';
  if (listenLink) {
    try { listenBook = new URL(listenLink.href, location.href).searchParams.get('book') || ''; } catch (e) {}
  }

  function show() {
    wrap.hidden = false;
    padBody();
  }
  function hide() {
    wrap.hidden = true;
    toc.hidden = true;
    padBody();
  }

  /* 播放条的高度会随字号与换行变化，正文底部留白按实际高度算 */
  function padBody() {
    if (wrap.hidden) {
      document.body.classList.remove('np-open');
      document.body.style.paddingBottom = '';
      return;
    }
    document.body.classList.add('np-open');
    var h = range.offsetHeight + bar.offsetHeight + 2;
    if (h > 0) document.body.style.paddingBottom = (h + 8) + 'px';
  }

  function mark() {
    var ch = chapters[st.ch];
    var para = ch && ch.paras[st.p];
    [].forEach.call(bodyEl.querySelectorAll('section.np'), function (s) {
      s.classList.toggle('lit', s === ch.el);
    });
    [].forEach.call(bodyEl.querySelectorAll('p.speaking'), function (p) {
      p.classList.remove('speaking');
    });
    if (!para || !para.el) return;
    para.el.classList.add('speaking');

    var key = st.ch + ':' + st.p;
    if (key !== lastKey) {
      lastKey = key;
      if (para.el.scrollIntoView) {
        var r = para.el.getBoundingClientRect();
        if (r.top < 80 || r.bottom > window.innerHeight - 130) {
          para.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
    }
  }

  function ui() {
    var ch = chapters[st.ch];
    metaTitle.textContent = ch.title;
    metaSub.textContent = '第 ' + (st.ch + 1) + ' / ' + chapters.length + ' 回 · 第 ' +
      (st.p + 1) + ' / ' + ch.paras.length + ' 段';
    playBtn.textContent = st.playing ? '暂停' : (st.ended ? '重听' : '播放');
    playBtn.setAttribute('data-state', st.playing ? 'playing' : 'paused');
    playBtn.setAttribute('aria-label', st.playing ? '暂停朗读' : '开始朗读');
    range.max = ch.paras.length;
    range.value = st.p + 1;
    prevBtn.disabled = st.ch === 0;
    nextBtn.disabled = st.ch === chapters.length - 1;
    tocButtons.forEach(function (b, i) { b.classList.toggle('on', i === st.ch); });
    if (listenLink) {
      listenLink.href = '../listen.html?book=' + encodeURIComponent(listenBook) + '&ch=' + (st.ch + 1);
      listenLink.title = '从第 ' + (st.ch + 1) + ' 回开始，一屏一回划着听';
    }
    if (startBtn) {
      var resume = !st.playing && !st.ended && (st.ch > 0 || st.p > 0);
      startBtn.textContent = st.playing ? '正在听书…' :
        (st.ended ? '重听' : (resume ? '接着听（第 ' + (st.ch + 1) + ' 回）' : '开始听书'));
    }
    padBody();
  }

  function go(ch, p, keepPlaying) {
    if (!chapters[ch]) return;
    st.ch = ch;
    st.p = Math.min(Math.max(0, p), chapters[ch].paras.length - 1);
    st.c = 0;
    st.ended = false;
    lastKey = '';
    save();
    mark();
    ui();
    if (keepPlaying) {
      stopVoice();
      st.playing = true;
      setTimeout(function () { if (st.playing) speak(); }, 80);
    }
  }

  function toggle() {
    if (!synth) {
      alert('这个浏览器不支持听书。请用 Chrome、Edge 或 Safari。');
      return;
    }
    if (st.playing) {
      st.playing = false;
      try { synth.pause(); } catch (e) {}
      ui();
      return;
    }
    if (st.ended) {
      st.ch = 0;
      st.p = 0;
      st.c = 0;
      st.ended = false;
      lastKey = '';
      save();
      speak();
      return;
    }
    if (synth.paused) {
      try { synth.resume(); } catch (e) {}
      st.playing = true;
      ui();
      /* 个别手机浏览器 pause 之后 resume 不生效，退回到重读本段 */
      setTimeout(function () {
        if (st.playing && !synth.speaking && !synth.pending) speak();
      }, 700);
      return;
    }
    speak();
  }

  playBtn.addEventListener('click', toggle);
  prevBtn.addEventListener('click', function () { go(st.ch - 1, 0, st.playing); });
  nextBtn.addEventListener('click', function () { go(st.ch + 1, 0, st.playing); });
  closeBtn.addEventListener('click', function () {
    st.playing = false;
    stopVoice();
    hide();
    ui();
  });
  tocBtn.addEventListener('click', function () {
    show();
    toc.hidden = !toc.hidden;
  });
  range.addEventListener('change', function () {
    var p = Math.min(Math.max(1, Number(range.value) || 1), chapters[st.ch].paras.length) - 1;
    go(st.ch, p, st.playing);
  });
  rateBtn.addEventListener('click', function () {
    var i = RATES.indexOf(st.rate);
    st.rate = RATES[(i + 1) % RATES.length];
    rateBtn.textContent = rateLabel(st.rate);
    rateBtn.setAttribute('aria-label', '语速 ' + rateLabel(st.rate) + '，点一下切换');
    try { localStorage.setItem(RATE_KEY, String(st.rate)); } catch (e) {}
    if (st.playing) {
      stopVoice();
      st.playing = true;
      setTimeout(function () { if (st.playing) speak(); }, 80);
    }
  });

  if (startBtn) {
    startBtn.addEventListener('click', function () {
      show();
      if (st.playing) return;          /* 已在读：只把播放条亮出来 */
      if (synth && synth.paused && !st.ended) { toggle(); return; }
      if (st.ended) {
        st.ch = 0; st.p = 0; st.c = 0; st.ended = false; lastKey = ''; save();
      }
      st.started = true;
      lastKey = '';
      ui();
      speak();
    });
  }

  chapters.forEach(function (ch, i) {
    if (!ch.h2) return;
    ch.h2.addEventListener('click', function () {
      show();
      st.started = true;
      var keep = st.playing;
      if (keep) stopVoice();
      go(i, 0, keep);
      if (!keep) speak();
    });
  });

  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var txt = chapters.map(function (ch) {
        return ch.title + '\n\n' + ch.paras.map(function (p) { return p.text; }).join('\n');
      }).join('\n\n\n');
      function done() {
        copyBtn.textContent = '已复制全文';
        setTimeout(function () { copyBtn.textContent = '复制纯文本'; }, 2000);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(done, done);
      } else {
        var ta = document.createElement('textarea');
        ta.value = txt;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
        done();
      }
    });
  }

  window.addEventListener('pagehide', stopVoice);
  window.addEventListener('resize', padBody);

  lastKey = st.ch + ':' + st.p;
  ui();
  /* 有断点才标出上次读到的那一段；新读者打开时正文保持干净 */
  if (st.ch > 0 || st.p > 0) mark();
})();
