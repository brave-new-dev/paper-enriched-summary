// Popup script for Arxiv PDF Saver extension

document.addEventListener('DOMContentLoaded', async () => {
  await initializePopup();
});

async function initializePopup() {
  // Load download count from storage
  const result = await chrome.storage.local.get(['downloadCount']);
  const downloadCount = result.downloadCount || 0;
  document.getElementById('downloadCount').textContent = downloadCount;
  
  // Set up test button
  document.getElementById('testButton').addEventListener('click', testCurrentPage);
  
  // Check if current page is arxiv.org
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  updateStatus(tab.url);
}

function updateStatus(url) {
  const statusElement = document.getElementById('status');
  const testButton = document.getElementById('testButton');
  
  if (url.includes('arxiv.org')) {
    statusElement.textContent = '✅ Arxiv.org detected - Ready to save PDFs';
    statusElement.style.color = '#28a745';
    testButton.style.display = 'block';
  } else {
    statusElement.textContent = '⚠️ Navigate to arxiv.org to use this extension';
    statusElement.style.color = '#ffc107';
    testButton.style.display = 'none';
  }
}

async function testCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes('arxiv.org')) {
      alert('Please navigate to arxiv.org first');
      return;
    }
    
    // Send message to content script to get paper info
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPaperInfo' });
    
    if (response && response.title) {
      document.getElementById('status').innerHTML = `
        <strong>Paper found:</strong><br>
        <small>${response.title.substring(0, 50)}...</small>
      `;
      document.getElementById('status').style.color = '#28a745';
    } else {
      document.getElementById('status').textContent = 'No paper information found on this page';
      document.getElementById('status').style.color = '#dc3545';
    }
    
  } catch (error) {
    console.error('Error testing page:', error);
    document.getElementById('status').textContent = 'Error testing page';
    document.getElementById('status').style.color = '#dc3545';
  }
}

// Listen for download events to update counter
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'downloadStarted') {
    updateDownloadCount();
  }
});

async function updateDownloadCount() {
  const result = await chrome.storage.local.get(['downloadCount']);
  const newCount = (result.downloadCount || 0) + 1;
  await chrome.storage.local.set({ downloadCount: newCount });
  document.getElementById('downloadCount').textContent = newCount;
}
