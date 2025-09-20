// Content script for Arxiv PDF Saver extension
// Runs on arxiv.org pages to enhance link detection

// Wrap everything in an IIFE to avoid global scope pollution
(function() {
  'use strict';
  
  // Wait for page to be ready before adding enhancements
  function initializeExtension() {
    try {
      enhanceArxivLinks();
      setupMutationObserver();
    } catch (error) {
      console.error('Arxiv PDF Saver: Error initializing extension:', error);
    }
  }

  // Add visual feedback for arxiv links
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
  } else {
    // Document already loaded
    initializeExtension();
  }

  // Enhance arxiv links with visual indicators
  function enhanceArxivLinks() {
    try {
      const arxivLinks = document.querySelectorAll('a[href*="arxiv.org/abs/"], a[href*="arxiv.org/pdf/"]');
      
      arxivLinks.forEach(link => {
        // Add a subtle indicator that this link can be saved as PDF
        if (link && !link.querySelector('.pdf-saver-indicator')) {
          const indicator = document.createElement('span');
          indicator.className = 'pdf-saver-indicator';
          indicator.innerHTML = ' 📄';
          indicator.title = 'Right-click to save as PDF';
          indicator.style.cssText = `
            font-size: 12px;
            opacity: 0.7;
            margin-left: 4px;
            cursor: pointer;
          `;
          try {
            link.appendChild(indicator);
          } catch (e) {
            // Silently ignore if we can't append (e.g., link is not in DOM)
          }
        }
      });
    } catch (error) {
      console.error('Arxiv PDF Saver: Error enhancing links:', error);
    }
  }

  // Setup mutation observer safely
  function setupMutationObserver() {
    try {
      if (document.body) {
        const observer = new MutationObserver(() => {
          try {
            enhanceArxivLinks();
          } catch (error) {
            console.error('Arxiv PDF Saver: Error in mutation observer:', error);
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      }
    } catch (error) {
      console.error('Arxiv PDF Saver: Error setting up mutation observer:', error);
    }
  }

  // Handle messages from popup or background script
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        if (message.action === 'getPaperInfo') {
          const paperInfo = extractPaperInfoFromPage();
          sendResponse(paperInfo);
        } else if (message.action === 'getHeadTitle') {
          const headTitle = (document.querySelector('head > title')?.textContent || '').trim();
          sendResponse(headTitle);
        }
      } catch (error) {
        console.error('Arxiv PDF Saver: Error handling message:', error);
        sendResponse(null);
      }
    });
  }

  // Extract paper information from the current page
  function extractPaperInfoFromPage() {
    try {
      // arXiv pages use <h1 class="title mathjax"> with inner span.descriptor "Title:"
      let titleElement = document.querySelector('h1.title');
      let titleText = null;
      if (titleElement) {
        // Remove the descriptor label if present
        const clone = titleElement.cloneNode(true);
        const desc = clone.querySelector('.descriptor');
        if (desc) desc.remove();
        titleText = clone.textContent.trim();
      }
      if (!titleText) {
        // Try meta citation_title
        const meta = document.querySelector('meta[name="citation_title"]');
        if (meta && meta.content) titleText = meta.content.trim();
      }
      if (!titleText) {
        // Last resort: document.title, removing arXiv suffixes
        titleText = (document.title || '').replace(/\s*-\s*arXiv.*$/i, '').trim();
      }
      
      const authorsElement = document.querySelector('.authors') || 
                            document.querySelector('.author');
      
      const abstractElement = document.querySelector('.abstract') || 
                             document.querySelector('#abstract');
      
      return {
        title: titleText || null,
        authors: authorsElement ? authorsElement.textContent.replace('Authors:', '').trim() : null,
        abstract: abstractElement ? abstractElement.textContent.replace('Abstract:', '').trim().substring(0, 200) + '...' : null,
        url: window.location.href
      };
    } catch (error) {
      console.error('Arxiv PDF Saver: Error extracting paper info:', error);
      return null;
    }
  }

})(); // End of IIFE
