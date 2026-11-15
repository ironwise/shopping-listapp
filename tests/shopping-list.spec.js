/**
 * index.html E2E 테스트.
 *
 * 선택자는 되도록 **사용자가 보는 것**으로 고른다(역할·이름). CSS 클래스에 묶으면
 * 스타일만 고쳐도 테스트가 깨지고, 정작 사용자가 쓸 수 없게 된 상태는 놓친다.
 *
 * 저장은 Supabase 테이블 하나라서 테스트끼리 상태가 샌다. 매 테스트 앞에서 비운다
 * (그래서 playwright.config.js 가 workers: 1 이다 — 병렬이면 서로를 지운다).
 *
 * 테스트는 실제 Supabase 프로젝트를 쓴다. 네트워크가 없으면 전부 실패한다.
 */

import { test, expect } from '@playwright/test';

/* index.html 안의 값과 같아야 한다. publishable 키는 공개되는 값이라 그대로 적는다. */
const ENDPOINT = 'https://ygmumpdtokurnxbkwswg.supabase.co/rest/v1/shopping_items';
const SUPABASE_KEY = 'sb_publishable_oUXULpKTwbzeWKjA2QbN0A_U5yNIaLF';
const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

/** 예전 버전이 쓰던 localStorage 키 */
const LEGACY_KEY = 'shopping-list.items.v1';

/** 입력란에 쳐 넣고 Enter. 실제 사용 경로와 같다. */
async function addItem(page, name) {
  await page.getByRole('textbox', { name: '살 물건' }).fill(name);
  await page.getByRole('textbox', { name: '살 물건' }).press('Enter');
}

/** 화면에 보이는 항목 이름들 */
function itemNames(page) {
  return page.locator('#list li .name').allTextContents();
}

/** 상단 카운터 */
function counter(page) {
  return page.locator('#count');
}

/** 첫 로드가 끝나 입력이 열릴 때까지 기다린다. */
async function waitReady(page) {
  await expect(page.getByRole('textbox', { name: '살 물건' })).toBeEnabled();
}

/** 서버 테이블을 비운다 */
async function dbClear() {
  const res = await fetch(`${ENDPOINT}?id=not.is.null`, { method: 'DELETE', headers: HEADERS });
  if (!res.ok) throw new Error(`테이블을 비우지 못했습니다: ${res.status} ${res.statusText}`);
}

/** 서버에 실제로 저장된 목록 (추가된 순서) */
async function dbItems() {
  const res = await fetch(`${ENDPOINT}?select=name,done&order=created_at.asc`, { headers: HEADERS });
  if (!res.ok) throw new Error(`목록을 읽지 못했습니다: ${res.status} ${res.statusText}`);
  return (await res.json()).map(({ name, done }) => ({ name, done }));
}

test.beforeEach(async ({ page }) => {
  /* 앱 스크립트보다 먼저 돌려서, 이전 테스트가 남긴 예전 데이터가
     마이그레이션으로 서버에 다시 들어오는 것을 막는다. */
  await page.addInitScript((key) => {
    try { localStorage.removeItem(key); } catch { /* 접근이 막혔다 */ }
  }, LEGACY_KEY);

  await dbClear();
  await page.goto('/');
  await waitReady(page);
});

test.describe('빈 상태', () => {
  test('항목이 없으면 안내와 함께 일괄 삭제 버튼이 비활성이다', async ({ page }) => {
    await expect(counter(page)).toHaveText('항목이 없습니다');
    await expect(page.getByText('아직 담은 물건이 없습니다.')).toBeVisible();
    await expect(page.getByRole('button', { name: '전체 지우기' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '완료 항목 지우기' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '추가' })).toBeDisabled();
  });
});

