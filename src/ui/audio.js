export function createAudioController({ state, refs, bgmConfig }) {
  let bgmAudio = null;

  function initBgm() {
    if (bgmAudio || !bgmConfig.src) return bgmAudio;
    bgmAudio = new Audio(bgmConfig.src);
    bgmAudio.loop = true;
    bgmAudio.preload = "auto";
    bgmAudio.volume = Math.max(0, Math.min(1, bgmConfig.volume ?? 0.35));
    bgmAudio.addEventListener("error", () => {
      state.bgmOn = false;
      state.bgmError = "BGM 파일 없음";
      renderBgmState();
    });
    return bgmAudio;
  }

  function renderBgmState() {
    refs.bgmToggle.disabled = !bgmConfig.src;
    refs.bgmToggle.classList.toggle("active", state.bgmOn);
    refs.bgmToggle.classList.toggle("error", Boolean(state.bgmError));
    refs.bgmToggle.textContent = state.bgmError || (state.bgmOn ? "BGM ON" : "BGM");
    refs.bgmToggle.title = bgmConfig.src
      ? `${state.bgmOn ? "배경음악 끄기" : "배경음악 켜기"} (${bgmConfig.src})`
      : "BGM 파일이 설정되지 않았습니다.";
  }

  async function toggleBgm() {
    const audio = initBgm();
    if (!audio) {
      state.bgmError = "BGM 없음";
      renderBgmState();
      return;
    }
    state.bgmError = "";
    try {
      if (audio.paused) {
        await audio.play();
        state.bgmOn = true;
      } else {
        audio.pause();
        state.bgmOn = false;
      }
    } catch {
      state.bgmOn = false;
      state.bgmError = "재생 차단";
    }
    renderBgmState();
  }

  return {
    initBgm,
    renderBgmState,
    toggleBgm,
  };
}
