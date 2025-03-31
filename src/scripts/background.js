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
      break;
      
    case 'REQUEST_CAMERA':
      requestCamera()
        .then(streamId => sendResponse({ success: true, streamId }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Required for async response
      
    case 'START_CALIBRATION':
      chrome.tabs.create({ 
        url: chrome.runtime.getURL('pages/calibration.html')
      }, (tab) => {
        sendResponse({ success: true, tabId: tab.id });
      });
      return true; // Required for async response
  }
});

// Request camera access using chrome.tabCapture API
async function requestCamera() {
  try {
    // Request tab capture
    const stream = await new Promise((resolve, reject) => {
      chrome.tabCapture.capture({
        video: true,
        audio: false,
        videoConstraints: {
          mandatory: {
            minWidth: 640,
            minHeight: 480,
            maxWidth: 1280,
            maxHeight: 720,
            minFrameRate: 30
          }
        }
      }, (stream) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!stream) {
          reject(new Error('Failed to capture tab'));
        } else {
          resolve(stream);
        }
      });
    });
    
    // Get stream ID for content script
    const streamId = stream.id;
    stream.getTracks().forEach(track => track.stop()); // Stop the stream since we only need the ID
    
    return streamId;
  } catch (error) {
    console.error('Error requesting camera:', error);
    throw error;
  }
}

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