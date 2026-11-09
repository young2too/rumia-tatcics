// 배치 단계에서 적 전장을 접고 아군 전장을 크게 보는 사용자 설정을 관리합니다.
const button = document.querySelector('#allyBoardToggle');
const label = document.querySelector('#allyBoardToggleLabel');
const mobile = matchMedia('(max-width: 640px)');
const storageKey = 'lumia-tactics-ally-board-only';

function storedPreference() {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored == null ? mobile.matches : stored === '1';
  } catch {
    return mobile.matches;
  }
}

let allyOnly = storedPreference();

function render() {
  const fighting = document.body.classList.contains('fighting');
  document.body.classList.toggle('ally-board-only', allyOnly);
  if (!button) return;
  button.setAttribute('aria-pressed', String(allyOnly));
  button.setAttribute('aria-label', allyOnly ? '전체' : '아군만');
  if (label) label.textContent = allyOnly ? '전체' : '아군만';
  button.disabled = fighting;
  button.title = fighting
    ? '전투 중에는 전체 전장을 표시합니다'
    : allyOnly ? '적 전장도 함께 보기' : '배치 중 적 전장을 접기';
}

button?.addEventListener('click', () => {
  if (document.body.classList.contains('fighting')) return;
  allyOnly = !allyOnly;
  try {
    localStorage.setItem(storageKey, allyOnly ? '1' : '0');
  } catch {
    // 저장소를 사용할 수 없어도 현재 페이지의 보기 설정은 유지합니다.
  }
  render();
});

new MutationObserver(render).observe(document.body, { attributes: true, attributeFilter: ['class'] });
render();
