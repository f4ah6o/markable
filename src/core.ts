export type MarkableMode = "review" | "feedback";

export type MarkableTargetKind =
  | "dom_range"
  | "text_range"
  | "line_range"
  | "cell_range"
  | "bbox"
  | "node"
  | "edge";

export type MarkableStatus =
  | "open"
  | "agent_replied"
  | "applied"
  | "rejected"
  | "needs_user_reply"
  | "resolved";

export interface MarkableRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MarkableTarget {
  kind: MarkableTargetKind;
  locator: Record<string, unknown>;
  quote?: string;
  prefix?: string;
  suffix?: string;
  rect?: MarkableRect;
}

export interface MarkableContext {
  url?: string;
  title?: string;
  viewport?: {
    width: number;
    height: number;
  };
  userAgent?: string;
  [key: string]: unknown;
}

export interface MarkableAnnotation {
  id: string;
  mode: MarkableMode;
  target: MarkableTarget;
  message: string;
  status: MarkableStatus;
  context?: MarkableContext;
  createdAt: string;
  updatedAt: string;
}

export interface MarkableStore {
  load(): Promise<MarkableAnnotation[]>;
  save(annotation: MarkableAnnotation): Promise<void>;
  update?(id: string, patch: Partial<MarkableAnnotation>): Promise<void>;
}

export interface MarkableAdapter {
  getTarget(): MarkableTarget | null;
  getContext?(): MarkableContext;
  clearSelection?(): void;
}

export interface CreateMarkableOptions {
  mode: MarkableMode;
  adapter: MarkableAdapter;
  store: MarkableStore;
  idFactory?: () => string;
  now?: () => Date;
}

export interface MarkableRuntime {
  mode: MarkableMode;
  load(): Promise<MarkableAnnotation[]>;
  submit(message: string): Promise<MarkableAnnotation>;
  updateStatus(id: string, status: MarkableStatus): Promise<void>;
}

export function createMarkable(options: CreateMarkableOptions): MarkableRuntime {
  const now = options.now ?? (() => new Date());
  const idFactory = options.idFactory ?? defaultIdFactory;

  return {
    mode: options.mode,

    load() {
      return options.store.load();
    },

    async submit(message: string) {
      const target = options.adapter.getTarget();
      if (!target) {
        throw new Error("markable: no active target");
      }

      const timestamp = now().toISOString();
      const annotation: MarkableAnnotation = {
        id: idFactory(),
        mode: options.mode,
        target,
        message,
        status: "open",
        context: options.adapter.getContext?.(),
        createdAt: timestamp,
        updatedAt: timestamp
      };

      await options.store.save(annotation);
      options.adapter.clearSelection?.();
      return annotation;
    },

    async updateStatus(id, status) {
      if (!options.store.update) {
        throw new Error("markable: store does not support update");
      }
      await options.store.update(id, {
        status,
        updatedAt: now().toISOString()
      });
    }
  };
}

function defaultIdFactory(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `mark-${random}`;
}
