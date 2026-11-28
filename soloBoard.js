/* soloBoard.js (v42) — 💬 사장님 커뮤니티 게시판 (2D·3D 공용, 자체 화면)
   저장 위치: 기존 community_board 그대로. Firestore 규칙이 글 하나에 7개 칸(id·uid·author·content·isPrivate·createdAt·dateStr)만
   허용하고 수정을 막고 있어서, 새 기능은 전부 content 앞머리로 구분한다(오락실 랭킹 'ARCADE|…' 과 같은 방식).
     글      : 'BBS2|분류|업종|지역|사진수\n제목\n본문'      (앞머리 없는 예전 글은 그대로 '자유' 글로 보임)
     댓글    : 'RE|글id|내용'
     좋아요  : 'LIKE|글id'            (취소 = 내 좋아요 글 삭제)
     신고    : 'REPORT|글id|사유'      (비공개 글 → 작성자와 관리자만 읽음)
   사진만 새 컬렉션 board_photos/{글id}_{번호} 를 쓴다(줄인 JPEG 를 글자로 저장). 이 컬렉션은 Firestore 규칙에 한 번 추가해야 열린다
   (docs/firestore_rules_board_photos.txt). 규칙이 없으면 사진만 실패하고 글은 그대로 올라간다. */
(function () {
  'use strict';
  var COL = 'community_board', PCOL = 'board_photos', PKEY = 'soloBoardProfile';
  var CATS = [['daily', '일상'], ['qna', 'QnA'], ['log', '장사기록'], ['info', '정보공유'], ['ask', '건의']];
  var CAT_NAME = { daily: '일상', qna: 'QnA', log: '장사기록', info: '정보공유', ask: '건의', free: '자유' };
  var INDS = ['한식', '양식·버거', '일식', '중식', '분식', '고깃집', '치킨·피자', '주점', '카페·디저트', '미용·뷰티', '소매·편의점', '학원·교육', '기타'];
  var REGS = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  var ADJ = ['유쾌한', '부지런한', '솔직한', '힘찬', '말끔한', '든든한', '상쾌한', '꼼꼼한', '씩씩한', '느긋한'], ANI = ['고양이', '부엉이', '기린', '비버', '쿼카', '강아지', '너구리', '펭귄', '다람쥐', '고래'];
  var MAX_PHOTO = 3, PHOTO_LIMIT = 240000, REPORT_REASONS = ['광고·도배', '욕설·비방', '개인정보 노출', '기타'];
  var STARTERS = [['log', '오늘 장사 어땠어요?'], ['qna', '다른 사장님들께 물어보기'], ['info', '써 보니 좋았던 것 공유'], ['daily', '그냥 수다 떨기']];

  var O = null, root = null, io = null;
  var S = { view: 'list', tab: 'all', chip: 'hot', q: '', searching: false, cur: null, posts: null, comments: {}, likes: {}, reports: [], err: '', busy: false,
    draft: null, reDraft: '', photoCache: {}, sheet: null, viewer: '' };

  /* ---------- 작은 도구 ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nl(s) { return esc(s).replace(/\n/g, '<br>'); }
  function one(s) { return String(s || '').replace(/[\r\n|]+/g, ' ').trim(); }
  function me() { return O && O.user && O.user.uid ? O.user.uid : ''; }
  function toast(m, bad) { if (O && typeof O.toast === 'function') { try { O.toast(m, bad); return; } catch (e) {} } var t = root && root.querySelector('.sb-toast'); if (!t) return; t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('on'); }, 2400); }
  function kstDate(ms) { try { return new Date(ms).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }); } catch (e) { return ''; } }
  function ago(ms, fallback) {
    var d = Date.now() - (Number(ms) || 0); if (!(d >= 0)) return fallback || '';
    if (d < 60000) return '방금'; if (d < 3600000) return Math.floor(d / 60000) + '분 전'; if (d < 86400000) return Math.floor(d / 3600000) + '시간 전';
    if (d < 8 * 86400000) return Math.floor(d / 86400000) + '일 전'; return fallback || kstDate(ms);
  }
  function newId() { var t = Date.now(); if (t <= newId.last) t = newId.last + 1; newId.last = t; return String(t); }
  newId.last = 0;
  function randNick() { return ADJ[Math.floor(Math.random() * ADJ.length)] + ANI[Math.floor(Math.random() * ANI.length)] + (100 + Math.floor(Math.random() * 900)); }
  function profile() {
    var p = {}; try { p = JSON.parse(localStorage.getItem(PKEY) || '{}') || {}; } catch (e) { p = {}; }
    if (memProfile) p = memProfile; // 저장소를 못 쓰는 환경에서는 이번 화면에서만 기억
    return { nick: one(p.nick).slice(0, 20), ind: INDS.indexOf(p.ind) >= 0 ? p.ind : '', reg: REGS.indexOf(p.reg) >= 0 ? p.reg : '' };
  }
  var memProfile = null;
  function saveProfile(p) { try { localStorage.setItem(PKEY, JSON.stringify(p)); memProfile = null; } catch (e) { memProfile = p; } }
  function ensureNick() { var p = profile(); if (!p.nick) { p.nick = randNick(); saveProfile(p); } return p; }

  /* ---------- 불러오기 · 해석 ---------- */
  function parse(x) {
    var c = typeof x.content === 'string' ? x.content : '', base = { id: String(x.id || ''), uid: String(x.uid || ''), author: String(x.author || '').slice(0, 30), at: Number(x.createdAt) || 0, dateStr: String(x.dateStr || ''), priv: !!x.isPrivate };
    if (c.indexOf('ARCADE|') === 0) return null;
    var a;
    if (c.indexOf('RE|') === 0) { a = c.indexOf('|', 3); if (a < 0) return null; base.kind = 're'; base.pid = c.slice(3, a); base.text = c.slice(a + 1); return base; }
    if (c.indexOf('LIKE|') === 0) { base.kind = 'like'; base.pid = c.slice(5); return base; }
    if (c.indexOf('REPORT|') === 0) { a = c.indexOf('|', 7); base.kind = 'report'; base.pid = a < 0 ? c.slice(7) : c.slice(7, a); base.text = a < 0 ? '' : c.slice(a + 1); return base; }
    base.kind = 'post';
    if (c.indexOf('BBS2|') === 0) {
      var e = c.indexOf('\n'), head = (e < 0 ? c : c.slice(0, e)).split('|'), rest = e < 0 ? '' : c.slice(e + 1), e2 = rest.indexOf('\n');
      base.cat = CAT_NAME[head[1]] ? head[1] : 'daily'; base.ind = head[2] || ''; base.reg = head[3] || ''; base.photos = Math.max(0, Math.min(MAX_PHOTO, parseInt(head[4], 10) || 0));
      base.title = (e2 < 0 ? rest : rest.slice(0, e2)).trim(); base.body = e2 < 0 ? '' : rest.slice(e2 + 1);
    } else { base.cat = 'free'; base.ind = ''; base.reg = ''; base.photos = 0; base.title = ''; base.body = c; }
    return base;
  }
  function ingest(list) {
    var posts = [], comments = {}, likes = {}, reports = [];
    list.forEach(function (x) { var p = parse(x); if (!p || !p.id) return;
      if (p.kind === 'post') posts.push(p); else if (p.kind === 're') (comments[p.pid] = comments[p.pid] || []).push(p);
      else if (p.kind === 'like') (likes[p.pid] = likes[p.pid] || []).push(p); else reports.push(p); });
    Object.keys(comments).forEach(function (k) { comments[k].sort(function (a, b) { return a.at - b.at; }); });
    Object.keys(likes).forEach(function (k) { var seen = {}; likes[k] = likes[k].filter(function (l) { if (seen[l.uid]) return false; seen[l.uid] = 1; return true; }); });
    S.posts = posts; S.comments = comments; S.likes = likes; S.reports = reports;
  }
  function load() {
    S.err = ''; S.posts = null; render();
    var f = O.fs, col = f.collection(O.db, COL), qs = O.isAdmin ? [col] : [f.query(col, f.where('isPrivate', '==', false))];
    if (!O.isAdmin && me()) qs.push(f.query(col, f.where('uid', '==', me())));
    return Promise.all(qs.map(function (q) { return f.getDocs(q); })).then(function (snaps) {
      var map = {}; snaps.forEach(function (s) { s.forEach(function (d) { var x = d.data(); map[x.id || d.id] = x; }); });
      ingest(Object.keys(map).map(function (k) { return map[k]; })); render();
    }).catch(function (e) { try { console.error('soloBoard load', e); } catch (_) {} S.posts = []; S.err = '게시글을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.'; render(); });
  }
  function nLike(p) { return (S.likes[p.id] || []).length; }
  function nRe(p) { return (S.comments[p.id] || []).length; }
  function myLike(p) { var u = me(), l = S.likes[p.id] || []; for (var i = 0; i < l.length; i++) if (l[i].uid === u) return l[i]; return null; }
  function hot(p) { return (nLike(p) * 2 + nRe(p) * 3 + 1) / (1 + Math.max(0, Date.now() - p.at) / (7 * 86400000)); }
  function canSee(p) { return !p.priv || O.isAdmin || p.uid === me(); }
  function findPost(id) { var a = S.posts || []; for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
  function filtered() {
    var pr = profile(), a = (S.posts || []).slice(), q = S.q.trim().toLowerCase();
    if (S.tab === 'ind') a = a.filter(function (p) { return pr.ind && p.ind === pr.ind; });
    else if (S.tab === 'reg') a = a.filter(function (p) { return pr.reg && p.reg === pr.reg; });
    else if (S.tab === 'mine') a = a.filter(function (p) { return p.uid === me(); });
    if (S.chip !== 'hot' && S.chip !== 'new') a = a.filter(function (p) { return p.cat === S.chip || (S.chip === 'ask' && p.cat === 'free'); });
    if (q) a = a.filter(function (p) { return canSee(p) && (p.title + '\n' + p.body + '\n' + p.author).toLowerCase().indexOf(q) >= 0; });
    if (S.chip === 'hot' && !q) a.sort(function (x, y) { return hot(y) - hot(x) || y.at - x.at; }); else a.sort(function (x, y) { return y.at - x.at; });
    return a;
  }

  /* ---------- 사진 ---------- */
  function photoDoc(pid, i) { return O.fs.doc(O.db, PCOL, pid + '_' + i); }
  function getPhoto(pid, i) {
    var k = pid + '_' + i; if (S.photoCache[k]) return S.photoCache[k];
    S.photoCache[k] = O.fs.getDoc(photoDoc(pid, i)).then(function (d) { var x = d && d.exists && d.exists() ? d.data() : null; var u = x && typeof x.data === 'string' && x.data.indexOf('data:image/') === 0 ? x.data : ''; return u; }).catch(function () { return ''; });
    return S.photoCache[k];
  }
  function hydratePhotos() {
    if (!root) return; var els = root.querySelectorAll('.sb-ph[data-pid]:not([data-on])');
    function fill(el) { el.setAttribute('data-on', '1'); getPhoto(el.dataset.pid, el.dataset.i).then(function (u) { if (!u) { el.classList.add('none'); el.textContent = '사진을 불러오지 못했어요'; return; } var im = document.createElement('img'); im.alt = '첨부 사진'; im.src = u; el.textContent = ''; el.appendChild(im); }); }
    if (!('IntersectionObserver' in window)) { Array.prototype.forEach.call(els, fill); return; }
    if (io) io.disconnect();
    io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { io.unobserve(x.target); fill(x.target); } }); }, { root: root.querySelector('.sb-body'), rootMargin: '200px' });
    Array.prototype.forEach.call(els, function (el) { io.observe(el); });
  }
  // 휴대폰 사진(수 MB)을 긴 변 1080px 이하 JPEG 로 줄여 글자(data URL)로 만든다. 한 장이 PHOTO_LIMIT 글자를 넘지 않게 화질·크기를 낮춘다.
  function shrink(file) {
    return new Promise(function (res, rej) {
      if (!file || !/^image\//.test(file.type || '')) { rej(new Error('type')); return; }
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        try {
          var w = im.naturalWidth, h = im.naturalHeight, sc = Math.min(1, 1080 / Math.max(w, h)), out = '';
          for (var tries = 0; tries < 6; tries++) {
            var cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * sc)); cv.height = Math.max(1, Math.round(h * sc));
            var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0, cv.width, cv.height);
            for (var q = 0.8; q >= 0.5; q -= 0.1) { out = cv.toDataURL('image/jpeg', q); if (out.length <= PHOTO_LIMIT) break; }
            if (out.length <= PHOTO_LIMIT) break; sc *= 0.75;
          }
          URL.revokeObjectURL(url); if (!out || out.length > PHOTO_LIMIT || out.indexOf('data:image/jpeg') !== 0) rej(new Error('big')); else res(out);
        } catch (e) { URL.revokeObjectURL(url); rej(e); }
      };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('load')); };
      im.src = url;
    });
  }

  /* ---------- 쓰기 · 지우기 ---------- */
  function rec(id, content, priv) { var now = Number(id); return { id: id, uid: me(), author: ensureNick().nick.slice(0, 30), content: String(content).slice(0, 1000), isPrivate: !!priv, createdAt: now, dateStr: kstDate(now) }; }
  function put(r) { return O.fs.setDoc(O.fs.doc(O.db, COL, r.id), r); }
  function del(id) { return O.fs.deleteDoc(O.fs.doc(O.db, COL, id)); }
  function needLogin() { if (me()) return false; toast('로그인하면 글·댓글·공감을 남길 수 있어요', true); return true; }

  function submitPost() {
    if (S.busy || needLogin()) return; var d = S.draft, pr = ensureNick();
    var title = one(d.title).slice(0, 40), body = String(d.body || '').trim();
    if (!title) { toast('제목을 적어 주세요', true); focus('#sbTitle'); return; }
    if (!body) { toast('내용을 적어 주세요', true); focus('#sbBody'); return; }
    var id = newId(), photos = d.priv ? [] : d.photos.slice(0, MAX_PHOTO);
    S.busy = true; render();
    var up = Promise.resolve(photos.length), done = 0;
    if (photos.length) {
      up = photos.reduce(function (chain, data, i) { return chain.then(function () { return O.fs.setDoc(photoDoc(id, i), { uid: me(), postId: id, idx: i, data: data, createdAt: Number(id) }).then(function () { done = i + 1; }); }); }, Promise.resolve())
        .then(function () { return photos.length; })
        .catch(function (e) {
          try { console.error('soloBoard photo', e); } catch (_) {}
          for (var i = 0; i < done; i++) O.fs.deleteDoc(photoDoc(id, i)).catch(function () {});
          if (!window.confirm('사진을 올리지 못했어요. (사진 저장소가 아직 열리지 않았거나 연결이 불안정해요)\n\n사진 없이 글만 올릴까요?')) throw new Error('cancel');
          return 0;
        });
    }
    up.then(function (n) {
      var head = 'BBS2|' + d.cat + '|' + one(pr.ind) + '|' + one(pr.reg) + '|' + n + '\n' + title + '\n';
      var r = rec(id, head + body.slice(0, Math.max(0, 1000 - head.length)), d.priv);
      return put(r).then(function () { photos.slice(0, n).forEach(function (u, i) { S.photoCache[id + '_' + i] = Promise.resolve(u); }); S.posts.push(parse(r)); S.draft = null; S.view = 'list'; S.chip = 'new'; S.tab = 'all'; S.q = ''; toast(d.priv ? '운영자에게만 보이는 글로 등록됐어요' : '글이 등록됐어요'); });
    }).catch(function (e) { if (!e || e.message !== 'cancel') { try { console.error('soloBoard post', e); } catch (_) {} toast('등록하지 못했어요 — 다시 시도해 주세요', true); } })
      .then(function () { S.busy = false; render(); });
  }
  function submitComment() {
    if (S.busy || needLogin()) return; var p = findPost(S.cur), ta = root.querySelector('#sbRe'), text = ta ? ta.value.trim().slice(0, 300) : '';
    if (!p) return; if (!text) { focus('#sbRe'); return; }
    var r = rec(newId(), 'RE|' + p.id + '|' + text, false); S.busy = true;
    put(r).then(function () { (S.comments[p.id] = S.comments[p.id] || []).push(parse(r)); S.reDraft = ''; }).catch(function () { toast('댓글을 올리지 못했어요', true); }).then(function () { S.busy = false; render(); });
  }
  function toggleLike(p) {
    if (S.busy || needLogin()) return; var mine = myLike(p); S.busy = true;
    var job = mine ? del(mine.id).then(function () { S.likes[p.id] = (S.likes[p.id] || []).filter(function (l) { return l.id !== mine.id; }); })
      : (function () { var r = rec(newId(), 'LIKE|' + p.id, false); return put(r).then(function () { (S.likes[p.id] = S.likes[p.id] || []).push(parse(r)); }); })();
    job.catch(function () { toast('잠시 뒤 다시 눌러 주세요', true); }).then(function () { S.busy = false; render(); });
  }
  function removePost(p) {
    if (!window.confirm('이 글을 삭제할까요?')) return;
    del(p.id).then(function () { for (var i = 0; i < p.photos; i++) O.fs.deleteDoc(photoDoc(p.id, i)).catch(function () {});
      S.posts = S.posts.filter(function (x) { return x.id !== p.id; }); S.view = 'list'; S.cur = null; toast('삭제했어요'); render(); })
      .catch(function () { toast('삭제 권한이 없거나 오류가 났어요', true); });
  }
  function removeComment(pid, cid) {
    if (!window.confirm('이 댓글을 삭제할까요?')) return;
    del(cid).then(function () { S.comments[pid] = (S.comments[pid] || []).filter(function (c) { return c.id !== cid; }); render(); }).catch(function () { toast('삭제 권한이 없거나 오류가 났어요', true); });
  }
  function report(p, reason) {
    if (needLogin()) return; var r = rec(newId(), 'REPORT|' + p.id + '|' + reason, true);
    put(r).then(function () { toast('신고가 접수됐어요. 운영자가 확인할게요'); }).catch(function () { toast('신고를 보내지 못했어요', true); });
    S.sheet = null; render();
  }
  function focus(sel) { var el = root && root.querySelector(sel); if (el) try { el.focus(); } catch (e) {} }

  /* ---------- 화면 ---------- */
  function tagHtml(p) { var t = '<span class="sb-cat c-' + p.cat + '">' + CAT_NAME[p.cat] + '</span>'; if (p.ind) t += '<span class="sb-tag">' + esc(p.ind) + '</span>'; if (p.reg) t += '<span class="sb-tag">' + esc(p.reg) + '</span>'; if (p.priv) t += '<span class="sb-tag lock">🔒 비공개</span>'; return t; }
  function card(p) {
    var see = canSee(p), body = see ? (p.title ? p.body : p.body) : '', mineLike = !!myLike(p);
    return '<article class="sb-card" data-act="open" data-id="' + esc(p.id) + '" tabindex="0" role="button">' +
      '<div class="sb-meta"><span class="sb-av" aria-hidden="true">' + esc((p.author || '?').slice(0, 1)) + '</span><b>' + esc(p.author || '이름 없음') + '</b><span class="sb-dot">·</span><span>' + esc(ago(p.at, p.dateStr)) + '</span></div>' +
      '<div class="sb-main"><div class="sb-txt">' + (see ? (p.title ? '<h3>' + (p.cat === 'qna' ? '<i class="sb-q">Q.</i> ' : '') + esc(p.title) + '</h3>' : '') + '<p>' + esc(body.slice(0, 120)) + '</p>' : '<p class="sb-lock">🔒 비공개 글이에요 (작성자와 운영자만 볼 수 있어요)</p>') + '</div>' +
      (see && p.photos ? '<div class="sb-ph thumb" data-pid="' + esc(p.id) + '" data-i="0"></div>' : '') + '</div>' +
      '<div class="sb-foot"><span class="sb-tags">' + tagHtml(p) + '</span><span class="sb-cnt' + (mineLike ? ' on' : '') + '">♥ ' + nLike(p) + '</span><span class="sb-cnt">💬 ' + nRe(p) + '</span>' + (p.photos > 1 && see ? '<span class="sb-cnt">📷 ' + p.photos + '</span>' : '') + '</div></article>';
  }
  function listView() {
    var pr = profile(), h = '';
    h += '<div class="sb-search' + (S.searching ? ' on' : '') + '"><input id="sbQ" type="search" placeholder="무엇이든 찾아보세요 (예: 알바, 세무사, 배민)" value="' + esc(S.q) + '" maxlength="30" aria-label="게시글 검색"></div>';
    h += '<div class="sb-tabs" role="tablist">' + [['all', '전체'], ['ind', '내 업종'], ['reg', '내 지역'], ['mine', '내 글']].map(function (t) { return '<button type="button" role="tab" aria-selected="' + (S.tab === t[0]) + '" data-act="tab" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
    h += '<div class="sb-chips">' + [['hot', '추천'], ['new', '최신']].concat(CATS).map(function (c) { return '<button type="button" class="sb-chip" aria-pressed="' + (S.chip === c[0]) + '" data-act="chip" data-v="' + c[0] + '">' + c[1] + '</button>'; }).join('') +
      (O.isAdmin ? '<button type="button" class="sb-chip" aria-pressed="' + (S.chip === 'report') + '" data-act="chip" data-v="report">🚨 신고 ' + S.reports.length + '</button>' : '') + '</div>';
    if (S.posts === null) return h + '<p class="sb-empty">불러오는 중…</p>';
    if (S.err) return h + '<p class="sb-empty">' + esc(S.err) + '</p><button type="button" class="sb-line" data-act="reload">다시 불러오기</button>';
    if (S.chip === 'report' && O.isAdmin) {
      return h + (S.reports.length ? S.reports.slice().sort(function (a, b) { return b.at - a.at; }).map(function (r) { var p = findPost(r.pid);
        return '<div class="sb-card flat"><div class="sb-meta"><b>🚨 ' + esc(r.text || '신고') + '</b><span class="sb-dot">·</span><span>' + esc(ago(r.at, r.dateStr)) + '</span></div><p class="sb-rp">' + (p ? esc((p.title || p.body).slice(0, 60)) : '이미 삭제된 글') + '</p><div class="sb-rowbtn">' + (p ? '<button type="button" class="sb-line" data-act="open" data-id="' + esc(p.id) + '">글 보기</button>' : '') + '<button type="button" class="sb-line" data-act="rdel" data-id="' + esc(r.id) + '">신고 지우기</button></div></div>'; }).join('') : '<p class="sb-empty">접수된 신고가 없어요.</p>');
    }
    if ((S.tab === 'ind' && !pr.ind) || (S.tab === 'reg' && !pr.reg)) {
      return h + '<div class="sb-card flat center"><b>' + (S.tab === 'ind' ? '내 업종 사장님들은 무슨 이야기를 할까?' : '내 지역 사장님들은 무슨 이야기를 할까?') + '</b><p>' + (S.tab === 'ind' ? '업종' : '지역') + '을 설정하면 같은 ' + (S.tab === 'ind' ? '업종' : '지역') + ' 글만 모아 볼 수 있어요.</p><button type="button" class="sb-pri" data-act="profile">' + (S.tab === 'ind' ? '업종' : '지역') + ' 설정하기</button></div>';
    }
    var a = filtered(), top = '';
    if (S.tab === 'all' && !S.q && (S.chip === 'hot' || S.chip === 'qna')) {
      var help = (S.posts || []).filter(function (p) { return p.cat === 'qna' && !p.priv && nRe(p) === 0; }).sort(function (x, y) { return y.at - x.at; }).slice(0, 2);
      if (help.length) top += '<section class="sb-help"><p class="sb-helph">🙋 사장님의 도움이 필요해요!</p>' + help.map(function (p) { return '<button type="button" class="sb-helpi" data-act="open" data-id="' + esc(p.id) + '"><b>' + esc(p.title || p.body.slice(0, 30)) + '</b><span>' + esc(p.body.slice(0, 44)) + '</span><i aria-hidden="true">›</i></button>'; }).join('') + '</section>';
    }
    if (!a.length) {
      if (S.q) return h + '<p class="sb-empty">"' + esc(S.q) + '" 에 맞는 글이 없어요.</p>';
      return h + top + '<div class="sb-card flat center"><b>아직 글이 없어요. 첫 글의 주인공이 되어 주세요!</b><p>이런 이야기로 시작해 보면 어때요?</p><div class="sb-start">' + STARTERS.map(function (s) { return '<button type="button" class="sb-line" data-act="write" data-cat="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</div></div>';
    }
    return h + top + '<p class="sb-count">' + (S.q ? '검색 결과 ' : '') + a.length + '개의 글</p>' + a.map(card).join('');
  }
  function postView() {
    var p = findPost(S.cur); if (!p) return '<p class="sb-empty">삭제되었거나 찾을 수 없는 글이에요.</p>';
    var see = canSee(p), mine = p.uid === me(), cs = S.comments[p.id] || [], liked = !!myLike(p), h = '';
    h += '<article class="sb-post"><div class="sb-meta big"><span class="sb-av" aria-hidden="true">' + esc((p.author || '?').slice(0, 1)) + '</span><div><b>' + esc(p.author || '이름 없음') + '</b><span>' + esc(ago(p.at, p.dateStr)) + '</span></div></div>';
    h += '<div class="sb-tags">' + tagHtml(p) + '</div>';
    if (!see) h += '<p class="sb-lock">🔒 비공개 글이에요 (작성자와 운영자만 볼 수 있어요)</p>';
    else {
      if (p.title) h += '<h2>' + (p.cat === 'qna' ? '<i class="sb-q">Q.</i> ' : '') + esc(p.title) + '</h2>';
      h += '<div class="sb-bodytxt">' + nl(p.body) + '</div>';
      for (var i = 0; i < p.photos; i++) h += '<div class="sb-ph full" data-pid="' + esc(p.id) + '" data-i="' + i + '" data-act="zoom"></div>';
    }
    h += '<div class="sb-acts"><button type="button" class="sb-like' + (liked ? ' on' : '') + '" data-act="like" aria-pressed="' + liked + '">♥ 공감 ' + nLike(p) + '</button><span class="sb-cnt">💬 ' + cs.length + '</span><span class="sb-grow"></span>' +
      (mine || O.isAdmin ? '<button type="button" class="sb-txtbtn" data-act="pdel">삭제</button>' : '') + (!mine ? '<button type="button" class="sb-txtbtn" data-act="report">신고</button>' : '') + '</div></article>';
    if (p.priv) return h + '<p class="sb-empty">비공개 글에는 댓글을 달 수 없어요. 운영자가 확인하고 반영할게요.</p>';
    h += '<section class="sb-res"><p class="sb-count">댓글 ' + cs.length + '</p>' + (cs.length ? cs.map(function (c) { return '<div class="sb-re"><div class="sb-meta"><span class="sb-av s" aria-hidden="true">' + esc((c.author || '?').slice(0, 1)) + '</span><b>' + esc(c.author || '이름 없음') + '</b>' + (c.uid === p.uid ? '<span class="sb-tag w">글쓴이</span>' : '') + '<span class="sb-dot">·</span><span>' + esc(ago(c.at, c.dateStr)) + '</span>' + (c.uid === me() || O.isAdmin ? '<button type="button" class="sb-txtbtn" data-act="cdel" data-id="' + esc(c.id) + '">삭제</button>' : '') + '</div><p>' + nl(c.text) + '</p></div>'; }).join('') : '<p class="sb-empty small">아직 댓글이 없어요. 첫 번째 댓글을 남겨 보세요.</p>') + '</section>';
    return h;
  }
  function writeView() {
    var d = S.draft, pr = ensureNick(), h = '<div class="sb-form">';
    h += '<p class="sb-lab">어떤 글인가요?</p><div class="sb-chips wrap">' + CATS.map(function (c) { return '<button type="button" class="sb-chip" aria-pressed="' + (d.cat === c[0]) + '" data-act="wcat" data-v="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div>';
    h += '<input id="sbTitle" class="sb-in" maxlength="40" placeholder="' + (d.cat === 'qna' ? '궁금한 점을 한 줄로 적어 주세요' : '제목') + '" value="' + esc(d.title) + '" aria-label="제목">';
    h += '<textarea id="sbBody" class="sb-in" rows="8" maxlength="900" placeholder="' + (d.cat === 'ask' ? '앱에서 불편한 점, 있었으면 하는 기능을 자유롭게 적어 주세요.' : d.cat === 'log' ? '오늘 장사는 어땠나요? 잘된 점, 힘들었던 점을 편하게 남겨 보세요.' : '사장님들과 나누고 싶은 이야기를 적어 주세요.') + '" aria-label="내용">' + esc(d.body) + '</textarea>';
    h += '<div class="sb-photos">' + d.photos.map(function (u, i) { return '<div class="sb-pv"><img src="' + u + '" alt="첨부할 사진 ' + (i + 1) + '"><button type="button" data-act="prm" data-i="' + i + '" aria-label="사진 빼기">✕</button></div>'; }).join('') +
      (d.photos.length < MAX_PHOTO && !d.priv ? '<label class="sb-add"><input id="sbFile" type="file" accept="image/*" multiple hidden><span>📷</span><em>사진 ' + d.photos.length + '/' + MAX_PHOTO + '</em></label>' : '') + '</div>';
    h += '<label class="sb-check"><input id="sbPriv" type="checkbox"' + (d.priv ? ' checked' : '') + '><span>🔒 운영자에게만 보이기 <small>(건의·문의용 · 사진은 못 올려요)</small></span></label>';
    h += '<div class="sb-who"><span>닉네임 <b>' + esc(pr.nick) + '</b>' + (pr.ind ? ' · ' + esc(pr.ind) : '') + (pr.reg ? ' · ' + esc(pr.reg) : '') + '</span><button type="button" class="sb-txtbtn" data-act="profile">바꾸기</button></div>';
    h += '<p class="sb-rule">손님·직원의 얼굴, 실명, 연락처, 차량번호가 보이는 글과 사진은 올리지 말아 주세요. 다른 사람을 비방하거나 광고하는 글은 신고되면 삭제될 수 있어요.</p>';
    return h + '</div>';
  }
  function profileView() {
    var pr = ensureNick(), mineN = (S.posts || []).filter(function (p) { return p.uid === me(); }).length;
    var h = '<div class="sb-form"><p class="sb-lab">닉네임</p><div class="sb-nickrow"><input id="sbNick" class="sb-in" maxlength="20" value="' + esc(pr.nick) + '" aria-label="닉네임"><button type="button" class="sb-line" data-act="rnick">🎲 추천</button></div>';
    h += '<p class="sb-hint">가게 이름 대신 닉네임을 쓰면 편하게 이야기할 수 있어요.</p>';
    h += '<p class="sb-lab">활동 업종</p><select id="sbInd" class="sb-in" aria-label="활동 업종"><option value="">선택 안 함</option>' + INDS.map(function (x) { return '<option' + (pr.ind === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>';
    h += '<p class="sb-lab">활동 지역</p><select id="sbReg" class="sb-in" aria-label="활동 지역"><option value="">선택 안 함</option>' + REGS.map(function (x) { return '<option' + (pr.reg === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>';
    h += '<p class="sb-hint">업종·지역은 글에 작은 꼬리표로 붙고, 「내 업종」「내 지역」 모아 보기에 쓰여요.</p>';
    h += '<button type="button" class="sb-pri" data-act="psave">저장</button><button type="button" class="sb-line wide" data-act="mine">내가 쓴 글 ' + mineN + '개 보기</button></div>';
    return h;
  }
  function render() {
    if (!root) return;
    var title = S.view === 'list' ? '사장님 커뮤니티' : S.view === 'post' ? '게시글' : S.view === 'write' ? '글쓰기' : '내 프로필', right = '';
    if (S.view === 'list') right = '<button type="button" class="sb-ico" data-act="search" aria-label="검색">🔍</button><button type="button" class="sb-ico" data-act="profile" aria-label="내 프로필">👤</button>';
    else if (S.view === 'write') right = '<button type="button" class="sb-done" data-act="submit"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? '올리는 중…' : '등록') + '</button>';
    var body = S.view === 'list' ? listView() : S.view === 'post' ? postView() : S.view === 'write' ? writeView() : profileView();
    var wrap = root.querySelector('.sb-wrap'), keep = root.querySelector('.sb-body'), top = keep && S.view === render.last ? keep.scrollTop : 0;
    var act = document.activeElement && document.activeElement.id, pos = act === 'sbQ' ? document.activeElement.selectionStart : null;
    var h = '<header class="sb-head"><button type="button" class="sb-ico" data-act="back" aria-label="' + (S.view === 'list' ? '닫기' : '뒤로') + '">' + (S.view === 'list' ? '✕' : '‹') + '</button><h1 id="sbH">' + title + (O.isAdmin && S.view === 'list' ? ' <span class="sb-tag w">👑 관리자</span>' : '') + '</h1><span class="sb-grow"></span>' + right + '</header>';
    h += '<div class="sb-body">' + body + '</div>';
    if (S.view === 'list') h += '<button type="button" class="sb-fab" data-act="write">✏️ 글쓰기</button>';
    if (S.view === 'post' && findPost(S.cur) && !findPost(S.cur).priv) h += '<div class="sb-rebar"><textarea id="sbRe" rows="1" maxlength="300" placeholder="' + (me() ? '따뜻한 댓글을 남겨 주세요' : '로그인하면 댓글을 남길 수 있어요') + '" aria-label="댓글 쓰기"></textarea><button type="button" class="sb-done" data-act="resend">등록</button></div>';
    if (S.sheet === 'report') h += '<div class="sb-sheet" data-act="sheetx"><div class="sb-sheetin"><b>신고하는 이유를 골라 주세요</b>' + REPORT_REASONS.map(function (r) { return '<button type="button" class="sb-line wide" data-act="rsend" data-v="' + r + '">' + r + '</button>'; }).join('') + '<button type="button" class="sb-txtbtn" data-act="sheetx">취소</button></div></div>';
    if (S.viewer) h += '<div class="sb-viewer" data-act="zoomx"><img src="' + S.viewer + '" alt="첨부 사진 크게 보기"></div>';
    wrap.innerHTML = h;
    var nb = root.querySelector('.sb-body'); if (nb) nb.scrollTop = top; render.last = S.view;
    var re = root.querySelector('#sbRe'); if (re && S.reDraft) re.value = S.reDraft;
    if (act === 'sbQ') { var q = root.querySelector('#sbQ'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) {} } }
    hydratePhotos();
  }

  /* ---------- 이벤트 ---------- */
  function keepDraft() { if (S.view !== 'write' || !S.draft || !root) return; var t = root.querySelector('#sbTitle'), b = root.querySelector('#sbBody'), p = root.querySelector('#sbPriv'); if (t) S.draft.title = t.value; if (b) S.draft.body = b.value; if (p) S.draft.priv = p.checked; }
  function startWrite(cat) { if (needLogin()) return; if (!S.draft) S.draft = { cat: 'daily', title: '', body: '', priv: false, photos: [] }; if (cat && CAT_NAME[cat]) S.draft.cat = cat; S.view = 'write'; render(); focus('#sbTitle'); }
  function onClick(e) {
    var b = e.target.closest ? e.target.closest('[data-act]') : null; if (!b || !root.contains(b)) return;
    var act = b.dataset.act, p;
    if (act === 'sheetx' && e.target !== b && !e.target.closest('.sb-txtbtn')) return;
    keepDraft();
    switch (act) {
      case 'back':
        if (S.view === 'list') { close(); return; }
        if (S.view === 'write') { var d = S.draft; if (d && (d.title.trim() || d.body.trim() || d.photos.length) && !window.confirm('쓰던 글을 지우고 나갈까요?')) return; S.draft = null; S.view = 'list'; }
        else if (S.view === 'profile') S.view = S.draft ? 'write' : 'list'; else { S.view = 'list'; S.cur = null; }
        break;
      case 'tab': S.tab = b.dataset.v; break;
      case 'chip': S.chip = b.dataset.v; break;
      case 'search': S.searching = !S.searching; if (!S.searching) S.q = ''; render(); if (S.searching) focus('#sbQ'); return;
      case 'reload': load(); return;
      case 'open': S.cur = b.dataset.id; S.view = 'post'; S.reDraft = ''; break;
      case 'write': startWrite(b.dataset.cat); return;
      case 'wcat': S.draft.cat = b.dataset.v; break;
      case 'prm': S.draft.photos.splice(+b.dataset.i, 1); break;
      case 'submit': submitPost(); return;
      case 'profile': S.view = 'profile'; break;
      case 'rnick': var n = root.querySelector('#sbNick'); if (n) n.value = randNick(); return;
      case 'psave':
        var np = { nick: one((root.querySelector('#sbNick') || {}).value).slice(0, 20) || randNick(), ind: (root.querySelector('#sbInd') || {}).value || '', reg: (root.querySelector('#sbReg') || {}).value || '' };
        saveProfile(np); if (me()) try { O.fs.setDoc(O.fs.doc(O.db, 'users', me(), 'settings', 'board'), np).catch(function () {}); } catch (er) {}
        toast('프로필을 저장했어요'); S.view = S.draft ? 'write' : 'list'; break;
      case 'mine': S.tab = 'mine'; S.chip = 'new'; S.view = 'list'; break;
      case 'like': p = findPost(S.cur); if (p) toggleLike(p); return;
      case 'pdel': p = findPost(S.cur); if (p) removePost(p); return;
      case 'cdel': removeComment(S.cur, b.dataset.id); return;
      case 'resend': submitComment(); return;
      case 'report': if (needLogin()) return; S.sheet = 'report'; break;
      case 'rsend': p = findPost(S.cur); if (p) report(p, b.dataset.v); return;
      case 'rdel': del(b.dataset.id).then(function () { S.reports = S.reports.filter(function (r) { return r.id !== b.dataset.id; }); render(); }).catch(function () { toast('지우지 못했어요', true); }); return;
      case 'sheetx': S.sheet = null; break;
      case 'zoom': var im = b.querySelector('img'); if (!im) return; S.viewer = im.src; break;
      case 'zoomx': S.viewer = ''; break;
      default: return;
    }
    render();
  }
  function onInput(e) { if (e.target.id === 'sbRe') { S.reDraft = e.target.value; return; } if (e.target.id === 'sbQ') { S.q = e.target.value; clearTimeout(onInput.t); onInput.t = setTimeout(render, 250); } }
  function onChange(e) {
    if (e.target.id === 'sbPriv') { keepDraft(); if (S.draft.priv) S.draft.photos = []; render(); return; }
    if (e.target.id !== 'sbFile') return;
    keepDraft(); var files = Array.prototype.slice.call(e.target.files || [], 0, MAX_PHOTO - S.draft.photos.length); if (!files.length) return;
    toast('사진을 줄이는 중…');
    files.reduce(function (chain, f) { return chain.then(function () { return shrink(f).then(function (u) { if (S.draft && S.draft.photos.length < MAX_PHOTO) S.draft.photos.push(u); }).catch(function () { toast('이 사진은 올릴 수 없어요 (사진 파일만 가능)', true); }); }); }, Promise.resolve()).then(function () { keepDraft(); render(); });
  }
  function onKey(e) {
    e.stopPropagation();
    if (e.key === 'Escape') { if (S.viewer) { S.viewer = ''; render(); } else if (S.sheet) { S.sheet = null; render(); } else if (S.view === 'list') close(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('sb-card')) { e.preventDefault(); e.target.click(); }
  }

  /* ---------- 열기 · 닫기 ---------- */
  function css() {
    if (document.getElementById('soloBoardStyle')) return;
    var s = document.createElement('style'); s.id = 'soloBoardStyle';
    s.textContent = '#soloBoard{position:fixed;inset:0;z-index:2147483000;background:#F2F4F6;color:#191F28;font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif;font-size:14px;line-height:1.5;-webkit-text-size-adjust:100%;user-select:text;-webkit-user-select:text;touch-action:auto}' +
      '#soloBoard *{box-sizing:border-box}#soloBoard button{font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}#soloBoard [hidden]{display:none!important}' +
      '.sb-wrap{position:relative;max-width:560px;height:100%;margin:0 auto;display:flex;flex-direction:column;background:#F2F4F6}' +
      '.sb-head{display:flex;align-items:center;gap:4px;padding:calc(8px + env(safe-area-inset-top)) 8px 8px;background:#fff;border-bottom:1px solid #E5E8EB;flex:none}' +
      '.sb-head h1{margin:0 0 0 2px;font-size:17px;font-weight:800;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-grow{flex:1}' +
      '.sb-ico{width:40px;height:40px;border:0;background:none;border-radius:12px;font-size:20px;line-height:1;color:#333D4B;flex:none}.sb-ico:active{background:#F2F4F6}' +
      '.sb-done{border:0;background:#3182F6;color:#fff;font-weight:800;font-size:14px;border-radius:12px;padding:9px 16px;flex:none}.sb-done:disabled{background:#B0B8C1}' +
      '.sb-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 0 96px;overscroll-behavior:contain}' +
      '.sb-search{display:none;padding:10px 14px 0;background:#fff}.sb-search.on{display:block}' +
      '.sb-in{display:block;width:100%;border:1px solid #E5E8EB;border-radius:14px;background:#fff;color:#191F28;padding:12px 14px;font-size:16px;font-family:inherit;line-height:1.5;outline:none}.sb-in:focus,.sb-search input:focus{border-color:#3182F6}' +
      '.sb-search input{width:100%;border:1px solid #E5E8EB;border-radius:999px;background:#F9FAFB;padding:10px 16px;font-size:16px;font-family:inherit;outline:none}' +
      '.sb-tabs{display:flex;gap:18px;padding:12px 16px 0;background:#fff}.sb-tabs button{border:0;background:none;padding:4px 0 10px;font-size:16px;font-weight:800;color:#B0B8C1;border-bottom:2px solid transparent}.sb-tabs button[aria-selected="true"]{color:#191F28;border-bottom-color:#191F28}' +
      '.sb-chips{display:flex;gap:6px;padding:10px 14px 12px;background:#fff;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid #E5E8EB}.sb-chips::-webkit-scrollbar{display:none}.sb-chips.wrap{flex-wrap:wrap;padding:0 0 12px;border:0;background:none}' +
      '.sb-chip{flex:none;border:1px solid #E5E8EB;background:#fff;color:#4E5968;border-radius:999px;padding:7px 13px;font-size:13px;font-weight:700;white-space:nowrap}.sb-chip[aria-pressed="true"]{background:#333D4B;border-color:#333D4B;color:#fff}' +
      '.sb-count{margin:14px 16px 6px;font-size:12px;font-weight:700;color:#8B95A1}.sb-empty{margin:0;padding:44px 20px;text-align:center;color:#8B95A1;font-size:13px}.sb-empty.small{padding:18px 0}' +
      '.sb-card{display:block;margin:8px 12px 0;padding:14px 16px;background:#fff;border-radius:18px;cursor:pointer;outline:none}.sb-card:focus-visible{box-shadow:0 0 0 2px #3182F6}.sb-card.flat{cursor:default}.sb-card.center{text-align:center;padding:22px 16px}.sb-card.center b{font-size:15px}.sb-card.center p{margin:6px 0 14px;color:#6B7684;font-size:13px}' +
      '.sb-meta{display:flex;align-items:center;gap:6px;font-size:12px;color:#8B95A1;min-width:0}.sb-meta b{color:#333D4B;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-dot{color:#D1D6DB}' +
      '.sb-meta.big{gap:10px}.sb-meta.big div{display:flex;flex-direction:column;line-height:1.35}.sb-meta.big b{font-size:14px}' +
      '.sb-av{flex:none;width:24px;height:24px;border-radius:50%;background:#E8F3FF;color:#1B64DA;font-size:12px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}.sb-meta.big .sb-av{width:38px;height:38px;font-size:16px}.sb-av.s{width:22px;height:22px;font-size:11px}' +
      '.sb-main{display:flex;gap:12px;margin-top:8px}.sb-txt{flex:1;min-width:0}.sb-txt h3{margin:0 0 3px;font-size:15.5px;font-weight:800;letter-spacing:-.02em;line-height:1.4;word-break:keep-all;overflow-wrap:anywhere}' +
      '.sb-txt p{margin:0;font-size:13.5px;color:#4E5968;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.sb-q{font-style:normal;color:#3182F6;font-weight:800}' +
      '.sb-lock{margin:8px 0 0;color:#8B95A1;font-size:13px}' +
      '.sb-ph{background:#F2F4F6;border-radius:12px;overflow:hidden;color:#B0B8C1;font-size:11px;display:flex;align-items:center;justify-content:center;text-align:center}.sb-ph img{display:block;width:100%;height:100%;object-fit:cover}' +
      '.sb-ph.thumb{flex:none;width:72px;height:72px}.sb-ph.thumb.none{display:none}.sb-ph.full{margin-top:10px;min-height:120px;cursor:zoom-in}.sb-ph.full img{height:auto;object-fit:contain}' +
      '.sb-foot{display:flex;align-items:center;gap:10px;margin-top:10px}.sb-tags{display:flex;flex-wrap:wrap;gap:4px;flex:1;min-width:0}' +
      '.sb-cat,.sb-tag{display:inline-block;font-size:11px;font-weight:700;border-radius:6px;padding:2px 6px;white-space:nowrap;background:#F2F4F6;color:#6B7684}.sb-tag.w{background:#E8F3FF;color:#1B64DA}.sb-tag.lock{background:#FFF3D6;color:#8A6100}' +
      '.sb-cat.c-qna{background:#E8F3FF;color:#1B64DA}.sb-cat.c-log{background:#E6F7EF;color:#0A7B4F}.sb-cat.c-info{background:#F3EEFF;color:#6541C7}.sb-cat.c-ask,.sb-cat.c-free{background:#FFF0E6;color:#B4540A}' +
      '.sb-cnt{flex:none;font-size:12px;font-weight:700;color:#8B95A1;white-space:nowrap}.sb-cnt.on{color:#F04452}' +
      '.sb-help{margin:10px 12px 0;padding:12px;border:1.5px solid #B9D7FF;border-radius:18px;background:#fff}.sb-helph{margin:0 2px 8px;font-size:12.5px;font-weight:800;color:#1B64DA}' +
      '.sb-helpi{position:relative;display:block;width:100%;text-align:left;border:0;background:#F2F4F6;border-radius:12px;padding:10px 30px 10px 12px;margin-top:6px}.sb-helpi b{display:block;font-size:14px;color:#191F28;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-helpi span{display:block;font-size:12px;color:#6B7684;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-helpi i{position:absolute;right:12px;top:50%;transform:translateY(-50%);font-style:normal;color:#B0B8C1;font-size:18px}' +
      '.sb-fab{position:absolute;right:16px;bottom:calc(20px + env(safe-area-inset-bottom));border:0;background:#3182F6;color:#fff;font-weight:800;font-size:15px;border-radius:999px;padding:13px 20px;box-shadow:0 6px 18px rgba(49,130,246,.35)}' +
      '.sb-pri{display:block;width:100%;border:0;background:#3182F6;color:#fff;font-weight:800;font-size:15px;border-radius:14px;padding:13px;margin-top:16px}.sb-card .sb-pri{margin-top:0}' +
      '.sb-line{border:1px solid #E5E8EB;background:#fff;color:#333D4B;font-weight:700;font-size:13px;border-radius:12px;padding:9px 13px}.sb-line.wide{display:block;width:100%;margin-top:8px;padding:12px}.sb-empty+.sb-line{display:block;margin:0 auto}' +
      '.sb-start{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}.sb-rowbtn{display:flex;gap:6px;margin-top:8px}.sb-rp{margin:6px 0 0;color:#4E5968;font-size:13px}' +
      '.sb-txtbtn{border:0;background:none;color:#8B95A1;font-size:12px;font-weight:700;padding:6px 6px;margin-left:auto;flex:none}' +
      '.sb-post{margin:10px 12px 0;padding:18px 16px;background:#fff;border-radius:18px}.sb-post .sb-tags{margin-top:12px}.sb-post h2{margin:12px 0 6px;font-size:19px;font-weight:800;letter-spacing:-.02em;line-height:1.4;word-break:keep-all;overflow-wrap:anywhere}' +
      '.sb-bodytxt{margin-top:8px;font-size:15px;line-height:1.7;color:#333D4B;overflow-wrap:anywhere}' +
      '.sb-acts{display:flex;align-items:center;gap:12px;margin-top:16px;padding-top:12px;border-top:1px solid #F2F4F6}.sb-acts .sb-txtbtn{margin-left:0}' +
      '.sb-like{border:1px solid #E5E8EB;background:#fff;color:#4E5968;font-weight:800;font-size:13px;border-radius:999px;padding:8px 14px}.sb-like.on{border-color:#F04452;color:#F04452;background:#FFF0F1}' +
      '.sb-res{margin:10px 12px 0;padding:4px 16px 12px;background:#fff;border-radius:18px}.sb-res .sb-count{margin:12px 0 4px}.sb-re{padding:12px 0;border-top:1px solid #F2F4F6}.sb-re p{margin:4px 0 0 28px;font-size:14px;color:#333D4B;overflow-wrap:anywhere}' +
      '.sb-rebar{flex:none;display:flex;gap:8px;align-items:flex-end;padding:8px 10px calc(8px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid #E5E8EB}.sb-rebar textarea{flex:1;border:1px solid #E5E8EB;border-radius:18px;background:#F9FAFB;padding:9px 14px;font-size:16px;font-family:inherit;line-height:1.4;resize:none;outline:none;max-height:96px}' +
      '.sb-form{padding:16px 14px}.sb-lab{margin:14px 2px 6px;font-size:13px;font-weight:800;color:#333D4B}.sb-form>.sb-lab:first-child{margin-top:0}.sb-form .sb-in+.sb-in{margin-top:8px}.sb-form textarea{resize:vertical;min-height:160px}' +
      '.sb-hint,.sb-rule{margin:6px 2px 0;font-size:12px;color:#8B95A1;line-height:1.55;word-break:keep-all}.sb-rule{margin-top:14px;padding:10px 12px;background:#fff;border-radius:12px}' +
      '.sb-photos{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}.sb-pv,.sb-add{position:relative;width:76px;height:76px;border-radius:14px;overflow:hidden;flex:none}.sb-pv img{width:100%;height:100%;object-fit:cover;display:block}' +
      '.sb-pv button{position:absolute;top:3px;right:3px;width:22px;height:22px;border:0;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;font-size:11px;line-height:1;padding:0}' +
      '.sb-add{border:1.5px dashed #B0B8C1;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;color:#6B7684}.sb-add span{font-size:22px;line-height:1.1}.sb-add em{font-style:normal;font-size:11px;font-weight:700}' +
      '.sb-check{display:flex;align-items:flex-start;gap:8px;margin-top:14px;font-size:13px;font-weight:700;color:#333D4B;cursor:pointer}.sb-check input{width:18px;height:18px;margin:1px 0 0;accent-color:#3182F6;flex:none}.sb-check small{font-weight:500;color:#8B95A1}' +
      '.sb-who{display:flex;align-items:center;gap:8px;margin-top:14px;padding:10px 12px;background:#fff;border-radius:12px;font-size:13px;color:#4E5968}.sb-who span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sb-who b{color:#191F28}' +
      '.sb-nickrow{display:flex;gap:8px}.sb-nickrow .sb-in{flex:1}.sb-nickrow .sb-line{flex:none;white-space:nowrap}' +
      '.sb-sheet{position:absolute;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;z-index:5}.sb-sheetin{width:100%;background:#fff;border-radius:22px 22px 0 0;padding:20px 16px calc(16px + env(safe-area-inset-bottom));display:flex;flex-direction:column}.sb-sheetin b{font-size:16px;margin-bottom:6px}.sb-sheetin .sb-txtbtn{margin:10px auto 0;padding:10px 20px;font-size:14px}' +
      '.sb-viewer{position:absolute;inset:0;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;z-index:6;cursor:zoom-out}.sb-viewer img{max-width:100%;max-height:100%;object-fit:contain}' +
      '.sb-toast{position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom));transform:translateX(-50%) translateY(10px);background:rgba(25,31,40,.92);color:#fff;font-size:13px;font-weight:700;border-radius:999px;padding:10px 18px;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;max-width:88%;text-align:center;z-index:7}.sb-toast.on{opacity:1;transform:translateX(-50%)}';
    document.head.appendChild(s);
  }
  // opts: { db, fs:{collection,doc,setDoc,getDoc,getDocs,deleteDoc,query,where}, user:{uid,email}|null, isAdmin, toast?, onClose? }
  function open(opts) {
    if (!opts || !opts.db || !opts.fs) return false;
    O = opts; css();
    if (!root) {
      root = document.createElement('div'); root.id = 'soloBoard'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'sbH');
      root.innerHTML = '<div class="sb-wrap"></div><div class="sb-toast" role="status" aria-live="polite"></div>';
      root.addEventListener('click', onClick); root.addEventListener('input', onInput); root.addEventListener('change', onChange); root.addEventListener('keydown', onKey);
      // 3D 화면에서는 바닥의 시점 조작이 같이 움직이지 않게 막는다(2D에서는 영향 없음)
      ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'keyup'].forEach(function (t) { root.addEventListener(t, function (e) { e.stopPropagation(); }, { passive: true }); });
    }
    if (!root.parentNode) document.body.appendChild(root);
    S.view = 'list'; S.cur = null; S.sheet = null; S.viewer = ''; S.q = ''; S.searching = false; S.busy = false; S.photoCache = {}; S.reDraft = ''; S.tab = 'all'; S.chip = 'hot';
    ensureNick();
    // 다른 기기에서 저장한 프로필이 있으면 가져온다(이 기기에 업종·지역이 비어 있을 때만)
    var pr = profile();
    if (me() && !pr.ind && !pr.reg && O.fs.getDoc) try { O.fs.getDoc(O.fs.doc(O.db, 'users', me(), 'settings', 'board')).then(function (d) { var x = d && d.exists && d.exists() ? d.data() : null; if (!x) return; var cur = profile(); if (cur.ind || cur.reg) return; saveProfile({ nick: one(x.nick).slice(0, 20) || cur.nick, ind: x.ind || '', reg: x.reg || '' }); if (S.view === 'list') render(); }).catch(function () {}); } catch (e) {}
    load();
    return true;
  }
  function close() { if (io) { io.disconnect(); io = null; } if (root && root.parentNode) root.parentNode.removeChild(root); var cb = O && O.onClose; if (typeof cb === 'function') try { cb(); } catch (e) {} }

  window.soloBoard = { open: open, close: close, isOpen: function () { return !!(root && root.parentNode); }, _parse: parse };
})();
