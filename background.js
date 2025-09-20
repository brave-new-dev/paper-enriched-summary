// Background service worker for Arxiv PDF Saver extension

// Create or refresh the context menu (needed because MV3 service workers are ephemeral)
function createOrUpdateContextMenu() {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "saveArxivPdfNow",
        title: "Save Paper as PDF",
        contexts: ["page"],
        documentUrlPatterns: ["https://arxiv.org/*"]
      });
      chrome.contextMenus.create({
        id: "saveArxivReferencesNow",
        title: "Save References",
        contexts: ["page"],
        documentUrlPatterns: ["https://arxiv.org/*"]
      });
      chrome.contextMenus.create({
        id: "saveArxivReferencesJsonNow",
        title: "Save References (JSON)",
        contexts: ["page"],
        documentUrlPatterns: ["https://arxiv.org/*"]
      });
    });
  } catch (e) {
    // Some browsers may throw if no menus exist yet; log and continue
    console.warn("Context menu setup warning:", e);
  }
}

// Ensure menu exists on install and on startup
chrome.runtime.onInstalled.addListener(createOrUpdateContextMenu);
if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(createOrUpdateContextMenu);
}
// Also try to create on worker boot
createOrUpdateContextMenu();

// Keep a short-lived map of desired filenames by URL to enforce naming in Save As dialog
const desiredFilenames = Object.create(null);
function rememberDesiredFilename(url, filename) {
  desiredFilenames[url] = filename;
  // Auto-expire to avoid leaks in ephemeral workers
  setTimeout(() => { delete desiredFilenames[url]; }, 60_000);
}

// Force our suggested filename via onDeterminingFilename
if (chrome.downloads && chrome.downloads.onDeterminingFilename) {
  chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    try {
      const wanted = desiredFilenames[item.url];
      if (wanted) {
        // Remove once used so subsequent downloads of same URL don't reuse
        delete desiredFilenames[item.url];
        suggest({ filename: wanted, conflictAction: 'uniquify' });
        return;
      }
    } catch (_) {}
    // Default behavior
    suggest({ filename: item.filename, conflictAction: 'uniquify' });
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "saveArxivPdfNow") {
    try {
      if (!tab || !tab.url) return;
      await saveCurrentPaperPdf(tab);
      
    } catch (error) {
      console.error("Error downloading PDF:", error);
      showNotification("Error", "Failed to process arxiv link");
    }
  } else if (info.menuItemId === "saveArxivReferencesNow") {
    try {
      if (!tab || !tab.url) return;
      await saveCurrentPaperReferences(tab);
    } catch (error) {
      console.error("Error saving references:", error);
      showNotification("Error", "Failed to save references");
    }
  } else if (info.menuItemId === "saveArxivReferencesJsonNow") {
    try {
      if (!tab || !tab.url) return;
      await saveCurrentPaperReferencesJson(tab);
    } catch (error) {
      console.error("Error saving references JSON:", error);
      showNotification("Error", "Failed to save references JSON");
    }
  }
});

// Toolbar button action: download current page's paper
if (chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(async (tab) => {
    try {
      if (!tab || !tab.url || !/https?:\/\/arxiv\.org\//i.test(tab.url)) {
        showNotification("Not on arXiv", "Open an arxiv.org page first");
        return;
      }

      await saveCurrentPaperPdf(tab);
    } catch (e) {
      console.error("Toolbar click error:", e);
    }
  });
}

async function getTitleFromTabOrFallback(tabId, tabTitle) {
  try {
    // Ask the content script on current page for head > title
    const t = await chrome.tabs.sendMessage(tabId, { action: 'getHeadTitle' }).catch(() => null);
    if (t && typeof t === 'string' && t.trim()) return t.trim();
  } catch (_) {}

  // Fallback to tab title
  if (tabTitle && tabTitle.trim()) return tabTitle.trim();
  return 'arxiv_page';
}

