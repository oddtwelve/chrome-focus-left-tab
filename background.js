'use strict';

// Когда закрывается активная вкладка, Chrome сам переключается на вкладку справа.
// Расширение сразу после этого переводит фокус на ближайшую вкладку слева.
//
// Порядок вкладок приходится запоминать заранее: в момент события onRemoved
// закрытой вкладки уже нет, и узнать, где она стояла, нельзя. Сервис-воркер
// засыпает примерно через 30 секунд простоя и теряет переменные, поэтому
// состояние хранится в chrome.storage.session (живёт до перезапуска браузера).

// Chrome может прислать onActivated для новой вкладки раньше, чем onRemoved для
// закрытой. Тогда закрытая вкладка числится «предыдущей активной», и переключение
// считается вызванным закрытием, только если оно случилось совсем недавно.
const CLOSE_ACTIVATION_WINDOW_MS = 500;

const stateKey = (windowId) => `win:${windowId}`;

// Обработчики выполняются строго по очереди, иначе параллельные
// чтения и записи состояния перетирали бы друг друга.
let queue = Promise.resolve();
function enqueue(task) {
  queue = queue.then(task).catch((err) => console.error('[focus-left]', err));
}

async function loadState(windowId) {
  const key = stateKey(windowId);
  return (await chrome.storage.session.get(key))[key] ?? null;
}

function saveState(windowId, state) {
  return chrome.storage.session.set({ [stateKey(windowId)]: state });
}

function dropState(windowId) {
  return chrome.storage.session.remove(stateKey(windowId));
}

// Запоминает текущий порядок вкладок окна.
async function snapshotWindow(windowId) {
  let tabs;
  try {
    tabs = await chrome.tabs.query({ windowId });
  } catch {
    tabs = [];
  }
  if (tabs.length === 0) return dropState(windowId);

  tabs.sort((a, b) => a.index - b.index);
  const prev = await loadState(windowId);
  await saveState(windowId, {
    order: tabs.map((t) => t.id),
    active: tabs.find((t) => t.active)?.id ?? null,
    prevActive: prev?.prevActive ?? null,
    activatedAt: prev?.activatedAt ?? 0,
  });
}

async function snapshotAllWindows() {
  const stored = await chrome.storage.session.get(null);
  await chrome.storage.session.remove(Object.keys(stored).filter((k) => k.startsWith('win:')));
  for (const win of await chrome.windows.getAll()) {
    await snapshotWindow(win.id);
  }
}

async function isInCollapsedGroup(tab) {
  if (tab.groupId === undefined || tab.groupId === -1) return false;
  try {
    return (await chrome.tabGroups.get(tab.groupId)).collapsed;
  } catch {
    return false;
  }
}

async function activate(tabId) {
  for (let attempt = 0; ; attempt++) {
    try {
      await chrome.tabs.update(tabId, { active: true });
      return;
    } catch (err) {
      // «Tabs cannot be edited right now (user may be dragging a tab)» — пробуем ещё раз.
      if (attempt >= 10 || !String(err?.message).includes('cannot be edited')) throw err;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

// Активирует ближайшую вкладку слева от позиции закрытой вкладки.
// Пропускает вкладки, которые уже закрыты, перенесены в другое окно
// или спрятаны в свёрнутой группе.
async function focusLeftNeighbor(windowId, order, closedPos) {
  for (let i = closedPos - 1; i >= 0; i--) {
    let tab;
    try {
      tab = await chrome.tabs.get(order[i]);
    } catch {
      continue;
    }
    if (tab.windowId !== windowId) continue;
    if (await isInCollapsedGroup(tab)) continue;
    if (!tab.active) await activate(tab.id);
    return;
  }
}

chrome.tabs.onRemoved.addListener((tabId, { windowId, isWindowClosing }) => {
  enqueue(async () => {
    if (isWindowClosing) return dropState(windowId);

    const state = await loadState(windowId);
    if (!state) return snapshotWindow(windowId);

    const pos = state.order.indexOf(tabId);
    const wasActive =
      state.active === tabId ||
      (state.prevActive === tabId && Date.now() - state.activatedAt < CLOSE_ACTIVATION_WINDOW_MS);

    await saveState(windowId, {
      ...state,
      order: state.order.filter((id) => id !== tabId),
      active: state.active === tabId ? null : state.active,
      prevActive: state.prevActive === tabId ? null : state.prevActive,
    });

    // Самая левая вкладка: слева никого нет, оставляем поведение Chrome.
    if (wasActive && pos > 0) await focusLeftNeighbor(windowId, state.order, pos);
  });
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  enqueue(async () => {
    const state = await loadState(windowId);
    if (!state) return snapshotWindow(windowId);
    if (state.active === tabId) return;
    await saveState(windowId, {
      ...state,
      prevActive: state.active,
      active: tabId,
      activatedAt: Date.now(),
    });
  });
});

chrome.tabs.onCreated.addListener((tab) => enqueue(() => snapshotWindow(tab.windowId)));
chrome.tabs.onMoved.addListener((_id, { windowId }) => enqueue(() => snapshotWindow(windowId)));
chrome.tabs.onAttached.addListener((_id, { newWindowId }) => enqueue(() => snapshotWindow(newWindowId)));
chrome.tabs.onDetached.addListener((_id, { oldWindowId }) => enqueue(() => snapshotWindow(oldWindowId)));
chrome.tabs.onReplaced.addListener((addedTabId) =>
  enqueue(async () => {
    try {
      await snapshotWindow((await chrome.tabs.get(addedTabId)).windowId);
    } catch {
      // вкладка уже исчезла
    }
  })
);
chrome.windows.onRemoved.addListener((windowId) => enqueue(() => dropState(windowId)));

chrome.runtime.onInstalled.addListener(() => enqueue(snapshotAllWindows));
chrome.runtime.onStartup.addListener(() => enqueue(snapshotAllWindows));
