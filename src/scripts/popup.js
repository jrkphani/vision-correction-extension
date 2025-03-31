/**
 * Popup script for Vision Correction Extension
 * 
 * This script handles the popup UI for the extension, allowing users
 * to control vision correction settings and profiles.
 */

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements - with null checks
  const elements = {
    correctionToggle: document.getElementById('correction-toggle'),
    statusElement: document.getElementById('status'),
    eyeTrackingStatus: document.getElementById('eye-tracking-status'),
    profileSelect: document.getElementById('profile-select'),
    calibrateBtn: document.getElementById('calibrate-btn'),
    optionsBtn: document.getElementById('options-btn'),
    manageProfilesBtn: document.getElementById('manage-profiles'),
    statusText: document.getElementById('status-text'),
    editProfileBtn: document.getElementById('edit-profile'),
    newProfileBtn: document.getElementById('new-profile'),
    calibrationStatus: document.getElementById('calibration-status'),
    cameraSelect: document.getElementById('camera-select'),
    lightLevelStatus: document.getElementById('light-level-status'),
    sharpnessSlider: document.getElementById('sharpness-slider'),
    contrastSlider: document.getElementById('contrast-slider'),
    optionsLink: document.getElementById('options-link'),
    qualitySelect: document.getElementById('quality'),
    screenDistanceInput: document.getElementById('screenDistance'),
    chromaticAberrationToggle: document.getElementById('chromaticAberration'),
    // Add modal elements
    profileModal: document.getElementById('profile-modal'),
    modalTitle: document.getElementById('modal-title'),
    profileForm: document.getElementById('profile-form'),
    closeModal: document.getElementById('close-modal'),
    cancelBtn: document.getElementById('cancel-btn'),
    profileNameInput: document.getElementById('profile-name'),
    leftSphereInput: document.getElementById('left-sphere'),
    leftCylinderInput: document.getElementById('left-cylinder'),
    leftAxisInput: document.getElementById('left-axis'),
    rightSphereInput: document.getElementById('right-sphere'),
    rightCylinderInput: document.getElementById('right-cylinder'),
    rightAxisInput: document.getElementById('right-axis'),
    pdInput: document.getElementById('pd')
  };

  // Verify all required elements are present
  const missingElements = Object.entries(elements)
    .filter(([key, element]) => !element)
    .map(([key]) => key);

  if (missingElements.length > 0) {
    console.error('Missing required DOM elements:', missingElements);
    updateStatus('Error: UI initialization failed', true, elements);
    return;
  }

  // Initialize the popup
  initializePopup(elements);
});

async function initializePopup(elements) {
  try {
    // Update initial status
    updateStatus('Initializing...', false, elements);
    
    // Get current state from background script
    const state = await sendMessage({ type: 'GET_STATE' });
    
    // Initialize UI with state
    if (state) {
      elements.correctionToggle.checked = state.enabled;
      elements.qualitySelect.value = state.settings?.quality || 'medium';
      elements.screenDistanceInput.value = state.settings?.screenDistance || 50;
      elements.chromaticAberrationToggle.checked = state.settings?.chromaticAberration || false;
      
      // Update profile select
      if (state.profiles) {
        elements.profileSelect.innerHTML = Object.keys(state.profiles).map(profile => 
          `<option value="${profile}" ${state.currentProfile === profile ? 'selected' : ''}>
            ${profile}
          </option>`
        ).join('');
      }
    }
    
    // Set up event listeners
    setupEventListeners(elements);
    
    // Check camera status
    await checkCameraStatus(elements);
    
  } catch (error) {
    console.error('Error initializing popup:', error);
    updateStatus('Error initializing extension', true, elements);
  }
}

// Function to load available cameras
async function loadCameras(elements) {
  try {
    // Get list of available media devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    
    // Filter for video input devices
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    
    // Clear existing options
    elements.cameraSelect.innerHTML = '';
    
    // Add options for each camera
    videoDevices.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `Camera ${device.deviceId.slice(0, 4)}`;
      elements.cameraSelect.appendChild(option);
    });
    
    // If we have a saved camera preference, select it
    if (state.settings.selectedCamera) {
      elements.cameraSelect.value = state.settings.selectedCamera;
    }
  } catch (error) {
    console.error('Error loading cameras:', error);
    elements.cameraSelect.innerHTML = '<option value="">Error loading cameras</option>';
  }
}

