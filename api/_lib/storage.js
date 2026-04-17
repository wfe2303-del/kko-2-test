var supabaseLib = require('./supabase');

var OPEN_STATUS = 'OPEN';
var RESOLVED_STATUS = 'RESOLVED';
var MANUAL_MATCH_STATUS = 'MANUAL_MATCH';
var EXCLUDED_STAFF_STATUS = 'EXCLUDED_STAFF';

function isConfigured() {
  return supabaseLib.isConfigured();
}

async function health() {
  if(!isConfigured()) {
    return {
      enabled: false,
      ok: false,
      error: 'Supabase is not configured.'
    };
  }

  await supabaseLib.query('kakao_sheet_states', function(query) {
    return query.select('sheet_title', { count: 'exact', head: true });
  });

  return {
    enabled: true,
    ok: true
  };
}

async function listPending(sheetTitle) {
  var normalizedSheetTitle = normalizeText(sheetTitle);
  var rows;

  if(!normalizedSheetTitle) {
    return {
      enabled: true,
      items: [],
      manualRules: []
    };
  }

  rows = await listQueueRows(normalizedSheetTitle);

  return {
    enabled: true,
    items: rows
      .filter(function(row) { return String(row.status || '').trim() === OPEN_STATUS; })
      .map(toQueueEntry)
      .sort(compareByLabel),
    manualRules: rows
      .filter(function(row) { return isManualRuleStatus(row.status); })
      .map(toManualRule)
      .sort(compareByQueueKey)
  };
}

async function syncRun(payload) {
  payload = payload || {};

  var sheetTitle = normalizeText(payload.sheetTitle);
  var nowIso = normalizeText(payload.executedAt) || new Date().toISOString();
  var summary = payload.summary || {};
  var currentUnmatchedItems = Array.isArray(payload.currentUnmatchedItems) ? payload.currentUnmatchedItems : [];
  var resolvedPendingItems = Array.isArray(payload.resolvedPendingItems) ? payload.resolvedPendingItems : [];
  var rows;
  var rowMap;
  var changedRows = [];
  var resolvedCount = 0;
  var openedCount = 0;
  var counts;

  if(!sheetTitle) {
    throw new Error('Sheet title is required.');
  }

  rows = await listQueueRows(sheetTitle);
  rowMap = buildRowMap(rows);

  resolvedPendingItems.forEach(function(rawItem) {
    var item = normalizeQueueItem(rawItem, sheetTitle);
    var existing = rowMap.get(item.queueKey);

    if(!item.queueKey || !existing || isManualRuleStatus(existing.status)) {
      return;
    }

    if(String(existing.status || '').trim() !== RESOLVED_STATUS) {
      resolvedCount += 1;
    }

    existing.status = RESOLVED_STATUS;
    existing.last_seen_at = nowIso;
    existing.resolved_at = nowIso;
    existing.context = item;
    changedRows.push(existing);
  });

  currentUnmatchedItems.forEach(function(rawItem) {
    var item = normalizeQueueItem(rawItem, sheetTitle);
    var existing = rowMap.get(item.queueKey);

    if(!item.queueKey) {
      return;
    }

    if(!existing) {
      existing = createQueueRow(item);
      existing.first_seen_at = nowIso;
      existing.last_seen_at = nowIso;
      existing.attempt_count = 1;
      existing.opened_at = nowIso;
      rowMap.set(item.queueKey, existing);
      rows.push(existing);
      openedCount += 1;
      changedRows.push(existing);
      return;
    }

    existing.sheet_title = item.sheetTitle || existing.sheet_title;
    existing.category = item.category;
    existing.name = item.name;
    existing.name_normalized = item.nameNormalized;
    existing.phone4 = item.phone4;
    existing.label = item.label;
    existing.reason = item.reason;
    existing.last_seen_at = nowIso;
    existing.attempt_count = Number(existing.attempt_count || 0) + 1;
    existing.context = item;

    if(!isManualRuleStatus(existing.status)) {
      if(String(existing.status || '').trim() !== OPEN_STATUS) {
        openedCount += 1;
      }
      existing.status = OPEN_STATUS;
      existing.resolved_at = null;
      existing.resolution_type = '';
      existing.resolution_label = '';
      existing.resolution_target_row = 0;
      existing.resolution_target_name = '';
      existing.resolution_target_phone = '';
      existing.handled_by = '';
      existing.handled_at = null;
    }

    changedRows.push(existing);
  });

  if(changedRows.length) {
    await upsertQueueRows(changedRows);
  }

  counts = summarizeCounts(rows);
  await upsertSheetState({
    sheet_title: sheetTitle,
    snapshot: payload.snapshot || null,
    last_saved_at: nowIso,
    last_snapshot_at: payload.snapshot ? nowIso : null,
    open_count: counts.openCount,
    manual_rule_count: counts.manualRuleCount,
    joined_count: Number(summary.joinedCount || 0),
    left_count: Number(summary.leftCount || 0),
    attending_count: Number(summary.attendingCount || 0),
    final_left_count: Number(summary.finalLeftCount || 0),
    missing_count: Number(summary.missingCount || 0),
    current_unmatched_count: Number(summary.currentUnmatchedCount || 0),
    resolved_pending_count: Number(summary.resolvedPendingCount || 0),
    manual_resolved_count: Number(summary.manualResolvedCount || 0),
    excluded_by_rule_count: Number(summary.excludedByRuleCount || 0)
  });

  return {
    enabled: true,
    synced: true,
    openedCount: openedCount,
    resolvedCount: resolvedCount,
    openCount: counts.openCount,
    manualRuleCount: counts.manualRuleCount
  };
}

