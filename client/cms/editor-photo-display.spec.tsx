// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { Render } from '@puckeditor/core/rsc';
import { expect, test, vi } from 'vitest';
import config from '../../src/puck.config';
import BulkaPage from './BulkaPage';
import { SiteRuntimeContext } from './SiteRuntimeContext';
import { validatePuckPage } from './content-model';
import { createSeedPage } from './seed';
import type { BulkaPageData } from './types';

const frameSource = 'blob:' + window.location.origin + '/45a3eb91-c01c-44b8-815f-d40672946879';
const frameThumbnail = 'blob:' + window.location.origin + '/45a3eb91-c01c-44b8-815f-d40672946880';

function heroPage() {
  const page: BulkaPageData = createSeedPage('en').content.puckData;
  page.content = page.content.filter(block => block.type === 'Hero');
  return { page, photo: page.content[0].props.photos!.ps_portrait };
}

test.each(['missing', 'empty'])('static images reject a draft object URL with a %s thumbnail', thumb => {
  const { page, photo } = heroPage();
  photo.src = frameSource;
  if (thumb === 'missing') delete photo.thumbSrc;
  else photo.thumbSrc = '';
  expect(validatePuckPage(page).some(error => /image URL/.test(error))).toBe(true);
  expect(renderToStaticMarkup(<Render config={config} data={page} />)).not.toContain(frameSource);
  expect(renderToStaticMarkup(<BulkaPage pages={{ en: page }} initialLanguage="en" />)).not.toContain(frameSource);
});

test('section photos keep the edited source in the mounted editor render only', async () => {
  const { page, photo } = heroPage();
  photo.src = '/assets/selected-portrait.webp';
  expect(validatePuckPage(page)).toEqual([]);

  const mount = document.createElement('div');
  document.body.append(mount);
  const root = createRoot(mount);
  const portrait = () => mount.querySelector<HTMLImageElement>('#hero [data-gallery-image] img')?.getAttribute('src');
  const before = JSON.stringify(page);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  try {
    await act(async () => { root.render(<Render config={config} data={page} />); });
    expect(portrait()).toBe(photo.src);
    expect(JSON.stringify(page)).toBe(before);

    const displayed = structuredClone(page);
    const selection = displayed.content[0].props.photos!.ps_portrait;
    selection.src = frameSource;
    const beforeDisplay = JSON.stringify(displayed);
    await act(async () => { root.render(<Render config={config} data={displayed} />); });
    expect(portrait()).toBe(frameSource);
    expect(JSON.stringify(displayed)).toBe(beforeDisplay);

    const next = structuredClone(displayed);
    next.content[0].props.photos!.ps_portrait.thumbSrc = frameThumbnail;
    await act(async () => { root.render(<Render config={config} data={next} />); });
    expect(portrait()).toBe(frameThumbnail);

    await act(async () => {
      root.render(<SiteRuntimeContext.Provider value={true}>
        <Render config={config} data={displayed} />
      </SiteRuntimeContext.Provider>);
    });
    expect(portrait()).toBeTruthy();
    expect(portrait()).not.toBe(frameSource);
    expect(JSON.stringify(displayed)).toBe(beforeDisplay);
  } finally {
    await act(async () => { root.unmount(); });
    mount.remove();
    vi.unstubAllGlobals();
  }
});
