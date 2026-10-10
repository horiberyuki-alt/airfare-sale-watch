# 航空券セール速報（airfare-sale-watch）

航空券のセール情報を自動で集めて、Webページで見られるようにする仕組みです。
通知はありません。各自がページを開き、自分が使う都市を登録して見ます。

- ページ: `https://horiberyuki-alt.github.io/airfare-sale-watch/`
- 更新: GitHub Actions が 2 時間おきに `scripts/scrape.js` を走らせ、`docs/data/sales.json` を書き換えます
- 費用: 0 円（GitHub の無料枠）

## 使い方（社内向け）

1. ページを開く
2. 「自分が使う都市を登録」で、よく発着する都市を押す（例: 東京・札幌）
3. 「あなた向け」に関係するセール記事が出る。登録はそのブラウザだけに保存される
4. 価格・期間はリンク先の原文で確かめてから予約する

スマホのホーム画面に追加しておくと、アプリのように開けます。

## 情報源

| 種類 | 元 | 取り方 |
|---|---|---|
| ニュース | TRAICY（セール・特別運賃カテゴリあり） | RSS → 記事本文から期間・価格・路線を抜く |
| ニュース | sky-budget | RSS → 記事本文 |
| ニュース | トラベルWatch、Aviation Wire | RSS の見出しと要約だけ |
| 公式 | スカイマーク キャンペーン一覧 | 「おすすめ特集」のバナー |

Peach・ジェットスター・JAL・ANA の公式サイトは bot をはじくので直接は見ていません。
ニュースサイトは各社のセールを開始当日かそれ以前に記事にするので、実用上はこちらのほうが早いです。

## 仕組み

```
scripts/scrape.js   RSS と公式ページを取得 → セール記事だけ残す → docs/data/sales.json
docs/index.html     sales.json を読んで表示。都市の登録は localStorage
.github/workflows/scrape.yml   2 時間おきに実行し、変化があればコミット
```

- 航空会社の判定: `AIRLINES`（ピーチ・ジェットスター・スカイマーク・JAL・ANA・AIRDO・ソラシド・スターフライヤー・スプリング・ZIPAIR・トキエア・FDA・IBEX）
- セールの判定: TRAICY のカテゴリに「セール・特別運賃」「キャンペーン」が付いているか、見出しに `SALE_RE` の語があるか
- 除外: 漏えい・欠航・就航・増便など、セールでない記事（`NOT_SALE_RE`）
- 路線: 本文中の「東京/成田〜札幌/新千歳」「羽田－新千歳」などを `CITIES` の都市名で拾い、成田・羽田→東京、新千歳→札幌 のように `CANON` で丸める
- 記事は firstSeen から 180 日で落ちる

## 手元で動かす

```bash
node scripts/scrape.js
```

Node 20 以上。依存パッケージなし。`docs/index.html` をブラウザで開けば確認できます（`fetch` の都合で `python -m http.server` などで配信すると確実）。

## 直したくなったとき

- 都市を増やす: `scripts/scrape.js` の `CITIES` と `docs/index.html` の `CITY_LIST`
- 航空会社を増やす: `AIRLINES`
- 情報源を増やす: `FEEDS`（RSS）か `OFFICIAL`（公式ページ）
- 更新間隔: `.github/workflows/scrape.yml` の cron
