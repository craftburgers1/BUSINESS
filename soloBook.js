/* 솔로운영 세무회계 장부 엑셀(구글 시트) 만들기 — 2D 가계부와 3D가 같이 쓰는 공용 파일
   세무사 사무실에서 받는 구성: 요약 · 손익계산서 · 합계잔액시산표 · 분개장(일반전표) · 계정별원장(계정마다 시트) · 거래처별 집계
   입력: entries = 2D 장부 형식 [{id,type:'sales'|'fixed'|'variable',date,category,amount,memo,scope?,receipts?}]
         mapper(entry) → {debit, credit, kind:'사업'|'개인'}  (화면의 복식장부와 같은 분개 규칙을 페이지가 넘겨줌)
   window.SoloBook = { load(), build(opts) → workbook, toArray(wb), fileBase(opts) } */
(function () {
  'use strict';
  const LIB = 'vendor/xlsx-js-style.min.js', BASE = (document.currentScript && document.currentScript.src) || location.href;
  let libP = null;
  function load() {
    if (window.XLSX && window.XLSX.style_version) return Promise.resolve(window.XLSX);
    if (libP) return libP;
    libP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = new URL(LIB, BASE).href; s.async = true;
      s.onload = () => (window.XLSX && window.XLSX.style_version) ? res(window.XLSX) : rej(new Error('xlsx-style'));
      s.onerror = () => { libP = null; rej(new Error('xlsx-style-load')); };
      document.head.appendChild(s);
    });
    return libP;
  }

  // 계정 분류(재무제표 순서) — 화면 복식장부의 계정과목 그대로
  const ASSET = ['보통예금', '현금'], EQUITY = ['자본금', '개인출금', '개인인출'], REVENUE = ['매출액'];
  const COGS = ['식자재비'];
  const SGA = ['인건비', '임차료', '지급수수료', '소모품비', '광고선전비', '통신비', '수도광열비', '보험료', '세금과공과', '차량유지비', '접대비', '기타경비', '기타비용'];
  const ORDER = [].concat(ASSET, EQUITY, REVENUE, COGS, SGA);
  const groupOf = a => ASSET.includes(a) ? '자산' : REVENUE.includes(a) ? '수익' : EQUITY.includes(a) ? '자본' : '비용';
  const debitNormal = a => groupOf(a) === '자산' || groupOf(a) === '비용' || a === '개인출금' || a === '개인인출';
  const ordIdx = a => { const i = ORDER.indexOf(a); return i < 0 ? 900 : i; };

  // ---- 스타일 ----
  const FONT = '맑은 고딕';
  const thin = { style: 'thin', color: { rgb: 'BFC5CE' } };
  const BORDER = { top: thin, bottom: thin, left: thin, right: thin };
  const NUM = '#,##0;[Red]-#,##0;"-"';
  const S = {
    title: { font: { name: FONT, sz: 16, bold: true, color: { rgb: '1F2937' } }, alignment: { vertical: 'center' } },
    sub: { font: { name: FONT, sz: 10, color: { rgb: '6B7280' } } },
    head: { font: { name: FONT, sz: 10, bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '334155' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: BORDER },
    txt: { font: { name: FONT, sz: 10 }, border: BORDER, alignment: { vertical: 'center' } },
    ctr: { font: { name: FONT, sz: 10 }, border: BORDER, alignment: { horizontal: 'center', vertical: 'center' } },
    num: { font: { name: FONT, sz: 10 }, border: BORDER, numFmt: NUM },
    pct: { font: { name: FONT, sz: 10, color: { rgb: '6B7280' } }, border: BORDER, numFmt: '0.0%' },
    sec: { font: { name: FONT, sz: 10, bold: true, color: { rgb: '1E3A8A' } }, fill: { fgColor: { rgb: 'E8EEF9' } }, border: BORDER },
    secNum: { font: { name: FONT, sz: 10, bold: true, color: { rgb: '1E3A8A' } }, fill: { fgColor: { rgb: 'E8EEF9' } }, border: BORDER, numFmt: NUM },
    tot: { font: { name: FONT, sz: 10, bold: true }, fill: { fgColor: { rgb: 'FFF4D6' } }, border: BORDER },
    totNum: { font: { name: FONT, sz: 10, bold: true }, fill: { fgColor: { rgb: 'FFF4D6' } }, border: BORDER, numFmt: NUM },
    sumRow: { font: { name: FONT, sz: 10, bold: true, color: { rgb: '475569' } }, fill: { fgColor: { rgb: 'F1F5F9' } }, border: BORDER },
    sumNum: { font: { name: FONT, sz: 10, bold: true, color: { rgb: '475569' } }, fill: { fgColor: { rgb: 'F1F5F9' } }, border: BORDER, numFmt: NUM },
    ok: { font: { name: FONT, sz: 10, bold: true, color: { rgb: '047857' } } },
    bad: { font: { name: FONT, sz: 10, bold: true, color: { rgb: 'B91C1C' } } },
    note: { font: { name: FONT, sz: 9, color: { rgb: '6B7280' } }, alignment: { wrapText: true, vertical: 'top' } },
    key: { font: { name: FONT, sz: 10, bold: true, color: { rgb: '374151' } }, fill: { fgColor: { rgb: 'F8FAFC' } }, border: BORDER },
    bigNum: { font: { name: FONT, sz: 12, bold: true }, border: BORDER, numFmt: NUM }
  };

  // 셀 헬퍼: 시트를 행 배열로 만들고, 셀마다 {v, s, f?}
  function Sheet() { this.rows = []; this.merges = []; this.cols = []; }
  Sheet.prototype.add = function (cells) { this.rows.push(cells || []); return this.rows.length - 1; };
  Sheet.prototype.blank = function () { return this.add([]); };
  const c = (v, s, f) => ({ v, s, f });
  const col = n => { let s = ''; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const ref = (r, k) => col(k) + (r + 1);

  function toWs(X, sh) {
    const ws = {}; let maxC = 0;
    sh.rows.forEach((row, r) => row.forEach((cell, k) => {
      if (cell == null) return; maxC = Math.max(maxC, k);
      const v = cell.v, isNum = typeof v === 'number';
      const o = { t: isNum ? 'n' : 's', v: isNum ? v : (v == null ? '' : String(v)) };
      if (cell.f) o.f = cell.f; if (cell.s) o.s = cell.s; if (cell.s && cell.s.numFmt) o.z = cell.s.numFmt;
      ws[ref(r, k)] = o;
    }));
    ws['!ref'] = 'A1:' + ref(Math.max(0, sh.rows.length - 1), Math.max(maxC, sh.cols.length - 1));
    ws['!cols'] = sh.cols.map(w => ({ wch: w }));
    if (sh.merges.length) ws['!merges'] = sh.merges;
    ws['!rows'] = sh.rows.map((row, r) => r === 0 ? { hpt: 26 } : null);
    return ws;
  }
  const sheetSafe = s => String(s).replace(/[\\\/\?\*\[\]:]/g, '').slice(0, 31);

  function build(o) {
    const X = window.XLSX;
    const store = o.store || '내 가게', label = o.label || '', scope = o.scope === 'all' ? 'all' : 'store', made = o.madeAt || new Date();
    const pad = n => String(n).padStart(2, '0');
    const madeStr = `${made.getFullYear()}-${pad(made.getMonth() + 1)}-${pad(made.getDate())}`;
    // 1) 전표 만들기 (일자순 → 같은 날은 입력순), 전표번호 YYYYMMDD-001
    const src = (o.entries || []).filter(e => e && e.date && Number(e.amount) > 0)
      .map((e, i) => ({ e, i, m: o.mapper(e) }))
      .filter(x => x.m && (scope === 'all' || x.m.kind !== '개인'))
      .sort((a, b) => String(a.e.date).localeCompare(String(b.e.date)) || String(a.e.id || '').localeCompare(String(b.e.id || '')) || a.i - b.i);
    const perDay = {};
    const V = src.map(({ e, m }) => {
      const d = String(e.date).slice(0, 10), n = (perDay[d] = (perDay[d] || 0) + 1);
      const rc = Array.isArray(e.receipts) ? e.receipts.length : 0;
      return { no: d.replace(/-/g, '') + '-' + String(n).padStart(3, '0'), date: d, ym: d.slice(0, 7), debit: m.debit, credit: m.credit, amount: Math.round(Number(e.amount) || 0),
        summary: e.category || (e.type === 'sales' ? '매출' : '지출'), partner: (e.memo || '').trim(), kind: m.kind || '사업', proof: rc ? `영수증 ${rc}장` : '' };
    });
    const months = [...new Set(V.map(v => v.ym))].sort();
    if (o.months && o.months.length) o.months.forEach(m => { if (!months.includes(m)) months.push(m); }), months.sort();
    // 계정별 합계
    const T = {}; const tAdd = (a, k, v) => { (T[a] = T[a] || { d: 0, c: 0 })[k] += v; };
    V.forEach(v => { tAdd(v.debit, 'd', v.amount); tAdd(v.credit, 'c', v.amount); });
    const accts = Object.keys(T).sort((a, b) => ordIdx(a) - ordIdx(b) || a.localeCompare(b));
    const byMonth = (a, ym, side) => V.filter(v => v.ym === ym && (side === 'd' ? v.debit === a : v.credit === a)).reduce((s, v) => s + v.amount, 0);
    const sales = (T['매출액'] || { c: 0 }).c;
    const cogsAccts = accts.filter(a => COGS.includes(a)), sgaAccts = accts.filter(a => groupOf(a) === '비용' && !COGS.includes(a));
    const cogs = cogsAccts.reduce((s, a) => s + T[a].d, 0), sga = sgaAccts.reduce((s, a) => s + T[a].d, 0);
    const drawing = ['개인출금', '개인인출'].reduce((s, a) => s + (T[a] ? T[a].d : 0), 0);
    const net = sales - cogs - sga;

    const wb = X.utils.book_new();
    const scopeTxt = scope === 'all' ? '전체 (사업 + 개인출금)' : '사업 전용';
    const headRow = (sh, title, sub, width) => { sh.add([c(title, S.title)]); sh.merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: width - 1 } }); sh.add([c(sub, S.sub)]); sh.merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: width - 1 } }); sh.blank(); };
    const subLine = `상호: ${store}   |   기간: ${label}   |   구분: ${scopeTxt}   |   작성일: ${madeStr}   |   (단위: 원)`;

    // ===== 1. 요약 =====
    {
      const sh = new Sheet(); sh.cols = [26, 20, 52];
      headRow(sh, `${store} 세무회계 장부`, subLine, 3);
      sh.add([c('항목', S.head), c('금액', S.head), c('설명', S.head)]);
      [['매출액', sales, '수입(매출)으로 적은 금액 합계'], ['매출원가', cogs, '식자재비'], ['매출총이익', sales - cogs, '매출액 − 매출원가'],
        ['판매비와관리비', sga, '인건비·임차료·수수료·소모품 등'], ['당기순이익', net, '매출총이익 − 판매비와관리비 (세전)']]
        .concat(scope === 'all' ? [['개인출금', drawing, '사업 통장에서 나간 개인 지출 (비용 아님)'], ['실잔여(순이익 − 개인출금)', net - drawing, '']] : [])
        .forEach(([k, v, d]) => sh.add([c(k, /순이익|실잔여/.test(k) ? S.tot : S.key), c(v, /순이익|실잔여/.test(k) ? S.totNum : S.bigNum), c(d, S.txt)]));
      sh.blank();
      sh.add([c('전표 수', S.key), c(V.length, S.bigNum), c('분개장(일반전표) 건수', S.txt)]);
      sh.add([c('증빙(영수증) 첨부 전표', S.key), c(V.filter(v => v.proof).length, S.bigNum), c('영수증 사진이 연결된 전표 수 — 사진은 구글 드라이브 [솔로운영_영수증] 폴더', S.txt)]);
      const bal = accts.reduce((s, a) => s + T[a].d, 0) === accts.reduce((s, a) => s + T[a].c, 0);
      sh.add([c('차변·대변 균형', S.key), c(bal ? '일치' : '불일치', bal ? S.ok : S.bad), c('합계잔액시산표 차변 합계 = 대변 합계', S.txt)]);
      sh.blank();
      sh.add([c('📑 시트 구성', S.sec), c('', S.sec), c('', S.sec)]);
      [['손익계산서', '월별 손익 (매출 − 매출원가 − 판매비와관리비)'], ['합계잔액시산표', '계정과목별 차변·대변 합계와 잔액'], ['분개장', '일반전표 형식 — 전표번호·차변/대변·계정과목·거래처·적요·증빙'],
        ['원장_계정과목', '계정마다 한 시트 — 일자별 거래, 월계·누계, 잔액'], ['거래처별 집계', '거래처(가맹점)·계정별 건수와 금액']]
        .forEach(([k, d]) => sh.add([c(k, S.txt), c('', S.txt), c(d, S.txt)]));
      sh.blank();
      sh.add([c('※ 솔로운영 가계부에 입력한 내용으로 자동 분개한 관리용 장부예요. 감가상각·재고·부가세 등 결산 조정은 반영돼 있지 않으니 신고 전 세무사 확인을 받으세요.', S.note)]);
      sh.merges.push({ s: { r: sh.rows.length - 1, c: 0 }, e: { r: sh.rows.length - 1, c: 2 } });
      X.utils.book_append_sheet(wb, toWs(X, sh), '요약');
    }

    // ===== 2. 손익계산서 (월별 + 합계 + 구성비) =====
    {
      const multi = months.length > 1, W = multi ? months.length + 3 : 3;
      const sh = new Sheet(); sh.cols = [24].concat(multi ? months.map(() => 13) : [], [15, 10]);
      headRow(sh, '손익계산서', subLine, W);
      const mLab = m => `${+m.slice(5)}월`;
      sh.add([c('과목', S.head)].concat(multi ? months.map(m => c(mLab(m), S.head)) : [], [c(multi ? '합계' : '금액', S.head), c('매출 대비', S.head)]));
      const first = 1, lastM = multi ? months.length : 0, totK = multi ? months.length + 1 : 1, pctK = totK + 1;
      const rowAt = {}; let salesRow = -1;
      const line = (name, vals, style, numStyle, key, formulaFor) => {
        const r = sh.rows.length, cells = [c(name, style)];
        if (multi) months.forEach((m, i) => cells.push(c(vals[i], numStyle, formulaFor ? formulaFor(i + first) : undefined)));
        const tot = multi ? vals.reduce((s, v) => s + v, 0) : vals[0];
        cells.push(c(tot, numStyle, multi ? `SUM(${ref(r, first)}:${ref(r, lastM)})` : (formulaFor ? formulaFor(totK) : undefined)));
        cells.push(c(sales ? tot / sales : 0, S.pct, salesRow >= 0 ? `IFERROR(${ref(r, totK)}/${ref(salesRow, totK)},0)` : undefined));
        sh.add(cells); if (key) rowAt[key] = r; return r;
      };
      const mv = (a, side) => months.map(m => byMonth(a, m, side));
      const secVals = list => months.map(m => list.reduce((s, a) => s + byMonth(a, m, 'd'), 0));
      const salesV = mv('매출액', 'c');
      salesRow = sh.rows.length; line('Ⅰ. 매출액', salesV, S.sec, S.secNum, 'sales');
      line('    매출액', salesV, S.txt, S.num);
      const cogsV = secVals(cogsAccts);
      const cogsHead = line('Ⅱ. 매출원가', cogsV, S.sec, S.secNum, 'cogs');
      const cogsStart = sh.rows.length; (cogsAccts.length ? cogsAccts : ['식자재비']).forEach(a => line('    ' + a, T[a] ? mv(a, 'd') : months.map(() => 0), S.txt, S.num));
      const cogsEnd = sh.rows.length - 1;
      const sumF = (s, e) => k => `SUM(${ref(s, k)}:${ref(e, k)})`;
      sh.rows[cogsHead].forEach((cell, k) => { if (k >= 1 && k <= totK) cell.f = sumF(cogsStart, cogsEnd)(k); });
      line('Ⅲ. 매출총이익', months.map((m, i) => salesV[i] - cogsV[i]), S.tot, S.totNum, 'gross', k => `${ref(rowAt.sales, k)}-${ref(rowAt.cogs, k)}`);
      const sgaV = secVals(sgaAccts);
      const sgaHead = line('Ⅳ. 판매비와관리비', sgaV, S.sec, S.secNum, 'sga');
      const sgaStart = sh.rows.length; (sgaAccts.length ? sgaAccts : ['기타비용']).forEach(a => line('    ' + a, T[a] ? mv(a, 'd') : months.map(() => 0), S.txt, S.num));
      const sgaEnd = sh.rows.length - 1;
      sh.rows[sgaHead].forEach((cell, k) => { if (k >= 1 && k <= totK) cell.f = sumF(sgaStart, sgaEnd)(k); });
      line('Ⅴ. 영업이익', months.map((m, i) => salesV[i] - cogsV[i] - sgaV[i]), S.tot, S.totNum, 'op', k => `${ref(rowAt.gross, k)}-${ref(rowAt.sga, k)}`);
      line('Ⅵ. 당기순이익 (세전)', months.map((m, i) => salesV[i] - cogsV[i] - sgaV[i]), S.tot, S.totNum, 'net', k => `${ref(rowAt.op, k)}`);
      if (scope === 'all') {
        sh.blank();
        line('(참고) 개인출금', months.map(m => byMonth('개인출금', m, 'd') + byMonth('개인인출', m, 'd')), S.txt, S.num, 'draw');
        line('(참고) 실잔여', months.map((m, i) => salesV[i] - cogsV[i] - sgaV[i] - byMonth('개인출금', m, 'd') - byMonth('개인인출', m, 'd')), S.tot, S.totNum, null, k => `${ref(rowAt.net, k)}-${ref(rowAt.draw, k)}`);
      }
      sh.blank(); sh.add([c('※ 영업외손익·법인세(소득세)는 포함하지 않은 관리용 손익계산서예요.', S.note)]);
      X.utils.book_append_sheet(wb, toWs(X, sh), '손익계산서');
    }

    // ===== 3. 합계잔액시산표 =====
    {
      const sh = new Sheet(); sh.cols = [15, 15, 22, 15, 15];
      headRow(sh, '합계잔액시산표', subLine, 5);
      sh.add([c('차      변', S.head), c('', S.head), c('계정과목', S.head), c('대      변', S.head), c('', S.head)]);
      sh.merges.push({ s: { r: 3, c: 0 }, e: { r: 3, c: 1 } }, { s: { r: 3, c: 3 }, e: { r: 3, c: 4 } }, { s: { r: 3, c: 2 }, e: { r: 4, c: 2 } });
      sh.add([c('잔액', S.head), c('합계', S.head), c('', S.head), c('합계', S.head), c('잔액', S.head)]);
      const start = sh.rows.length; let lastG = '';
      accts.forEach(a => {
        const g = groupOf(a);
        if (g !== lastG) { sh.add([c('', S.sec), c('', S.sec), c(`< ${g} >`, S.sec), c('', S.sec), c('', S.sec)]); lastG = g; }
        const r = sh.rows.length, dr = T[a].d, cr = T[a].c, b = dr - cr;
        sh.add([c(b > 0 ? b : 0, S.num, `MAX(${ref(r, 1)}-${ref(r, 3)},0)`), c(dr, S.num), c(a, S.ctr), c(cr, S.num), c(b < 0 ? -b : 0, S.num, `MAX(${ref(r, 3)}-${ref(r, 1)},0)`)]);
      });
      const end = sh.rows.length - 1, tr = sh.rows.length;
      const dSum = accts.reduce((s, a) => s + T[a].d, 0), cSum = accts.reduce((s, a) => s + T[a].c, 0);
      const dBal = accts.reduce((s, a) => s + Math.max(0, T[a].d - T[a].c), 0), cBal = accts.reduce((s, a) => s + Math.max(0, T[a].c - T[a].d), 0);
      const F = k => accts.length ? `SUM(${ref(start, k)}:${ref(end, k)})` : undefined;
      sh.add([c(dBal, S.totNum, F(0)), c(dSum, S.totNum, F(1)), c('합      계', S.tot), c(cSum, S.totNum, F(3)), c(cBal, S.totNum, F(4))]);
      sh.blank();
      const ok = dSum === cSum && dBal === cBal;
      sh.add([c(ok ? '✔ 차변 합계 = 대변 합계 (대차 균형)' : '⚠ 차변·대변이 맞지 않아요', ok ? S.ok : S.bad, `IF(AND(${ref(tr, 1)}=${ref(tr, 3)},${ref(tr, 0)}=${ref(tr, 4)}),"✔ 차변 합계 = 대변 합계 (대차 균형)","⚠ 차변·대변이 맞지 않아요")`)]);
      sh.merges.push({ s: { r: sh.rows.length - 1, c: 0 }, e: { r: sh.rows.length - 1, c: 4 } });
      X.utils.book_append_sheet(wb, toWs(X, sh), '합계잔액시산표');
    }

    // ===== 4. 분개장 (일반전표: 한 전표 = 차변 줄 + 대변 줄) =====
    {
      const sh = new Sheet(); sh.cols = [11, 14, 7, 14, 22, 22, 13, 13, 7, 11];
      headRow(sh, '분개장 (일반전표)', subLine, 10);
      sh.add(['일자', '전표번호', '구분', '계정과목', '거래처', '적요', '차변', '대변', '사업/개인', '증빙'].map(h => c(h, S.head)));
      const start = sh.rows.length;
      V.forEach(v => {
        sh.add([c(v.date, S.ctr), c(v.no, S.ctr), c('차변', S.ctr), c(v.debit, S.txt), c(v.partner, S.txt), c(v.summary, S.txt), c(v.amount, S.num), c(0, S.num), c(v.kind, S.ctr), c(v.proof, S.ctr)]);
        sh.add([c('', S.ctr), c('', S.ctr), c('대변', S.ctr), c(v.credit, S.txt), c(v.partner, S.txt), c(v.summary, S.txt), c(0, S.num), c(v.amount, S.num), c(v.kind, S.ctr), c('', S.ctr)]);
      });
      const end = sh.rows.length - 1, tot = V.reduce((s, v) => s + v.amount, 0);
      sh.add([c('합계', S.tot), c(`${V.length}건`, S.tot), c('', S.tot), c('', S.tot), c('', S.tot), c('', S.tot), c(tot, S.totNum, V.length ? `SUM(${ref(start, 6)}:${ref(end, 6)})` : undefined), c(tot, S.totNum, V.length ? `SUM(${ref(start, 7)}:${ref(end, 7)})` : undefined), c('', S.tot), c('', S.tot)]);
      if (!V.length) sh.add([c('이 기간에 기록된 거래가 없어요.', S.note)]);
      X.utils.book_append_sheet(wb, toWs(X, sh), '분개장');
    }

    // ===== 5. 계정별원장 (계정마다 시트, 월계·누계·잔액) =====
    accts.forEach(a => {
      const sh = new Sheet(); sh.cols = [11, 14, 18, 22, 14, 13, 13, 14];
      const dn = debitNormal(a);
      headRow(sh, `계정별원장 — ${a}`, subLine + `   |   잔액 기준: ${dn ? '차변' : '대변'}`, 8);
      sh.add(['일자', '전표번호', '적요', '거래처', '상대계정', '차변', '대변', '잔액'].map(h => c(h, S.head)));
      let bal = 0, cumD = 0, cumC = 0;
      months.forEach(m => {
        const rows = V.filter(v => v.ym === m && (v.debit === a || v.credit === a)); if (!rows.length) return;
        let mD = 0, mC = 0;
        rows.forEach(v => {
          const d = v.debit === a ? v.amount : 0, cr = v.credit === a ? v.amount : 0; mD += d; mC += cr;
          bal += dn ? d - cr : cr - d;
          sh.add([c(v.date, S.ctr), c(v.no, S.ctr), c(v.summary, S.txt), c(v.partner, S.txt), c(v.debit === a ? v.credit : v.debit, S.txt), c(d, S.num), c(cr, S.num), c(bal, S.num)]);
        });
        cumD += mD; cumC += mC;
        sh.add([c('', S.sumRow), c('', S.sumRow), c(`[ ${+m.slice(5)}월 월계 ]`, S.sumRow), c('', S.sumRow), c('', S.sumRow), c(mD, S.sumNum), c(mC, S.sumNum), c('', S.sumRow)]);
        sh.add([c('', S.sumRow), c('', S.sumRow), c('[ 누   계 ]', S.sumRow), c('', S.sumRow), c('', S.sumRow), c(cumD, S.sumNum), c(cumC, S.sumNum), c(bal, S.sumNum)]);
      });
      X.utils.book_append_sheet(wb, toWs(X, sh), sheetSafe('원장_' + a));
    });

    // ===== 6. 거래처별 집계 =====
    {
      const sh = new Sheet(); sh.cols = [26, 16, 8, 15, 15];
      headRow(sh, '거래처별 집계', subLine, 5);
      sh.add(['거래처', '계정과목', '건수', '수입(매출)', '지출'].map(h => c(h, S.head)));
      const G = {};
      V.forEach(v => { const isSale = v.credit === '매출액', acc = isSale ? '매출액' : v.debit, key = (v.partner || '(거래처 미기재)') + '\u0001' + acc;
        const g = G[key] = G[key] || { p: v.partner || '(거래처 미기재)', a: acc, n: 0, in: 0, out: 0 }; g.n++; if (isSale) g.in += v.amount; else g.out += v.amount; });
      const list = Object.values(G).sort((x, y) => (y.in + y.out) - (x.in + x.out));
      const start = sh.rows.length;
      list.forEach(g => sh.add([c(g.p, S.txt), c(g.a, S.ctr), c(g.n, S.num), c(g.in, S.num), c(g.out, S.num)]));
      const end = sh.rows.length - 1;
      const F = k => list.length ? `SUM(${ref(start, k)}:${ref(end, k)})` : undefined;
      sh.add([c('합계', S.tot), c('', S.tot), c(V.length, S.totNum, F(2)), c(list.reduce((s, g) => s + g.in, 0), S.totNum, F(3)), c(list.reduce((s, g) => s + g.out, 0), S.totNum, F(4))]);
      X.utils.book_append_sheet(wb, toWs(X, sh), '거래처별 집계');
    }
    return wb;
  }
  function toArray(wb) { return window.XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true }); }
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  function download(wb, name) {
    const blob = new Blob([toArray(wb)], { type: XLSX_MIME }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name + '.xlsx'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  // 구글 드라이브에 올리면서 구글 시트로 변환 (시트 탭·서식 유지). fetchFn(url, opts) 는 페이지의 드라이브 호출(토큰 포함)
  async function uploadAsGoogleSheet(fetchFn, folderId, name, wb) {
    const b = 'soloBook' + Math.random().toString(36).slice(2);
    const meta = { name, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [folderId] };
    const body = new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${XLSX_MIME}\r\n\r\n`, new Uint8Array(toArray(wb)), `\r\n--${b}--`]);
    const r = await fetchFn('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body });
    return r.json();
  }
  window.SoloBook = { load, build, toArray, download, uploadAsGoogleSheet, XLSX_MIME };
})();