test.describe('추가', () => {
  test('입력한 순서대로 쌓이고 카운트가 맞는다', async ({ page }) => {
    for (const name of ['우유', '계란 한 판', '식빵', '사과 3개']) {
      await addItem(page, name);
    }

    expect(await itemNames(page)).toEqual(['우유', '계란 한 판', '식빵', '사과 3개']);
    await expect(counter(page)).toHaveText('4개 남음 · 전체 4개');
    await expect(page.getByText('아직 담은 물건이 없습니다.')).toBeHidden();
  });

  test('빈 값과 공백만으로는 추가되지 않는다', async ({ page }) => {
    const input = page.getByRole('textbox', { name: '살 물건' });

    await input.press('Enter');
    await input.fill('     ');
    await expect(page.getByRole('button', { name: '추가' })).toBeDisabled();
    await input.press('Enter');

    expect(await itemNames(page)).toEqual([]);
  });

  test('앞뒤·중간 공백은 하나로 정리된다', async ({ page }) => {
    await addItem(page, '  사과   3개  ');
    expect(await itemNames(page)).toEqual(['사과 3개']);
  });

  test('100자를 넘으면 잘라서 담는다', async ({ page }) => {
    await addItem(page, '가'.repeat(150));
    const [name] = await itemNames(page);
    expect(name.length).toBe(100);
  });

  test('HTML 을 입력해도 태그로 해석되지 않는다', async ({ page }) => {
    // 회귀 대상: innerHTML 로 그리면 이 입력이 실제 <img> 가 되어 onerror 가 돈다.
    await addItem(page, '<img src=x onerror="window.__xss=1">');

    expect(await itemNames(page)).toEqual(['<img src=x onerror="window.__xss=1">']);
    await expect(page.locator('#list img')).toHaveCount(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });
});

test.describe('체크', () => {
  test('체크박스를 누르면 완료 표시되고 카운트가 준다', async ({ page }) => {
    await addItem(page, '우유');
    await addItem(page, '식빵');

    await page.getByRole('checkbox', { name: '우유' }).check();

    await expect(page.getByRole('checkbox', { name: '우유' })).toBeChecked();
    await expect(counter(page)).toHaveText('1개 남음 · 전체 2개');
    await expect(page.locator('#list li', { hasText: '우유' })).toHaveClass(/done/);
  });

  test('글자를 눌러도 체크된다 (작은 체크박스를 노릴 필요 없다)', async ({ page }) => {
    await addItem(page, '식빵');

    await page.locator('#list li .name', { hasText: '식빵' }).click();

    await expect(page.getByRole('checkbox', { name: '식빵' })).toBeChecked();
  });

  test('다시 누르면 완료가 풀린다', async ({ page }) => {
    await addItem(page, '우유');
    const box = page.getByRole('checkbox', { name: '우유' });

    await box.check();
    await box.uncheck();

    await expect(box).not.toBeChecked();
    await expect(counter(page)).toHaveText('1개 남음 · 전체 1개');
  });
});

test.describe('삭제', () => {
  test('누른 항목만 사라진다', async ({ page }) => {
    for (const name of ['우유', '계란 한 판', '식빵']) await addItem(page, name);

    await page.getByRole('button', { name: '계란 한 판 삭제' }).click();

    expect(await itemNames(page)).toEqual(['우유', '식빵']);
    await expect(counter(page)).toHaveText('2개 남음 · 전체 2개');
  });

  test('완료 항목 지우기는 체크된 것만 지운다', async ({ page }) => {
    for (const name of ['우유', '계란 한 판', '식빵']) await addItem(page, name);
    await page.getByRole('checkbox', { name: '식빵' }).check();

    await page.getByRole('button', { name: '완료 항목 지우기' }).click();

    expect(await itemNames(page)).toEqual(['우유', '계란 한 판']);
    await expect(page.getByRole('button', { name: '완료 항목 지우기' })).toBeDisabled();
  });

  test('전체 지우기를 취소하면 그대로 남는다', async ({ page }) => {
    for (const name of ['우유', '식빵']) await addItem(page, name);

    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: '전체 지우기' }).click();

    expect(await itemNames(page)).toEqual(['우유', '식빵']);
  });

  test('전체 지우기를 확인하면 서버까지 비워진다', async ({ page }) => {
    for (const name of ['우유', '식빵']) await addItem(page, name);

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: '전체 지우기' }).click();

    expect(await itemNames(page)).toEqual([]);
    await expect(counter(page)).toHaveText('항목이 없습니다');
    await expect(page.getByText('아직 담은 물건이 없습니다.')).toBeVisible();
    await expect(page.getByRole('button', { name: '전체 지우기' })).toBeDisabled();
    await expect.poll(dbItems).toEqual([]);
  });
});

test.describe('중복', () => {
  test('같은 물건을 또 넣으면 추가하지 않는다', async ({ page }) => {
    await addItem(page, '우유');
    await addItem(page, '우유');

    expect(await itemNames(page)).toEqual(['우유']);
  });

  test('완료한 물건을 다시 넣으면 완료가 풀린다 (또 필요하다는 뜻)', async ({ page }) => {
    await addItem(page, '우유');
    await page.getByRole('checkbox', { name: '우유' }).check();

    await addItem(page, '우유');

    await expect(page.getByRole('checkbox', { name: '우유' })).not.toBeChecked();
    expect(await itemNames(page)).toEqual(['우유']);
  });

  test('공백·대소문자 차이는 같은 물건으로 본다', async ({ page }) => {
    await addItem(page, 'Milk');
    await addItem(page, '  milk  ');

    expect(await itemNames(page)).toEqual(['Milk']);
  });
});