// Function to measure light level from camera
async function measureLightLevel(stream) {
  try {
    // Create a video element to capture the frame
    const video = document.createElement('video');
    video.srcObject = stream;
    await new Promise(resolve => video.onloadedmetadata = resolve);
    video.play();

    // Create a canvas to analyze the frame
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw the current frame
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get image data
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Calculate average brightness
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
      // Convert RGB to relative luminance
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      totalBrightness += (0.299 * r + 0.587 * g + 0.114 * b);
    }

    const averageBrightness = totalBrightness / (data.length / 4);
    
    // Convert brightness to approximate lux (this is a rough estimation)
    // The actual conversion would require calibration with a light meter
    const estimatedLux = averageBrightness * 2;

    // Clean up
    video.srcObject.getTracks().forEach(track => track.stop());
    video.remove();

    return estimatedLux;
  } catch (error) {
    console.error('Error measuring light level:', error);
    return null;
  }
}

// Function to update light level status
function updateLightLevelStatus(lux) {
  if (lux === null) {
    elements.lightLevelStatus.textContent = 'Error';
    elements.lightLevelStatus.className = 'status error';
    return;
  }

  if (lux >= LIGHT_THRESHOLDS.OPTIMAL) {
    elements.lightLevelStatus.textContent = 'Optimal';
    elements.lightLevelStatus.className = 'status active';
  } else if (lux >= LIGHT_THRESHOLDS.MINIMUM) {
    elements.lightLevelStatus.textContent = 'Adequate';
    elements.lightLevelStatus.className = 'status warning';
  } else if (lux >= LIGHT_THRESHOLDS.DARK) {
    elements.lightLevelStatus.textContent = 'Low Light';
    elements.lightLevelStatus.className = 'status warning';
  } else {
    elements.lightLevelStatus.textContent = 'Too Dark';
    elements.lightLevelStatus.className = 'status error';
  }
}

// Modified requestCameraPermission function
async function requestCameraPermission(elements) {
  try {
    // Check if we're in a secure context (required for getUserMedia)
    if (!window.isSecureContext) {
      throw new Error('Camera access requires a secure context (HTTPS or localhost)');
    }

    // Check if getUserMedia is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Your browser does not support camera access');
    }

    // Request camera permissions with the selected camera if available
    const constraints = {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    // If a specific camera is selected, add it to constraints
    if (elements.cameraSelect.value) {
      constraints.video.deviceId = { exact: elements.cameraSelect.value };
    } else {
      constraints.video.facingMode = 'user'; // Default to user-facing camera
    }

    // Request camera access through the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('No active tab found');
    }

    // Send message to content script to request camera access
    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { 
        type: 'REQUEST_CAMERA_ACCESS',
        constraints: constraints
      }, resolve);
    });

    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to access camera');
    }

    // Update state with camera status
    await updateState({
      settings: {
        ...state.settings,
        cameraEnabled: true,
        selectedCamera: elements.cameraSelect.value
      }
    });

    // Update UI to show camera is ready
    elements.eyeTrackingStatus.textContent = 'Ready';
    elements.eyeTrackingStatus.className = 'status success';
    elements.statusText.textContent = 'Correction ON';

    return true;
  } catch (error) {
    // Update state to indicate camera is disabled
    await updateState({
      settings: {
        ...state.settings,
        cameraEnabled: false
      }
    });

    // Provide specific error messages based on the error type
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      throw new Error('Camera permission was denied. Please allow camera access in your browser settings to use eye tracking.');
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      throw new Error('No camera found. Please connect a camera to use eye tracking.');
    } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      throw new Error('Camera is in use by another application. Please close other apps using the camera.');
    } else {
      throw new Error(`Camera error: ${error.message}`);
    }
  }
}

function updateUI(elements) {
  if (!state) return;
  
  // Update toggle state
  if (elements.correctionToggle) {
    elements.correctionToggle.checked = state.enabled;
  }
  
  if (elements.statusText) {
    elements.statusText.textContent = state.enabled ? 'Correction ON' : 'Correction OFF';
  }
  
  // Update profile selector
  updateProfileSelector(elements);
  
  // Update sliders
  if (elements.sharpnessSlider) {
    elements.sharpnessSlider.value = state.settings.sharpnessEnhancement * 100;
  }
  
  if (elements.contrastSlider) {
    elements.contrastSlider.value = state.settings.contrastEnhancement * 100;
  }
  
  // Update status indicators
  updateStatusIndicators(elements);
}