async function saveCurrentPaperPdf(tab) {
  const url = tab.url;
  // Determine paper ID first from URL
  const idFromUrl = extractPaperId(url);
  // Get head title from the tab (works on abs pages)
  const headTitle = await getTitleFromTabOrFallback(tab.id, tab.title);
  // If headTitle includes [ID], prefer that ID
  const parsed = parseArxivHeadTitle(headTitle);
  const paperId = parsed?.id || idFromUrl;
  let titlePart = parsed?.title || headTitle;
  if (!paperId) {
    showNotification("Error", "Could not determine paper ID");
    return;
  }
  // If title looks like a filename or just an ID, try fetching from abs page
  if (!titlePart || /\.pdf\s*$/i.test(titlePart) || /^\s*\d{4}\.\d{4,5}(?:v\d+)?\s*$/i.test(titlePart)) {
    try {
      const better = await tryGetTitleFromAbsPage(paperId);
      if (better && better.trim()) titlePart = better.trim();
    } catch (_) { /* ignore */ }
  }
  // Build safe filename with ID and title
  const filename = buildPdfFilename(paperId, titlePart);
  const pdfUrl = `https://arxiv.org/pdf/${paperId}.pdf`;
  // Remember desired filename and let onDeterminingFilename enforce it
  rememberDesiredFilename(pdfUrl, filename);
  chrome.downloads.download({ url: pdfUrl, saveAs: true }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error("Download failed:", chrome.runtime.lastError);
      showNotification("Download failed", chrome.runtime.lastError.message);
    } else {
      updateDownloadCount();
      showNotification("Download started", `Saving: ${filename}`);
    }
  });
}

// Save references for current arXiv paper as CSV
async function saveCurrentPaperReferences(tab) {
  const url = tab.url;
  const idFromUrl = extractPaperId(url);
  const headTitle = await getTitleFromTabOrFallback(tab.id, tab.title);
  const parsed = parseArxivHeadTitle(headTitle);
  const paperId = parsed?.id || idFromUrl;
  const titlePartRaw = parsed?.title || headTitle || "references";
  if (!paperId) {
    showNotification("Error", "Could not determine paper ID");
    return;
  }

  try {
    const refs = await fetchReferencesFromSemanticScholar(paperId);
    if (!refs || refs.length === 0) {
      showNotification("No references", "No references found for this paper");
      return;
    }
  const csv = buildReferencesCsv(refs);
  const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);

  const filename = buildReferencesFilename(paperId, titlePartRaw);
  rememberDesiredFilename(dataUrl, filename);
  chrome.downloads.download({ url: dataUrl, saveAs: true, filename }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error("References download failed:", chrome.runtime.lastError);
        showNotification("Download failed", chrome.runtime.lastError.message);
      } else {
        showNotification("Download started", `Saving: ${filename}`);
      }
    });
  } catch (e) {
    console.error("Failed to fetch references:", e);
    showNotification("Error", "Could not fetch references");
  }
}

// Fetch references using Semantic Scholar Graph API
async function fetchReferencesFromSemanticScholar(paperId) {
  const bareId = String(paperId || '').replace(/v\d+$/i, '');
  const api = `https://api.semanticscholar.org/graph/v1/paper/arXiv:${encodeURIComponent(bareId)}/references?fields=title,year,url,openAccessPdf,externalIds&limit=1000`;
  const res = await fetch(api);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Semantic Scholar API error: ${res.status} ${res.statusText} ${text?.slice(0,200)}`);
  }
  const data = await res.json();
  const items = Array.isArray(data?.data) ? data.data : [];
  return items
    .map(it => it?.citedPaper)
    .filter(Boolean)
    .map(p => ({
      title: p.title || null,
      year: p.year || null,
      url: pickBestUrl(p),
      doi: p.externalIds?.DOI || null,
      arxiv: p.externalIds?.ArXiv || null
    }));
}

function pickBestUrl(p) {
  // Prefer openAccessPdf.url, then DOI URL, then S2 URL, then arXiv abs
  if (p.openAccessPdf?.url) return p.openAccessPdf.url;
  if (p.externalIds?.DOI) return `https://doi.org/${p.externalIds.DOI}`;
  if (p.url) return p.url;
  if (p.externalIds?.ArXiv) return `https://arxiv.org/abs/${p.externalIds.ArXiv}`;
  return '';
}

