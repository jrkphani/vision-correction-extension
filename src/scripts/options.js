/**
 * Options script for Vision Correction Extension
 * 
 * This script manages the advanced settings page UI and saves user preferences.
 */

// DOM Elements - Settings
const performanceModeSelect = document.getElementById('performance-mode');
const autoAdjustToggle = document.getElementById('auto-adjust-toggle');
const trackingFrequencySelect = document.getElementById('tracking-frequency');
const distanceTrackingToggle = document.getElementById('distance-tracking-toggle');
const pupilTrackingToggle = document.getElementById('pupil-tracking-toggle');
const recalibrateBtn = document.getElementById('recalibrate-btn');

// DOM Elements - Correction Parameters
const textEnhancementSlider = document.getElementById('text-enhancement');
const textEnhancementValue = document.getElementById('text-enhancement-value');
const contrastEnhancementSlider = document.getElementById('contrast-enhancement');
const contrastEnhancementValue = document.getElementById('contrast-enhancement-value');
const focalAdjustmentSlider = document.getElementById('focal-adjustment');
const focalAdjustmentValue = document.getElementById('focal-adjustment-value');
const zoomIntensitySlider = document.getElementById('zoom-intensity');
const zoomIntensityValue = document.getElementById('zoom-intensity-value');

// DOM Elements - Profiles
const profileList = document.getElementById('profile-list');
const addProfileBtn = document.getElementById('add-profile-btn');

// DOM Elements - Action buttons
const saveSettingsBtn = document.getElementById('save-settings');
const resetSettingsBtn = document.getElementById('reset-settings');

// DOM Elements - Modal
const profileModal = document.getElementById('profile-modal');
const modalTitle = document.getElementById('modal-title');
const profileForm = document.getElementById('profile-form');
const profileNameInput = document.getElementById('profile-name');
const leftSphereInput = document.getElementById('left-sphere');
const leftCylinderInput = document.getElementById('left-cylinder');
const leftAxisInput = document.getElementById('left-axis');
const rightSphereInput = document.getElementById('right-sphere');
const rightCylinderInput = document.getElementById('right-cylinder');
const rightAxisInput = document.getElementById('right-axis');
const pdInput = document.getElementById('pd-value');
const cancelBtn = document.getElementById('cancel-btn');
const deleteProfileBtn = document.getElementById('delete-profile-btn');
const closeModal = document.querySelector('.close');

// State variables
let currentState = null;
let isEditingProfile = false;
let currentEditingProfile = null;
let advancedSettings = {
  trackingFrequency: 'medium',
  enableDistanceTracking: true,
  enablePupilTracking: false,
  textEnhancement: 50,
  focalAdjustment: 50,
  zoomIntensity: 30,
};

// Initialize the options page
document.addEventListener('DOMContentLoaded', initializeOptionsPage);

async function initializeOptionsPage() {
  try {
    // Get current state from background script
    currentState = await getState();
    
    // Merge advanced settings if they exist
    if (currentState.advancedSettings) {
      advancedSettings = { ...advancedSettings, ...currentState.advancedSettings };
    }
    
    // Update UI with current state
    updateUI();
    
    // Set up event listeners
    setupEventListeners();
    
    // Populate profile list
    populateProfileList();
  } catch (error) {
    console.error('Error initializing options page:', error);
  }
}

function updateUI() {
  if (!currentState) return;
  
  // Update basic settings
  performanceModeSelect.value = currentState.settings.performanceMode;
  autoAdjustToggle.checked = currentState.settings.autoAdjust;
  
  // Update advanced settings
  trackingFrequencySelect.value = advancedSettings.trackingFrequency;
  distanceTrackingToggle.checked = advancedSettings.enableDistanceTracking;
  pupilTrackingToggle.checked = advancedSettings.enablePupilTracking;
  
  // Update sliders
  textEnhancementSlider.value = advancedSettings.textEnhancement;
  textEnhancementValue.textContent = `${advancedSettings.textEnhancement}%`;
  
  contrastEnhancementSlider.value = currentState.settings.contrastEnhancement * 100;
  contrastEnhancementValue.textContent = `${Math.round(currentState.settings.contrastEnhancement * 100)}%`;
  
  focalAdjustmentSlider.value = advancedSettings.focalAdjustment;
  focalAdjustmentValue.textContent = `${advancedSettings.focalAdjustment}%`;
  
  zoomIntensitySlider.value = advancedSettings.zoomIntensity;
  zoomIntensityValue.textContent = `${advancedSettings.zoomIntensity}%`;
}

