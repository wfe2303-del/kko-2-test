var fs = require('fs');
var path = require('path');
var googleapis = require('googleapis');

var google = googleapis.google;
var sheetTitlesCache = new Map();

function isConfigured() {
  try {
    return !!(
      getAttendanceSpreadsheetId() &&
      loadServiceAccountCredentials()
    );
  } catch (error) {
    return false;
  }
}

function getAttendanceSpreadsheetId() {
  return String(process.env.KAKAO_CHECK_SPREADSHEET_ID || '').trim();
}

async function listSheetTitles(spreadsheetId) {
  var cacheKey = String(spreadsheetId || '').trim();
  var cached = getCacheEntry(cacheKey);
  var sheetsClient;
  var response;

  if(cached) {
    return cached.slice();
  }

  sheetsClient = await getSheetsClient();
  response = await sheetsClient.spreadsheets.get({
    spreadsheetId: spreadsheetId,
    fields: 'sheets.properties.title'
  });

  var titles = ((response && response.data && response.data.sheets) || []).map(function(sheet) {
    return String(sheet && sheet.properties && sheet.properties.title || '').trim();
  }).filter(Boolean);

  setCacheEntry(cacheKey, titles, 5 * 60 * 1000);
  return titles.slice();
}

async function loadRosterRows(options) {
  var spreadsheetId = String(options && options.spreadsheetId || '').trim();
  var sheetTitle = String(options && options.sheetTitle || '').trim();
  var startRow = Number(options && options.startRow || 2);
  var targetRoleText = normalizeText(options && options.targetRoleText);
  var allowRoleFallback = !!(options && options.allowRoleFallback);
  var columns = options && options.columns || {};
  var nameColumn = normalizeColumn(columns.name || 'C');
  var phoneColumn = normalizeColumn(columns.phone || 'D');
  var roleColumn = normalizeColumn(columns.role || 'N');
  var statusColumn = normalizeColumn(columns.status || 'M');
  var minColumn = getMinColumn([nameColumn, phoneColumn, roleColumn, statusColumn]);
  var maxColumn = getMaxColumn([nameColumn, phoneColumn, roleColumn, statusColumn]);
  var sheetsClient = await getSheetsClient();
  var range = buildSheetRange(sheetTitle, minColumn + startRow + ':' + maxColumn);
  var response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: spreadsheetId,
    range: range,
    majorDimension: 'ROWS'
  });
  var values = response && response.data && Array.isArray(response.data.values) ? response.data.values : [];
  var nameIndex = columnToNumber(nameColumn) - columnToNumber(minColumn);
  var phoneIndex = columnToNumber(phoneColumn) - columnToNumber(minColumn);
  var roleIndex = columnToNumber(roleColumn) - columnToNumber(minColumn);
  var availableRoles = new Set();
  var matchedRows = [];
  var fallbackRows = [];

  values.forEach(function(row, index) {
    var name = normalizeText(row && row[nameIndex]);
    var phone = normalizeText(row && row[phoneIndex]);
    var role = normalizeText(row && row[roleIndex]);
    var rowData;

    if(role) {
      availableRoles.add(role);
    }

    if(!name) {
      return;
    }

    rowData = {
      rowNumber: startRow + index,
      sheetTitle: sheetTitle,
      name: name,
      phone: phone,
      nameNormalized: normalizeName(name)
    };

    fallbackRows.push(rowData);
    if(!targetRoleText || normalizeText(role) === targetRoleText) {
      matchedRows.push(rowData);
    }
  });

  return {
    rows: matchedRows.length ? matchedRows : (allowRoleFallback && targetRoleText ? fallbackRows : matchedRows),
    fallbackUsed: !!(allowRoleFallback && targetRoleText && !matchedRows.length && fallbackRows.length),
    roleFilterApplied: !!targetRoleText,
    matchedRoleCount: matchedRows.length,
    availableRoles: Array.from(availableRoles).sort(function(left, right) {
      return left.localeCompare(right, 'ko');
    })
  };
}

