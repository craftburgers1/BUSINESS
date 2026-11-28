/* soloPickle.js (v42) — 🤖 피클 시작 프롬프트 · 내 가게 알려 주기 (2D·3D 공용)
   - 새 사장님이 피클에 붙여넣으면, 피클이 "어떤 포스를 쓰세요?"부터 스스로 물어보고 연결을 진행한다.
   - 여기서 미리 고른 것(연매출 구간·포스·배달앱)은 프롬프트에 적혀 나가서 피클이 다시 묻지 않는다.
   - 고른 값은 이 기기(localStorage: soloPickleProfile)에만 저장한다. 서버에는 쓰지 않는다. */
(function () {
  'use strict';
  var KEY = 'soloPickleProfile';
  // 2026년 상반기 영세·중소가맹점 우대수수료율(금융위원회 2026-02-12 발표). 반기마다 바뀔 수 있음.
  var FEE_ASOF = '2026년 상반기';
  var REV = [
    { k: 'u3', label: '3억 이하', credit: '0.40', check: '0.15' },
    { k: '3_5', label: '3~5억', credit: '1.00', check: '0.75' },
    { k: '5_10', label: '5~10억', credit: '1.15', check: '0.90' },
    { k: '10_30', label: '10~30억', credit: '1.45', check: '1.15' },
    { k: 'o30', label: '30억 초과', credit: '', check: '' },
    { k: 'unk', label: '잘 모르겠어요', credit: '', check: '' }
  ];
  var POS = ['토스포스', '오케이포스(OKPOS)', '포스뱅크', '이지포스', '유니온포스', '페이히어', '배민포스', '단말기만 써요(포스 없음)', '기타'];
  var APPS = ['배민', '쿠팡이츠', '요기요', '땡겨요'];

  function load() {
    var p = {};
    try { p = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { p = {}; }
    if (mem) p = mem; // 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 이번 화면에서만 기억
    return { rev: typeof p.rev === 'string' ? p.rev : '', isNew: !!p.isNew, pos: typeof p.pos === 'string' ? p.pos : '',
      posEtc: typeof p.posEtc === 'string' ? p.posEtc.slice(0, 20) : '', apps: Array.isArray(p.apps) ? p.apps.filter(function (a) { return APPS.indexOf(a) >= 0; }) : [], noApp: !!p.noApp };
  }
  var mem = null;
  function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); mem = null; } catch (e) { mem = p; } }
  function revOf(k) { for (var i = 0; i < REV.length; i++) if (REV[i].k === k) return REV[i]; return null; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clean(s) { return String(s || '').replace(/[\r\n|]/g, ' ').trim(); }

  function feeLine(p) {
    var r = revOf(p.rev);
    if (!r) return '';
    if (p.isNew) return '개업 6개월 이내라 처음엔 일반 수수료율(약 2%대)이 적용되고, 나중에 차액을 돌려받아요.';
    if (!r.credit) return '수수료율은 여신금융협회 「카드매출조회」에서 확인이 필요해요.';
    return '예상 카드 수수료: 신용 ' + r.credit + '% · 체크 ' + r.check + '% (' + FEE_ASOF + ' 기준)';
  }

  /* ---------- 프롬프트 ---------- */
  // opt: { mode:'restaurant'|'salon'|'store', full:bool, ledgerUrl, staffUrl }
  function prompt(opt) {
    opt = opt || {};
    var p = load(), salon = opt.mode === 'salon', food = opt.mode === 'restaurant';
    var L = opt.ledgerUrl || 'https://craftburgers1.github.io/BUSINESS/2d.html?by=pickle', S = opt.staffUrl || 'https://craftburgers1.github.io/craftburger/';
    var r = revOf(p.rev), known = [];
    if (food) known.push('- 업종: 식당·카페'); else if (salon) known.push('- 업종: 미용실');
    if (r && r.k !== 'unk') known.push('- 작년 연매출: ' + r.label + (r.credit && !p.isNew ? ' → 카드 수수료율 신용 ' + r.credit + '% / 체크 ' + r.check + '%' : ''));
    if (r && r.k !== 'unk') known.push('- 개업 6개월 이내: ' + (p.isNew ? '예 (당분간 일반 수수료율 약 2%대가 적용되고, 나중에 차액을 돌려받음)' : '아니오'));
    var pos = p.pos === '기타' ? clean(p.posEtc) : p.pos;
    if (pos) known.push('- 포스: ' + pos);
    if (!salon) { if (p.apps.length) known.push('- 배달앱: ' + p.apps.join(', ')); else if (p.noApp) known.push('- 배달앱: 안 씀'); }

    var who = salon ? '내 미용실 전담 비서' : '내 가게 전담 비서';
    var t = '너는 ' + who + '야. 내 용돈냥이 PRO 가계부(' + L + ')' + (opt.full ? '와 근태관리(' + S + ')' : '') + '에 매출·지출을 대신 적어 주고, 매일 아침 "들어올 돈"을 알려 주는 일을 맡아 줘.\n\n';
    t += '[꼭 지킬 것]\n' +
      '- 비밀번호·인증번호는 채팅으로 받지 마. 로그인은 내가 피클 브라우저에서 직접 할게.\n' +
      '- 가계부에 저장할 때 "입력한 사람" 칸은 항상 피클로 골라 줘. 내가(주인장) 넣은 기록은 고치거나 지우지 마.\n' +
      '- 같은 날짜·같은 항목이 이미 있으면 또 넣지 말고, 금액이 다르면 먼저 나에게 물어봐.\n' +
      '- 처음 보는 화면은 추측하지 말고 캡처를 부탁해. 금액이 평소의 3배를 넘거나 0원이면 넣기 전에 물어봐.\n' +
      '- 질문은 한 번에 하나씩, 쉬운 말로 짧게 해 줘.\n\n';
    if (known.length) t += '[내가 미리 알려 주는 것 — 이건 다시 묻지 마]\n' + known.join('\n') + '\n\n';
    t += '[1단계 · 먼저 물어보기]\n위에 내가 미리 적어 둔 것은 건너뛰고, 빠진 것만 하나씩 물어봐 줘.\n' +
      (food || salon ? '' : '① 어떤 가게를 하는지 (식당·카페 / 미용실 / 기타)\n') +
      '② 작년 연매출 구간 (3억 이하 / 3~5억 / 5~10억 / 10~30억 / 30억 초과 / 잘 모름)\n' +
      '③ 가게를 연 지 6개월이 안 됐는지\n' +
      '④ 계산할 때 쓰는 포스 (토스포스 / 오케이포스 / 포스뱅크 / 이지포스 / 유니온포스 / 페이히어 / 배민포스 / 단말기만 씀 / 기타 — 이름을 물어봐)\n' +
      (salon ? '⑤ 예약을 받는 곳 (네이버 예약 / 카카오헤어샵 / 전화만 / 기타)\n' : '⑤ 쓰는 배달앱 (배민 / 쿠팡이츠 / 요기요 / 땡겨요 / 안 씀)\n') +
      '⑥ 매일 정리를 받아 볼 시간 (말 안 하면 오전 9시)\n' +
      '연매출 구간을 알면 카드 수수료율은 이 표로 정해 줘(' + FEE_ASOF + ' 우대수수료율): 3억 이하 신용 0.40%·체크 0.15% / 3~5억 1.00%·0.75% / 5~10억 1.15%·0.90% / 10~30억 1.45%·1.15%. ' +
      '30억 초과이거나 모르면 여신금융협회 「카드매출조회」(cardsales.or.kr)에서 내 수수료율을 확인해 달라고 하고, 그 전까지는 "확인 필요"로 표시해. ' +
      '개업 6개월 이내면 일반 수수료율이 먼저 적용되고 나중에 차액을 돌려받는다고 알려 줘. 수수료율은 반기마다 바뀔 수 있으니 1월·7월 말에 다시 확인하자고 먼저 말해 줘.\n\n';
    t += '[2단계 · 연결 전에 먼저 설명]\n지금 바로 연결부터 하지 말고, 위 주소를 직접 열어 어떤 기능이 있는지 살펴본 뒤 "연결하면 내 가게 운영이 어떻게 편해지는지" 쉽고 짧게 먼저 브리핑해 줘. 내가 좋다고 하면 그때부터 하나씩 연결하자.\n\n';
    t += '[3단계 · 하나씩 연결]\n' +
      '- 가계부: 내가 피클 브라우저에서 직접 로그인할게.\n' +
      '- 포스: 내가 답한 포스의 사장님용 매출 조회 앱·사이트를 같이 찾아 줘(내가 모르면 포스 화면이나 영수증 아래쪽 회사 이름을 사진으로 보내 달라고 해). 내가 로그인하면 "일별 매출" 화면에서 날짜·총매출·결제수단별 금액(카드/현금/간편결제)·취소 금액을 읽을 수 있는지 확인해. 포스가 없으면 카드 매출은 「카드매출조회」에서 읽고, 현금 매출은 매일 나에게 물어봐.\n' +
      (salon ? '- 예약: 네이버 예약 등 내가 쓰는 예약 화면에서 날짜별 시술 매출을 읽을 수 있는지 확인해.\n'
        : '- 배달앱: 내가 쓰는 앱마다 사장님 사이트에 내가 로그인하면, 정산 화면에서 주문금액·입금(정산)예정액·입금예정일을 읽을 수 있는지 확인해.\n') +
      '- 하나 연결할 때마다 어제 하루치를 읽어 와서 "이 금액 맞나요?" 하고 나에게 확인받은 다음에 넘어가. 화면 위치는 기억해 두고 다음부터 그대로 읽어.\n\n';
    t += '[4단계 · 매일 할 일]\n' +
      '1. 정한 시간에 ' + (salon ? '포스·예약 기준 전날 시술 매출만' : '포스·배달앱 전날 매출만') + ' 가계부에 기록 (' + (salon ? '카드 수수료는' : '수수료·배달비는') + ' 매일 넣으면 정산이 안 맞으니 매월 1일 월말 정산내역서 기준으로 한 번에 정리)\n' +
      '2. "들어올 돈"을 계산해서 브리핑: 카드 = 카드매출 × (1 − 수수료율), 입금일은 결제일 + 2영업일(주말·공휴일 제외, 연휴에는 밀릴 수 있다고 표시)' + (salon ? '' : ' / 배달앱 = 앱에 나온 입금예정액·입금예정일 그대로') + '. 항상 "예상"이라고 붙이고, 실제 입금과 3% 넘게 다르면 알려 줘.\n' +
      '   예) ☀️ 어제 매출 1,234,000원 (카드 820,000 · 현금 64,000' + (salon ? '' : ' · 배민 230,000 · 쿠팡이츠 120,000') + ') / 💰 오늘 들어올 돈(예상) 812,000원 · 내일 455,000원\n' +
      '3. 지출 정리: 내가 보내는 영수증 사진이나 쿠팡·네이버쇼핑·G마켓 주문내역은 날짜·항목별로 가계부에 입력\n' +
      '4. 로그인이 풀렸으면 추측해서 넣지 말고 "미확인"으로 남긴 뒤, 다시 로그인해 달라고 알려 줘.';
    if (opt.full) t += '\n5. 매일 자정: ' + (salon ? '네이버·카카오' : '배민·쿠팡이츠·네이버') + ' 긍정 리뷰(4~5점)에 매장 톤으로 답글 달고 보고(1~3점 부정 리뷰는 답글 달지 말고 즉시 나에게 알림)\n' +
      '6. 예약 알림: 네이버 예약 메일이 오면 나에게 바로 알리고 캘린더에 등록해 줘.';
    return t;
  }

  /* ---------- "내 가게 알려 주기" 작은 폼 ---------- */
  function css() {
    if (document.getElementById('soloPickleStyle')) return;
    var s = document.createElement('style'); s.id = 'soloPickleStyle';
    s.textContent = '.spk{display:block}.spk-q{font-size:12px;font-weight:700;color:#333D4B;margin:10px 0 6px}.spk-q:first-child{margin-top:0}.spk-q small{font-weight:500;color:#8B95A1}' +
      '.spk-row{display:flex;flex-wrap:wrap;gap:6px}' +
      '.spk-c{appearance:none;border:1px solid #E5E8EB;background:#fff;color:#4E5968;border-radius:999px;padding:7px 11px;font-size:12px;font-weight:600;line-height:1.2;cursor:pointer;font-family:inherit;min-height:32px}' +
      '.spk-c[aria-pressed="true"]{background:#3182F6;border-color:#3182F6;color:#fff}' +
      '.spk-sel,.spk-in{width:100%;border:1px solid #E5E8EB;border-radius:12px;background:#fff;color:#191F28;padding:9px 10px;font-size:16px;font-family:inherit;box-sizing:border-box}' +
      '.spk-in{margin-top:6px}.spk-fee{margin-top:8px;font-size:11.5px;font-weight:700;color:#1B64DA;background:#EBF3FE;border-radius:10px;padding:7px 10px;line-height:1.5;word-break:keep-all}' +
      '.spk-fee:empty{display:none}.spk-note{margin-top:8px;font-size:11px;color:#8B95A1;line-height:1.5;word-break:keep-all}';
    document.head.appendChild(s);
  }
  // el 안에 폼을 그린다. opt: { mode, onChange }
  function mount(el, opt) {
    if (!el) return; opt = opt || {}; css();
    var salon = opt.mode === 'salon';
    function draw() {
      var p = load();
      var h = '<div class="spk">';
      h += '<p class="spk-q">작년 연매출 <small>(카드 수수료율이 정해져요)</small></p><div class="spk-row">' + REV.map(function (r) { return '<button type="button" class="spk-c" data-rev="' + r.k + '" aria-pressed="' + (p.rev === r.k) + '">' + r.label + '</button>'; }).join('') + '</div>';
      h += '<div class="spk-row" style="margin-top:6px"><button type="button" class="spk-c" data-new="1" aria-pressed="' + p.isNew + '">🆕 개업한 지 6개월이 안 됐어요</button></div>';
      h += '<p class="spk-fee">' + esc(feeLine(p)) + '</p>';
      h += '<p class="spk-q">쓰는 포스</p><select class="spk-sel" data-pos aria-label="쓰는 포스"><option value="">모르겠어요 · 피클이 물어봐 주세요</option>' + POS.map(function (x) { return '<option' + (p.pos === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>';
      if (p.pos === '기타') h += '<input class="spk-in" data-posetc maxlength="20" placeholder="포스 이름 (예: ○○포스)" value="' + esc(p.posEtc) + '" aria-label="포스 이름">';
      if (!salon) h += '<p class="spk-q">쓰는 배달앱 <small>(여러 개 선택)</small></p><div class="spk-row">' + APPS.map(function (a) { return '<button type="button" class="spk-c" data-app="' + a + '" aria-pressed="' + (p.apps.indexOf(a) >= 0) + '">' + a + '</button>'; }).join('') +
        '<button type="button" class="spk-c" data-noapp="1" aria-pressed="' + (p.noApp && !p.apps.length) + '">안 써요</button></div>';
      h += '<p class="spk-note">고른 내용은 아래 프롬프트에 적혀서 피클이 다시 묻지 않아요. 비워 두면 피클이 하나씩 물어봐요. (이 기기에만 저장)</p></div>';
      el.innerHTML = h;
    }
    function changed() { if (typeof opt.onChange === 'function') try { opt.onChange(load()); } catch (e) {} }
    if (!el.__spk) {
      el.__spk = true;
      el.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('.spk-c'); if (!b) return;
        var p = load();
        if (b.dataset.rev) p.rev = p.rev === b.dataset.rev ? '' : b.dataset.rev;
        else if (b.dataset.new) p.isNew = !p.isNew;
        else if (b.dataset.app) { var i = p.apps.indexOf(b.dataset.app); if (i >= 0) p.apps.splice(i, 1); else p.apps.push(b.dataset.app); p.noApp = false; }
        else if (b.dataset.noapp) { p.noApp = !(p.noApp && !p.apps.length); p.apps = []; }
        save(p); draw(); changed();
      });
      el.addEventListener('change', function (e) {
        if (!e.target.matches || !e.target.matches('[data-pos]')) return;
        var p = load(); p.pos = e.target.value; if (p.pos !== '기타') p.posEtc = ''; save(p); draw(); changed();
      });
      el.addEventListener('input', function (e) {
        if (!e.target.matches || !e.target.matches('[data-posetc]')) return;
        var p = load(); p.posEtc = e.target.value.slice(0, 20); save(p); changed();
      });
    }
    draw();
  }

  window.soloPickle = { prompt: prompt, mount: mount, profile: load, feeLine: feeLine, REV: REV, FEE_ASOF: FEE_ASOF };
})();