function populateProfileList() {
  // Clear current list
  profileList.innerHTML = '';
  
  // Add each profile
  Object.entries(currentState.profiles).forEach(([name, profile]) => {
    const profileItem = document.createElement('div');
    profileItem.className = 'profile-item';
    
    const leftEyeDesc = `${profile.leftEye.sphere}${profile.leftEye.cylinder !== 0 ? ' / ' + profile.leftEye.cylinder : ''}`;
    const rightEyeDesc = `${profile.rightEye.sphere}${profile.rightEye.cylinder !== 0 ? ' / ' + profile.rightEye.cylinder : ''}`;
    
    profileItem.innerHTML = `
      <span>${name}</span>
      <span>${leftEyeDesc}</span>
      <span>${rightEyeDesc}</span>
      <div class="profile-actions">
        <button class="btn edit-profile" data-profile="${name}">Edit</button>
        <button class="btn ${currentState.activeProfile === name ? 'primary' : ''} set-active" data-profile="${name}">
          ${currentState.activeProfile === name ? 'Active' : 'Set Active'}
        </button>
      </div>
    `;
    
    profileList.appendChild(profileItem);
  });
  
  // Add event listeners to the buttons
  document.querySelectorAll('.edit-profile').forEach(button => {
    button.addEventListener('click', () => {
      openProfileModal(false, button.dataset.profile);
    });
  });
  
  document.querySelectorAll('.set-active').forEach(button => {
    button.addEventListener('click', () => {
      setActiveProfile(button.dataset.profile);
    });
  });
}

function setupEventListeners() {
  // Slider value display updates
  textEnhancementSlider.addEventListener('input', () => {
    textEnhancementValue.textContent = `${textEnhancementSlider.value}%`;
  });
  
  contrastEnhancementSlider.addEventListener('input', () => {
    contrastEnhancementValue.textContent = `${contrastEnhancementSlider.value}%`;
  });
  
  focalAdjustmentSlider.addEventListener('input', () => {
    focalAdjustmentValue.textContent = `${focalAdjustmentSlider.value}%`;
  });
  
  zoomIntensitySlider.addEventListener('input', () => {
    zoomIntensityValue.textContent = `${zoomIntensitySlider.value}%`;
  });
  
  // Add profile button
  addProfileBtn.addEventListener('click', () => {
    openProfileModal(true);
  });
  
  // Save settings button
  saveSettingsBtn.addEventListener('click', saveSettings);
  
  // Reset settings button
  resetSettingsBtn.addEventListener('click', resetSettings);
  
  // Recalibrate button
  recalibrateBtn.addEventListener('click', startCalibration);
  
  // Modal close buttons
  closeModal.addEventListener('click', closeProfileModal);
  cancelBtn.addEventListener('click', closeProfileModal);
  
  // Delete profile button
  deleteProfileBtn.addEventListener('click', deleteProfile);
  
  // Profile form submission
  profileForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveProfile();
  });
  
  // Close modal when clicking outside
  window.addEventListener('click', (e) => {
    if (e.target === profileModal) {
      closeProfileModal();
    }
  });
}

function openProfileModal(isNew, profileName = null) {
  isEditingProfile = !isNew;
  currentEditingProfile = profileName;
  
  // Set modal title
  modalTitle.textContent = isNew ? 'Create New Profile' : 'Edit Profile';
  
  // Show/hide delete button
  deleteProfileBtn.style.display = isNew ? 'none' : 'block';
  
  if (isNew) {
    // Default values for new profile
    profileNameInput.value = 'New Profile';
    leftSphereInput.value = '-2.0';
    leftCylinderInput.value = '0';
    leftAxisInput.value = '0';
    rightSphereInput.value = '-2.0';
    rightCylinderInput.value = '0';
    rightAxisInput.value = '0';
    pdInput.value = '62';
    
    // Enable profile name input for new profiles
    profileNameInput.disabled = false;
  } else {
    // Load existing profile data
    const profile = currentState.profiles[profileName];
    
    profileNameInput.value = profileName;
    leftSphereInput.value = profile.leftEye.sphere;
    leftCylinderInput.value = profile.leftEye.cylinder;
    leftAxisInput.value = profile.leftEye.axis;
    rightSphereInput.value = profile.rightEye.sphere;
    rightCylinderInput.value = profile.rightEye.cylinder;
    rightAxisInput.value = profile.rightEye.axis;
    pdInput.value = profile.pd;
    
    // Disable profile name input for existing profiles
    profileNameInput.disabled = true;
  }
  
  // Show the modal
  profileModal.style.display = 'block';
}

