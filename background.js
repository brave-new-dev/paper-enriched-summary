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
  if (chrome.notifications) {
    chrome.notifications.create({
      type: 'basic',
      title: title,
      message: message
    });
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