function updateProfileSelector(elements) {
  // If profileSelect element doesn't exist or state/profiles not initialized, return
  if (!elements.profileSelect || !state || !state.profiles) return;
  
  // Clear existing options
  elements.profileSelect.innerHTML = '';
  
  // Add options for each profile
  Object.keys(state.profiles).forEach(profileName => {
    const option = document.createElement('option');
    option.value = profileName;
    option.textContent = profileName;
    elements.profileSelect.appendChild(option);
  });
  
  // Select the active profile
  if (state.activeProfile) {
    elements.profileSelect.value = state.activeProfile;
  }
}

function updateStatusIndicators(elements) {
  // Update eye tracking status
  if (elements.eyeTrackingStatus) {
    elements.eyeTrackingStatus.textContent = state.enabled ? 'Active' : 'Inactive';
    elements.eyeTrackingStatus.className = 'status ' + (state.enabled ? 'active' : 'inactive');
  }
  
  // Update calibration status
  if (elements.calibrationStatus) {
    if (state.calibration && state.calibration.completed) {
      const lastCalDate = new Date(state.calibration.lastCalibrationDate);
      elements.calibrationStatus.textContent = lastCalDate.toLocaleDateString();
      elements.calibrationStatus.className = 'status active';
    } else {
      elements.calibrationStatus.textContent = 'Never';
      elements.calibrationStatus.className = 'status inactive';
    }
  }
}

function setupEventListeners(elements) {
  // Toggle correction
  elements.correctionToggle.addEventListener('change', async () => {
    try {
      const enabled = elements.correctionToggle.checked;
      
      // If enabling correction, check camera first
      if (enabled) {
        await checkCameraStatus(elements);
      }
      
      // Update state
      await sendMessage({ 
        type: 'SET_STATE',
        state: { enabled }
      });
      
      updateStatus(
        enabled ? 'Vision correction enabled' : 'Vision correction disabled',
        false,
        elements
      );
    } catch (error) {
      console.error('Error toggling correction:', error);
      elements.correctionToggle.checked = false;
      updateStatus('Failed to toggle correction', true, elements);
    }
  });
  
  // Profile selection
  elements.profileSelect.addEventListener('change', async () => {
    state.activeProfile = elements.profileSelect.value;
    await updateState(state);
  });
  
  // Edit profile button
  elements.editProfileBtn.addEventListener('click', () => {
    openProfileModal(false, elements.profileSelect.value);
  });
  
  // New profile button
  elements.newProfileBtn.addEventListener('click', () => {
    openProfileModal(true);
  });
  
  // Start calibration
  elements.calibrateBtn.addEventListener('click', async () => {
    try {
      // Request camera access first
      await checkCameraStatus(elements);
      
      // Start calibration
      await sendMessage({ type: 'START_CALIBRATION' });
      window.close(); // Close popup as calibration opens in tab
    } catch (error) {
      console.error('Error starting calibration:', error);
      updateStatus('Failed to start calibration', true, elements);
    }
  });
  
  // Open options
  elements.optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  // Manage profiles
  elements.manageProfilesBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  // Options link
  elements.optionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('../pages/options.html'));
    }
  });
  
  // Sliders
  elements.sharpnessSlider.addEventListener('change', () => {
    const settings = { ...state.settings };
    settings.sharpnessEnhancement = elements.sharpnessSlider.value / 100;
    updateState({ settings });
  });
  
  elements.contrastSlider.addEventListener('change', () => {
    const settings = { ...state.settings };
    settings.contrastEnhancement = elements.contrastSlider.value / 100;
    updateState({ settings });
  });
  
  // Modal close buttons
  elements.closeModal.addEventListener('click', closeProfileModal);
  elements.cancelBtn.addEventListener('click', closeProfileModal);
  
  // Profile form submission
  elements.profileForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveProfile();
  });
  
  // Close modal when clicking outside
  window.addEventListener('click', (e) => {
    if (e.target === elements.profileModal) {
      closeProfileModal();
    }
  });

  // Screen distance change
  elements.screenDistanceInput.addEventListener('change', async () => {
    const distance = parseInt(elements.screenDistanceInput.value);
    if (distance >= 30 && distance <= 100) {
      await sendMessage({
        type: 'SET_STATE',
        state: { 
          settings: { screenDistance: distance }
        }
      });
    }
  });

  // Chromatic aberration toggle
  elements.chromaticAberrationToggle.addEventListener('change', async () => {
    await sendMessage({
      type: 'SET_STATE',
      state: { 
        settings: { 
          chromaticAberration: elements.chromaticAberrationToggle.checked 
        }
      }
    });
  });

  // Camera selection change
  elements.cameraSelect.addEventListener('change', async () => {
    try {
      // Update state with selected camera
      const settings = { ...state.settings };
      settings.selectedCamera = elements.cameraSelect.value;
      await updateState({ settings });

      // Only request camera permission if eye tracking is enabled
      if (state.enabled) {
        await requestCameraPermission(elements);
      }
    } catch (error) {
      console.error('Error changing camera:', error);
      elements.statusText.textContent = 'Error: ' + error.message;
      elements.eyeTrackingStatus.textContent = 'Error';
      elements.eyeTrackingStatus.className = 'status error';
    }
  });
}