function closeProfileModal() {
  profileModal.style.display = 'none';
  currentEditingProfile = null;
  isEditingProfile = false;
}

function saveProfile() {
  // Get form values
  const profileName = isEditingProfile ? currentEditingProfile : profileNameInput.value.trim();
  
  // Create profile object
  const profile = {
    leftEye: {
      sphere: parseFloat(leftSphereInput.value),
      cylinder: parseFloat(leftCylinderInput.value),
      axis: parseInt(leftAxisInput.value)
    },
    rightEye: {
      sphere: parseFloat(rightSphereInput.value),
      cylinder: parseFloat(rightCylinderInput.value),
      axis: parseInt(rightAxisInput.value)
    },
    pd: parseFloat(pdInput.value)
  };
  
  // Update profiles in state
  const profiles = { ...currentState.profiles };
  profiles[profileName] = profile;
  
  // Update state
  updateState({ profiles });
  
  // Close the modal
  closeProfileModal();
  
  // Refresh profile list
  populateProfileList();
}

function deleteProfile() {
  if (!isEditingProfile || !currentEditingProfile) return;
  
  // Cannot delete the last profile
  if (Object.keys(currentState.profiles).length <= 1) {
    alert('Cannot delete the last profile. At least one profile must exist.');
    return;
  }
  
  // Cannot delete the active profile
  if (currentEditingProfile === currentState.activeProfile) {
    alert('Cannot delete the active profile. Please select another profile first.');
    return;
  }
  
  if (confirm(`Are you sure you want to delete the profile "${currentEditingProfile}"?`)) {
    // Create a copy of profiles without the deleted one
    const profiles = { ...currentState.profiles };
    delete profiles[currentEditingProfile];
    
    // Update state
    updateState({ profiles });
    
    // Close the modal
    closeProfileModal();
    
    // Refresh profile list
    populateProfileList();
  }
}

function setActiveProfile(profileName) {
  updateState({ activeProfile: profileName });
  populateProfileList();
}

function saveSettings() {
  // Collect settings from UI
  const performanceMode = performanceModeSelect.value;
  const autoAdjust = autoAdjustToggle.checked;
  const contrastEnhancement = contrastEnhancementSlider.value / 100;
  const sharpnessEnhancement = textEnhancementSlider.value / 100;
  
  // Basic settings update
  const settings = {
    performanceMode,
    autoAdjust,
    contrastEnhancement,
    sharpnessEnhancement
  };
  
  // Advanced settings update
  const updatedAdvancedSettings = {
    trackingFrequency: trackingFrequencySelect.value,
    enableDistanceTracking: distanceTrackingToggle.checked,
    enablePupilTracking: pupilTrackingToggle.checked,
    textEnhancement: parseInt(textEnhancementSlider.value),
    focalAdjustment: parseInt(focalAdjustmentSlider.value),
    zoomIntensity: parseInt(zoomIntensitySlider.value)
  };
  
  // Update state
  updateState({ 
    settings,
    advancedSettings: updatedAdvancedSettings
  });
  
  // Show success message
  alert('Settings saved successfully!');
}

function resetSettings() {
  if (confirm('Are you sure you want to reset all settings to default values?')) {
    // Reset to default values
    performanceModeSelect.value = 'balanced';
    autoAdjustToggle.checked = true;
    trackingFrequencySelect.value = 'medium';
    distanceTrackingToggle.checked = true;
    pupilTrackingToggle.checked = false;
    textEnhancementSlider.value = 50;
    textEnhancementValue.textContent = '50%';
    contrastEnhancementSlider.value = 50;
    contrastEnhancementValue.textContent = '50%';
    focalAdjustmentSlider.value = 50;
    focalAdjustmentValue.textContent = '50%';
    zoomIntensitySlider.value = 30;
    zoomIntensityValue.textContent = '30%';
    
    // Save settings
    saveSettings();
  }
}

function startCalibration() {
  // Send message to start calibration
  chrome.runtime.sendMessage({ type: 'START_CALIBRATION' }, (response) => {
    if (response && response.success) {
      // Open a new tab for calibration
      chrome.tabs.create({ url: 'https://example.com' }, (tab) => {
        // Tab will be used for calibration
        console.log('Calibration tab opened:', tab.id);
      });
    }
  });
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
        currentState = response.state;
      }
      resolve(response);
    });
  });
}