async function saveSnapshot(payload) {
  payload = payload || {};

  var sheetTitle = normalizeText(payload.sheetTitle);
  var state;

  if(!sheetTitle) {
    throw new Error('Sheet title is required.');
  }

  state = await getSheetState(sheetTitle);
  await upsertSheetState({
    sheet_title: sheetTitle,
    snapshot: payload.snapshot || null,
    last_saved_at: normalizeText(payload.savedAt) || new Date().toISOString(),
    last_snapshot_at: normalizeText(payload.savedAt) || new Date().toISOString(),
    open_count: Number(state.open_count || 0),
    manual_rule_count: Number(state.manual_rule_count || 0),
    joined_count: Number(state.joined_count || 0),
    left_count: Number(state.left_count || 0),
    attending_count: Number(state.attending_count || 0),
    final_left_count: Number(state.final_left_count || 0),
    missing_count: Number(state.missing_count || 0),
    current_unmatched_count: Number(state.current_unmatched_count || 0),
    resolved_pending_count: Number(state.resolved_pending_count || 0),
    manual_resolved_count: Number(state.manual_resolved_count || 0),
    excluded_by_rule_count: Number(state.excluded_by_rule_count || 0)
  });

  return {
    enabled: true,
    saved: true,
    summary: {
      sheetTitle: sheetTitle,
      snapshotReady: true,
      openCount: Number(state.open_count || 0),
      manualRuleCount: Number(state.manual_rule_count || 0),
      lastSavedAt: normalizeText(payload.savedAt) || new Date().toISOString(),
      lastSnapshotAt: normalizeText(payload.savedAt) || new Date().toISOString()
    }
  };
}

async function applyManualAction(payload) {
  payload = payload || {};

  var sheetTitle = normalizeText(payload.sheetTitle);
  var item = normalizeQueueItem(payload.item, sheetTitle);
  var row = await getQueueRow(item.queueKey);
  var rows;
  var counts;

  if(!sheetTitle) {
    throw new Error('Sheet title is required.');
  }

  if(!row) {
    row = createQueueRow(item);
    row.first_seen_at = normalizeText(payload.savedAt) || new Date().toISOString();
    row.attempt_count = 1;
  }

  applyManualActionToRow(row, item, payload);
  await upsertQueueRows([row]);

  rows = await listQueueRows(sheetTitle);
  counts = summarizeCounts(rows);
  await mergeSheetStateCounts(sheetTitle, counts, normalizeText(payload.savedAt) || new Date().toISOString());

  return {
    enabled: true,
    queueItem: toQueueEntry(row),
    manualRule: toManualRule(row),
    summary: {
      sheetTitle: sheetTitle,
      snapshotReady: !!(await getSheetState(sheetTitle)).snapshot,
      openCount: counts.openCount,
      manualRuleCount: counts.manualRuleCount,
      lastSavedAt: normalizeText(payload.savedAt) || new Date().toISOString(),
      lastSnapshotAt: normalizeText((await getSheetState(sheetTitle)).last_snapshot_at)
    }
  };
}