function openProfileModal(isNew, profileName = null) {
  isEditingProfile = !isNew;
  currentEditingProfile = profileName;
  
  // Set modal title
  elements.modalTitle.textContent = isNew ? 'Create New Profile' : 'Edit Profile';
  
  if (isNew) {
    // Default values for new profile
    elements.profileNameInput.value = 'New Profile';
    elements.leftSphereInput.value = '-2.0';
    elements.leftCylinderInput.value = '0';
    elements.leftAxisInput.value = '0';
    elements.rightSphereInput.value = '-2.0';
    elements.rightCylinderInput.value = '0';
    elements.rightAxisInput.value = '0';
    elements.pdInput.value = '62';
    
    // Enable profile name input for new profiles
    elements.profileNameInput.disabled = false;
  } else {
    // Load existing profile data
    const profile = state.profiles[profileName];
    
    elements.profileNameInput.value = profileName;
    elements.leftSphereInput.value = profile.leftEye.sphere;
    elements.leftCylinderInput.value = profile.leftEye.cylinder;
    elements.leftAxisInput.value = profile.leftEye.axis;
    elements.rightSphereInput.value = profile.rightEye.sphere;
    elements.rightCylinderInput.value = profile.rightEye.cylinder;
    elements.rightAxisInput.value = profile.rightEye.axis;
    elements.pdInput.value = profile.pd;
    
    // Disable profile name input for existing profiles
    elements.profileNameInput.disabled = true;
  }
  
  // Show the modal
  elements.profileModal.style.display = 'block';
}

function closeProfileModal() {
  elements.profileModal.style.display = 'none';
  currentEditingProfile = null;
  isEditingProfile = false;
}

function saveProfile() {
  // Get form values
  const profileName = isEditingProfile ? currentEditingProfile : elements.profileNameInput.value.trim();
  
  // Create profile object
  const profile = {
    leftEye: {
      sphere: parseFloat(elements.leftSphereInput.value),
      cylinder: parseFloat(elements.leftCylinderInput.value),
      axis: parseInt(elements.leftAxisInput.value)
    },
    rightEye: {
      sphere: parseFloat(elements.rightSphereInput.value),
      cylinder: parseFloat(elements.rightCylinderInput.value),
      axis: parseInt(elements.rightAxisInput.value)
    },
    pd: parseFloat(elements.pdInput.value)
  };
  
  // Update profiles in state
  const profiles = { ...state.profiles };
  profiles[profileName] = profile;
  
  // If it's a new profile, set it as active
  const updates = { profiles };
  if (!isEditingProfile) {
    updates.activeProfile = profileName;
  }
  
  // Update state
  updateState(updates);
  
  // Close the modal
  closeProfileModal();
}

async function startCalibration(elements) {
  try {
    // Request camera permissions first
    await requestCameraPermission(elements);
    
    // Send message to content script to start calibration
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { type: 'START_CALIBRATION' });
    }
  } catch (error) {
    console.error('Error starting calibration:', error);
    // Show error in the UI
    elements.eyeTrackingStatus.textContent = 'Error: ' + error.message;
    elements.eyeTrackingStatus.className = 'status error';
  }
}

// Helper functions for state management
async function getState() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
      resolve(response);
    });
  });
}

async function updateState(changes) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ 
      type: 'UPDATE_STATE', 
      data: changes 
    }, (response) => {
      if (response && response.success) {
        state = response.state;
        updateUI();
      }
      resolve(response);
    });
  });
}

/**
 * Check if the URL allows content scripts to run
 */
