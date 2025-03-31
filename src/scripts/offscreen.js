/**
 * Offscreen document script for handling camera access
 * This runs in a hidden document to maintain camera access across navigation
 */

// Handle messages from the service worker
chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target !== 'offscreen') return;
  
  if (message.type === 'start-camera') {
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          mandatory: {
            chromeMediaSource: "tab",
            chromeMediaSourceId: message.data,
          }
        }
      });

      // Store the stream for later use
      window.cameraStream = media;

      // Send success message back
      chrome.runtime.sendMessage({
        type: 'camera-started',
        success: true
      });

    } catch (error) {
      console.error('Error starting camera in offscreen document:', error);
      chrome.runtime.sendMessage({
        type: 'camera-started',
        success: false,
        error: error.message
      });
    }
  }

  if (message.type === 'stop-camera') {
    if (window.cameraStream) {
      window.cameraStream.getTracks().forEach(track => track.stop());
      window.cameraStream = null;
    }
    chrome.runtime.sendMessage({
      type: 'camera-stopped',
      success: true
    });
  }
}); 