function buildReferencesCsv(refs) {
  // CSV header
  const header = ['Title', 'Year', 'DOI', 'arXiv', 'URL'];
  const rows = refs.map(r => [r.title || '', r.year || '', r.doi || '', r.arxiv || '', r.url || ''])
    .map(cols => cols.map(csvEscape).join(','));
  return header.join(',') + '\n' + rows.join('\n') + '\n';
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function buildReferencesFilename(paperId, rawTitle) {
  let t = (rawTitle || '').replace(/:\s*/g, '. ');
  t = t.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim();
  if (!t) t = paperId;
  let name = `${paperId} ${t} - references.csv`;
  name = name.replace(/\.+/g, '.').replace(/[\s.]+$/g, '.csv');
  if (name.length > 220) {
    const ext = '.csv';
    const keep = 220 - ext.length;
    name = name.substring(0, keep).replace(/[\s.]+$/g, '') + ext;
  }
  return name;
}

// Save references as JSON file
async function saveCurrentPaperReferencesJson(tab) {
  const url = tab.url;
  const idFromUrl = extractPaperId(url);
  const headTitle = await getTitleFromTabOrFallback(tab.id, tab.title);
  const parsed = parseArxivHeadTitle(headTitle);
  const paperId = parsed?.id || idFromUrl;
  const titlePartRaw = parsed?.title || headTitle || "references";
  if (!paperId) {
    showNotification("Error", "Could not determine paper ID");
    return;
  }
  try {
    const refs = await fetchReferencesFromSemanticScholar(paperId);
    const payload = {
      arxivId: paperId,
      title: (titlePartRaw || '').replace(/\s*-\s*arXiv.*$/i, '').trim(),
      count: refs?.length || 0,
      references: refs || []
    };
  const jsonText = JSON.stringify(payload, null, 2);
  const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonText);
  const filename = buildReferencesJsonFilename(paperId, titlePartRaw);
  rememberDesiredFilename(dataUrl, filename);
  chrome.downloads.download({ url: dataUrl, saveAs: true, filename }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error("References JSON download failed:", chrome.runtime.lastError);
        showNotification("Download failed", chrome.runtime.lastError.message);
      } else {
        showNotification("Download started", `Saving: ${filename}`);
      }
    });
  } catch (e) {
    console.error("Failed to fetch references (JSON):", e);
    showNotification("Error", "Could not fetch references");
  }
}

function buildReferencesJsonFilename(paperId, rawTitle) {
  let t = (rawTitle || '').replace(/:\s*/g, '. ');
  t = t.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim();
  if (!t) t = paperId;
  let name = `${paperId} ${t} - references.json`;
  name = name.replace(/\.+/g, '.').replace(/[\s.]+$/g, '.json');
  if (name.length > 220) {
    const ext = '.json';
    const keep = 220 - ext.length;
    name = name.substring(0, keep).replace(/[\s.]+$/g, '') + ext;
  }
  return name;
}

function parseArxivHeadTitle(headTitle) {
  if (!headTitle) return null;
  // Typical format: "[2508.14825] Title text..."
  const m = headTitle.match(/^\s*\[([^\]]+)\]\s*(.+?)\s*(?:-\s*arXiv.*)?$/i);
  if (m) {
    return { id: m[1], title: m[2] };
  }
  return { id: null, title: headTitle };
}