function isValidContentScriptTarget(url) {
  // Content scripts can't run on these URLs
  if (!url) return false;
  
  const invalidProtocols = [
    'chrome://', 
    'chrome-extension://', 
    'chrome-search://',
    'chrome-devtools://',
    'devtools://',
    'about:',
    'data:',
    'file:'
  ];
  
  return !invalidProtocols.some(protocol => url.startsWith(protocol));
}

/**
 * Dynamically injects the content script into the current tab
 */
async function injectContentScript(tabId) {
  console.log('Injecting content script into tab:', tabId);
  try {
    // Check if we have scripting permission
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['scripts/content.js']
    });
    
    // Wait for script to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('Content script injected successfully');
    return true;
  } catch (error) {
    console.error('Failed to inject content script:', error);
    return false;
  }
}

/**
 * Sends a message to a content script via the background script relay
 */
async function sendMessageToContentScript(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      type: 'RELAY_TO_CONTENT',
      tabId: tabId,
      contentMessage: message
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Check camera status and request permissions if needed
 */
async function checkCameraStatus(elements) {
  try {
    updateStatus('Requesting camera access...', false, elements);
    console.log('Checking if content script is loaded...');
    
    // First check if the content script is loaded by pinging it
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('No active tab found');
    }
    
    // Check if the current tab allows content scripts
    if (!isValidContentScriptTarget(tab.url)) {
      throw new Error('This page doesn\'t support eye tracking. Please open a regular web page.');
    }
    
    let contentScriptActive = false;
    
    try {
      // Try to ping the content script
      console.log('Pinging content script...');
      
      // First try direct messaging
      try {
        const pingResponse = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
        if (pingResponse && pingResponse.status === 'alive') {
          contentScriptActive = true;
        }
      } catch (directError) {
        console.log('Direct ping failed, trying relay:', directError);
        
        // If direct fails, try relay through background
        try {
          const relayResponse = await sendMessageToContentScript(tab.id, { type: 'PING' });
          if (relayResponse && relayResponse.status === 'alive') {
            contentScriptActive = true;
          }
        } catch (relayError) {
          console.error('Relay ping also failed:', relayError);
        }
      }
    } catch (pingError) {
      console.error('Content script ping failed:', pingError);
      console.log('Attempting to inject content script...');
    }
    
    // If content script is not responding, try to inject it
    if (!contentScriptActive) {
      const injected = await injectContentScript(tab.id);
      if (!injected) {
        throw new Error('Failed to initialize eye tracking. Please refresh the page and try again.');
      }
      
      // Wait a moment for the script to initialize
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Try ping one more time
      try {
        const pingResponse = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
        if (!pingResponse || pingResponse.status !== 'alive') {
          throw new Error('Content script not responding after injection');
        }
      } catch (error) {
        throw new Error('Content script failed to initialize. Please refresh the page.');
      }
    }
    
    // Now that we know the content script is available, request camera access
    console.log('Sending INITIALIZE_CAMERA message to content script...');
    let response;
    
    try {
      // Try direct message first
      response = await chrome.tabs.sendMessage(tab.id, { type: 'INITIALIZE_CAMERA' });
    } catch (directError) {
      console.log('Direct message failed, trying relay');
      // Fall back to relay if direct fails
      response = await sendMessageToContentScript(tab.id, { type: 'INITIALIZE_CAMERA' });
    }
    
    // Check response
    if (!response) {
      throw new Error('No response from content script');
    }
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to access camera');
    }
    
    console.log('Camera initialization successful');
    updateStatus('Camera initialized', false, elements);
    return true;
  } catch (error) {
    console.error('Camera initialization error:', error);
    updateStatus('Camera access failed: ' + error.message, true, elements);
    return false;
  }
}

/**
 * Update status display
 */
function updateStatus(message, isError, elements) {
  // Check if elements object exists
  if (!elements) return;
  
  // Update status element if it exists
  if (elements.statusElement) {
    elements.statusElement.textContent = message;
    elements.statusElement.className = 'status ' + (isError ? 'error' : 'success');
  }
  
  // Update eye tracking status if it exists
  if (elements.eyeTrackingStatus) {
    elements.eyeTrackingStatus.textContent = isError ? 'Camera unavailable' : 'Camera ready';
    elements.eyeTrackingStatus.className = 'status ' + (isError ? 'error' : 'success');
  }
  
  // Update status text if it exists
  if (elements.statusText) {
    elements.statusText.textContent = isError ? 'Error: ' + message : message;
  }
}

// Helper function to send messages to background script
function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}