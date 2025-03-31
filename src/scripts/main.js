// Main window script for the Vision Correction Chrome App
document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI elements
    const statusElement = document.getElementById('status');
    const qualitySelect = document.getElementById('quality');
    const screenDistanceInput = document.getElementById('screenDistance');
    const chromaticAberrationCheckbox = document.getElementById('chromaticAberration');

    // Load saved settings
    chrome.storage.sync.get(['quality', 'screenDistance', 'chromaticAberration'], (result) => {
        if (result.quality) qualitySelect.value = result.quality;
        if (result.screenDistance) screenDistanceInput.value = result.screenDistance;
        if (result.chromaticAberration !== undefined) {
            chromaticAberrationCheckbox.checked = result.chromaticAberration;
        }
    });

    // Save settings when changed
    qualitySelect.addEventListener('change', () => {
        chrome.storage.sync.set({ quality: qualitySelect.value });
    });

    screenDistanceInput.addEventListener('change', () => {
        chrome.storage.sync.set({ screenDistance: screenDistanceInput.value });
    });

    chromaticAberrationCheckbox.addEventListener('change', () => {
        chrome.storage.sync.set({ chromaticAberration: chromaticAberrationCheckbox.checked });
    });

    // Update status
    statusElement.textContent = 'Ready';
}); 