// Mobile floating menu and information drawer; reuses existing controls and listeners.
import './mobileShell.css';

const media = matchMedia('(max-width: 640px)');
const floating = document.createElement('div');
floating.className = 'mobile-floating-menu';
floating.innerHTML = `
  <div class="mobile-floating-actions" hidden></div>
  <button class="mobile-floating-toggle" type="button" aria-label="전장 메뉴 열기" aria-expanded="false">
    <span aria-hidden="true"></span>
  </button>
`;
const actionList = floating.firstElementChild;
const floatingToggle = floating.lastElementChild;

const drawer = document.createElement('section');
drawer.className = 'mobile-drawer';
drawer.hidden = true;
drawer.innerHTML = '<header><strong></strong><button class="mobile-drawer-close" type="button" aria-label="패널 닫기" title="닫기">×</button></header><div class="mobile-drawer-body"></div>';
const drawerBody = drawer.lastElementChild;

const shopPanel = document.querySelector('.shop-panel');
const shopTools = shopPanel?.querySelector('.shop-tools');
const shopWallet = shopPanel?.querySelector('.shop-wallet');
const shopWalletAnchor = document.createComment('mobile: shop wallet');
shopWallet?.before(shopWalletAnchor);
const shopTrayToggle = document.createElement('button');
shopTrayToggle.className = 'mobile-shop-tray-toggle';
shopTrayToggle.type = 'button';
shopTrayToggle.innerHTML = '<span>상점</span><i aria-hidden="true"></i>';
shopPanel?.prepend(shopTrayToggle);

let shopTrayCollapsed = false;
let wasFighting = document.body.classList.contains('fighting');

function syncShopTrayClearance() {
  if (!media.matches || !shopPanel) {
    document.documentElement.style.removeProperty('--mobile-shop-tray-clearance');
    return;
  }
  const clearance = shopTrayCollapsed ? 8 : Math.ceil(shopPanel.getBoundingClientRect().height) + 12;
  document.documentElement.style.setProperty('--mobile-shop-tray-clearance', `${clearance}px`);
}

function syncShopToolbarLayout() {
  if (!shopWallet || !shopTools) return;
  if (media.matches) shopTools.append(shopWallet);
  else shopWalletAnchor.after(shopWallet);
}

function setShopTrayCollapsed(collapsed) {
  shopTrayCollapsed = Boolean(collapsed);
  shopPanel?.classList.toggle('mobile-shop-tray-collapsed', shopTrayCollapsed);
  shopTrayToggle.setAttribute('aria-expanded', String(!shopTrayCollapsed));
  shopTrayToggle.setAttribute('aria-label', shopTrayCollapsed ? '상점 열기' : '상점 접기');
  shopTrayToggle.title = shopTrayCollapsed ? '상점 열기' : '상점 접기';
  requestAnimationFrame(syncShopTrayClearance);
}

shopTrayToggle.addEventListener('click', () => setShopTrayCollapsed(!shopTrayCollapsed));
if (shopPanel && 'ResizeObserver' in window) new ResizeObserver(syncShopTrayClearance).observe(shopPanel);

new MutationObserver(() => {
  const fighting = document.body.classList.contains('fighting');
  if (fighting && !wasFighting) setShopTrayCollapsed(true);
  if (!fighting && wasFighting) setShopTrayCollapsed(false);
  wasFighting = fighting;
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });

function closeFloatingMenu() {
  actionList.hidden = true;
  floatingToggle.setAttribute('aria-expanded', 'false');
  floatingToggle.setAttribute('aria-label', '전장 메뉴 열기');
}

function toggleFloatingMenu() {
  const opening = actionList.hidden;
  actionList.hidden = !opening;
  floatingToggle.setAttribute('aria-expanded', String(opening));
  floatingToggle.setAttribute('aria-label', opening ? '전장 메뉴 닫기' : '전장 메뉴 열기');
}