async function writeUpdates(options) {
  var spreadsheetId = String(options && options.spreadsheetId || '').trim();
  var updates = Array.isArray(options && options.updates) ? options.updates : [];
  var sheetsClient = await getSheetsClient();
  var data = updates.filter(function(item) {
    return item && item.range && Array.isArray(item.values);
  }).map(function(item) {
    return {
      range: item.range,
      values: item.values
    };
  });

  if(!data.length) {
    return { totalUpdatedCells: 0 };
  }

  await sheetsClient.spreadsheets.values.batchUpdate({
    spreadsheetId: spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: data
    }
  });

  return {
    totalUpdatedCells: data.reduce(function(total, item) {
      return total + countCells(item.values);
    }, 0)
  };
}

async function getSheetsClient() {
  var credentials = loadServiceAccountCredentials();
  var auth;

  if(!credentials) {
    throw new Error('Google Sheets credentials are not configured. Set KAKAO_CHECK_GOOGLE_SERVICE_ACCOUNT_FILE, KAKAO_CHECK_GOOGLE_SERVICE_ACCOUNT_JSON, or KAKAO_CHECK_GOOGLE_SERVICE_ACCOUNT_JSON_B64.');
  }

  auth = new google.auth.GoogleAuth({
    credentials: credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  return google.sheets({
    version: 'v4',
    auth: auth
  });
}

function loadServiceAccountCredentials() {
  var inlineJson = String(process.env.KAKAO_CHECK_GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();
  var inlineJsonBase64 = String(process.env.KAKAO_CHECK_GOOGLE_SERVICE_ACCOUNT_JSON_B64 || '').trim();
  var filePath = String(process.env.KAKAO_CHECK_GOOGLE_SERVICE_ACCOUNT_FILE || '').trim();
  var raw = '';

  try {
    if(inlineJson) {
      raw = inlineJson;
    } else if(inlineJsonBase64) {
      raw = Buffer.from(inlineJsonBase64, 'base64').toString('utf8');
    } else if(filePath) {
      raw = fs.readFileSync(path.resolve(filePath), 'utf8');
    } else {
      return null;
    }

    return JSON.parse(raw);
  } catch (error) {
    throw new Error('Failed to load Google service account credentials.');
  }
}

function getCacheEntry(key) {
  var entry = sheetTitlesCache.get(key);
  if(!entry) {
    return null;
  }

  if(entry.expiresAt < Date.now()) {
    sheetTitlesCache.delete(key);
    return null;
  }

  return entry.value;
}

function setCacheEntry(key, value, ttlMs) {
  sheetTitlesCache.set(key, {
    value: Array.isArray(value) ? value.slice() : value,
    expiresAt: Date.now() + Number(ttlMs || 0)
  });
}

function buildSheetRange(sheetTitle, suffix) {
  var value = String(sheetTitle || '').trim();
  if(/[!' ]/.test(value)) {
    value = "'" + value.replace(/'/g, "''") + "'";
  }
  return value + '!' + suffix;
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

function normalizeColumn(value) {
  return String(value || '').trim().toUpperCase();
}

function getMinColumn(columns) {
  return columns.slice().sort(function(left, right) {
    return columnToNumber(left) - columnToNumber(right);
  })[0];
}

function getMaxColumn(columns) {
  return columns.slice().sort(function(left, right) {
    return columnToNumber(right) - columnToNumber(left);
  })[0];
}

function columnToNumber(column) {
  return String(column || '').trim().split('').reduce(function(total, character) {
    var code = character.charCodeAt(0);
    if(code < 65 || code > 90) {
      return total;
    }
    return (total * 26) + (code - 64);
  }, 0);
}

function countCells(values) {
  return (Array.isArray(values) ? values : []).reduce(function(total, row) {
    return total + (Array.isArray(row) ? row.length : 0);
  }, 0);
}

module.exports = {
  getAttendanceSpreadsheetId: getAttendanceSpreadsheetId,
  isConfigured: isConfigured,
  listSheetTitles: listSheetTitles,
  loadRosterRows: loadRosterRows,
  writeUpdates: writeUpdates
};
