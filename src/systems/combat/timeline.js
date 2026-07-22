// 스킬 타임라인: 지연 피해, 채널링, 후속 폭발 같은 예약 이벤트를 관리합니다.
export function createSkillTimeline() {
  let sequence = 0;
  let events = [];

  function schedule(currentTimeMs, delayMs, event) {
    const entry = {
      ...event,
      id: `skill-event-${sequence += 1}`,
      dueTimeMs: currentTimeMs + Math.max(0, Math.round(delayMs || 0)),
    };
    events.push(entry);
    events.sort((a, b) => a.dueTimeMs - b.dueTimeMs || a.id.localeCompare(b.id));
    return entry;
  }

  function takeDue(currentTimeMs) {
    const due = events.filter((event) => event.dueTimeMs <= currentTimeMs);
    events = events.filter((event) => event.dueTimeMs > currentTimeMs);
    return due;
  }

  function clear() {
    events = [];
  }

  return { clear, schedule, takeDue };
}
