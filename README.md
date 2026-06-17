# markable

[English](README.en.md)

あらゆるものをマーク可能にします。

`markable` は、既存アプリの実装を変更せずに、構造化されたフィードバック、レビューコメント、書き換え指示を成果物へ紐づけるためのヘッドレスなインタラクションレイヤーです。

次の2つのモードで動作します。

- **dev / review**: 開発者向けのレビュー注釈を保存し、エージェントやリライトツールが利用できる構造化データとして扱います。
- **prod / feedback**: ユーザー向けのフィードバックや問い合わせを、URL・選択範囲・ビューポート・任意コンテキストと一緒に収集します。

## パッケージ構成

npm のメインパッケージは次のとおりです。

````bash
npm install @f12o/markable
````

連携機能はサブパスエクスポートとして提供します。

````ts
import { createMarkable } from "@f12o/markable/core";
import { createDomAdapter } from "@f12o/markable/dom";
import { markable } from "@f12o/markable/vite";
````

## Vite での使い方

````ts
import { defineConfig } from "vite";
import { markable } from "@f12o/markable/vite";

export default defineConfig({
  plugins: [
    markable({
      mode: process.env.NODE_ENV === "production" ? "feedback" : "review",
      commentsFile: ".markable/comments.json",
      endpoint: "/__markable/comments",
      // 既定の "Powered by Markable" フッターリンクを非表示にするには false にします。
      poweredBy: true,
    }),
  ],
});
````

## Vite+ 互換性

Vite+ は、Vite互換の設定を読み込む場合に通常のViteプラグインを実行できます。`markable` はVite+専用APIを追加せず、標準のViteプラグインとして連携します。

初期互換対象:

````bash
vp dev
vp build
````

現在、次の標準Viteフックを使用しています。

````text
transformIndexHtml
configureServer
resolveId
load
````

## 基本構想

````text
成果物
  -> 対象をマーク
  -> 注釈 / コメント / フィードバック
  -> 構造化イベント
  -> チケット / JSON / エージェント入力
  -> 書き換え / 解決 / フォローアップ
````

`markable` はアプリのUIを所有しません。コアはヘッドレスであり、DOM連携とVite連携は取得・注入のみを担当します。

## 現在の状態

初期スキャフォールドです。

## 参考実装

本番向けフィードバック選択UIは、[`u-ichi/reviewable-html-workbench`](https://github.com/u-ichi/reviewable-html-workbench) の明確なレビュー状態、コンテキストに応じたハイライト、対象位置に紐づくコメント表示を参考にしています。`markable` は、この操作パターンを本番Webアプリのフィードバックへ一般化しつつ、コアパッケージをヘッドレスに保ちます。

## デモアプリ

軽量なVue 3 + Vite Todoデモは `examples/vite-todo` にあります。markable連携を確認しやすいよう、意図的に小さく構成しています。

````bash
pnpm install
pnpm build
pnpm --filter @f12o/markable-vite-todo-demo dev
````

デモ設定では、パッケージのViteプラグインを直接使用します。

````ts
markable({
  mode: "auto",
  commentsFile: ".markable/comments.json",
  endpoint: "/__markable/comments",
});
````

Vite開発時には、`mode: "auto"` がreviewモードになります。フローティングの「マーク」ボタンから入力画面を開きます。実用的なページ要素はポインター移動時に自動でハイライトされ、クリックするとそのDOM要素にマークを紐づけます。ページの空白部分をドラッグすると矩形範囲へ、対象を選択せずに保存すると現在のページ全体へマークを紐づけます。開発サーバーのエンドポイントは、構造化された注釈JSONをデモアプリ内の `.markable/comments.json` へ保存します。

本番ビルド時には、`mode: "auto"` がfeedbackモードになります。フローティングの「フィードバック」ボタンから、フィードバックと質問のタブを持つユーザー向けパネルを開きます。要素・矩形範囲の選択と、セッション内の最近の投稿一覧を利用できます。取得するコンテキストには、URL、ページタイトル、ビューポート、ユーザーエージェント、選択中のタブ、任意の選択要素または矩形範囲が含まれます。

### shadcn-admin サンプル

より大きなReactダッシュボードのサンプルは `examples/shadcn-admin` にあります。[`satnaing/shadcn-admin`](https://github.com/satnaing/shadcn-admin) のコミット `e16c87f213a5ba5e45964e9b67c792105ec74d26` を取り込み、現実的なshadcn UI上でオーバーレイを確認できるようmarkable Viteプラグインを追加しています。

````bash
pnpm install
pnpm --filter @f12o/markable-shadcn-admin-demo dev
pnpm --filter @f12o/markable-shadcn-admin-demo build
````

このサンプルでもTodoデモと同じローカル開発エンドポイントを使用します。

````ts
markable({
  mode: "auto",
  commentsFile: ".markable/comments.json",
  endpoint: "/__markable/comments",
});
````

ローカル開発時に送信されたマークは、`examples/shadcn-admin/.markable/comments.json` に保存されます。

### GitHub Pages へのデプロイ

`Deploy demo to GitHub Pages` ワークフローは、パッケージと各サンプルをビルドし、サンプル一覧を生成して、次のGitHub Pagesへ静的ファイルを公開します。

````text
https://f4ah6o.github.io/markable/
https://f4ah6o.github.io/markable/vue-todo/
https://f4ah6o.github.io/markable/shadcn-admin/
````

一覧ページは `examples/examples.json` を基に `scripts/build-pages-index.mjs` が生成します。新しいサンプルはマニフェストを更新すると一覧へ追加できます。

GitHub Pagesは静的ホスティングのため、サンプルアプリと注入されたフィードバックUIは表示できますが、`/.markable` や `/.json` ファイルへのPOSTを永続化できません。公開静的環境では、外部エンドポイントを設定しない限り、送信したフィードバックはローカルまたはセッション内だけで扱われます。

### Cloudflare Workers による永続化

本番フィードバックを永続化する場合は、markableのエンドポイントを `/api/feedback` などのWorkerルートへ向けます。

````text
ブラウザー
  -> markable feedback UI
  -> /api/feedback
  -> Cloudflare Worker
  -> D1, KV, R2, GitHub Issues, queue, webhook
````

この構成により、GitHub Pagesの静的デモを軽量に保ちながら、Worker側で保存、通知、Issue作成などを追加できます。
