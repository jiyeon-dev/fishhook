'use strict';

// Jira serves description images in two shrunken forms: a REST thumbnail URL
// (wiki markup / legacy attachments) and a Media Services card with a 156px
// crop (Cloud editor). Both must end up as the full-size attachment image.
const test = require('node:test');
const assert = require('node:assert');

const { loadBackground } = require('./helpers/load-background.js');

const bg = loadBackground();
const BASE = 'https://ims.cloud.genians.com';

function parse(json, options = {}) {
  return bg.call(`parseIssueDescription(__json, "${BASE}", __options)`, {
    __json: json,
    __options: options,
  });
}

function paragraph(text) {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function issue(renderedHtml, { attachment = [], adfContent = [paragraph('본문')] } = {}) {
  return {
    fields: {
      summary: 'JIRA-1',
      description: { type: 'doc', version: 1, content: adfContent },
      attachment,
    },
    renderedFields: { description: renderedHtml },
  };
}

const MEDIA_UUID = '93bc017c-338a-42c0-ba77-8b00c1fec909';
const CDN_SRC =
  'https://media-cdn.atlassian.com/file/' +
  MEDIA_UUID +
  '/image/cdn?allowAnimated=true&amp;client=826d59f3&amp;collection=&amp;height=125' +
  '&amp;max-age=2592000&amp;mode=crop&amp;source=mediaCard&amp;token=abc&amp;width=156' +
  '#media-blob-url=true&amp;id=' +
  MEDIA_UUID;

// Trimmed copy of the real Cloud renderedFields markup: MediaGroup wrapper,
// fullscreen button, image, blanket, title box and actions bar.
function mediaCardHtml({ mime = 'image/png', name = 'image (17).png' } = {}) {
  return (
    '<div class="MediaGroup" data-media-vc-wrapper="true">' +
    '<div class="css-vhfmu2" data-media-badges="true"></div>' +
    `<div data-type="file" data-node-type="media" data-id="${MEDIA_UUID}" data-collection=""` +
    ` data-file-name="${name}" data-file-size="12723360" data-file-mime-type="${mime}" data-alt=""` +
    ' data-renderer-start-pos="95">' +
    `<span class="_ca0qidpf"><button type="button" aria-label="Open ${name} in fullscreen">Open ${name}</button></span>` +
    '<div id="newFileExperienceWrapper" data-testid="media-card-view"' +
    ' style="--media-wrapper-width:156px;--media-wrapper-height:125px">' +
    '<div role="presentation"><div data-testid="media-file-card-view">' +
    `<div data-testid="ImageRendererWrapper"><img data-fileid="${MEDIA_UUID}" src="${CDN_SRC}" alt=""></div>` +
    '<div class="media-card-blanket"></div>' +
    `<div id="titleBoxWrapper"><div id="titleBoxHeader">${name}</div>` +
    '<div id="titleBoxFooter">10 Jul 2026, 02:41 PM</div></div>' +
    '</div></div>' +
    '<div id="actionsBarWrapper"><button type="button" aria-label="Download">D</button></div>' +
    '</div></div></div>'
  );
}

const PNG_ATTACHMENT = {
  id: 307961,
  filename: 'image (17).png',
  mimeType: 'image/png',
  content: '/rest/api/3/attachment/content/307961',
};

test('upgrades a REST thumbnail URL to the attachment content URL', () => {
  const result = parse(
    issue(`<p><img src="${BASE}/rest/api/3/attachment/thumbnail/307961" alt="image (17).png"></p>`, {
      attachment: [PNG_ATTACHMENT],
    })
  );

  assert.doesNotMatch(result.html, /attachment\/thumbnail/);
  assert.match(result.html, /src="https:\/\/ims\.cloud\.genians\.com\/rest\/api\/3\/attachment\/content\/307961"/);
  assert.match(result.html, /class="[^"]*fishhook-jira-image/);
  assert.match(result.html, /data-fishhook-media-url="/);
});

test('upgrades a relative thumbnail URL and keeps the surrounding markup', () => {
  const result = parse(
    issue('<p>앞</p><span class="image-wrap"><img src="/secure/thumbnail/307961/_thumb_307961.png" alt="image (17).png"></span><p>뒤</p>', {
      attachment: [PNG_ATTACHMENT],
    })
  );

  assert.match(result.html, /src="https:\/\/ims\.cloud\.genians\.com\/rest\/api\/3\/attachment\/content\/307961"/);
  assert.match(result.html, /<p>앞<\/p>/);
  assert.match(result.html, /<p>뒤<\/p>/);
});

test('drops the thumbnail sizing so the full image is not shrunk back down', () => {
  const result = parse(
    issue(
      '<p><img src="/rest/api/3/attachment/thumbnail/307961" alt="image (17).png" width="200"' +
        ' height="150" style="border: 0; width: 200px; max-height: 150px"' +
        ' srcset="/rest/api/3/attachment/thumbnail/307961 2x"></p>',
      { attachment: [PNG_ATTACHMENT] }
    )
  );

  assert.doesNotMatch(result.html, /\swidth=/);
  assert.doesNotMatch(result.html, /\sheight=/);
  assert.doesNotMatch(result.html, /srcset/);
  assert.doesNotMatch(result.html, /width:\s*200px/);
  assert.doesNotMatch(result.html, /max-height/);
  assert.match(result.html, /style="border: 0"/);
  assert.match(result.html, /content\/307961/);
});

test('falls back to the attachment filename when the thumbnail id is unknown', () => {
  const result = parse(
    issue('<p><img src="/rest/api/3/attachment/thumbnail/999999" alt="image (17).png"></p>', {
      attachment: [PNG_ATTACHMENT],
    })
  );

  assert.match(result.html, /content\/307961"/);
});

test('matches a thumbnail filename that carries the media UUID suffix', () => {
  const result = parse(
    issue(`<p><img src="/rest/api/3/attachment/thumbnail/999999" alt="image (17).png"></p>`, {
      attachment: [
        {
          id: 307961,
          filename: `image (17) (${MEDIA_UUID}).png`,
          mimeType: 'image/png',
          content: '/rest/api/3/attachment/content/307961',
        },
      ],
    })
  );

  assert.match(result.html, /content\/307961"/);
});

test('leaves the thumbnail alone when the filename is ambiguous', () => {
  const result = parse(
    issue('<p><img src="/rest/api/3/attachment/thumbnail/999999" alt="dup.png"></p>', {
      attachment: [
        { id: 1, filename: `dup (${MEDIA_UUID}).png`, mimeType: 'image/png' },
        { id: 2, filename: 'dup (11111111-2222-3333-4444-555555555555).png', mimeType: 'image/png' },
      ],
    })
  );

  assert.match(result.html, /thumbnail\/999999/);
});

test('swaps thumbnail for content when the issue has no attachment list', () => {
  const result = parse(issue('<p><img src="/rest/api/3/attachment/thumbnail/307961" alt=""></p>'));

  assert.match(result.html, /src="https:\/\/ims\.cloud\.genians\.com\/rest\/api\/3\/attachment\/content\/307961"/);
});

test('leaves non-thumbnail images untouched', () => {
  const rendered = '<p><img src="https://example.com/logo.png" alt="logo"></p>';
  const result = parse(issue(rendered));
  assert.strictEqual(result.html, rendered);
});

test('replaces a Media Services card with the full-size attachment image', () => {
  const result = parse(
    issue(`${mediaCardHtml()}<p>카드 뒤 문단</p>`, {
      attachment: [PNG_ATTACHMENT],
      adfContent: [
        {
          type: 'mediaSingle',
          attrs: { width: 546 },
          content: [
            { type: 'media', attrs: { id: MEDIA_UUID, alt: 'image (17).png', type: 'file' } },
          ],
        },
      ],
    })
  );

  assert.match(
    result.html,
    /<img class="fishhook-jira-media fishhook-jira-image" alt="image \(17\)\.png" src="https:\/\/ims\.cloud\.genians\.com\/rest\/api\/3\/attachment\/content\/307961"/
  );
  assert.doesNotMatch(result.html, /media-cdn\.atlassian\.com/);
  assert.doesNotMatch(result.html, /<button\b/);
  assert.doesNotMatch(result.html, /titleBox/);
  assert.doesNotMatch(result.html, /media-wrapper-width/);
  // depth counting must stop at the card's own closing tag
  assert.match(result.html, /<p>카드 뒤 문단<\/p>/);
  assert.doesNotMatch(result.text, /02:41 PM/);
});

test('replaces two cards in the same media group', () => {
  const result = parse(
    issue(`<div>${mediaCardHtml()}${mediaCardHtml({ name: 'second.png' })}</div>`, {
      attachment: [
        PNG_ATTACHMENT,
        { id: 307962, filename: 'second.png', mimeType: 'image/png', content: '/rest/api/3/attachment/content/307962' },
      ],
    })
  );

  assert.match(result.html, /content\/307961/);
  assert.match(result.html, /content\/307962/);
  assert.doesNotMatch(result.html, /media-cdn\.atlassian\.com/);
});

test('falls back to a full-fit CDN URL when the card has no matching attachment', () => {
  const result = parse(issue(mediaCardHtml()));

  assert.match(result.html, /media-cdn\.atlassian\.com/);
  assert.match(result.html, /mode=full-fit/);
  assert.match(result.html, /width=1600/);
  assert.match(result.html, /height=1600/);
  assert.doesNotMatch(result.html, /width=156/);
  assert.doesNotMatch(result.html, /mode=crop/);
  assert.match(result.html, /class="fishhook-jira-media fishhook-jira-image"/);
  assert.doesNotMatch(result.html, /<button\b/);
});

test('honours includeVideo=false for a video card', () => {
  const result = parse(
    issue(mediaCardHtml({ mime: 'video/mp4', name: 'clip.mp4' }), {
      attachment: [
        { id: 307963, filename: 'clip.mp4', mimeType: 'video/mp4', content: '/rest/api/3/attachment/content/307963' },
      ],
    }),
    { includeVideo: false }
  );

  assert.doesNotMatch(result.html, /<video\b/);
  assert.match(result.html, /fishhook-video-placeholder/);
});

test('shows a placeholder for an unmatched video card instead of a CDN still', () => {
  const result = parse(issue(mediaCardHtml({ mime: 'video/mp4', name: 'clip.mp4' })));

  assert.doesNotMatch(result.html, /media-cdn\.atlassian\.com/);
  assert.match(result.html, /fishhook-media-placeholder/);
  assert.match(result.html, /clip\.mp4/);
});
