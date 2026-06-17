<script setup lang="ts">
import { computed, ref } from "vue";

type Todo = {
  id: number;
  label: string;
  done: boolean;
};

const draft = ref("");
const todos = ref<Todo[]>([
  { id: 1, label: "Click a highlighted Todo item to add a review annotation", done: false },
  { id: 2, label: "Ask how due dates should work in production feedback", done: false },
  { id: 3, label: "Inspect the captured URL, target, viewport, and message", done: true },
]);

const remaining = computed(() => todos.value.filter((todo) => !todo.done).length);

function addTodo() {
  const label = draft.value.trim();
  if (!label) return;

  todos.value.push({
    id: Date.now(),
    label,
    done: false,
  });
  draft.value = "";
}

function removeTodo(id: number) {
  todos.value = todos.value.filter((todo) => todo.id !== id);
}
</script>

<template>
  <main class="demo-shell">
    <section class="hero" aria-labelledby="demo-title">
      <p class="eyebrow">@f12o/markable demo</p>
      <h1 id="demo-title">Make a Todo app markable without changing its feature code.</h1>
      <p class="lede">
        Use the floating Mark or Feedback button to submit structured annotations against highlighted
        Todo elements, dragged regions, or the current page context.
      </p>
      <div class="mode-grid" aria-label="Demo modes">
        <article>
          <h2>Review mode</h2>
          <p>
            Run the demo locally with <code>pnpm dev</code>, click a highlighted Todo element or
            drag an empty area, then submit a review annotation. The Vite dev server stores JSON in
            <code>.markable/comments.json</code>.
          </p>
        </article>
        <article>
          <h2>Feedback mode</h2>
          <p>
            Build or deploy the demo to see production feedback UI. Static GitHub Pages can show the
            overlay, but cannot persist POSTed feedback without a remote endpoint.
          </p>
        </article>
      </div>
    </section>

    <section class="todo-card" aria-labelledby="todo-title">
      <div class="todo-header">
        <div>
          <p class="eyebrow">Demo surface</p>
          <h2 id="todo-title">Todo list</h2>
        </div>
        <span>{{ remaining }} open</span>
      </div>

      <form class="add-form" @submit.prevent="addTodo">
        <label for="todo-input">New Todo</label>
        <div>
          <input id="todo-input" v-model="draft" placeholder="Add a markable task" />
          <button type="submit">Add</button>
        </div>
      </form>

      <ul class="todo-list">
        <li v-for="todo in todos" :key="todo.id" :class="{ done: todo.done }">
          <label>
            <input v-model="todo.done" type="checkbox" />
            <span>{{ todo.label }}</span>
          </label>
          <button type="button" aria-label="Remove Todo" @click="removeTodo(todo.id)">×</button>
        </li>
      </ul>
    </section>

    <section class="capture-card" aria-labelledby="capture-title">
      <h2 id="capture-title">What markable captures</h2>
      <ul>
        <li>A highlighted DOM element, a dragged screen region, or the current page target.</li>
        <li>The current URL, document title, viewport size, and user agent.</li>
        <li>A mode-specific message: review annotation in dev, feedback or inquiry in prod.</li>
        <li>Status and timestamps so downstream tools can resolve or route the annotation.</li>
      </ul>
    </section>
  </main>
</template>