function buildPdfFilename(paperId, rawTitle) {
  // Replace colon with dot + space per user request
  let t = (rawTitle || '').replace(/:\s*/g, '. ');
  // Remove characters illegal on Windows
  t = t.replace(/[<>:"/\\|?*\x00-\x1f]/g, '');
  // Collapse whitespace
  t = t.replace(/\s+/g, ' ').trim();
  // Ensure not empty
  if (!t) t = paperId;
  // Compose filename: "{id} {title}.pdf"
  let name = `${paperId} ${t}.pdf`;
  // Extra cleanup: avoid multiple dots, strip trailing dot/space
  name = name.replace(/\.\.+/g, '.').replace(/[\s.]+$/g, '.pdf');
  // Limit length
  if (name.length > 220) {
    const ext = '.pdf';
    const keep = 220 - ext.length;
    name = name.substring(0, keep).replace(/[\s.]+$/g, '') + ext;
  }
  return name;
}

// Extract paper ID from arxiv URL
function extractPaperId(url) {
  // Handle various arxiv URL formats
  const patterns = [
    /arxiv\.org\/(?:abs|pdf)\/([^/?#]+)(?:\.pdf)?/i,  // Standard format (with optional .pdf)
    /arxiv\.org\/(?:abs|pdf)\/([^/?#]+)$/i,            // Without .pdf extension
    /([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/i               // Just the ID pattern
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      let paperId = match[1];
      // Remove .pdf extension if present
      paperId = paperId.replace(/\.pdf$/i, '');
      console.log("Extracted paper ID:", paperId, "from URL:", url);
      return paperId;
    }
  }
  
  console.error("Could not extract paper ID from URL:", url);
  return null;
}

// Get paper title with robust fallbacks
async function getPaperTitle(paperId) {
  try {
    // 1) Try arXiv API (Atom XML)
    const apiTitle = await tryGetTitleFromApi(paperId);
    if (apiTitle) return apiTitle;

    // 2) Fallback: fetch the abstract page and parse
    const absTitle = await tryGetTitleFromAbsPage(paperId);
    if (absTitle) return absTitle;

    return null;
  } catch (error) {
    console.error("Error fetching paper title:", error);
    return null;
  }
}

async function tryGetTitleFromApi(paperId) {
  try {
    const apiUrl = `https://export.arxiv.org/api/query?id_list=${paperId}`;
    const response = await fetch(apiUrl);
    if (!response.ok) {
      console.warn("API not OK:", response.status, response.statusText);
      return null;
    }
    const xmlText = await response.text();

    // Prefer regex parsing to avoid dependency on DOMParser in service worker
    // Extract <entry>...<title>...</title>
    const entryMatch = xmlText.match(/<entry\b[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<\/entry>/i);
    let title = entryMatch ? entryMatch[1] : null;
    if (!title) {
      // Fallback to first <title> after feed-level title
      const titles = [...xmlText.matchAll(/<title>([\s\S]*?)<\/title>/gi)].map(m => m[1]);
      if (titles.length >= 2) {
        title = titles[1]; // second title is usually the entry title
      }
    }
    if (title) {
      title = decodeEntities(title).replace(/\s+/g, ' ').trim();
      return title || null;
    }
    return null;
  } catch (e) {
    console.warn("API title fetch failed:", e);
    return null;
  }
}

async function tryGetTitleFromAbsPage(paperId) {
  try {
    const absUrl = `https://arxiv.org/abs/${paperId}`;
    const res = await fetch(absUrl);
    if (!res.ok) {
      console.warn("ABS page not OK:", res.status, res.statusText);
      return null;
    }
    const html = await res.text();

    // 1) meta citation_title
    let m = html.match(/<meta[^>]+name=["']citation_title["'][^>]*content=["']([^"']+)["']/i);
    if (m && m[1]) {
      return decodeEntities(m[1]).replace(/\s+/g, ' ').trim();
    }

    // 2) h1.title ... may include a descriptor 'Title:'
    m = html.match(/<h1[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
    if (m && m[1]) {
      let text = m[1]
        .replace(/<[^>]+>/g, ' ') // strip tags
        .replace(/\s+/g, ' ') // collapse whitespace
        .replace(/\bTitle:\s*/i, '')
        .trim();
      if (text) return decodeEntities(text);
    }

    // 3) Document <title> as last resort
    m = html.match(/<title>([\s\S]*?)<\/title>/i);
    if (m && m[1]) {
      let text = decodeEntities(m[1]).replace(/\s+/g, ' ').trim();
      // arXiv titles sometimes append identifiers; remove common suffixes
      text = text.replace(/\s*-\s*arXiv.*$/i, '').trim();
      return text || null;
    }
    return null;
  } catch (e) {
    console.warn("ABS title fetch failed:", e);
    return null;
  }
}

function decodeEntities(str) {
  if (!str) return str;
  const map = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
  return str
    .replace(/&(#\d+|#x[0-9a-fA-F]+|amp|lt|gt|quot|#39);/g, (s) => {
      if (map[s]) return map[s];
      const mDec = s.match(/&#(\d+);/);
      if (mDec) return String.fromCharCode(parseInt(mDec[1], 10));
      const mHex = s.match(/&#x([0-9a-fA-F]+);/);
      if (mHex) return String.fromCharCode(parseInt(mHex[1], 16));
      return s;
    });
}

// Clean filename by removing special characters
function cleanFilename(filename) {
  if (!filename || filename.length === 0) {
    return "arxiv_paper";
  }
  
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "") // Remove invalid filename characters including control chars
    .replace(/[\s\-\u2013\u2014]+/g, "_") // Replace spaces and dashes with underscores
    .replace(/[^\w\-_.]/g, "") // Keep only word chars, hyphens, underscores, dots
    .replace(/_{2,}/g, "_") // Replace multiple underscores with single
    .replace(/^[._\-]+|[._\-]+$/g, "") // Remove leading/trailing punctuation
    .substring(0, 180) // Limit length (leave room for .pdf extension)
    .replace(/^$/, "arxiv_paper"); // Fallback if string becomes empty
}

// Show notification to user
function showNotification(title, message) {
  try {
    if (!chrome.notifications) return;
    const iconUrl = (chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL('icons/logo.ico')
      : 'icons/logo.ico';
    chrome.notifications.create({
      type: 'basic',
      iconUrl,
      title: String(title ?? ''),
      message: String(message ?? '')
    });
  } catch (e) {
    console.warn('Notification failed:', e);
  }
}

// Update download count
async function updateDownloadCount() {
  try {
    const result = await chrome.storage.local.get(['downloadCount']);
    const newCount = (result.downloadCount || 0) + 1;
    await chrome.storage.local.set({ downloadCount: newCount });
    
    // Notify popup if it's open
    chrome.runtime.sendMessage({ action: 'downloadStarted' });
  } catch (error) {
    console.error("Error updating download count:", error);
  }
}
