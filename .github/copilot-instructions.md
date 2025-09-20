# Arxiv PDF Saver Extension

This is a browser extension project for downloading arxiv.org papers as PDFs with cleaned filenames.

## Project Structure
- Browser extension targeting Chrome/Edge and Chromium-based browsers
- Manifest V3 extension with context menu functionality
- Content script to detect arxiv.org links and extract paper titles
- Background service worker to handle PDF downloads

## Key Features
- Right-click context menu on arxiv.org links
- Automatic title extraction from arxiv papers
- Filename sanitization (removes special characters like ":")
- Direct PDF download functionality

## Development Guidelines
- Use Manifest V3 format for modern browser compatibility
- Implement proper error handling for network requests
- Follow browser extension security best practices
- Test with various arxiv.org link formats