async function applyManualActionsBatch(payload) {
  payload = payload || {};

  var sheetTitle = normalizeText(payload.sheetTitle);
  var items = Array.isArray(payload.items) ? payload.items : [];
  var rows;
  var rowMap;
  var changedRows = [];
  var counts;
  var state;
  var nowIso;

  if(!sheetTitle) {
    throw new Error('Sheet title is required.');
  }

  if(normalizeText(payload.actionType) !== 'exclude-staff') {
    throw new Error('Unsupported manual batch action.');
  }

  rows = await listQueueRows(sheetTitle);
  rowMap = buildRowMap(rows);
  nowIso = normalizeText(payload.savedAt) || new Date().toISOString();

  items.forEach(function(rawItem) {
    var item = normalizeQueueItem(rawItem, sheetTitle);
    var row = rowMap.get(item.queueKey);

    if(!row) {
      row = createQueueRow(item);
      row.first_seen_at = nowIso;
      row.attempt_count = 1;
      rowMap.set(item.queueKey, row);
      rows.push(row);
    }

    applyManualActionToRow(row, item, {
      actionType: 'exclude-staff',
      actorEmail: payload.actorEmail,
      actorName: payload.actorName,
      savedAt: nowIso
    });
    changedRows.push(row);
  });

  if(changedRows.length) {
    await upsertQueueRows(changedRows);
  }

  counts = summarizeCounts(rows);
  await mergeSheetStateCounts(sheetTitle, counts, nowIso);
  state = await getSheetState(sheetTitle);

  return {
    enabled: true,
    items: changedRows.map(toQueueEntry),
    manualRules: changedRows.map(toManualRule),
    summary: {
      sheetTitle: sheetTitle,
      snapshotReady: !!state.snapshot,
      openCount: counts.openCount,
      manualRuleCount: counts.manualRuleCount,
      lastSavedAt: nowIso,
      lastSnapshotAt: normalizeText(state.last_snapshot_at)
    }
  };
}

async function getStorageOverview() {
  var rows = await supabaseLib.query('kakao_sheet_states', function(query) {
    return query.select('*').order('sheet_title', { ascending: true });
  });

  return {
    enabled: true,
    sheets: (rows || []).map(toSheetSummary)
  };
}

async function getStoredSheetData(sheetTitle) {
  var normalizedSheetTitle = normalizeText(sheetTitle);
  var state;

  if(!normalizedSheetTitle) {
    throw new Error('Sheet title is required.');
  }

  state = await getSheetState(normalizedSheetTitle);

  return {
    enabled: true,
    summary: toSheetSummary(state),
    snapshot: state.snapshot || null
  };
}

function normalizeQueueItem(rawItem, defaultSheetTitle) {
  var name = normalizeText(rawItem && rawItem.name);
  var nameNormalized = normalizeName((rawItem && (rawItem.nameNormalized || rawItem.name)) || '');
  var phone4 = last4Digits((rawItem && (rawItem.phone4 || rawItem.phone)) || '');
  var category = normalizeText(rawItem && rawItem.category) || 'outside-roster';
  var sheetTitle = normalizeText(rawItem && rawItem.sheetTitle) || normalizeText(defaultSheetTitle);

  return {
    queueKey: buildQueueKey(sheetTitle, nameNormalized, phone4, category),
    sheetTitle: sheetTitle,
    category: category,
    name: name || nameNormalized,
    nameNormalized: nameNormalized,
    phone4: phone4,
    label: normalizeText(rawItem && rawItem.label) || formatLabel(name || nameNormalized, phone4),
    reason: normalizeText(rawItem && rawItem.reason)
  };
}

