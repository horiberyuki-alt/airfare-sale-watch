// 航空券セール速報: ニュースRSSと航空会社公式ページからセール記事を集めて docs/data/sales.json に書く
// 依存なし（Node 20+ の fetch を使う）
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = path.join(__dirname, '..', 'docs', 'data', 'sales.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 airfare-sale-watch/1.0';
const KEEP_DAYS = 180;

const FEEDS = [
  { source: 'TRAICY', url: 'https://www.traicy.com/category/airline/sale/feed', fetchBody: true },
  { source: 'TRAICY', url: 'https://www.traicy.com/feed', fetchBody: true },
  { source: 'sky-budget', url: 'https://sky-budget.com/feed', fetchBody: true },
  { source: 'トラベルWatch', url: 'https://travel.watch.impress.co.jp/data/rss/1.0/trw/feed.rdf', fetchBody: false },
  { source: 'Aviation Wire', url: 'https://www.aviationwire.jp/feed', fetchBody: false },
];
const OFFICIAL = [
  { source: 'スカイマーク公式', airline: 'スカイマーク', url: 'http://www.skymark.co.jp/ja/campaign/index.php', base: 'https://www.skymark.co.jp' },
];

const AIRLINES = [
  ['Peach', /ピーチ|peach/i], ['ジェットスター', /ジェットスター|jetstar/i], ['スカイマーク', /スカイマーク|skymark/i],
  ['JAL', /\bJAL\b|日本航空/i], ['ANA', /\bANA\b|全日空|全日本空輸/i], ['AIRDO', /AIRDO|エア・?ドゥ/i],
  ['ソラシドエア', /ソラシド/], ['スターフライヤー', /スターフライヤー|starflyer/i], ['スプリング・ジャパン', /スプリング・?ジャパン|春秋航空/],
  ['ZIPAIR', /ZIPAIR/i], ['トキエア', /トキエア/], ['FDA', /フジドリーム|\bFDA\b/], ['IBEX', /IBEX|アイベックス/i],
];
const SALE_RE = /セール|SALE|タイムセール|割引|クーポン|円から|円〜|円～|特別運賃|キャンペーン|バーゲン|最安|おトク|お得|運賃を?販売|片道/i;
const NOT_SALE_RE = /漏えい|不正アクセス|欠航|遅延|機材変更|就航|増便|減便|運休|人事|決算|旅客数|ストライキ|事故|訓練|制服|採用|ラウンジ|機内食|マイル交換|ホテル|フェリー|鉄道|高速バス/;
const CITIES = ['東京','成田','羽田','札幌','新千歳','千歳','函館','旭川','釧路','女満別','帯広','大阪','関西','関空','伊丹','神戸','名古屋','中部','セントレア','福岡','北九州','沖縄','那覇','石垣','宮古','仙台','新潟','小松','静岡','広島','岡山','高松','松山','高知','徳島','長崎','熊本','大分','宮崎','鹿児島','奄美','茨城','ソウル','仁川','釜山','台北','高雄','香港','上海','バンコク','シンガポール','マニラ','セブ','グアム','ホノルル','ハワイ','ダナン','ハノイ','ホーチミン','クアラルンプール','韓国','台湾','タイ','ベトナム'];
const CITY_RE = new RegExp('(' + CITIES.join('|') + ')', 'g');
const CANON = { '成田':'東京','羽田':'東京','新千歳':'札幌','千歳':'札幌','関西':'大阪','関空':'大阪','伊丹':'大阪','中部':'名古屋','セントレア':'名古屋','那覇':'沖縄','仁川':'ソウル' };

async function get(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, 'accept': 'text/html,application/xml,application/rss+xml,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
  return await r.text();
}
const unesc = s => (s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(n));
const strip = h => unesc(h).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/[ \t　]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const tag = (x, t) => { const m = new RegExp('<' + t + '[^>]*>([\\s\\S]*?)<\\/' + t + '>', 'i').exec(x); return m ? unesc(m[1]).trim() : ''; };

function parseFeed(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const x = m[0];
    const link = tag(x, 'link') || (/<link[^>]*href="([^"]+)"/.exec(x) || [])[1] || '';
    const date = tag(x, 'pubDate') || tag(x, 'dc:date') || tag(x, 'published') || '';
    const cats = [...x.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map(m => unesc(m[1]).trim());
    const desc = strip(tag(x, 'description') || tag(x, 'content:encoded')).replace(/投稿\s.*?に最初に表示されました。?/s, '').trim();
    items.push({ title: tag(x, 'title'), link: link.trim(), date, desc: desc.slice(0, 400), cats });
  }
  return items;
}
// 記事本文だけを取り出す（関連記事やランキングの数字を拾わないため）
function mainText(source, html) {
  let seg = html;
  if (source === 'TRAICY') { const i = html.indexOf('single-content-column'); if (i > 0) { seg = html.slice(i); const j = seg.indexOf('記事をシェアする'); if (j > 0) seg = seg.slice(0, j); const k = seg.indexOf('編集部'); if (k > 0 && k < 3000) seg = seg.slice(k + 3); } }
  else if (source === 'sky-budget') { const i = html.indexOf('entry-content'); if (i > 0) { seg = html.slice(i); const j = seg.search(/entry-tags|addtoany|related-posts/); if (j > 0) seg = seg.slice(0, j); } }
  return strip(seg).slice(0, 6000);
}
function airlinesOf(text) { return AIRLINES.filter(([, re]) => re.test(text)).map(([n]) => n); }
function routesOf(text) {
  const routes = new Set(); const cities = new Set();
  for (const m of text.matchAll(CITY_RE)) cities.add(CANON[m[1]] || m[1]);
  // 「東京/成田〜札幌/新千歳」「羽田－新千歳線」「大阪（関西）－札幌（新千歳）」など
  const pair = new RegExp('(' + CITIES.join('|') + ')(?:[/／（(][^）)〜～\\-－]{1,8}[）)]?)?\\s*[〜～\\-－―=]\\s*(' + CITIES.join('|') + ')', 'g');
  for (const m of text.matchAll(pair)) { const a = CANON[m[1]] || m[1], b = CANON[m[2]] || m[2]; if (a !== b) routes.add([a, b].sort().join('⇄')); }
  return { routes: [...routes], cities: [...cities] };
}
function periodsOf(text) {
  const t = text.replace(/\s+/g, ' ');
  const pick = (re) => { const m = re.exec(t); return m ? m[0].slice(0, 120) : ''; };
  return {
    sale: pick(/(販売期間|予約期間|発売期間|販売開始|予約受付)[^。]{0,90}/) || pick(/(\d{1,2}月\d{1,2}日)[^。]{0,20}(から|より)[^。]{0,40}(販売|発売|予約)[^。]{0,30}/),
    boarding: pick(/(搭乗期間|対象搭乗期間|搭乗日|対象期間|旅行期間)[^。]{0,90}/),
    prices: [...new Set([...t.matchAll(/(片道|往復)?\s*([0-9０-９,，]{3,7})円(から|〜|～|台)?/g)].map(m => m[0].replace(/\s+/g, '')))].slice(0, 8),
  };
}
function id(link) { return crypto.createHash('sha1').update(link).digest('hex').slice(0, 12); }

