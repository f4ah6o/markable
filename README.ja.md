# markable

`markable` は、既存アプリの実装を大きく変えずに、構造化されたフィードバック、レビューコメント、書き換え指示を成果物へ紐づけるためのヘッドレスなインタラクションレイヤーです。

## モード

- **dev / review**：開発者向けのレビュー注釈を保存し、エージェントやリライトツールが利用できる JSON として扱います。
- **prod / feedback**：ユーザー向けのフィードバックや問い合わせを、URL、選択範囲、ビューポート、任意コンテキストと一緒に収集します。

## インストール

```bash
npm install @f12o/markable
```

主なサブパスエクスポートは次のとおりです。

```ts
import { createMarkable } from "@f12o/markable/core";
import { createDomAdapter } from "@f12o/markable/dom";
import { markable } from "@f12o/markable/vite";
import { normalizeAnnotation } from "@f12o/markable/annotations";
```

## Vite での使い方

```ts
import { defineConfig } from "vite";
import { markable } from "@f12o/markable/vite";

export default defineConfig({
  plugins: [
    markable({
      mode: "auto",
      locale: "en",
      commentsFile: ".markable/comments.json",
      endpoint: "/__markable/comments",
      // 既定の "Powered by Markable" フッターリンクを非表示にするには false にします。
      poweredBy: true,
    }),
  ],
});
```

`mode: "auto"` は Vite の開発時に review モード、本番ビルド時に feedback モードへ解決されます。

## 注釈に含まれる情報(コーディングエージェント向け)

要素を対象にした注釈には、コーディングエージェントが「どの画面のどの要素か」を特定し、対応するソースコードへたどり着くための構造化された情報が含まれます。

| locator フィールド | 内容 | 既定で収集されるモード |
| --- | --- | --- |
| `tag`, `id`, `classes`, `role`, `ariaLabel` | 選択された要素の基本情報 | review・feedback |
| `selector` | CSS パス(例: `main > form > button:nth-of-type(1)`) | review・feedback |
| `textSnippet` | 表示テキストの先頭 160 文字 | review・feedback |
| `ancestors` | 祖先要素のチェーン(tag/id/classes/role、近い順に最大 6 件) | review・feedback |
| `attributes` | ホワイトリスト属性(`href`、`type`、`name`、`placeholder`、`alt`、`title`、`for`、`aria-*`、`data-*`) | review・feedback |
| `nearestHeading`, `landmark` | 直前の見出しテキストと囲んでいるランドマーク領域 | review・feedback |
| `outerHtml` | サニタイズ済み HTML スニペット(約 2 KB。script 除去、`value`/`style`/秘密情報らしき属性を削除、password/hidden input は縮約、textarea の内容はクリア) | review のみ |
| `componentHints` | フレームワークのコンポーネント名と、dev ビルドでは `file:line`(React fiber の `_debugSource`、Vue の `__name`/`__file`、Svelte の `__svelte_meta`) | review のみ |

既定値はモードに応じて決まり、`capture` オプションでフィールドごとに上書きできます(Vite プラグイン、`markable.config.ts`、`mountMarkable` で同じ形)。

```ts
markable({
  capture: {
    outerHtml: true,       // feedback(本番)モードで opt-in
    componentHints: false, // どのモードでも opt-out 可能
  },
});
```

ブラウザは送信前に locator を 7 KiB 以内へ自主的に切り詰めるため(最初に `outerHtml` を落とし、selector の切り詰めは最終手段)、エンドポイント側の 8 KiB 上限で拒否されることはありません。

### 注釈の読み取り: `markable comments`

保存された注釈は、JSON を直接解析しなくても markdown として読み取れます。

```bash
markable comments                  # エージェント向け markdown で全件表示
markable comments --status open    # ステータスで絞り込み(カンマ区切り)
markable comments --mode feedback --limit 5
markable comments --json           # 同じフィルタで raw JSON を出力
```

対象ファイルは `markable.config.*` の `commentsFile`(未設定時は `.markable/comments.json`)が既定で、`--file` で本番フィードバックストアからエクスポートしたファイルも指定できます。

## CLI: 開発時のみのセットアップ

Markable を開発者向けのレビュー用途だけで使う場合は、同梱の CLI で開発時専用の
設定を安全に追加できます。

```bash
pnpm dlx @f12o/markable init
```

`init` は `@f12o/markable` を `devDependencies` に追加し、Markable 専用の
`markable.config.ts` を生成し、既存の `vite.config.*` へ最小限の `markable()`
プラグイン呼び出しを挿入し、`.gitignore` に `.markable/` を追記します。Vite
設定の編集は書式・コメント・プラグインの順序を保つバイト範囲の挿入で行い、
複雑な設定は上書きしません（代わりに手動用のスニペットを表示します）。

```ts
// markable.config.ts（生成されるファイル）
import { defineMarkableConfig } from "@f12o/markable/config";

export default defineMarkableConfig({
  devOnly: true,
  mode: "review",
  commentsFile: ".markable/comments.json",
  endpoint: "/__markable/comments",
});
```