function createQueueRow(item) {
  return {
    queue_key: item.queueKey,
    sheet_title: item.sheetTitle,
    status: OPEN_STATUS,
    category: item.category,
    name: item.name,
    name_normalized: item.nameNormalized,
    phone4: item.phone4,
    label: item.label,
    reason: item.reason,
    attempt_count: 0,
    first_seen_at: null,
    last_seen_at: null,
    opened_at: null,
    resolved_at: null,
    resolution_type: '',
    resolution_label: '',
    resolution_target_row: 0,
    resolution_target_name: '',
    resolution_target_phone: '',
    handled_by: '',
    handled_at: null,
    context: item
  };
}

function applyManualActionToRow(row, item, payload) {
  var nowIso = normalizeText(payload.savedAt) || new Date().toISOString();
  var targetRow = payload.targetRow || {};
  var actionType = normalizeText(payload.actionType);

  row.sheet_title = item.sheetTitle;
  row.category = item.category;
  row.name = item.name;
  row.name_normalized = item.nameNormalized;
  row.phone4 = item.phone4;
  row.label = item.label;
  row.reason = item.reason;
  row.last_seen_at = nowIso;
  row.context = item;
  row.handled_by = normalizeText(payload.actorName || payload.actorEmail);
  row.handled_at = nowIso;
  row.resolved_at = nowIso;

  if(actionType === 'match-student') {
    if(!targetRow || !targetRow.rowNumber) {
      throw new Error('Target row is required for match-student.');
    }

    row.status = MANUAL_MATCH_STATUS;
    row.resolution_type = 'MATCH_ROSTER';
    row.resolution_label = formatLabel(normalizeText(targetRow.name), targetRow.phone);
    row.resolution_target_row = Number(targetRow.rowNumber || 0);
    row.resolution_target_name = normalizeText(targetRow.name);
    row.resolution_target_phone = normalizeText(targetRow.phone);
    return;
  }

  if(actionType === 'exclude-staff') {
    row.status = EXCLUDED_STAFF_STATUS;
    row.resolution_type = 'EXCLUDE_STAFF';
    row.resolution_label = '코칭스태프 제외';
    row.resolution_target_row = 0;
    row.resolution_target_name = '';
    row.resolution_target_phone = '';
    return;
  }

  throw new Error('Unsupported manual action.');
}

function toQueueEntry(row) {
  return {
    queueKey: row.queue_key,
    sheetTitle: row.sheet_title,
    status: row.status,
    category: row.category,
    label: row.label,
    reason: row.reason,
    attemptCount: Number(row.attempt_count || 0),
    firstSeenAt: normalizeText(row.first_seen_at),
    lastSeenAt: normalizeText(row.last_seen_at),
    resolutionLabel: normalizeText(row.resolution_label),
    handledBy: normalizeText(row.handled_by),
    handledAt: normalizeText(row.handled_at)
  };
}

function toManualRule(row) {
  return {
    queueKey: row.queue_key,
    status: row.status,
    actionType: row.status === MANUAL_MATCH_STATUS ? 'match-student' : 'exclude-staff',
    reason: row.reason || row.resolution_label || '',
    resolutionLabel: normalizeText(row.resolution_label),
    targetRowNumber: Number(row.resolution_target_row || 0),
    targetName: normalizeText(row.resolution_target_name),
    targetPhone4: last4Digits(row.resolution_target_phone)
  };
}

function toSheetSummary(row) {
  row = row || {};
  return {
    sheetTitle: normalizeText(row.sheet_title),
    snapshotReady: !!row.snapshot,
    openCount: Number(row.open_count || 0),
    manualRuleCount: Number(row.manual_rule_count || 0),
    lastSavedAt: normalizeText(row.last_saved_at),
    lastSnapshotAt: normalizeText(row.last_snapshot_at)
  };
}

function summarizeCounts(rows) {
  return (rows || []).reduce(function(counts, row) {
    if(String(row.status || '').trim() === OPEN_STATUS) {
      counts.openCount += 1;
    }
    if(isManualRuleStatus(row.status)) {
      counts.manualRuleCount += 1;
    }
    return counts;
  }, {
    openCount: 0,
    manualRuleCount: 0
  });
}

function isManualRuleStatus(status) {
  var value = normalizeText(status);
  return value === MANUAL_MATCH_STATUS || value === EXCLUDED_STAFF_STATUS;
}

