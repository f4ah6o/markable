# markable

あらゆるものをマーク可能にします。

`markable` は、既存アプリの実装を大きく変えずに、構造化されたフィードバック、レビューコメント、書き換え指示を成果物へ紐づけるためのヘッドレスなインタラクションレイヤーです。

## モード

- **dev / review**: 開発者向けのレビュー注釈を保存し、エージェントやリライトツールが利用できる JSON として扱います。
- **prod / feedback**: ユーザー向けのフィードバックや問い合わせを、URL・選択範囲・ビューポート・任意コンテキストと一緒に収集します。

## インストール

```bash
npm install @f12o/markable
```

主なサブパスエクスポートは次のとおりです。

```ts
import { createMarkable } from "@f12o/markable/core";
import { createDomAdapter } from "@f12o/markable/dom";
import { markable } from "@f12o/markable/vite";
```

## Vite での使い方

```ts
import { defineConfig } from "vite";
import { markable } from "@f12o/markable/vite";

export default defineConfig({
  plugins: [
    markable({
      mode: "auto",
      commentsFile: ".markable/comments.json",
      endpoint: "/__markable/comments",
    }),
  ],
});
```

`mode: "auto"` は Vite の開発時に review モード、本番ビルド時に feedback モードへ解決されます。

## UI の使い方

画面右下のフローティングボタンから composer を開きます。

- ハイライトされた要素をクリックすると、その DOM 要素にマークを紐づけます。
- 空白部分をドラッグすると、矩形の画面範囲にマークを紐づけます。
- 対象を選ばずに保存すると、ページ全体へのフィードバックとして記録します。
- ボタン、composer のタイトル、最近のマーク一覧の見出しはドラッグ可能です。UI が選択したい要素に重なった場合は、任意の場所へ移動できます。

開発サーバーでは、投稿された注釈が `.markable/comments.json` に保存されます。静的な GitHub Pages 配信では POST 先がないため、外部エンドポイントを設定しない限りセッション内の表示に留まります。

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
