/* 天枢南翼 · 划着听
   一屏一回，上划下一回；像刷短视频一样听小说。
   作品来自 assets/data/novels.json；正文直接从阅读页的 section.np 里取，
   作者不用另写一份听书稿。 */
(function () {
  if (!document.body || !document.body.classList.contains('listen-page')) return;

  var feed = document.getElementById('feed');
  if (!feed) return;

  var countEl = document.getElementById('count');
  var titleEl = document.getElementById('title');
  var subEl = document.getElementById('sub');
  var progEl = document.getElementById('prog');
  var playBtn = document.getElementById('play');
  var rateBtn = document.getElementById('rate');
  var likeBtn = document.getElementById('like');
  var likeN = document.getElementById('likeN');
  var skipBtn = document.getElementById('skip');
  var nextBookBtn = document.getElementById('nextBook');
  var tocBtn = document.getElementById('toc');
  var sheet = document.getElementById('sheet');
  var sheetList = document.getElementById('sheetList');
  var sheetClose = document.getElementById('sheetClose');
  var gate = document.getElementById('gate');
  var gatePlay = document.getElementById('gatePlay');
  var toastEl = document.getElementById('toast');

  /* App（安卓 WebView）不支持 speechSynthesis，听书只能走预生成的音频。
     网页端有音频时也优先用音频，音质和一致性好过本机语音。 */
  var isApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ||
    /Android.*;\s*wv\)/.test(navigator.userAgent);

  var VOICES = [
    { id: 'xiaoxiao', name: '晓晓' },
    { id: 'yunxi', name: '云希' },
    { id: 'yunjian', name: '云健' }
  ];
  var VOICE_KEY = 'tslisten-voice';
  var voice = 'xiaoxiao';
  try {
    var vv = localStorage.getItem(VOICE_KEY);
    if (vv && VOICES.some(function (v) { return v.id === vv; })) voice = vv;
  } catch (e) {}

  var audio = new Audio();
  audio.preload = 'auto';
  var manifest = null;   /* 音频清单：{ "novel-006/01-xiaoxiao.mp3": 1 } */
  var voiceBtn = null;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function relAudio(book, ci, v) { return book.id + '/' + pad2(ci + 1) + '-' + v + '.mp3'; }
  function hasAudio(c, v) { return !!manifest && !!manifest[relAudio(c.book, c.ci, v || voice)]; }
  function audioSrc(c, v) { return abs('assets/audio/' + relAudio(c.book, c.ci, v || voice)); }
  function voiceName(v) {
    for (var i = 0; i < VOICES.length; i++) if (VOICES[i].id === (v || voice)) return VOICES[i].name;
    return '声音';
  }
  function clock(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }


  var synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  var MAX = 90;
  var RATES = [0.8, 1, 1.25, 1.5];

  var scriptSrc = document.currentScript ? document.currentScript.src : location.href;
  var siteRoot = new URL('../', scriptSrc);
  function abs(p) { return new URL(String(p).replace(/^\.?\//, ''), siteRoot).href; }

  var cards = [];
  var pos = {};            /* 本次会话里每张卡听到第几段，划回来能接上 */
  var liked = {};
  var st = { i: 0, p: 0, c: 0, playing: false, rate: 1, heard: false, token: 0, t: 0, src: '' };
  var sysVoice = null;
  var sheetButtons = [];

  /* ---------- 本地设置 ---------- */
  try {
    var lj = JSON.parse(localStorage.getItem('tslisten-like') || '{}');
    if (lj && typeof lj === 'object') liked = lj;
  } catch (e) {}
  try {
    var rr = Number(localStorage.getItem('tslisten-rate'));
    if (RATES.indexOf(rr) >= 0) st.rate = rr;
  } catch (e) {}

  function saveLikes() {
    try { localStorage.setItem('tslisten-like', JSON.stringify(liked)); } catch (e) {}
  }
  function savePos() {
    try {
      localStorage.setItem('tslisten-pos', JSON.stringify({ i: st.i, p: st.p, t: st.t }));
    } catch (e) {}
  }
  function saveRate() {
    try { localStorage.setItem('tslisten-rate', String(st.rate)); } catch (e) {}
  }

  /* ---------- 朗读 ---------- */
  function pickVoice() {
    if (!synth || !synth.getVoices) return;
    var list = synth.getVoices();
    sysVoice = null;
    for (var i = 0; i < list.length; i++) {
      if (!/^zh/i.test(list[i].lang)) continue;
      if (!sysVoice) sysVoice = list[i];
      if (/^zh[-_]CN/i.test(list[i].lang) && /Xiaoxiao|Huihui|Yaoyao|Tingting|Meijia|Female/i.test(list[i].name)) {
        sysVoice = list[i];
        break;
      }
    }
  }
  pickVoice();
  if (synth && synth.addEventListener) synth.addEventListener('voiceschanged', pickVoice);

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

  function stopVoice() {
    st.token++;
    if (!synth) return;
    try { synth.cancel(); } catch (e) {}
  }

  /* ---------- 音频（预生成 mp3） ---------- */
  audio.addEventListener('play', function () {
    st.playing = true;
    st.heard = true;
    gate.hidden = true;
    updateUI();
  });
  audio.addEventListener('pause', function () {
    if (audio.ended) return;
    st.playing = false;
    updateUI();
  });
  audio.addEventListener('timeupdate', function () {
    if (!st.playing) return;
    st.t = audio.currentTime || 0;
    savePos();
    updateUI();
  });
  audio.addEventListener('ended', function () {
    if (!st.playing) return;
    if (st.i < cards.length - 1) {
      goTo(st.i + 1, true);
    } else {
      st.playing = false;
      updateUI();
      toast('这一部听完了');
    }
  });
  audio.addEventListener('error', function () {
    if (!st.playing) return;
    st.playing = false;
    updateUI();
    if (synth) { speak(); return; }
    toast('这一回的音频没读到');
  });

  function stopAudio() {
    try { audio.pause(); } catch (e) {}
    st.src = '';
    st.t = 0;
    try { audio.removeAttribute('src'); audio.load(); } catch (e) {}
  }

  function playAudio(from) {
    var c = cards[st.i];
    if (!c || c.isEnd) return;
    var src = audioSrc(c);
    if (st.src !== src) {
      st.src = src;
      audio.src = src;
      audio.currentTime = 0;
      if (from != null && from > 0) {
        try { audio.currentTime = from; } catch (e) {}
      }
    } else if (from != null) {
      try { audio.currentTime = from; } catch (e) {}
    }
    audio.playbackRate = st.rate;
    var p = audio.play();
    if (p && p.catch) p.catch(function () {
      st.playing = false;
      updateUI();
      if (isApp) toast('没播出来，再点一下播放试试');
      else { toast('点一下播放，音频才会响'); gate.hidden = false; }
    });
  }

  function speak() {
    var c = cards[st.i];
    if (!c || c.isEnd) return;
    if (hasAudio(c)) { playAudio(st.t); return; }
    if (!synth) {
      if (isApp) toast('这一回的音频还没铺好，先在阅读页看文字');
      else gate.hidden = false;
      return;
    }
    var para = c.paras[st.p];
    if (!para) return;
    if (st.c >= c.chunks[st.p].length) st.c = 0;

    var u = new SpeechSynthesisUtterance(c.chunks[st.p][st.c]);
    u.lang = 'zh-CN';
    u.rate = st.rate;
    u.pitch = 1;
    if (sysVoice) u.voice = sysVoice;

    var my = ++st.token;
    u.onstart = function () {
      if (my !== st.token) return;
      st.heard = true;
      st.playing = true;
      gate.hidden = true;
      updateUI();
    };
    u.onend = function () {
      if (my !== st.token) return;
      advance();
    };
    u.onerror = function (ev) {
      if (my !== st.token) return;
      var err = (ev && ev.error) || '';
      if (/interrupted|cancel/i.test(err)) return;
      if (/not-allowed|audio-busy|synthesis/i.test(err) || !/network|voice/i.test(err)) {
        st.playing = false;
        gate.hidden = false;
        updateUI();
        return;
      }
      advance();
    };

    synth.speak(u);
    st.playing = true;
    updateUI();
    savePos();
    setTimeout(function () {
      if (my === st.token && st.playing && !st.heard) gate.hidden = false;
    }, 1500);
  }

  function advance() {
    var c = cards[st.i];
    if (!c || c.isEnd) return;
    if (st.c < c.chunks[st.p].length - 1) {
      st.c++;
      setTimeout(function () { if (st.playing) speak(); }, 120);
      return;
    }
    if (st.p < c.paras.length - 1) {
      st.p++;
      st.c = 0;
      savePos();
      setTimeout(function () { if (st.playing) speak(); }, 120);
      return;
    }
    /* 这一回读完：自动滑到下一回，像信息流一样往下走 */
    if (st.i < cards.length - 1) {
      goTo(st.i + 1, true);
    } else {
      st.playing = false;
      updateUI();
      toast('这一部听完了');
    }
  }

  function toggle() {
    var c = cards[st.i];
    if (!c) return;
    if (c.isEnd) { goTo(0, true); return; }
    if (hasAudio(c)) {
      if (st.playing) {
        st.playing = false;
        try { audio.pause(); } catch (e) {}
        updateUI();
        return;
      }
      playAudio(st.t);
      return;
    }
    if (!synth) {
      if (isApp) toast('这一回的音频还没铺好，先在阅读页看文字');
      else gate.hidden = false;
      return;
    }
    if (st.playing) {
      st.playing = false;
      try { synth.pause(); } catch (e) {}
      updateUI();
      return;
    }
    if (synth.paused) {
      try { synth.resume(); } catch (e) {}
      st.playing = true;
      updateUI();
      setTimeout(function () {
        if (st.playing && !synth.speaking && !synth.pending) speak();
      }, 700);
      return;
    }
    speak();
  }

  /* ---------- 卡片 ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function buildCards() {
    feed.innerHTML = '';
    cards.forEach(function (c, idx) {
      var sec = el('section', 'ls-card ls-bg-' + (c.isEnd ? 5 : ((c.bookIndex % 4) + 1)));
      sec.setAttribute('data-i', String(idx));
      var inner = el('div', 'ls-inner');

      if (c.isEnd) {
        inner.appendChild(el('div', 'ls-kicker', '南翼故事 · 连载中'));
        inner.appendChild(el('h1', 'ls-h1', '还有更多镇的故事在写'));
        inner.appendChild(el('p', 'ls-text', '007 金井……写到哪发到哪。你可以先回目录，把已经发出的读完；也可以从头再听一遍。'));
        var acts = el('div', 'ls-acts');
        var a1 = el('a', 'ls-go', '回小说目录'); a1.href = './novel.html';
        var a2 = el('a', 'ls-go', '从头再听'); a2.href = './listen.html?ch=1';
        acts.appendChild(a1);
        acts.appendChild(a2);
        inner.appendChild(acts);
      } else {
        inner.appendChild(el('div', 'ls-kicker',
          c.book.title + ' · ' + c.book.town + ' · 第 ' + (c.ci + 1) + ' / ' + c.total + ' 回'));
        inner.appendChild(el('h1', 'ls-h1', c.title));
        var excerpt = c.paras.slice(0, 2).join('');
        if (excerpt.length > 150) excerpt = excerpt.slice(0, 150) + '…';
        inner.appendChild(el('p', 'ls-text', excerpt));
        if (idx === 0) inner.appendChild(el('div', 'ls-tip', '上划听下一回 · 不想听点「划走」，想换一部点「换一部」'));
      }

      sec.appendChild(inner);
      if (!c.isEnd) {
        sec.appendChild(el('div', 'ls-no', (c.ci + 1 < 10 ? '0' : '') + (c.ci + 1)));
      }
      feed.appendChild(sec);
    });
  }

  function buildSheet() {
    sheetList.innerHTML = '';
    sheetButtons = [];
    cards.forEach(function (c, idx) {
      if (c.isEnd) return;
      var li = el('li');
      var b = el('button', null);
      b.type = 'button';
      b.appendChild(el('i', null, (c.ci + 1 < 10 ? '0' : '') + (c.ci + 1)));
      b.appendChild(el('b', null, c.title));
      b.addEventListener('click', function () {
        sheet.classList.remove('open');
        goTo(idx, true);
      });
      li.appendChild(b);
      sheetList.appendChild(li);
      sheetButtons.push(b);
    });
  }

  function keyOf(c) { return c.book.id + ':' + c.ci; }

  function updateUI() {
    var c = cards[st.i];
    if (!c) return;
    var real = cards.length - 1;
    var audioMode = !c.isEnd && hasAudio(c);
    countEl.textContent = c.isEnd ? '完' : (st.i + 1) + ' / ' + real;
    titleEl.textContent = c.isEnd ? '更多故事在写' : c.title;
    if (c.isEnd) {
      subEl.textContent = '连载中 · 回目录看看';
    } else if (audioMode) {
      /* 有的服务器不支持 Range，duration 会是 Infinity，这时只显示已播时长 */
      var dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      var at = st.playing ? audio.currentTime : st.t;
      subEl.textContent = c.book.title + ' · 第 ' + (c.ci + 1) + ' / ' + c.total + ' 回 · ' + voiceName() +
        (at ? (' · ' + clock(at) + (dur ? ' / ' + clock(dur) : '')) : '');
    } else {
      subEl.textContent = c.book.title + ' · 第 ' + (c.ci + 1) + ' / ' + c.total + ' 回 · 第 ' +
        (st.p + 1) + ' / ' + c.paras.length + ' 段';
    }
    progEl.style.width = c.isEnd ? '100%' :
      (audioMode
        ? ((Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration : 0) * 100).toFixed(1) + '%'
        : (((st.p + 1) / c.paras.length) * 100).toFixed(1) + '%');

    playBtn.textContent = c.isEnd ? '重听' : (st.playing ? '暂停' : (st.heard ? '继续' : '开始听'));
    playBtn.setAttribute('data-state', st.playing ? 'playing' : 'paused');
    rateBtn.textContent = (st.rate === 1 ? '1.0' : String(st.rate)) + '×';
    if (voiceBtn) voiceBtn.textContent = voiceName();

    var isLiked = !c.isEnd && !!liked[keyOf(c)];
    likeBtn.classList.toggle('on', isLiked);
    likeBtn.disabled = !!c.isEnd;
    skipBtn.disabled = !!c.isEnd;
    nextBookBtn.disabled = !!c.isEnd;
    likeN.textContent = Object.keys(liked).length;

    sheetButtons.forEach(function (b, idx) { b.classList.toggle('on', idx === st.i); });
  }

  function activate(i, autoplay) {
    if (i < 0 || i >= cards.length) return;
    if (i !== st.i) pos[st.i] = { p: st.p, c: st.c, t: st.t };
    stopVoice();
    stopAudio();
    gate.hidden = true;
    st.i = i;
    var c = cards[i];
    var saved = pos[i];
    st.p = saved && !c.isEnd ? Math.min(saved.p, c.paras.length - 1) : 0;
    st.c = saved && !c.isEnd ? (saved.c || 0) : 0;
    st.t = saved && !c.isEnd ? Math.min(Number(saved.t) || 0, 60 * 30) : 0;
    st.playing = false;
    savePos();
    updateUI();
    if (autoplay && !c.isEnd) speak();
  }

  function goTo(i, autoplay) {
    if (i < 0 || i >= cards.length) return;
    if (i === st.i) { if (autoplay) { if (!st.playing) toggle(); } return; }
    var h = feed.clientHeight || window.innerHeight;
    feed.scrollTo({ top: i * h, behavior: 'smooth' });
    activate(i, autoplay);
  }

  /* ---------- 手势：滚动停下就算翻页 ---------- */
  var scrollTimer = 0;
  feed.addEventListener('scroll', function () {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () {
      var h = feed.clientHeight || 1;
      var i = Math.round(feed.scrollTop / h);
      if (i !== st.i && i >= 0 && i < cards.length) activate(i, st.playing);
    }, 150);
  }, { passive: true });

  window.addEventListener('keydown', function (e) {
    if (!cards.length) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault(); goTo(st.i + 1, st.playing);
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault(); goTo(st.i - 1, st.playing);
    } else if (e.key === ' ' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      e.preventDefault(); toggle();
    } else if (e.key === 'Escape') {
      sheet.classList.remove('open');
    }
  });

  window.addEventListener('resize', function () {
    feed.scrollTop = st.i * (feed.clientHeight || 1);
  });

  /* ---------- 交互 ---------- */
  playBtn.addEventListener('click', toggle);
  feed.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    if (e.target.closest('button, a')) return;
    toggle();
  });

  rateBtn.addEventListener('click', function () {
    var i = RATES.indexOf(st.rate);
    st.rate = RATES[(i + 1) % RATES.length];
    saveRate();
    updateUI();
    var c = cards[st.i];
    if (c && !c.isEnd && hasAudio(c)) {
      audio.playbackRate = st.rate;
      return;
    }
    if (st.playing) {
      stopVoice();
      st.playing = true;
      setTimeout(function () { if (st.playing) speak(); }, 80);
    }
  });

  likeBtn.addEventListener('click', function () {
    var c = cards[st.i];
    if (!c || c.isEnd) return;
    var k = keyOf(c);
    if (liked[k]) { delete liked[k]; toast('已取消喜欢'); }
    else { liked[k] = 1; toast('已喜欢 · ' + c.title); }
    saveLikes();
    updateUI();
  });

  skipBtn.addEventListener('click', function () {
    var c = cards[st.i];
    if (!c || c.isEnd) return;
    if (st.i >= cards.length - 2) { goTo(cards.length - 1, false); toast('已经是最后一回了'); return; }
    goTo(st.i + 1, true);
    toast('已划走 · 听下一回');
  });

  /* 不爱听这一部，直接跳到下一部的第一回；到最末一部就绕回第一部 */
  function nextBookIndex() {
    var cur = cards[st.i];
    if (!cur || cur.isEnd) return -1;
    for (var i = st.i + 1; i < cards.length; i++) {
      if (!cards[i].isEnd && cards[i].book.id !== cur.book.id) return i;
    }
    for (var j = 0; j < cards.length; j++) {
      if (!cards[j].isEnd && cards[j].book.id !== cur.book.id) return j;
    }
    return -1;
  }

  nextBookBtn.addEventListener('click', function () {
    var i = nextBookIndex();
    if (i < 0) { toast('只有这一部在连载'); return; }
    goTo(i, true);
    toast('已划走 · 换一部');
  });

  tocBtn.addEventListener('click', function () {
    sheet.classList.toggle('open');
  });
  sheetClose.addEventListener('click', function () { sheet.classList.remove('open'); });
  sheet.addEventListener('click', function (e) {
    if (e.target === sheet) sheet.classList.remove('open');
  });

  gatePlay.addEventListener('click', function () {
    gate.hidden = true;
    stopVoice();
    speak();
  });

  /* App 里没有本机语音，启动遮罩没有意义 */
  if (isApp) {
    gate.hidden = true;
    gatePlay.parentNode && (gatePlay.parentNode.hidden = true);
  }

  var toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, 1900);
  }

  /* ---------- 声线切换（有音频时才出现） ---------- */
  function buildVoice() {
    if (!voiceBtn) {
      voiceBtn = document.createElement('button');
      voiceBtn.type = 'button';
      voiceBtn.id = 'voice';
      voiceBtn.className = 'ls-rate';
      voiceBtn.title = '点一下换朗读声线';
      rateBtn.parentNode.insertBefore(voiceBtn, rateBtn);
      voiceBtn.addEventListener('click', switchVoice);
    }
    voiceBtn.textContent = voiceName();
  }

  function switchVoice() {
    var idx = 0;
    for (var i = 0; i < VOICES.length; i++) if (VOICES[i].id === voice) idx = i;
    var next = VOICES[(idx + 1) % VOICES.length];
    var c = cards[st.i];
    if (c && !c.isEnd && hasAudio(c) && !hasAudio(c, next.id)) {
      toast('这一回还没有' + next.name + '的声音');
      return;
    }
    var at = st.src ? (audio.currentTime || 0) : st.t;
    var wasPlaying = st.playing;
    stopAudio();
    voice = next.id;
    try { localStorage.setItem(VOICE_KEY, voice); } catch (e) {}
    st.t = at;
    savePos();
    updateUI();
    toast('声音：' + next.name);
    if (wasPlaying && c && !c.isEnd) {
      st.playing = true;
      playAudio(at);
    }
  }

  var manifestReady = fetch(abs('assets/audio/manifest.json'))
    .then(function (r) {
      if (!r.ok) throw new Error('no-manifest');
      return r.json();
    })
    .then(function (d) {
      var files = (d && d.files) || [];
      manifest = {};
      files.forEach(function (f) { manifest[f] = 1; });
    })
    .catch(function () { manifest = {}; })
    .then(function () {
      if (cards.length && manifest && Object.keys(manifest).length) { buildVoice(); }
      updateUI();
    });

  /* ---------- 装载 ---------- */
  function dead(msg) {
    feed.innerHTML = '';
    var sec = el('section', 'ls-card');
    var inner = el('div', 'ls-inner');
    inner.appendChild(el('div', 'ls-kicker', '听书频道 · 出错'));
    inner.appendChild(el('h1', 'ls-h1', '这一页没加载出来'));
    inner.appendChild(el('p', 'ls-text', msg));
    var acts = el('div', 'ls-acts');
    var a = el('a', 'ls-go', '回小说目录'); a.href = './novel.html';
    acts.appendChild(a);
    inner.appendChild(acts);
    sec.appendChild(inner);
    feed.appendChild(sec);
    playBtn.disabled = true;
    likeBtn.disabled = true;
    skipBtn.disabled = true;
    countEl.textContent = '—';
  }

  function boot() {
    fetch(abs('assets/data/novels.json'))
      .then(function (r) {
        if (!r.ok) throw new Error('registry');
        return r.json();
      })
      .then(function (data) {
        var books = (data && data.books) || [];
        if (!books.length) throw new Error('empty');
        return books.reduce(function (chain, book, bi) {
          return chain.then(function () {
            return fetch(abs(book.url)).then(function (r) {
              if (!r.ok) throw new Error('book');
              return r.text();
            }).then(function (html) {
              var doc = new DOMParser().parseFromString(html, 'text/html');
              var secs = [].slice.call(doc.querySelectorAll('#np-body section.np'));
              secs.forEach(function (sec, ci) {
                var h2 = sec.querySelector('h2');
                var raw = (sec.getAttribute('data-title') || (h2 ? h2.textContent : '')).replace(/\s+/g, ' ').trim();
                var short = raw.replace(/^第[〇零一二三四五六七八九十百]+回\s*/, '').trim() || raw || ('第 ' + (ci + 1) + ' 回');
                var paras = [].slice.call(sec.querySelectorAll('p')).map(function (p) {
                  return p.textContent.replace(/\s+/g, ' ').trim();
                }).filter(function (t) { return t.length; });
                if (!paras.length) return;
                cards.push({
                  book: book, bookIndex: bi, ci: ci, total: secs.length,
                  title: short, raw: raw, paras: paras,
                  chunks: paras.map(chunksOf), isEnd: false
                });
              });
            }).catch(function (e) { console.warn('[listen] 作品载入失败', book.id, e); });
          });
        }, Promise.resolve());
      })
      .then(function () {
        if (!cards.length) throw new Error('none');
        cards.push({ isEnd: true, title: '还有更多镇的故事在写' });
        buildCards();
        buildSheet();
        if (manifest && Object.keys(manifest).length) buildVoice();

        var start = 0;
        var qs = new URLSearchParams(location.search);
        var wantBook = qs.get('book') || cards[0].book.id;
        if (qs.has('ch')) {
          var n = Number(qs.get('ch'));
          var found = -1;
          for (var i = 0; i < cards.length; i++) {
            if (!cards[i].isEnd && cards[i].book.id === wantBook && cards[i].ci === n - 1) { found = i; break; }
          }
          if (found >= 0) start = found;
        } else if (qs.has('book')) {
          for (var j = 0; j < cards.length; j++) {
            if (!cards[j].isEnd && cards[j].book.id === wantBook) { start = j; break; }
          }
        } else {
          try {
            var saved = JSON.parse(localStorage.getItem('tslisten-pos') || 'null');
            if (saved && cards[saved.i] && !cards[saved.i].isEnd) {
              start = saved.i;
              pos[start] = { p: Number(saved.p) || 0, c: 0, t: Number(saved.t) || 0 };
            }
          } catch (e) {}
        }

        requestAnimationFrame(function () {
          feed.scrollTop = start * (feed.clientHeight || window.innerHeight);
          activate(start, false);
          updateUI();
          setTimeout(tryAuto, 120);
        });
      })
      .catch(function (e) {
        console.warn('[listen]', e);
        dead('作品表或正文没读到。如果是本地双击打开，请用本地服务器（http）访问；线上 GitHub Pages 正常。');
      });
  }

  function tryAuto() {
    var c = cards[st.i];
    /* App 里没有本机语音；音频又需要用户先点一下才允许出声，所以只准备好，不自动播 */
    if (isApp || !synth) return;
    if (c && hasAudio(c)) { gate.hidden = false; return; }
    speak();
    setTimeout(function () {
      if (!st.heard) gate.hidden = false;
    }, 1400);
  }

  boot();
})();
