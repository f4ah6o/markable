import { mountMarkable, type MountMarkableOptions } from "@f12o/markable/browser";

const defaultOptions: MountMarkableOptions = {
  mode: "review",
  endpoint: "/__markable/comments",
  locale: "en",
  issueRepo: "f4ah6o/markable",
};

// Simulate a React dev build so componentHints capture is covered end-to-end
// without pulling a real framework into the fixture.
function DemoButton() {}
const targetButton = document.getElementById("target-button");
if (targetButton) {
  (targetButton as unknown as Record<string, unknown>).__reactFiber$e2e = {
    type: "button",
    _debugSource: { fileName: "src/Demo.tsx", lineNumber: 7, columnNumber: 3 },
    return: { type: DemoButton, return: null },
  };
}

const host = document.createElement("div");
host.id = "markable-host";
document.body.append(host);

let mounted = mountMarkable(host, defaultOptions);

(window as unknown as Record<string, unknown>).remountMarkable = (
  options?: MountMarkableOptions,
) => {
  mounted.unmount();
  mounted = mountMarkable(host, { ...defaultOptions, ...options });
  return mounted;
};

(window as unknown as Record<string, unknown>).unmountMarkable = () => {
  mounted.unmount();
};
