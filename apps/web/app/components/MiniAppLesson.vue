<script setup lang="ts">
import type { MiniAppComponent } from '~/utils/types';

// A Duolingo-style lesson, like iOS: one question at a time, Check, feedback and
// Continue. A wrong answer costs a heart; running out ends without a score.
type Lesson = Extract<MiniAppComponent, { type: 'lesson' }>;
const props = defineProps<{ lesson: Lesson }>();
const emit = defineEmits<{ complete: [correct: number] }>();

const playing = ref(false);
const index = ref(0);
const selected = ref<number | null>(null);
const typed = ref('');
const result = ref<boolean | null>(null);
const hearts = ref(props.lesson.hearts);
const correct = ref(0);
const finished = ref(false);
const failed = ref(false);
const question = computed(() => props.lesson.questions[index.value]!);
const ready = computed(() => question.value.options ? selected.value !== null : !!typed.value.trim());
// Typed answers ignore case, accents, punctuation and extra spaces.
const normalized = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[\p{P}\p{S}]/gu, '').replace(/\s+/g, ' ').trim();

function start() {
  index.value = 0; selected.value = null; typed.value = ''; result.value = null; hearts.value = props.lesson.hearts; correct.value = 0; finished.value = false; failed.value = false;
  playing.value = true;
}
function check() {
  const right = question.value.options ? selected.value === question.value.correct : (question.value.answers ?? []).some(a => normalized(a) === normalized(typed.value));
  result.value = right;
  if (right) correct.value++; else hearts.value = Math.max(0, hearts.value - 1);
}
function advance() {
  if (!hearts.value) { failed.value = true; return; }
  if (index.value + 1 < props.lesson.questions.length) { index.value++; selected.value = null; typed.value = ''; result.value = null; }
  else finished.value = true;
}
function done() {
  emit('complete', correct.value);
  playing.value = false;
}
const answer = computed(() => question.value.options ? question.value.options[question.value.correct ?? 0] : question.value.answers?.[0] ?? '');
</script>

<template>
  <div class="group">
    <!-- The row is a card; only Start is a button, so it reads as one. -->
    <div class="mini-row mini-lesson-row">
      <span class="badge-icon"><AppIcon name="book" /></span>
      <span class="copy"><strong>{{ lesson.title }}</strong><span>{{ lesson.questions.length }} questions</span></span>
      <AppButton class="start" size="small" @click="start">Start</AppButton>
    </div>
  </div>
  <Teleport to="body">
    <div v-if="playing" class="mini-lesson" role="dialog" aria-modal="true" :aria-label="lesson.title">
      <header>
        <AppIconButton icon="close" label="Close" @click="playing = false" />
        <div class="track"><div class="fill" :style="{ width: `${(index + (result === null ? 0 : 1)) / lesson.questions.length * 100}%` }" /></div>
        <span class="hearts" :aria-label="`${hearts} hearts`"><AppIcon name="heart" filled />{{ hearts }}</span>
      </header>
      <section v-if="finished || failed" class="summary">
        <AppIcon :name="failed ? 'heart' : 'trophy'" filled class="big" :class="{ failed }" />
        <h2>{{ failed ? 'Out of hearts' : 'Lesson complete!' }}</h2>
        <p>{{ correct }} of {{ lesson.questions.length }} correct</p>
        <p v-if="!failed && lesson.xp && correct" class="xp">+{{ correct }} XP</p>
        <button type="button" class="mini-button primary" data-ripple @click="failed ? start() : done()">{{ failed ? 'Try again' : 'Done' }}</button>
        <AppButton v-if="failed" variant="text" @click="playing = false">Close</AppButton>
      </section>
      <template v-else>
        <section class="question">
          <h2>{{ question.prompt }}</h2>
          <div v-if="question.options" class="options">
            <button v-for="(option, at) in question.options" :key="at" type="button" data-ripple :disabled="result !== null"
              :class="{ chosen: selected === at, right: result !== null && at === question.correct, wrong: result === false && selected === at }" @click="selected = at">{{ option }}</button>
          </div>
          <textarea v-else v-model="typed" rows="2" placeholder="Type your answer" :disabled="result !== null" @keydown.enter.prevent="ready && result === null && check()" />
        </section>
        <footer :class="{ right: result === true, wrong: result === false }">
          <div v-if="result !== null" class="feedback">
            <strong>{{ result ? 'Correct!' : 'Correct answer:' }}</strong>
            <span v-if="!result">{{ answer }}</span>
            <span v-if="question.explain" class="explain">{{ question.explain }}</span>
          </div>
          <button type="button" class="mini-button primary" data-ripple :disabled="result === null && !ready" @click="result === null ? check() : advance()">{{ result === null ? 'Check' : 'Continue' }}</button>
        </footer>
      </template>
    </div>
  </Teleport>
</template>
