const API_BASE = "https://api.github.com";

function toQueryString(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  return query.toString();
}

export class GitHubClient {
  constructor({ token, userAgent = "maintainer-radar/1.0" } = {}) {
    this.token = token;
    this.userAgent = userAgent;
  }

  async request(path, params = {}) {
    const query = toQueryString(params);
    const url = `${API_BASE}${path}${query ? `?${query}` : ""}`;

    const headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": this.userAgent,
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const body = await response.text();
      const remaining = response.headers.get("x-ratelimit-remaining");
      const resetAt = response.headers.get("x-ratelimit-reset");

      if (response.status === 403 && remaining === "0") {
        const resetDate = resetAt ? new Date(Number(resetAt) * 1000).toISOString() : "unknown";
        throw new Error(`GitHub API rate limit exceeded. Reset at ${resetDate}`);
      }

      throw new Error(
        `GitHub API ${response.status} for ${path}: ${body.slice(0, 240) || response.statusText}`,
      );
    }

    return response.json();
  }

  async paginate(path, { perPage = 100, maxPages = 10, ...params } = {}) {
    const all = [];

    for (let page = 1; page <= maxPages; page++) {
      const data = await this.request(path, { ...params, per_page: perPage, page });

      if (!Array.isArray(data)) {
        throw new Error(`Expected array response from ${path}`);
      }

      all.push(...data);

      if (data.length < perPage) {
        break;
      }
    }

    return all;
  }
}