`devOnly: true` のとき、Markable は `vite dev` でのみ動作し、`vite build` からは
除外されます。`init` は繰り返し実行しても安全です。次の 2 つのコマンドも
利用できます。

```bash
markable doctor    # 現在の組み込み状況を表示
markable remove    # CLI が行った編集を取り消す（未変更の場合のみ）
markable comments  # 保存された注釈をエージェント向け markdown で表示
```

`devOnly` はプラグインに直接指定することもでき（`markable({ devOnly: true })`）、
その場合は Vite の `apply: "serve"` を設定します。

## UI の言語

Markable が注入する UI は英語と日本語に対応しています。既定値は英語です。

```ts
markable({ locale: "en" }); // English、既定値
markable({ locale: "ja" }); // 日本語
```

対象となる文言には、フローティングボタン、入力パネル、タブ、プレースホルダー、対象表示、最近の投稿一覧、コピー結果、送信結果が含まれます。選択された言語は、送信する注釈の `context.markableLocale` にも記録されます。

## UI の使い方

画面右下のフローティングボタンから composer を開きます。

- ハイライトされた要素をクリックすると、その DOM 要素にマークを紐づけます。
- 空白部分をドラッグすると、矩形の画面範囲にマークを紐づけます。
- 対象を選ばずに保存すると、ページ全体へのフィードバックとして記録します。
- ボタン、composer のタイトル、最近のマーク一覧の見出しはドラッグ可能です。UI が選択したい要素に重なった場合は、任意の場所へ移動できます。

開発サーバーでは、投稿された注釈が `.markable/comments.json` に保存されます。静的な GitHub Pages 配信では POST 先がないため、外部エンドポイントを設定しない限りセッション内の表示に留まります。

## セキュリティとデータの扱い

開発サーバーのコメントエンドポイントは、受け取った内容をディスクへ書き込む前に検証します。

- リクエストボディは 256 KB を上限とし、`application/json` かつ JSON として解析できる必要があります(413 / 415 / 400 を返します)。
- 各注釈はスキーマに照らして検証します。message・mode・target は必須で、未知のフィールドは取り除き、文字列長には上限を設けます(不正な場合は 422)。
- 書き込みは直列化し、一時ファイルへの書き込み後にリネームするため、同時送信で `comments.json` が壊れたり欠落したりしません。既知の ID による再送は重複させずに無視します。
- レスポンスには `Cache-Control: no-store` と `X-Content-Type-Options: nosniff` を付与します。

同じ検証ロジックは、プラットフォーム非依存のサブパスエクスポートとして本番エンドポイント(Cloudflare Workers、Express など)からも利用できます。

```ts
import { normalizeAnnotation } from "@f12o/markable/annotations";

const result = normalizeAnnotation(await request.json());
if (!result.ok) return new Response(result.error, { status: 422 });
await store.save(result.annotation);
```

収集するコンテキストはページが構造的に示している範囲に限られます。URL、ページタイトル、ビューポートサイズ、ユーザーエージェント、アクティブなタブ、UI の言語、そして選択した要素についてはタグ・セレクタ・クラス・テキスト断片・祖先チェーン・ホワイトリスト属性・近くの見出し/ランドマークのテキストです(上記「注釈に含まれる情報」参照)。Cookie、ストレージ、フォームの入力値、キー入力は読み取りません。`value` 属性と秘密情報らしき名前の属性はシリアライズ前に常に取り除き、password/hidden input は構造属性のみに縮約します。サニタイズ済みの `outerHtml` と(dev ビルドのソースファイルパスを含みうる)`componentHints` は review モード限定で、feedback モードで使うには `capture` オプションでの明示的な有効化が必要です。本番のフィードバックエンドポイントにおける認証・認可・レート制限はホストアプリケーションの責務です。開発用エンドポイントはローカル開発専用であり、`devOnly: true` を指定すると本番ビルドからエンドポイントと注入 UI の両方を完全に除外できます。

脆弱性の報告方法は [SECURITY.md](./SECURITY.md) を参照してください。

## アクセシビリティ

注入されるパネルはダイアログとして通知され、送信ステータスはライブリージョンで読み上げられます。`Escape` キーでパネルを閉じるとフォーカスは起動ボタンへ戻ります。保存処理の実行中は二重送信を防止します。

## デモ

軽量な Vue 3 + Vite Todo デモ:

```bash
pnpm install
pnpm build
pnpm --filter @f12o/markable-vite-todo-demo dev
```

より実践的な React ダッシュボードデモ:

```bash
pnpm --filter @f12o/markable-shadcn-admin-demo dev
pnpm --filter @f12o/markable-shadcn-admin-demo build
```

GitHub Pages では次の URL でデモを確認できます。

```text
https://f4ah6o.github.io/markable/
https://f4ah6o.github.io/markable/vue-todo/
https://f4ah6o.github.io/markable/shadcn-admin/
```
