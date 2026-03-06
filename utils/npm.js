import axios from "axios";

const NPM_URL = process.env.NPM_URL;
const IDENTITY = process.env.NPM_IDENTITY;
const SECRET = process.env.NPM_SECRET;

let tokenCache = null;
let tokenCacheExpiry = 0;

async function getToken() {
  if (tokenCache && Date.now() < tokenCacheExpiry) return tokenCache;

  const r = await axios.post(`${NPM_URL}/api/tokens`, {
    identity: IDENTITY,
    secret: SECRET
  });

  tokenCache = r.data.token;
  tokenCacheExpiry = Date.now() + 20 * 60 * 1000;
  return tokenCache;
}

async function api(method, path, data) {
  const token = await getToken();
  return axios({
    method,
    url: `${NPM_URL}${path}`,
    data,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });
}

export async function createProxyHost(domain, host, port) {
  const r = await api("POST", "/api/nginx/proxy-hosts", {
    domain_names: [domain],
    forward_scheme: "http",
    forward_host: host,
    forward_port: Number(port),
    access_list_id: "0",
    certificate_id: 0,
    ssl_forced: false,
    block_exploits: true,
    allow_websocket_upgrade: true,
    enabled: true,
    meta: { letsencrypt_agree: true },
    locations: []
  });

  const id = r.data?.id ?? r.data?.data?.id;
  if (!id) throw new Error("NPM create failed: missing id");
  return id;
}

export async function deleteProxyHost(id) {
  await api("DELETE", `/api/nginx/proxy-hosts/${id}`);
}

export async function getProxyHost(id) {
  const r = await api("GET", `/api/nginx/proxy-hosts/${id}`);
  return r.data;
}

export async function updateProxyHost(id, patch) {
  const current = await getProxyHost(id);

  const payload = {
    ...current,
    ...patch
  };

  payload.id = id;

  const r = await api("PUT", `/api/nginx/proxy-hosts/${id}`, payload);
  return r.data;
}

export async function findCertificateForDomain(domain) {
  const r = await api("GET", "/api/nginx/certificates?per_page=200");
  const list = r.data?.data || r.data || [];

  for (const item of list) {
    const cert = item?.attributes || item;
    const domains = cert?.domain_names || cert?.domains || [];
    if (Array.isArray(domains) && domains.includes(domain)) {
      return cert.id;
    }
  }
  return null;
}

export async function createLetsEncryptCertificate(domain) {
  const r = await api("POST", "/api/nginx/certificates", {
    provider: "letsencrypt",
    domain_names: [domain],
    meta: {
      letsencrypt_email: IDENTITY,
      letsencrypt_agree: true,
      dns_challenge: false
    }
  });

  const id = r.data?.id ?? r.data?.data?.id;
  if (!id) throw new Error("LE cert create failed: missing id");
  return id;
}

export async function ensureLetsEncrypt(domain) {
  const existing = await findCertificateForDomain(domain);
  if (existing) return existing;
  return await createLetsEncryptCertificate(domain);
}
