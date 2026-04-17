var supabase = require('@supabase/supabase-js');

var createClient = supabase.createClient;
var client = null;

function isConfigured() {
  return !!(getUrl() && getServiceRoleKey());
}

function getUrl() {
  return String(
    process.env.KAKAO_CHECK_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).trim();
}

function getServiceRoleKey() {
  return String(
    process.env.KAKAO_CHECK_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  ).trim();
}

function getClient() {
  if(client) {
    return client;
  }

  if(!isConfigured()) {
    throw new Error('Supabase is not configured. Set KAKAO_CHECK_SUPABASE_URL and KAKAO_CHECK_SUPABASE_SERVICE_ROLE_KEY.');
  }

  client = createClient(getUrl(), getServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return client;
}

async function query(tableName, builder) {
  var queryBuilder = getClient().from(tableName);
  var result = await builder(queryBuilder);
  var error = result && result.error;

  if(error) {
    throw new Error(error.message || ('Supabase query failed for ' + tableName + '.'));
  }

  return result && result.data ? result.data : [];
}

module.exports = {
  getClient: getClient,
  getServiceRoleKey: getServiceRoleKey,
  getUrl: getUrl,
  isConfigured: isConfigured,
  query: query
};
