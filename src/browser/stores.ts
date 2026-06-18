import type { MarkableAnnotation, MarkableStore } from "../core";

export interface MemoryStore extends MarkableStore {
  annotations: MarkableAnnotation[];
  update(id: string, patch: Partial<MarkableAnnotation>): Promise<void>;
}

export function createMemoryStore(initial: MarkableAnnotation[] = []): MemoryStore {
  const annotations: MarkableAnnotation[] = [...initial];

  return {
    annotations,
    async load() {
      return annotations;
    },
    async save(annotation) {
      annotations.push(annotation);
    },
    async update(id, patch) {
      const annotation = annotations.find((item) => item.id === id);
      if (!annotation) return;
      Object.assign(annotation, patch);
    },
  };
}

export function createHttpStore(endpoint: string): MarkableStore {
  return {
    async load() {
      const response = await fetch(endpoint, { method: "GET" });
      if (!response.ok) {
        throw new Error(`markable: failed to load annotations: ${response.status}`);
      }
      const data = (await response.json()) as { annotations?: MarkableAnnotation[] };
      return data.annotations ?? [];
    },
    async save(annotation) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(annotation),
      });
      if (!response.ok) {
        throw new Error(`markable: failed to save annotation: ${response.status}`);
      }
    },
  };
}

export interface LocalStorageStore extends MarkableStore {
  update(id: string, patch: Partial<MarkableAnnotation>): Promise<void>;
}

export interface LocalStorageStoreOptions {
  key?: string;
}

export function createLocalStorageStore(
  options: LocalStorageStoreOptions = {},
): LocalStorageStore {
  const key = options.key ?? "markable.annotations";
  let queue: Promise<unknown> = Promise.resolve();

  function run<T>(operation: () => Promise<T>): Promise<T> {
    const task = queue.then(operation);
    queue = task.catch(() => {
      // keep the queue alive even if one operation fails
    });
    return task;
  }

  async function loadAnnotations(): Promise<MarkableAnnotation[]> {
    try {
      const raw = globalThis.localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as { annotations?: MarkableAnnotation[] };
      return parsed.annotations ?? [];
    } catch {
      return [];
    }
  }

  async function persistAnnotations(annotations: MarkableAnnotation[]): Promise<void> {
    globalThis.localStorage.setItem(key, JSON.stringify({ annotations }));
  }

  return {
    async load() {
      return loadAnnotations();
    },
    async save(annotation) {
      return run(async () => {
        const annotations = await loadAnnotations();
        annotations.push(annotation);
        await persistAnnotations(annotations);
      });
    },
    async update(id, patch) {
      return run(async () => {
        const annotations = await loadAnnotations();
        const annotation = annotations.find((item) => item.id === id);
        if (!annotation) return;
        Object.assign(annotation, patch);
        await persistAnnotations(annotations);
      });
    },
  };
}