async function listQueueRows(sheetTitle) {
  return supabaseLib.query('kakao_queue_items', function(query) {
    return query.select('*').eq('sheet_title', sheetTitle);
  });
}

async function getQueueRow(queueKey) {
  var rows = await supabaseLib.query('kakao_queue_items', function(query) {
    return query.select('*').eq('queue_key', queueKey).limit(1);
  });

  return rows && rows[0] ? rows[0] : null;
}

async function getSheetState(sheetTitle) {
  var rows = await supabaseLib.query('kakao_sheet_states', function(query) {
    return query.select('*').eq('sheet_title', sheetTitle).limit(1);
  });

  if(rows && rows[0]) {
    return rows[0];
  }

  return {
    sheet_title: sheetTitle,
    snapshot: null,
    open_count: 0,
    manual_rule_count: 0,
    last_saved_at: null,
    last_snapshot_at: null,
    joined_count: 0,
    left_count: 0,
    attending_count: 0,
    final_left_count: 0,
    missing_count: 0,
    current_unmatched_count: 0,
    resolved_pending_count: 0,
    manual_resolved_count: 0,
    excluded_by_rule_count: 0
  };
}

async function upsertQueueRows(rows) {
  if(!rows || !rows.length) {
    return [];
  }

  return supabaseLib.query('kakao_queue_items', function(query) {
    return query.upsert(rows, { onConflict: 'queue_key' }).select();
  });
}

async function upsertSheetState(row) {
  return supabaseLib.query('kakao_sheet_states', function(query) {
    return query.upsert([row], { onConflict: 'sheet_title' }).select();
  });
}

async function mergeSheetStateCounts(sheetTitle, counts, lastSavedAt) {
  var state = await getSheetState(sheetTitle);
  return upsertSheetState({
    sheet_title: sheetTitle,
    snapshot: state.snapshot || null,
    last_saved_at: lastSavedAt || state.last_saved_at || new Date().toISOString(),
    last_snapshot_at: state.last_snapshot_at || null,
    open_count: Number(counts.openCount || 0),
    manual_rule_count: Number(counts.manualRuleCount || 0),
    joined_count: Number(state.joined_count || 0),
    left_count: Number(state.left_count || 0),
    attending_count: Number(state.attending_count || 0),
    final_left_count: Number(state.final_left_count || 0),
    missing_count: Number(state.missing_count || 0),
    current_unmatched_count: Number(state.current_unmatched_count || 0),
    resolved_pending_count: Number(state.resolved_pending_count || 0),
    manual_resolved_count: Number(state.manual_resolved_count || 0),
    excluded_by_rule_count: Number(state.excluded_by_rule_count || 0)
  });
}

function buildRowMap(rows) {
  return new Map((rows || []).map(function(row) {
    return [String(row.queue_key || '').trim(), row];
  }));
}

function compareByLabel(left, right) {
  return String(left.label || '').localeCompare(String(right.label || ''), 'ko');
}

function compareByQueueKey(left, right) {
  return String(left.queueKey || '').localeCompare(String(right.queueKey || ''), 'ko');
}

function buildQueueKey(sheetTitle, nameNormalized, phone4, category) {
  return [
    normalizeText(sheetTitle),
    normalizeText(nameNormalized),
    normalizeText(phone4),
    normalizeText(category)
  ].join('::');
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeName(value) {
  return normalizeText(value)
    .replace(/[\s]*[\(\[\{][^)\]\}]*[\)\]\}]\s*$/, '')
    .replace(/[/_\-\s]+$/, '')
    .replace(/\s+/g, ' ');
}

function digitsOnly(value) {
  return String(value || '').replace(/\D+/g, '');
}

function last4Digits(value) {
  return digitsOnly(value).slice(-4);
}

function formatLabel(name, phone4) {
  var digits = last4Digits(phone4);
  return digits ? normalizeText(name) + '/' + digits : normalizeText(name);
}

module.exports = {
  applyManualAction: applyManualAction,
  applyManualActionsBatch: applyManualActionsBatch,
  getStorageOverview: getStorageOverview,
  getStoredSheetData: getStoredSheetData,
  health: health,
  isConfigured: isConfigured,
  listPending: listPending,
  saveSnapshot: saveSnapshot,
  syncRun: syncRun
};
