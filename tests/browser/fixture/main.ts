import { mountMarkable, type MountMarkableOptions } from "@f12o/markable/browser";

const defaultOptions: MountMarkableOptions = {
  mode: "review",
  endpoint: "/__markable/comments",
  locale: "en",
  issueRepo: "f4ah6o/markable",
};

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
