(function () {
  'use strict';

  if (window.FishHookIssueMeta) return;

  // Issue type / status / Fix versions / Affects versions. Shared so the
  // Objectives banner and the Description preview panel show the same fields
  // with the same markup — only the surrounding container differs.
  const STATUS_CATEGORIES = new Set(['new', 'indeterminate', 'done']);

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildVersionTag(version, variant) {
    const name = escapeHtml(String(version?.name || ''));
    const className = `fishhook-version-tag fishhook-version-tag--${variant}`;
    if (version?.url) {
      return (
        `<a class="${className}" href="${escapeHtml(version.url)}" ` +
        `target="_blank" rel="noopener noreferrer">${name}</a>`
      );
    }
    return `<span class="${className}">${name}</span>`;
  }

  function buildVersionGroup(label, versions, variant) {
    const list = Array.isArray(versions) ? versions.filter((item) => item && item.name) : [];
    const value = list.length
      ? list.map((version) => buildVersionTag(version, variant)).join('')
      : `<span class="fishhook-issue-meta__versions-empty">-</span>`;
    return (
      `<span class="fishhook-issue-meta__versions">` +
      `<span class="fishhook-issue-meta__versions-label">${escapeHtml(label)}</span>` +
      value +
      `</span>`
    );
  }

  function buildIssueType(issueType) {
    const name = String(issueType?.name || '').trim();
    if (!name) return '';
    return `<span class="fishhook-issue-meta__type">${escapeHtml(name)}</span>`;
  }

  // The status name is localized per Jira instance, so the lozenge colour comes
  // from `statusCategory.key` instead of matching on the name.
  function buildStatus(status) {
    const name = String(status?.name || '').trim();
    if (!name) return '';
    const category = String(status?.category || '').trim().toLowerCase();
    const variant = STATUS_CATEGORIES.has(category) ? category : 'unknown';
    return (
      `<span class="fishhook-issue-meta__status fishhook-issue-meta__status--${variant}">` +
      `${escapeHtml(name)}</span>`
    );
  }

  // Version groups always render, with a "-" placeholder when empty, so the row
  // keeps the same shape across issues. Issue type and status are dropped when
  // absent rather than showing an empty lozenge.
  //
  // Each entry keeps its `key` so a caller can group them — the narrow preview
  // panel puts `issue` on one line and `versions` on the next, while the banner
  // renders everything inline.
  function buildEntries(data, labels) {
    const meta = data || {};
    const text = labels || {};
    return [
      { key: 'issueType', group: 'issue', html: buildIssueType(meta.issueType) },
      { key: 'status', group: 'issue', html: buildStatus(meta.status) },
      {
        key: 'fixVersions',
        group: 'versions',
        html: buildVersionGroup(text.fixVersions || 'Fix versions', meta.fixVersions, 'fix'),
      },
      {
        key: 'affectsVersions',
        group: 'versions',
        html: buildVersionGroup(
          text.affectsVersions || 'Affects versions',
          meta.affectsVersions,
          'affects'
        ),
      },
    ].filter((entry) => entry.html);
  }

  function buildSegments(data, labels) {
    return buildEntries(data, labels).map((entry) => entry.html);
  }

  // `buildSegments` always emits the two version groups, so callers cannot use an
  // empty result to detect "nothing to show" — a failed fetch (no Jira session)
  // would otherwise render a row of bare "-" placeholders.
  function hasFields(data) {
    const meta = data || {};
    return Boolean(
      String(meta.issueType?.name || '').trim() ||
        String(meta.status?.name || '').trim() ||
        (Array.isArray(meta.fixVersions) && meta.fixVersions.length) ||
        (Array.isArray(meta.affectsVersions) && meta.affectsVersions.length)
    );
  }

  window.FishHookIssueMeta = {
    buildSegments,
    buildEntries,
    hasFields,
    buildStatus,
    buildIssueType,
    buildVersionGroup,
  };
})();
