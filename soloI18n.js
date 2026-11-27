/* soloI18n.js — v40 용돈냥이 한국어 · English · 日本語
 * 한국어 원문을 키로 쓰는 사전 번역기. ko 일 때는 화면을 건드리지 않는다(언어 버튼만 추가).
 * - 저장 숫자·Firestore 구조는 절대 바꾸지 않는다. 화면에 그려진 글자(텍스트 노드·placeholder·title·aria-label·alt)만 바꾼다.
 * - 통화는 "표시 단위"만 바꾼다(환율 변환 없음). 기존 사용자 = ko + ₩ 그대로.
 * - 사전에 없는 문장은 한국어 원문 그대로 둔다(빈칸·깨진 키 노출 없음).
 * 사전: soloI18n.en.js / soloI18n.ja.js (언어를 고를 때만 불러온다)
 */
(function () {
  'use strict';
  if (window.soloI18n) return;
  var LANGS = ['ko', 'en', 'ja'];
  var LABEL = { ko: '한국어', en: 'English', ja: '日本語' };
  var SYM = { KRW: '₩', JPY: '¥', USD: '$' };
  var LANG_CUR = { ko: 'KRW', en: 'USD', ja: 'JPY' };
  var HANGUL = /[가-힣]/;
  var mem = {};
  function lsGet(k) { try { var v = localStorage.getItem(k); if (v !== null) return v; } catch (e) { /* 사생활 보호 모드 */ } return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; }
  function lsSet(k, v) { mem[k] = v; try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* 메모리 값만 */ } }

  // ---------- 언어 정하기: 저장값 > (기존 사용자면 ko) > 브라우저 언어 > ko ----------
  function isLegacy() {
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i) || ''; if ((/^solo/.test(k) && !/^solo(Lang|Cur)/.test(k)) || k === 'connected_store_code') return true; } } catch (e) {}
    return false;
  }
  function detect() {
    try { var l = String((navigator.languages && navigator.languages[0]) || navigator.language || ''); if (!l) return 'ko'; if (/^ko/i.test(l)) return 'ko'; if (/^ja/i.test(l)) return 'ja'; return 'en'; } catch (e) { return 'ko'; }
  }
  var lang = lsGet('soloLang'), firstRun = false;
  if (LANGS.indexOf(lang) < 0) {
    firstRun = true;
    lang = isLegacy() ? 'ko' : detect();
    lsSet('soloLang', lang);
    if (!SYM[lsGet('soloCurAuto')]) lsSet('soloCurAuto', LANG_CUR[lang]);
  }

  // ---------- 통화(표시 단위) ----------
  var ctx = { biz: false, demo: false };
  function cur() {
    var c = lsGet('soloCur'); if (SYM[c]) return c;          // 설정에서 직접 고른 단위
    if (ctx.demo) return LANG_CUR[lang];                       // 체험판 샘플은 언어에 맞는 단위
    if (ctx.biz) return 'KRW';                                 // 사업자 장부(PRO)는 원화 회계
    var a = lsGet('soloCurAuto'); return SYM[a] ? a : 'KRW';
  }
  function plain() { return lang === 'ko' && cur() === 'KRW'; } // 지금 그대로의 화면

  // ---------- 사전 ----------
  var DICT = (window.soloI18nDict = window.soloI18nDict || {});
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var BASE = {
    en: { '일': 'Sun', '월': 'Mon', '화': 'Tue', '수': 'Wed', '목': 'Thu', '금': 'Fri', '토': 'Sat', '{0}년 {1}월 {2}일': '{M1} {2}, {0}', '{0}년 {1}월': '{M1} {0}', '{0}월 {1}일': '{M0} {1}', '{0}년': '{0}', '{0}월': '{M0}', '{0}일': '{0}', '{0}.{1}': '{0}.{1}', '{0}일 전': '{0}d ago', '{0}시간 전': '{0}h ago', '{0}분 전': '{0}m ago', '{0}시간': '{0}h', '{0}분': '{0}m', '{0}시간 {1}분': '{0}h {1}m', '{0}시간{1}분': '{0}h {1}m', '방금 전': 'just now', '어제': 'yesterday', '오늘': 'Today', '{0}원': '¤{0}', '{0}건': '{0}', '{0}장': '{0}', '{0}개': '{0}', '{0}명': '{0}' },
    ja: { '일': '日', '월': '月', '화': '火', '수': '水', '목': '木', '금': '金', '토': '土', '{0}년 {1}월 {2}일': '{0}年{1}月{2}日', '{0}년 {1}월': '{0}年{1}月', '{0}월 {1}일': '{0}月{1}日', '{0}년': '{0}年', '{0}월': '{0}月', '{0}일': '{0}日', '{0}일 전': '{0}日前', '{0}시간 전': '{0}時間前', '{0}분 전': '{0}分前', '{0}시간': '{0}時間', '{0}분': '{0}分', '{0}시간 {1}분': '{0}時間{1}分', '{0}시간{1}분': '{0}時間{1}分', '방금 전': 'たった今', '어제': '昨日', '오늘': '今日', '{0}원': '¤{0}', '{0}건': '{0}件', '{0}장': '{0}枚', '{0}개': '{0}個', '{0}명': '{0}人' }
  };
  var CACHE = { en: new Map(), ja: new Map() }, PAT = {}, REV = new Map(), missing = new Set();
  function dict(l) { return DICT[l] || {}; }
  function look(l, k) { var d = dict(l); if (Object.prototype.hasOwnProperty.call(d, k)) return d[k]; var b = BASE[l]; return b && Object.prototype.hasOwnProperty.call(b, k) ? b[k] : undefined; }
  function esc(s) { return s.replace(/[.*+?^$()|[\]\\]/g, '\\$&'); }
  function pats(l) { // {s0} 자리표시가 있는 키 → 정규식 (앞 2글자 버킷으로 후보만 검사)
    if (PAT[l]) return PAT[l];
    var b = new Map(), d = dict(l);
    Object.keys(d).forEach(function (k) {
      if (k.indexOf('{s') < 0) return;
      var order = [], src = '^' + esc(k).replace(/\\?\{(s?)(\d+)\\?\}/g, function (m, s, i) { order.push((s ? 's' : 'n') + i); return s ? '([\\s\\S]+?)' : '(\\{\\d+\\})'; }) + '$';
      var lits = k.split(/\{s?\d+\}/).sort(function (a, c) { return c.length - a.length; }), lit = (lits[0] || '').trim();
      if (lit.length < 2) lit = '__';
      var key = lit.slice(0, 2), arr = b.get(key); if (!arr) b.set(key, arr = []);
      var hl = (k.replace(/\{s?\d+\}/g, '').match(/[가-힣]/g) || []).length, glued = {}; // 글자가 1~2자뿐인 패턴에서 한글에 붙은 자리({s0}월 등)는 숫자·영문만 받는다
      if (hl <= 2) k.replace(/\{s(\d+)\}(?=[가-힣])|(?:[가-힣])\{s(\d+)\}/g, function (a, x, y) { glued['s' + (x || y)] = 1; return a; });
      try { arr.push({ re: new RegExp(src), order: order, k: k, glued: glued }); } catch (e) {}
    });
    return (PAT[l] = b);
  }
  // 문자열 안의 {n}/{Mn} 토큰을 지역 번호로 바꿔 번역한 뒤 원래 번호로 되돌린다
  function sub(l, str) {
    var toks = [], local = str.replace(/\{(\d+)\}/g, function (m) { toks.push(m.slice(1, -1)); return '{' + (toks.length - 1) + '}'; });
    var r = trN(l, local); if (r == null) return null;
    return r.replace(/\{(M?)(\d+)\}/g, function (m, M, i) { return toks[i] != null ? '{' + M + toks[i] + '}' : m; });
  }
  var SEP = /( · | → | — | - | \/ | \| |\n|: |, )/;
  function trN(l, k) {
    if (!HANGUL.test(k)) return k;
    var c = CACHE[l]; if (c.has(k)) return c.get(k);
    var r = look(l, k), m;
    if (r === undefined) { // 패턴
      var b = pats(l), seen = new Set();
      for (var i = 0; i < k.length - 1 && r === undefined; i++) {
        var arr = b.get(k.substr(i, 2)); if (!arr || seen.has(arr)) continue; seen.add(arr);
        for (var j = 0; j < arr.length; j++) { m = arr[j].re.exec(k); if (!m) continue; r = fillPat(l, arr[j], m); if (r !== undefined) break; }
      }
      if (r === undefined) { var arr2 = b.get('__'); if (arr2) for (var j2 = 0; j2 < arr2.length && r === undefined; j2++) { m = arr2[j2].re.exec(k); if (m) r = fillPat(l, arr2[j2], m); } }
    }
    if (r === undefined && (m = /^([^\p{L}\p{N}{]+)([\s\S]+)$/u.exec(k)) && HANGUL.test(m[2])) { var x0 = sub(l, m[2]); if (x0 != null) r = m[1] + x0; } // 앞 이모지·기호 떼고
    if (r === undefined && (m = /^([^\p{L}\p{N}{]*)([\s\S]*?)([^\p{L}\p{N}}]*)$/u.exec(k)) && (m[1] || m[3]) && HANGUL.test(m[2])) { var x = sub(l, m[2]); if (x != null) r = m[1] + x + m[3]; } // 앞뒤 기호 떼고
    if (r === undefined && SEP.test(k)) {
      var parts = k.split(SEP), any = false;
      for (var p = 0; p < parts.length; p += 2) { if (!HANGUL.test(parts[p])) continue; var y = sub(l, parts[p]); if (y != null) { parts[p] = y; any = true; } else missing.add(parts[p]); }
      if (any) r = parts.join('');
    }
    if (r === undefined) r = null;
    c.set(k, r); return r;
  }
  function fillPat(l, p, m) {
    var vals = {}; p.order.forEach(function (o, i) { vals[o] = m[i + 1]; });
    if (p.order.some(function (o, i) { return p.glued[o] && HANGUL.test(m[i + 1]); })) return undefined;
    var t = dict(l)[p.k], ok = true;
    t = t.replace(/\{(s?)(M?)(\d+)\}/g, function (all, s, M, i) {
      var v = vals[(s ? 's' : 'n') + i]; if (v == null) return all;
      if (s) { var y = HANGUL.test(v) ? sub(l, v) : v; return y == null ? v : y; }
      return M ? '{M' + v.slice(1) : v; // v = "{k}"
    });
    return ok ? t : undefined;
  }
  function money(s) {
    if (plain()) return s;
    var y = SYM[cur()];
    s = s.replace(/¤/g, function () { return y; }); // 함수로 넣는다: '$' 기호가 정규식 치환 문법으로 읽히지 않게
    if (cur() !== 'KRW') s = s.replace(/(\d[\d,]*(?:\.\d+)?)\s?원/g, function (a, n) { return y + n; }).replace(/₩/g, function () { return y; });
    return s;
  }
  function t(raw, l) {
    l = l || lang; if (raw == null) return raw; raw = String(raw);
    if (l === 'ko' || !HANGUL.test(raw)) return l === lang ? money(raw) : raw;
    var mm = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw), core = mm[2].replace(/[ \t\r\f\v]+/g, ' ').replace(/ ?\n ?/g, '\n');
    var nums = [], norm = core.replace(/\d+(?:[,.]\d+)*/g, function (n) { nums.push(n); return '{' + (nums.length - 1) + '}'; });
    var nk = norm.replace(/\s+/g, ' '), r = trN(l, nk);
    if (r == null && nk !== norm) r = trN(l, norm);
    if (r == null) { missing.add(nk); return l === lang ? money(raw) : raw; }
    r = r.replace(/\{(M?)(\d+)\}/g, function (a, M, i) { var v = nums[i]; if (v == null) return a; if (!M) return v; var n = parseInt(v, 10); return l === 'en' ? (MON[n - 1] || v) : v + '月'; });
    if (r.length > 0 && !/\S/.test(r)) r = core;
    return mm[1] + (l === lang ? money(r) : r) + mm[3];
  }

  // ---------- DOM 적용 ----------
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'label'];
  var recT = new WeakMap(), recA = new WeakMap(), everTr = false, observer = null;
  function skipEl(el) {
    if (!el || !el.closest) return false;
    var tg = el.tagName; if (tg === 'SCRIPT' || tg === 'STYLE' || tg === 'NOSCRIPT' || tg === 'TEXTAREA') return true;
    return !!el.closest('[data-i18n-skip],[data-i18n-ui],[contenteditable="true"],[contenteditable=""]');
  }
  function origOf(v, r) { if (r && v === r[1]) return r[0]; if (everTr && !HANGUL.test(v)) { var tv = v.trim(), k = REV.get(tv) || REV.get(bare(tv)); if (k) return v.replace(tv, k); } return v; }
  function doText(n) {
    var p = n.parentElement; if (!p || skipEl(p)) return;
    var v = n.nodeValue; if (!v || !/\S/.test(v)) return;
    var r = recT.get(n), o = origOf(v, r);
    if (p.tagName === 'OPTION' && !p.hasAttribute('value') && p.parentElement) p.setAttribute('value', p.value); // 번역해도 option 값은 원래 글자
    var tr = t(o);
    if (tr !== v) n.nodeValue = tr;
    if (tr !== o || r) recT.set(n, [o, tr]);
  }
  function doAttrs(el) {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || (el.closest && el.closest('[data-i18n-skip],[data-i18n-ui]'))) return; // textarea 의 placeholder 는 번역
    var m = recA.get(el);
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i], v = el.getAttribute(a); if (v == null || v === '') continue;
      var r = m && m[a], o = origOf(v, r), tr = t(o);
      if (tr !== v) el.setAttribute(a, tr);
      if (tr !== o || r) { if (!m) recA.set(el, m = {}); m[a] = [o, tr]; }
    }
    if (el.tagName === 'INPUT' && /^(button|submit)$/i.test(el.type) && el.value) {
      var r2 = m && m.__v, o2 = origOf(el.value, r2), t2 = t(o2); if (t2 !== el.value) el.value = t2; if (t2 !== o2 || r2) { if (!m) recA.set(el, m = {}); m.__v = [o2, t2]; }
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (skipEl(root)) return; doAttrs(root); }
    var w = document.createTreeWalker(root, 5 /* ELEMENT | TEXT */, { acceptNode: function (x) { if (x.nodeType === 1 && x.tagName === 'TEXTAREA') { doAttrs(x); return 2; } return x.nodeType === 1 && skipEl(x) ? 2 /* REJECT */ : 1; } }), n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  function head() {
    document.documentElement.setAttribute('lang', lang);
    var mt = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (mt) { var r = recA.get(mt) || {}; var o = r.c ? origOf(mt.content, r.c) : mt.content; var tr = t(o); if (tr !== mt.content) mt.content = tr; r.c = [o, tr]; recA.set(mt, r); }
  }
  function apply() {
    if (!document.documentElement) return;
    head();
    if (document.title) { var tt = document.querySelector('title'); if (tt) walk(tt); }
    if (document.body) walk(document.body);
    redrawCharts();
  }
  function startObserver() {
    if (observer || !window.MutationObserver) return;
    observer = new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') { if (m.target.nodeType === 1) doAttrs(m.target); }
        else for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function redrawCharts() {
    try { var C = window.Chart; if (C && C.instances) Object.keys(C.instances).forEach(function (k) { try { C.instances[k].update('none'); } catch (e) {} }); } catch (e) {}
  }

  // ---------- 캔버스 글자(차트 라벨·3D 간판) ----------
  (function () {
    var P = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype; if (!P) return;
    ['fillText', 'strokeText', 'measureText'].forEach(function (name) {
      var f = P[name]; if (typeof f !== 'function') return;
      P[name] = function (txt) { if (!plain() && typeof txt === 'string') { var a = Array.prototype.slice.call(arguments); a[0] = t(txt); return f.apply(this, a); } return f.apply(this, arguments); };
    });
  })();
  // ---------- alert / confirm / prompt ----------
  ['alert', 'confirm', 'prompt'].forEach(function (name) {
    var f = window[name]; if (typeof f !== 'function') return;
    window[name] = function (msg) { if (plain() || typeof msg !== 'string') return f.apply(window, arguments); var a = Array.prototype.slice.call(arguments); a[0] = t(msg); return f.apply(window, a); };
  });

  // ---------- 사전 불러오기 ----------
  var base = (function () { try { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/[^/]*$/, '') : ''; } catch (e) { return ''; } })();
  // 앱이 앞 이모지·기호를 떼고 다시 쓰는 글자('🏪 Shop spending' → 'Shop spending')도 원문을 찾도록, 뗀 모양도 함께 기억
  function bare(s) { return s.replace(/^[^\p{L}\p{N}(]+/u, ''); }
  function indexRev(l) { var d = dict(l); Object.keys(d).forEach(function (k) { var v = d[k]; if (typeof v !== 'string' || v.indexOf('{') >= 0 || k.indexOf('{') >= 0) return; v = v.trim();
    if (!REV.has(v)) REV.set(v, k); var bv = bare(v), bk = bare(k); if (bv && bv !== v && HANGUL.test(bk) && !REV.has(bv)) REV.set(bv, bk); }); }
  var loading = {};
  function load(l, cb) {
    if (l === 'ko' || DICT[l]) { if (DICT[l] && !DICT[l].__rev) { DICT[l].__rev = 1; indexRev(l); } return cb(); }
    if (loading[l]) return loading[l].push(cb);
    loading[l] = [cb];
    var s = document.createElement('script'); s.src = base + 'soloI18n.' + l + '.js?v=40';
    s.onload = s.onerror = function () { var q = loading[l]; loading[l] = null; if (DICT[l]) { DICT[l].__rev = 1; indexRev(l); } PAT[l] = null; q.forEach(function (f) { f(); }); };
    (document.head || document.documentElement).appendChild(s);
  }

  // ---------- 언어·통화 바꾸기 ----------
  var listeners = [];
  function emit() {
    listeners.slice().forEach(function (f) { try { f(lang, cur()); } catch (e) {} });
    try { window.dispatchEvent(new CustomEvent('soloLangChange', { detail: { lang: lang, cur: cur() } })); } catch (e) {}
  }
  function refresh() { if (!plain()) { everTr = true; startObserver(); } if (everTr || !plain()) apply(); try { mount(); } catch (e) {} syncUi(); }
  function setLang(l, opts) {
    if (LANGS.indexOf(l) < 0) return;
    opts = opts || {};
    load(l, function () {
      var changed = l !== lang; lang = l; lsSet('soloLang', l); api.lang = l;
      if (l === 'ko' && adsGone) { location.reload(); return; } // 쿠팡 광고는 처음 그릴 때만 넣을 수 있어 ko 로 돌아오면 다시 연다
      dropAds();
      if (opts.autoCur && !SYM[lsGet('soloCur')]) lsSet('soloCurAuto', LANG_CUR[l]);
      refresh(); if (changed || opts.autoCur) emit();
    });
  }
  function setCur(c) { lsSet('soloCur', SYM[c] ? c : null); refresh(); emit(); }
  function setCtx(o) { var b = cur(); ctx.biz = !!(o && o.biz); ctx.demo = !!(o && o.demo); if (cur() !== b) { refresh(); emit(); } }

  // ---------- 체험판 샘플 현지화(메모리 안에서만) ----------
  var SHELF = { en: { '세무': ['TAX', '🧾'], '회계': ['ACC', '📊'], '급여': ['PAY', '💵'], '장부': ['LOG', '📒'], '예약': ['RSV', '📅'], '가계': ['BGT', '🏠'], '영수': ['RCP', '🧾'], '보험': ['INS', '🛡️'] },
    ja: { '세무': '税務', '회계': '会計', '급여': '給与', '장부': '帳簿', '예약': '予約', '가계': '家計', '영수': '領収', '보험': '保険' } };
  // ---------- v41: 한국 전용 요소(쿠팡 파트너스) · 현지 검색 · 드라이브 폴더 이름 · 3D 판매 채널 ----------
  var adsGone = lang !== 'ko'; // en/ja 로 시작하면 광고 스크립트·iframe 을 아예 쓰지 않는다(2d.html·3d.html 의 soloI18n.ads())
  function dropAds() { if (lang === 'ko') return; var n = document.querySelectorAll('[data-ko-only]'); for (var i = 0; i < n.length; i++) n[i].remove(); if (n.length) adsGone = true; }
  var SHOP = { en: 'https://www.amazon.com/s?k=', ja: 'https://www.amazon.co.jp/s?k=' };
  function shop(q) { q = t(String(q || '')).replace(/\s+/g, ' ').trim().slice(0, 60); if (!q || !SHOP[lang]) return false; window.open(SHOP[lang] + encodeURIComponent(q), '_blank', 'noopener'); return true; }
  var FOLDER = { receipt: { ko: '솔로운영_영수증', en: 'PocketNyan_Receipts', ja: 'おこづかいニャン_レシート' }, book: { ko: '솔로운영_장부', en: 'PocketNyan_Books', ja: 'おこづかいニャン_帳簿' } };
  var FKEY = { receipt: 'soloDriveReceiptFolder', book: 'soloDriveBookFolder' };
  // 찾을 이름 후보(앞에서부터): 기억한 폴더 → 기존 한국어 폴더 → 다른 언어 폴더 → 지금 언어 폴더(마지막 = 없을 때 만들 이름). ko 는 예전처럼 한국어 이름 하나
  function folder(kind) { var f = FOLDER[kind], mem = lsGet(FKEY[kind]), c = lang === 'ko' ? [mem, f.ko] : [mem, f.ko, f.en, f.ja];
    var out = c.filter(function (n, i) { return n && n !== f[lang] && c.indexOf(n) === i; }); out.push(f[lang]); return out.length === 1 ? out[0] : out; }
  function folderMade(name) { for (var k in FOLDER) for (var l in FOLDER[k]) if (FOLDER[k][l] === name) lsSet(FKEY[k], name); }
  var LIVE = { en: ['Dine-in sales', 'DoorDash sales', 'Uber Eats sales', 'Grubhub sales', 'Daily total sales'], ja: ['店内売上', '出前館 売上', 'Uber Eats 売上', 'Wolt 売上', '1日の総売上'] };
  var SCALE = { ko: 1, en: 0.001, ja: 0.1 };
  function amt(n) { var v = Number(n); if (!isFinite(v) || lang === 'ko') return n; v = v * SCALE[lang]; return lang === 'en' ? (Math.abs(v) >= 1 ? Math.round(v) : Math.round(v * 100) / 100) : Math.round(v); }
  function demoT(s) { if (typeof s !== 'string' || lang === 'ko') return s; var d = (window.soloI18nDemo || {})[lang] || {}; var k = s.replace(/\s+/g, ' ').trim(); if (Object.prototype.hasOwnProperty.call(d, k)) return d[k]; var nums = [], nk = k.replace(/\d+(?:[,.]\d+)*/g, function (n) { nums.push(n); return '{' + (nums.length - 1) + '}'; }); if (Object.prototype.hasOwnProperty.call(d, nk)) return d[nk].replace(/\{(M?)(\d+)\}/g, function (a, M, i) { var v = nums[i]; if (v == null) return a; return M ? (lang === 'en' ? MON[parseInt(v, 10) - 1] || v : v + '月') : v; }); return t(s); }
  function localizeDemo(cfg, list) {
    if (lang === 'ko') return;
    if (cfg) ['name', 'industryName'].forEach(function (k) { if (cfg[k]) cfg[k] = demoT(cfg[k]); });
    if (cfg) ['sales', 'fixed', 'variable'].forEach(function (k) { if (Array.isArray(cfg[k])) cfg[k] = cfg[k].map(demoT); });
    (list || []).forEach(function (x) { if (x.category) x.category = demoT(x.category); if (x.memo) x.memo = demoT(x.memo); if (x.amount != null) x.amount = amt(x.amount); });
  }
  function sample(d) { // 3D 처음 샘플(그 기기에만 저장되는 견본)
    if (lang === 'ko' || !d) return d;
    ['sales', 'ingredients', 'personal'].forEach(function (k) { (d[k] || []).forEach(function (x) { if (x.amount != null) x.amount = amt(x.amount); if (x.name) x.name = demoT(x.name); if (x.channel) x.channel = demoT(x.channel); }); });
    (d.fixed || []).forEach(function (x) { x.amount = amt(x.amount); x.name = demoT(x.name); });
    (d.staff || []).forEach(function (x) { x.wage = amt(x.wage); x.name = demoT(x.name); x.role = demoT(x.role); });
    (d.family || []).forEach(function (x) { x.text = demoT(x.text); x.when = demoT(x.when); });
    if (typeof d.opening === 'number') d.opening = amt(d.opening);
    return d;
  }

  // ---------- 언어 고르기 UI (2D·3D 공용, 스크립트가 직접 붙인다) ----------
  var CSS = 'html:not([lang="ko"]) [data-ko-only]{display:none!important}' +
    '.sl-seg{display:flex;gap:4px;padding:3px;border-radius:12px;background:rgba(148,163,184,.16);width:100%;box-sizing:border-box}' +
    '.sl-seg button{flex:1 1 0;min-width:0;min-height:34px;padding:4px 6px;border:0;border-radius:9px;background:transparent;font:inherit;font-size:12px;font-weight:700;color:#475569;cursor:pointer;white-space:nowrap}' +
    '.sl-seg button[aria-pressed="true"]{background:#fff;color:#0f172a;box-shadow:0 1px 3px rgba(0,0,0,.12)}' +
    '.sl-box{display:grid;gap:6px;text-align:left;margin:0}.sl-box p{margin:0;font-size:11px;font-weight:700;color:#64748b}' +
    '.sl-btn{display:inline-flex;align-items:center;gap:2px;flex-shrink:0;white-space:nowrap;cursor:pointer;font-size:11px;font-weight:800;line-height:1;padding:7px 8px;border-radius:12px;border:1px solid #e2e8f0;background:#f8fafc;color:#334155}' +
    '.sl-pop{position:fixed;z-index:2147483000;width:min(260px,calc(100vw - 24px));background:#fff;color:#0f172a;border-radius:16px;box-shadow:0 12px 40px rgba(15,23,42,.22);padding:12px;display:grid;gap:10px;font-family:inherit}' +
    '.sl-pop[hidden]{display:none}' +
    // 휴대폰 ko 화면은 머리글 줄이 그대로이도록 지구본을 숨긴다(첫 화면·내정보·꾸미기 창에서 고름). en/ja 는 2D 오른쪽 위에 작게
    '@media (max-width:639.98px){html[lang="ko"] .sl-h2{display:none!important}html:not([lang="ko"]) .sl-h2{position:absolute;top:12px;right:12px;z-index:2}html:not([lang="ko"]) body>header.ios-header>div:first-child{padding-right:70px}}' +
    '@media (max-width:599.98px){html[lang="ko"] .sl-btn3{display:none!important}}';
  function el(tag, attrs, html) { var e = document.createElement(tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }
  var UI = {
    curTitle: { ko: '표시 단위', en: 'Currency', ja: '通貨表示' }, langTitle: { ko: '언어', en: 'Language', ja: '言語' },
    auto: { ko: '자동', en: 'Auto', ja: '自動' },
    unit: { ko: '단위', en: 'Unit', ja: '単位' },
    legal: { en: 'ℹ️ This English translation is for reference only. The Korean original is the legally binding version.', ja: 'ℹ️ この日本語訳は参考用です。法的には韓国語の原文が正本となります。' },
    note: { ko: '숫자는 그대로 두고 단위 표시만 바뀌어요(환율 변환 없음).', en: 'Only the symbol changes — amounts are never converted.', ja: '金額はそのままで、表示する通貨記号だけが変わります（換算なし）。' }
  };
  function segLang(autoCur) {
    var s = el('div', { class: 'sl-seg', role: 'group', 'aria-label': 'Language / 언어 / 言語', 'data-sl': 'lang' });
    LANGS.forEach(function (l) { var b = el('button', { type: 'button', 'data-l': l, lang: l }, LABEL[l]); b.addEventListener('click', function (e) { e.stopPropagation(); setLang(l, { autoCur: autoCur }); }); s.appendChild(b); });
    return s;
  }
  function segCur() {
    var s = el('div', { class: 'sl-seg', role: 'group', 'data-sl': 'cur' });
    [['', 'auto'], ['KRW', '₩'], ['JPY', '¥'], ['USD', '$']].forEach(function (x) { var b = el('button', { type: 'button', 'data-c': x[0] }, x[1] === 'auto' ? '' : x[1]); b.addEventListener('click', function (e) { e.stopPropagation(); setCur(x[0] || null); }); s.appendChild(b); });
    return s;
  }
  function box(withCur, autoCur) {
    var b = el('div', { class: 'sl-box', 'data-i18n-ui': '1' });
    b.appendChild(el('p', { 'data-sl': 'lt' }));
    b.appendChild(segLang(autoCur));
    if (withCur) { b.appendChild(el('p', { 'data-sl': 'ct' })); b.appendChild(segCur()); b.appendChild(el('p', { 'data-sl': 'cn', style: 'font-weight:500;font-size:10px;color:#94a3b8' })); }
    return b;
  }
  function syncUi() {
    var c = cur(), explicit = SYM[lsGet('soloCur')];
    document.querySelectorAll('[data-i18n-ui] [data-l]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-l') === lang)); });
    document.querySelectorAll('[data-i18n-ui] [data-c]').forEach(function (b) { var k = b.getAttribute('data-c'); b.setAttribute('aria-pressed', String(k ? explicit && k === c : !explicit)); if (!k) b.textContent = UI.auto[lang] + ' (' + SYM[c] + ')'; });
    document.querySelectorAll('[data-i18n-ui] [data-sl="lt"]').forEach(function (p) { p.textContent = '🌐 ' + UI.langTitle[lang] + (lang === 'ko' ? '' : ' · 언어'); });
    document.querySelectorAll('[data-i18n-ui] [data-sl="ct"]').forEach(function (p) { p.textContent = UI.curTitle[lang] + ' · ' + UI.unit[lang] + ' ' + SYM[c]; });
    document.querySelectorAll('[data-i18n-ui] [data-sl="cn"]').forEach(function (p) { p.textContent = UI.note[lang]; });
    document.querySelectorAll('[data-sl-btn]').forEach(function (b) { b.textContent = '🌐 ' + lang.toUpperCase() + '·' + SYM[c]; b.setAttribute('aria-label', UI.langTitle[lang] + ' / ' + UI.curTitle[lang]); b.title = UI.langTitle[lang] + ' · ' + UI.curTitle[lang]; });
  }
  var pop = null;
  function headerBtn(cls) {
    var b = el('button', { type: 'button', class: cls || 'sl-btn', 'data-sl-btn': '1', 'data-i18n-ui': '1', 'aria-haspopup': 'dialog' });
    b.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (!pop) { pop = el('div', { class: 'sl-pop', role: 'dialog', 'data-i18n-ui': '1', hidden: '' }); pop.appendChild(box(true, false)); document.body.appendChild(pop); syncUi();
        document.addEventListener('click', function (ev) { if (pop && !pop.hidden && !pop.contains(ev.target) && !ev.target.closest('[data-sl-btn]')) pop.hidden = true; }, true);
        document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && pop) pop.hidden = true; }); }
      if (!pop.hidden) { pop.hidden = true; return; }
      var r = b.getBoundingClientRect(); pop.hidden = false;
      var w = pop.offsetWidth; pop.style.top = Math.round(r.bottom + 6) + 'px'; pop.style.left = Math.max(12, Math.min(innerWidth - w - 12, Math.round(r.right - w))) + 'px';
    });
    return b;
  }
  function mount() { // 페이지마다 자리 잡기(없으면 건너뜀). 나중에 그려지는 창은 observer 대신 가벼운 주기 검사
    dropAds();
    var st = document.getElementById('soloI18nCss'); if (!st) { st = el('style', { id: 'soloI18nCss' }); st.textContent = CSS; document.head.appendChild(st); }
    // 2D: 첫 화면(로그인·체험 선택) 맨 위
    var lm = document.querySelector('#loginModal > div'); if (lm && !lm.querySelector('[data-i18n-ui]')) lm.insertBefore(box(false, true), lm.firstChild);
    // 2D: 머리글 오른쪽 버튼 줄 맨 앞
    var hr = document.querySelector('body > header.ios-header > div:last-child'); if (hr && !document.querySelector('header [data-sl-btn]')) hr.insertBefore(headerBtn('sl-btn sl-h2'), hr.firstChild);
    // 2D: 내정보 · 꾸미기 창에 언어·통화 설정
    [['#userInfoModal .space-y-2.pt-1', 'before'], ['#decoModal .overflow-y-auto', 'append']].forEach(function (x) {
      var t0 = document.querySelector(x[0]); if (!t0) return; var host = x[1] === 'before' ? t0.parentNode : t0; if (host.querySelector(':scope > [data-i18n-ui]')) return;
      var bx = box(true, false); bx.style.cssText = 'background:#f8fafc;border-radius:12px;padding:10px'; if (x[1] === 'before') host.insertBefore(bx, t0); else host.appendChild(bx);
    });
    // 3D: 머리글(📊 2D 옆)
    var lt = document.querySelector('#hud .lt'); if (lt && !lt.querySelector('[data-sl-btn]')) { var hb = headerBtn('twod sl-btn3'); var ref = document.getElementById('instBtn'); if (ref && ref.parentNode === lt) lt.insertBefore(hb, ref.nextSibling); else lt.appendChild(hb); }
    // 3D: 첫 방문 모드 고르기 창 · 내 정보 창
    var sm = document.getElementById('smBody');
    if (sm && sm.querySelector('[data-pick]') && !sm.querySelector('[data-i18n-ui]')) sm.insertBefore(box(false, true), sm.firstChild);
    var fa = sm && sm.querySelector('[data-act="me-in"],[data-act="me-out"]'); fa = fa && fa.closest('.factions');
    if (fa && !sm.querySelector('[data-i18n-ui]')) { var bm = box(true, false); bm.style.cssText = 'margin:12px 0 0;background:#fffaf3;border-radius:14px;padding:10px'; fa.parentNode.insertBefore(bm, fa.nextSibling); }
    // 약관·개인정보: 번역본은 참고용, 한국어 원문이 정본
    document.querySelectorAll('.solo-legal').forEach(function (lg) {
      var nt = lg.previousElementSibling && lg.previousElementSibling.hasAttribute('data-sl-legal') ? lg.previousElementSibling : null;
      if (lang === 'ko') { if (nt) nt.remove(); return; }
      if (!nt) { nt = el('p', { 'data-i18n-ui': '1', 'data-sl-legal': '1', style: 'margin:0 0 8px;padding:8px 10px;border-radius:10px;background:#fff7e0;color:#8a6200;font-size:11px;font-weight:700;line-height:1.5' }); lg.parentNode.insertBefore(nt, lg); }
      nt.textContent = UI.legal[lang];
    });
    syncUi();
  }
  var mountT = null;
  function mountLoop() { try { mount(); } catch (e) {} if (!mountT) mountT = setInterval(function () { try { mount(); } catch (e) {} }, 700); }

  // 첫 실행 + 저장된 기록이 없는데 이미 구글 로그인 정보가 있으면(= 기존 사용자) 한국어·원화로 되돌린다
  function legacyAuthCheck() {
    if (!firstRun || lang === 'ko' || !window.indexedDB || !indexedDB.databases) return;
    indexedDB.databases().then(function (list) {
      if (!list.some(function (d) { return d && d.name === 'firebaseLocalStorageDb'; })) return;
      var rq = indexedDB.open('firebaseLocalStorageDb');
      rq.onsuccess = function () { try { var db = rq.result, tx = db.transaction(db.objectStoreNames[0], 'readonly'), c = tx.objectStore(db.objectStoreNames[0]).count(); c.onsuccess = function () { db.close(); if (c.result > 0) { lsSet('soloCurAuto', 'KRW'); setLang('ko'); } }; } catch (e) {} };
    }).catch(function () {});
  }

  var api = window.soloI18n = {
    lang: lang, langs: LANGS, t: function (s) { return t(s); }, money: money, cur: cur, sym: function () { return SYM[cur()]; },
    set: setLang, setCur: setCur, ctx: setCtx, on: function (f) { listeners.push(f); },
    missing: function () { return Array.from(missing); }, plain: plain,
    ads: function () { return lang === 'ko'; }, shop: shop, folder: folder, folderMade: folderMade, liveCh: function () { return LIVE[lang] ? LIVE[lang].slice() : null; },
    shelf: function (w) { var m = SHELF[lang]; return m && m[w] ? m[w] : w; }, // 3D 책장 바인더 등 글자(세로 2줄)
    localizeDemo: localizeDemo, sample: sample, amt: amt, apply: function () { refresh(); }
  };

  // 시작: ko(+₩)면 아무것도 바꾸지 않는다. 다른 언어는 사전을 먼저 동기로 불러 첫 화면부터 번역
  if (lang !== 'ko' && !DICT[lang] && document.readyState === 'loading') { try { document.write('<script src="' + base + 'soloI18n.' + lang + '.js?v=40"><\/script>'); } catch (e) {} }
  if (!plain()) { document.documentElement.setAttribute('lang', lang); }
  function boot() { load(lang, function () { refresh(); }); mountLoop(); legacyAuthCheck(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  // 사전 파일이 읽히자마자(본문을 그리기 전) 감시 시작 → 첫 화면부터 번역(한국어가 잠깐 보이는 깜빡임 방지)
  api._dictReady = function (l) { if (l !== lang || plain()) return; CACHE[l].clear(); PAT[l] = null; if (!DICT[l].__rev) { DICT[l].__rev = 1; indexRev(l); } everTr = true; startObserver(); if (document.body) walk(document.body); };
})();
