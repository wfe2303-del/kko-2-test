var storage = require('./_lib/storage');

module.exports = function handler(req, res) {
  function parseList(value) {
    return String(value || '')
      .split(',')
      .map(function(item){ return item.trim(); })
      .filter(Boolean);
  }

  var payload = {
    matchHistoryEnabled: storage.isConfigured(),
    allowedOrigins: parseList(process.env.KAKAO_CHECK_ALLOWED_ORIGINS)
  };

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');

  if(typeof res.status === 'function'){
    res.status(200).json(payload);
    return;
  }

  res.statusCode = 200;
  res.end(JSON.stringify(payload));
};