test.describe('저장', () => {
  test('새로고침해도 목록과 완료 상태가 유지된다', async ({ page }) => {
    for (const name of ['우유', '계란 한 판', '식빵']) await addItem(page, name);
    await page.getByRole('checkbox', { name: '계란 한 판' }).check();

    // 화면은 낙관적으로 먼저 바뀐다. 서버에 실제로 닿았는지 확인한 뒤 새로고침한다.
    await expect.poll(dbItems).toEqual([
      { name: '우유', done: false },
      { name: '계란 한 판', done: true },
      { name: '식빵', done: false },
    ]);

    await page.reload();
    await waitReady(page);

    expect(await itemNames(page)).toEqual(['우유', '계란 한 판', '식빵']);
    await expect(page.getByRole('checkbox', { name: '계란 한 판' })).toBeChecked();
    await expect(counter(page)).toHaveText('2개 남음 · 전체 3개');
  });

  test('다른 브라우저에서 담은 것도 보인다 (목록이 서버에 있다)', async ({ page }) => {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ name: '남이 담은 우유', done: true }),
    });
    expect(res.ok).toBe(true);

    await page.reload();
    await waitReady(page);

    expect(await itemNames(page)).toEqual(['남이 담은 우유']);
    await expect(page.getByRole('checkbox', { name: '남이 담은 우유' })).toBeChecked();
  });

  test('예전 버전이 localStorage 에 남긴 목록을 서버로 옮긴다', async ({ page }) => {
    /* beforeEach 의 정리 스크립트 다음에 실행되므로, 지운 뒤 다시 심는 순서가 된다. */
    await page.addInitScript((key) => {
      localStorage.setItem(key, JSON.stringify([
        { id: 'a', name: '우유', done: false },
        { id: 'b', name: '식빵', done: true },
        { nope: 1 },           // 모양이 다른 값은 버린다
        { name: '   ' },       // 빈 이름도 버린다
      ]));
    }, LEGACY_KEY);

    await page.goto('/');
    await waitReady(page);

    // 옮기기는 목록을 띄운 뒤에 일어난다. 두 개가 붙을 때까지 기다린다.
    await expect(page.locator('#list li')).toHaveCount(2);
    expect(await itemNames(page)).toEqual(['우유', '식빵']);
    await expect(page.getByRole('checkbox', { name: '식빵' })).toBeChecked();
    await expect.poll(dbItems).toEqual([
      { name: '우유', done: false },
      { name: '식빵', done: true },
    ]);

    // 옮긴 뒤에는 예전 키를 지운다 — 다시 열어도 두 번 들어오지 않는다.
    expect(await page.evaluate((key) => localStorage.getItem(key), LEGACY_KEY)).toBeNull();
  });
});

test.describe('서버가 말을 안 들을 때', () => {
  test('못 불러오면 오류와 다시 시도 버튼이 뜨고, 다시 시도로 복구된다', async ({ page }) => {
    await page.route(/shopping_items/, (route) => route.abort('failed'));
    await page.goto('/');

    await expect(page.getByText(/목록을 불러오지 못했습니다/)).toBeVisible();
    // 못 불러온 상태에서 입력을 받으면 저장되지 않은 채 쌓인다. 입력을 잠가 둔다.
    await expect(page.getByRole('textbox', { name: '살 물건' })).toBeDisabled();

    await page.unroute(/shopping_items/);
    await page.getByRole('button', { name: '다시 시도' }).click();

    await waitReady(page);
    await expect(counter(page)).toHaveText('항목이 없습니다');
    await expect(page.getByRole('button', { name: '다시 시도' })).toBeHidden();
  });

  test('추가가 실패하면 화면을 되돌리고 알린다', async ({ page }) => {
    await page.route(/shopping_items/, (route) => (
      route.request().method() === 'POST' ? route.abort('failed') : route.continue()
    ));

    await addItem(page, '우유');

    // 같은 문구가 상태 영역(#live)에도 들어가므로 알림 띠로 좁혀서 본다.
    await expect(page.locator('#bannerText')).toHaveText(/추가를 저장하지 못했습니다/);
    expect(await itemNames(page)).toEqual([]);
    await expect(counter(page)).toHaveText('항목이 없습니다');
    await expect.poll(dbItems).toEqual([]);
  });
});

test.describe('접근성', () => {
  test('체크박스와 삭제 버튼에 이름이 붙는다', async ({ page }) => {
    await addItem(page, '우유');

    await expect(page.getByRole('checkbox', { name: '우유' })).toBeVisible();
    await expect(page.getByRole('button', { name: '우유 삭제' })).toBeVisible();
  });

  test('변경 사항이 상태 영역으로 안내된다', async ({ page }) => {
    const live = page.locator('#live');

    await addItem(page, '우유');
    await expect(live).toHaveText('우유 추가됨');

    await page.getByRole('checkbox', { name: '우유' }).check();
    await expect(live).toHaveText('우유 완료');

    await page.getByRole('button', { name: '우유 삭제' }).click();
    await expect(live).toHaveText('우유 삭제됨');
  });

  test('키보드만으로 추가하고 체크할 수 있다', async ({ page }) => {
    await page.getByRole('textbox', { name: '살 물건' }).fill('우유');
    await page.keyboard.press('Enter');

    // 입력 후 포커스가 입력란에 남아야 연속 입력이 편하다.
    await expect(page.getByRole('textbox', { name: '살 물건' })).toBeFocused();

    await page.getByRole('checkbox', { name: '우유' }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('checkbox', { name: '우유' })).toBeChecked();
  });
});

test('조작하는 동안 콘솔 오류가 없다', async ({ page }) => {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  await addItem(page, '우유');
  await addItem(page, '식빵');
  await page.getByRole('checkbox', { name: '우유' }).check();
  await page.getByRole('button', { name: '식빵 삭제' }).click();
  await page.getByRole('button', { name: '완료 항목 지우기' }).click();

  await expect.poll(dbItems).toEqual([]);
  await page.reload();
  await waitReady(page);

  expect(errors).toEqual([]);
});