async function main() {
  const now = new Date();
  let prev = []; try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')).items || []; } catch { }
  const byId = new Map(prev.map(p => [p.id, p]));
  const log = [];
  for (const f of FEEDS) {
    try {
      const items = parseFeed(await get(f.url));
      let n = 0;
      for (const it of items) {
        if (!it.link) continue;
        const head = it.title + ' ' + it.desc;
        const air = airlinesOf(head);
        const catSale = it.cats.some(c => /セール|特別運賃|キャンペーン/.test(c));
        if (!air.length || !(catSale || SALE_RE.test(it.title)) || NOT_SALE_RE.test(it.title)) continue;
        const key = id(it.link); n++;
        if (byId.has(key)) continue; // 既知
        let body = '';
        if (f.fetchBody) { try { body = mainText(f.source, await get(it.link)); } catch (e) { log.push('body fail ' + it.link); } }
        const text = it.title + '\n' + it.desc + '\n' + body;
        const { routes, cities } = routesOf(text); const per = periodsOf(body || it.desc);
        byId.set(key, { id: key, source: f.source, airlines: airlinesOf(it.title + ' ' + it.desc + ' ' + body.slice(0, 600)), category: it.cats.filter(c => /セール|特別運賃|キャンペーン|運賃/.test(c)).join('・'), title: it.title, link: it.link, published: new Date(it.date || now).toISOString(), summary: it.desc.slice(0, 200), routes, cities, salePeriod: per.sale, boardingPeriod: per.boarding, prices: per.prices, firstSeen: now.toISOString() });
      }
      log.push(`${f.source}: ${items.length} items, ${n} sale-ish`);
    } catch (e) { log.push(`${f.source}: ERROR ${e.message}`); }
  }
  for (const o of OFFICIAL) {
    try {
      const html = await get(o.url);
      let n = 0;
      // 「おすすめ特集」のバナー一覧だけを見る（路線案内ページは拾わない）
      const list = (/<ul class="bannerList">([\s\S]*?)<\/ul>/.exec(html) || [])[1] || '';
      for (const m of list.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const title = strip(m[2]).replace(/\s+/g, ' ').trim(); const href = m[1];
        if (title.length < 4 || !/セール|キャンペーン|割引|運賃|年末年始|お得|おトク|円/.test(title) || /はじめての|お得な航空券|運賃をご紹介|行きの|旅コラム/.test(title)) continue;
        const link = href.startsWith('http') ? href : o.base + (href.startsWith('/') ? '' : '/') + href;
        const key = id(link); n++;
        if (byId.has(key)) continue;
        const { routes, cities } = routesOf(title); const per = periodsOf(title);
        byId.set(key, { id: key, source: o.source, airlines: [o.airline], title, link, published: now.toISOString(), summary: '', routes, cities, salePeriod: per.sale, boardingPeriod: per.boarding, prices: per.prices, firstSeen: now.toISOString() });
      }
      log.push(`${o.source}: ${n} campaign links`);
    } catch (e) { log.push(`${o.source}: ERROR ${e.message}`); }
  }
  const cutoff = now.getTime() - KEEP_DAYS * 86400000;
  const items = [...byId.values()].filter(x => new Date(x.firstSeen).getTime() > cutoff).sort((a, b) => (b.published > a.published ? 1 : -1));
  const out = { updatedAt: now.toISOString(), count: items.length, log, items };
  const before = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  // items が同じなら書かない（updatedAt だけの差分で無駄なコミットをしない）
  let same = false; try { same = JSON.stringify(JSON.parse(before).items) === JSON.stringify(items); } catch { }
  if (!same || !before) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(log.join('\n')); console.log('items:', items.length, same ? '(no change)' : '(written)');
}
main().catch(e => { console.error(e); process.exit(1); });
