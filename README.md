# Arxiv PDF Saver - Browser Extension

A Chrome/Edge browser extension that allows you to right-click on arxiv.org links and save the papers as PDFs with properly cleaned filenames.

## Features

- 🖱️ **Right-click context menu** on arxiv.org paper links
- 📄 **Automatic PDF download** with clean filenames
- 🧹 **Smart filename cleaning** - removes special characters like `:`, `/`, `\`, etc.
- 📊 **Download tracking** - keeps count of saved papers
- 🔍 **Paper title extraction** from arxiv API
- ✅ **Visual indicators** on arxiv.org pages showing saveable links
- 📚 **Save References** - export a paper's references to CSV (via Semantic Scholar API)
   - Also available as JSON via the context menu option "Save References (JSON)"

## Installation

### For Development/Testing

1. **Download or clone this repository** to your local machine
2. **Open Chrome or Edge** browser
3. **Navigate to extensions page**:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
4. **Enable "Developer mode"** (toggle in top-right corner)
5. **Click "Load unpacked"** and select the extension folder
6. **The extension should now appear** in your browser toolbar

### For Distribution

To distribute this extension, you would need to:
1. Create proper icon files (16x16, 32x32, 48x48, 128x128 pixels) and add them back to manifest.json
2. Package the extension as a .zip file
3. Submit to Chrome Web Store or Edge Add-ons store

## Usage

### Basic Usage

1. **Visit arxiv.org** and browse papers
2. **Right-click on any paper link** (either abstract or PDF links)
3. **Select "Save Paper as PDF"** from the context menu
4. **Choose save location** when prompted
5. **The PDF downloads** with a cleaned filename based on the paper title

### Save References

On any arxiv.org paper page:
1. Right-click anywhere on the page
2. Choose **"Save References"** (CSV) or **"Save References (JSON)"**
3. CSV includes: Title, Year, DOI, arXiv, URL; JSON includes metadata and references array

### Supported URL Formats

The extension works with these arxiv.org URL patterns:
- `https://arxiv.org/abs/2301.12345`
- `https://arxiv.org/pdf/2301.12345.pdf`
- Papers from any arxiv category (cs, math, physics, etc.)

### Filename Cleaning

The extension automatically cleans paper titles to create valid filenames:
- Removes special characters: `< > : " / \ | ? *`
- Replaces spaces with underscores
- Removes multiple consecutive underscores
- Limits filename length to 200 characters
- Falls back to paper ID if title extraction fails

**Example:**
- Original title: `"Attention Is All You Need: Transformers for NLP"`
- Cleaned filename: `Attention_Is_All_You_Need_Transformers_for_NLP.pdf`

## Extension Structure

```
rightclick/
├── manifest.json          # Extension configuration
├── background.js          # Service worker (context menu, downloads)
├── content.js            # Content script (page enhancement)
├── popup.html            # Extension popup interface
├── popup.js              # Popup functionality
├── icons/                # Extension icons (placeholder)
│   └── README.md
└── README.md             # This file
```

## Technical Details

### Permissions

The extension requires these permissions:
- **contextMenus**: Create right-click menu items
- **downloads**: Initiate file downloads
- **activeTab**: Access current tab information
- **storage**: Store download statistics
- **notifications**: Show download status

### Host Permissions

- **https://arxiv.org/\***: Access arxiv.org pages
- **https://export.arxiv.org/\***: Fetch paper metadata from arxiv API
- **https://api.semanticscholar.org/***: Fetch references for a paper

### Architecture

1. **Background Script**: Handles context menu creation and PDF downloads
2. **Content Script**: Runs on arxiv.org pages to enhance links
3. **Popup**: Provides user interface and statistics
4. **Manifest V3**: Uses modern extension format for security

## Development

### Prerequisites

- Chrome or Edge browser
- Basic understanding of JavaScript and browser extensions

### Local Development

1. Make changes to the extension files
2. Go to `chrome://extensions/` or `edge://extensions/`
3. Click the refresh button for the extension
4. Test your changes on arxiv.org

### Bump version for each upload (Windows)

Chrome/Edge require the `version` in `manifest.json` to increase for every upload. Use the provided script to bump automatically and add a timestamped `version_name`:

```bat
bump-version.cmd
```

This will:
- Increment the last segment (e.g., 1.0.0.15 → 1.0.0.16)
- Add/update `version_name` with a UTC timestamp (e.g., v1.0.0.16 2025-09-20T18:45:10Z)

### Testing

Test the extension on various arxiv.org pages:
- Recent papers: https://arxiv.org/list/cs/recent
- Paper abstract page: https://arxiv.org/abs/2301.12345
- PDF link: https://arxiv.org/pdf/2301.12345.pdf

## Troubleshooting

### Extension Not Working

1. **Check if extension is enabled** in browser extensions page
2. **Verify permissions** are granted during installation
3. **Refresh the arxiv.org page** after installing the extension
4. **Check browser console** for error messages (F12 → Console)

### Downloads Not Starting

1. **Check browser download settings** - ensure downloads are allowed
2. **Verify arxiv.org is accessible** and not blocked
3. **Try a different paper link** - some very old papers may not have PDFs
4. **Check popup statistics** to verify extension is tracking attempts

### Context Menu Not Appearing

1. **Right-click directly on paper links** (not just text)
2. **Ensure you're on arxiv.org domain**
3. **Try refreshing the page** and right-clicking again
4. **Check if other extensions** are interfering with context menus

## Known Limitations

- **Icons**: Icon references removed to avoid loading errors - extension uses browser default icon
- **Old papers**: Very old arxiv papers may not have PDF versions available
- **Network errors**: No retry mechanism for failed API requests
- **Filename conflicts**: No automatic handling of duplicate filenames

## Future Enhancements

- [ ] Custom filename templates
- [ ] Batch download multiple papers
- [ ] Integration with reference managers
- [ ] Support for other academic paper sites
- [ ] Download progress indicators
- [ ] Better error handling and user feedback

## Privacy

This extension:
- ✅ Only accesses arxiv.org and export.arxiv.org
- ✅ Stores only download count locally
- ✅ Does not track or transmit user data
- ✅ Open source and auditable

## License

This project is open source. Feel free to modify and distribute according to your needs.

## Contributing

1. Fork this repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly on arxiv.org
5. Submit a pull request

---

**Version**: 1.0.0  
**Last Updated**: September 2025  
**Tested On**: Chrome 115+, Edge 115+
