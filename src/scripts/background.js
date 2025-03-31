/**
 * Background script for Vision Correction Extension
 * 
 * This script runs as a service worker and manages the state of the extension
 * across browser sessions. It handles user prescription data storage and
 * coordinates between content scripts.
 */

// Default state
const DEFAULT_STATE = {
  enabled: false,
  settings: {
    quality: 'medium',
    screenDistance: 50,
    chromaticAberration: true,
    cameraEnabled: false
  },
  profiles: {
    'Default': {
      leftEye: { sphere: -2.0, cylinder: 0, axis: 0 },
      rightEye: { sphere: -2.0, cylinder: 0, axis: 0 },
      pd: 62
    }
  },
  currentProfile: 'Default'
};

// Current state
let state = { ...DEFAULT_STATE };

// Message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_STATE':
      sendResponse(state);
      break;
      
    case 'SET_STATE':
      state = {
        ...state,
        ...message.state,
        settings: {
          ...state.settings,
          ...(message.state.settings || {})
        }
      };
      // Save state to storage
      chrome.storage.local.set({ state });
      // Send response with updated state
      sendResponse({ success: true, state });
      
      // Broadcast state change to all tabs with content scripts
      notifyContentScripts({ type: 'STATE_UPDATED', data: state });
      break;
      
    case 'START_CALIBRATION':
      chrome.tabs.create({ 
        url: chrome.runtime.getURL('pages/calibration.html')
      }, (tab) => {
        sendResponse({ success: true, tabId: tab.id });
      });
      return true; // Required for async response
    
    case 'RELAY_TO_CONTENT':
      // Relay messages from popup to content script
      if (message.tabId && message.contentMessage) {
        chrome.tabs.sendMessage(message.tabId, message.contentMessage, sendResponse);
        return true; // Keep channel open for async response
      }
      break;
      
    default:
      // Handle unrecognized message
      sendResponse({ success: false, error: 'Unknown message type' });
  }
});

// Load state from storage when extension starts
chrome.storage.local.get(['state'], (result) => {
  if (result.state) {
    state = {
      ...DEFAULT_STATE,
      ...result.state,
      settings: {
        ...DEFAULT_STATE.settings,
        ...(result.state.settings || {})
      }
    };
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  switch (command) {
    case 'toggle-correction':
      state.enabled = !state.enabled;
      chrome.storage.local.set({ state });
      break;
      
    case 'start-calibration':
      chrome.tabs.create({ 
        url: chrome.runtime.getURL('pages/calibration.html')
      });
      break;
  }
});

/**
 * Initialize extension state
 */
function initializeExtension() {
  // Initialize state when extension is installed
  chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({ visionCorrection: DEFAULT_STATE });
    console.log('Vision Correction Extension installed with default settings.');
  });
}

// Initialize the extension
initializeExtension();

/**
 * Sends a message to all tabs with content scripts
 */
function notifyContentScripts(message) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      // Skip chrome:// and other protected URLs
      if (tab.url && tab.url.startsWith('http')) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {
          // Ignore errors from tabs where content script is not running
          console.log(`Content script not running in tab ${tab.id}`);
        });
      }
    }
  });
}