function closeDrawer() {
  drawer.hidden = true;
  for (const { node, anchor, button } of entries) {
    anchor.after(node);
    button.setAttribute('aria-expanded', 'false');
  }
}

const entries = [
  ['시너지', '.left-panel'],
  ['증강', '#activeAugments'],
  ['유닛', '.unit-detail'],
  ['더보기', '.topbar nav'],
  ['디버그', '#debugShop'],
].map(([name, selector]) => {
  const node = document.querySelector(selector);
  if (!node) return null;
  const anchor = document.createComment(`mobile: ${name}`);
  node.before(anchor);
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = name;
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', () => {
    const wasOpen = !drawer.hidden && drawerBody.contains(node);
    closeDrawer();
    closeFloatingMenu();
    if (wasOpen) return;
    drawerBody.append(node);
    drawer.querySelector('strong').textContent = name;
    drawer.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  });
  if (name === '디버그' && !['localhost', '127.0.0.1', '::1'].includes(location.hostname)) button.hidden = true;
  actionList.append(button);
  return { node, anchor, button };
}).filter(Boolean);

function updateFloatingAttention() {
  const hasAttention = Array.from(actionList.querySelectorAll('button.has-unread')).some((button) => !button.hidden);
  floatingToggle.classList.toggle('has-unread', hasAttention);
}

function addProxyButton({ name, sourceSelector, rootSelector, unreadSelector = '' }) {
  const source = document.querySelector(sourceSelector);
  const root = document.querySelector(rootSelector);
  if (!source || !root) return null;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = name;
  button.dataset.mobileAction = name;
  button.addEventListener('click', () => {
    closeDrawer();
    closeFloatingMenu();
    source.click();
  });
  actionList.prepend(button);

  const unread = unreadSelector ? document.querySelector(unreadSelector) : null;
  const sync = () => {
    button.hidden = root.hidden;
    button.classList.toggle('has-unread', Boolean(unread && !unread.hidden));
    button.classList.toggle('active', source.classList.contains('active') || source.getAttribute('aria-expanded') === 'true');
    updateFloatingAttention();
  };
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['hidden', 'class'] });
  new MutationObserver(sync).observe(source, { attributes: true, attributeFilter: ['class', 'aria-expanded'] });
  if (unread) new MutationObserver(sync).observe(unread, { attributes: true, attributeFilter: ['hidden'] });
  sync();
  return button;
}

addProxyButton({
  name: '광장',
  sourceSelector: '#globalChatToggle',
  rootSelector: '#globalChat',
  unreadSelector: '#globalChatUnread',
});

const moreEntry = entries.find(({ node }) => node.matches('.topbar nav'));
const pvpAlert = document.querySelector('.pvp-rooms-alert');
if (moreEntry && pvpAlert) {
  const syncMoreAttention = () => {
    moreEntry.button.classList.toggle('has-unread', !pvpAlert.hidden);
    updateFloatingAttention();
  };
  new MutationObserver(syncMoreAttention).observe(pvpAlert, {
    attributes: true,
    attributeFilter: ['hidden'],
    childList: true,
  });
  syncMoreAttention();
}
addProxyButton({
  name: '정찰',
  sourceSelector: '[data-pvp-social-tab="scout"]',
  rootSelector: '#pvpSocial',
});

floatingToggle.addEventListener('click', () => {
  closeDrawer();
  toggleFloatingMenu();
});
drawer.querySelector('button').addEventListener('click', closeDrawer);
document.addEventListener('click', (event) => {
  if (!floating.contains(event.target)) closeFloatingMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  closeFloatingMenu();
  closeDrawer();
});
media.addEventListener('change', () => {
  closeFloatingMenu();
  closeDrawer();
  syncShopToolbarLayout();
  syncShopTrayClearance();
});
document.body.append(floating, drawer);
syncShopToolbarLayout();
setShopTrayCollapsed(false);
