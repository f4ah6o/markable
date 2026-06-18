import type { MarkableLocale } from "../config";
import type { MarkableMode } from "../core";

export interface ModeLabels {
  launcher: string;
  panelTitle: string;
  tabPrimary: string;
  tabSecondary: string;
  placeholder: string;
  secondaryPlaceholder: string;
  submit: string;
  helper: string;
  empty: string;
}

export interface LocaleMessages {
  close: string;
  cancel: string;
  targetElement: string;
  targetBox: string;
  targetPage: string;
  recentReview: string;
  recentFeedback: string;
  copyJson: string;
  copyJsonTitle: string;
  copied: string;
  copyFailed: string;
  persistedReview: string;
  persistedFeedback: string;
  localOnly: string;
  issueSubmitLabel: string;
  issueTitleDefault: string;
  review: ModeLabels;
  feedback: ModeLabels;
}

const locales: Record<MarkableLocale, LocaleMessages> = {
  ja: {
    close: "閉じる",
    cancel: "キャンセル",
    targetElement: "対象: ",
    targetBox: "対象: 選択した画面範囲",
    targetPage: "対象: 現在のページ",
    recentReview: "最近のマーク",
    recentFeedback: "最近のフィードバック",
    copyJson: "マークJSONをコピー",
    copyJsonTitle: "JSONをコピー",
    copied: "コピー済み",
    copyFailed: "コピー失敗",
    persistedReview: "マークを保存しました。",
    persistedFeedback: "ありがとうございます。フィードバックを送信しました。",
    localOnly: "ローカルに記録しました。永続化するにはエンドポイントを設定してください。",
    issueSubmitLabel: "Issueを送信",
    issueTitleDefault: "フィードバック",
    review: {
      launcher: "マーク",
      panelTitle: "このページをマーク",
      tabPrimary: "コメント",
      tabSecondary: "AIに依頼",
      placeholder: "レビューコメントを入力",
      secondaryPlaceholder: "AIに依頼したい変更内容を入力",
      submit: "マークを保存",
      helper:
        "ハイライトされた要素をクリック、空白をドラッグ、またはページ全体のフィードバックを保存できます。",
      empty: "まだマークはありません。",
    },
    feedback: {
      launcher: "フィードバック",
      panelTitle: "フィードバックを送信",
      tabPrimary: "フィードバック",
      tabSecondary: "質問",
      placeholder: "このページへのフィードバックを入力",
      secondaryPlaceholder: "このページについて質問する",
      submit: "送信",
      helper:
        "ハイライトされた要素をクリック、空白をドラッグ、またはページ全体のフィードバックを送信できます。",
      empty: "このセッションではまだフィードバックがありません。",
    },
  },
  en: {
    close: "Close",
    cancel: "Cancel",
    targetElement: "Target: ",
    targetBox: "Target: selected screen area",
    targetPage: "Target: current page",
    recentReview: "Recent marks",
    recentFeedback: "Recent feedback",
    copyJson: "Copy mark JSON",
    copyJsonTitle: "Copy JSON",
    copied: "Copied",
    copyFailed: "Copy failed",
    persistedReview: "Mark saved.",
    persistedFeedback: "Thank you. Your feedback was sent.",
    localOnly: "Saved locally. Configure an endpoint to persist submissions.",
    issueSubmitLabel: "Submit Issue",
    issueTitleDefault: "Feedback",
    review: {
      launcher: "Mark",
      panelTitle: "Mark this page",
      tabPrimary: "Comment",
      tabSecondary: "Ask AI",
      placeholder: "Enter a review comment",
      secondaryPlaceholder: "Describe the change you want AI to make",
      submit: "Save mark",
      helper:
        "Click a highlighted element, drag an empty area, or save feedback for the entire page.",
      empty: "No marks yet.",
    },
    feedback: {
      launcher: "Feedback",
      panelTitle: "Send feedback",
      tabPrimary: "Feedback",
      tabSecondary: "Question",
      placeholder: "Enter feedback about this page",
      secondaryPlaceholder: "Ask a question about this page",
      submit: "Send",
      helper:
        "Click a highlighted element, drag an empty area, or send feedback for the entire page.",
      empty: "No feedback in this session yet.",
    },
  },
};

export function getMessages(locale: MarkableLocale): LocaleMessages {
  return locales[locale];
}

export function getLabels(messages: LocaleMessages, mode: MarkableMode): ModeLabels {
  return messages[mode];
}
