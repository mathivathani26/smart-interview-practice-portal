/* Manages the in-progress mock-drive state across drive-aptitude.html,
   drive-coding.html, and drive-theory.html using sessionStorage (per-tab,
   cleared when the browser tab closes — appropriate for "state mid-flow"). */

const PAGE_BY_ROUND = { aptitude: "drive-aptitude.html", coding: "drive-coding.html", theory: "drive-theory.html" };

const Drive = {
  KEY: "sip_active_drive",

  save(state) {
    state.aptitudeQuestions = state.aptitudeQuestions || [];
    state.aptitudeAnswers = state.aptitudeAnswers || {};
    sessionStorage.setItem(this.KEY, JSON.stringify(state));
  },

  get() {
    const raw = sessionStorage.getItem(this.KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  },

  clear() { sessionStorage.removeItem(this.KEY); },

  requireActive() {
    const state = this.get();
    if (!state) { window.location.href = "mock-drive.html"; return null; }
    return state;
  },

  currentRoundSpec(state) { return state.round_sequence[state.roundIndex]; },

  startRoundTimer(state, element) {
    state.roundDeadlines = state.roundDeadlines || {};
    const key = String(state.roundIndex);
    if (!state.roundDeadlines[key]) {
      state.roundDeadlines[key] = Date.now() + this.currentRoundSpec(state).time_limit_seconds * 1000;
      this.save(state);
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((state.roundDeadlines[key] - Date.now()) / 1000));
      const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
      const seconds = String(remaining % 60).padStart(2, "0");
      element.textContent = `${minutes}:${seconds}`;
    };

    tick();
    return setInterval(tick, 1000);
  },

  // Call after a round's question is submitted. Returns { done: bool, sameRound: bool }
  async advance(state) {
    state.questionIndex += 1;
    const spec = this.currentRoundSpec(state);

    if (state.questionIndex < spec.question_count) {
      this.save(state);
      return { done: false, sameRound: true };
    }

    // this round is finished — move to the next round, or finish the drive
    state.roundIndex += 1;
    state.questionIndex = 0;

    if (state.roundIndex >= state.round_sequence.length) {
      this.save(state);
      return { done: true, sameRound: false };
    }

    this.save(state);
    return { done: false, sameRound: false };
  },

  nextRoundUrl(state) {
    const spec = this.currentRoundSpec(state);
    return PAGE_BY_ROUND[spec.round_type];
  },
};
