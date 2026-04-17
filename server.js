var express = require('express');
var path = require('path');
var dotenv = require('dotenv');

dotenv.config();
dotenv.config({ path: path.join(__dirname, '.env.local'), override: true });

var app = express();
var sessionHandler = require('./api/session');
var runtimeConfigHandler = require('./api/runtime-config');
var sheetsHandler = require('./api/sheets');
var matchRecordsHandler = require('./api/match-records');

app.set('trust proxy', true);
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: false, limit: '20mb' }));

function wrap(handler) {
  return function(req, res, next) {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

app.all('/api/session', wrap(sessionHandler));
app.all('/api/runtime-config', wrap(runtimeConfigHandler));
app.all('/api/sheets', wrap(sheetsHandler));
app.all('/api/match-records', wrap(matchRecordsHandler));

app.use('/assets', express.static(path.join(__dirname, 'assets'), { fallthrough: false }));
app.use('/js', express.static(path.join(__dirname, 'js'), { fallthrough: false }));

app.get('/styles.css', function(req, res) {
  res.sendFile(path.join(__dirname, 'styles.css'));
});

app.get(['/', '/index.html'], function(req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use(function(req, res) {
  res.status(404).json({ error: 'Not found.' });
});

app.use(function(error, req, res, next) {
  if(res.headersSent) {
    next(error);
    return;
  }

  res.status(Number(error && error.statusCode) || 500).json({
    error: error && error.message ? error.message : 'Internal server error.'
  });
});

var port = Number(process.env.PORT || 3000);
app.listen(port, function() {
  console.log('Kakao Check server listening on http://0.0.0.0:' + port);
});
