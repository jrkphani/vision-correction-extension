/**
 * Content script for Vision Correction Extension
 * 
 * This script runs in the context of web pages and applies vision correction
 * based on user's prescription and eye tracking data.
 */

import * as tf from '@tensorflow/tfjs';
import * as THREE from 'three';
import { mat4, vec3 } from 'gl-matrix';
import { createDetector, SupportedModels } from '@tensorflow-models/face-landmarks-detection';

// Main class to handle vision correction
class VisionCorrector {
  constructor() {
    this.state = null;
    this.isInitialized = false;
    this.isCalibrating = false;
    this.eyeTracker = null;
    this.overlayElement = null;
    this.observer = null;
    this.currentGaze = { x: 0.5, y: 0.5 };
    this.screenDistance = 50; // Default value, will be updated from state
    this.dominantEye = 'right';
    this.frameId = null;
    
    // Three.js specific properties
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.correctionMesh = null;
    this.correctionShader = null;
    this.screenTexture = null;
    
    // Quality settings
    this.qualitySettings = {
      high: {
        resolution: 1.0,
        antialias: true,
        chromaticAberration: true,
        updateRate: 60,
        textureQuality: 'high'
      },
      medium: {
        resolution: 0.75,
        antialias: false,
        chromaticAberration: true,
        updateRate: 30,
        textureQuality: 'medium'
      },
      low: {
        resolution: 0.5,
        antialias: false,
        chromaticAberration: false,
        updateRate: 15,
        textureQuality: 'low'
      }
    };
    
    this.currentQuality = 'medium';
    this.lastUpdateTime = 0;
    this.updateInterval = 1000 / this.qualitySettings[this.currentQuality].updateRate;
    
    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.startCorrection = this.startCorrection.bind(this);
    this.stopCorrection = this.stopCorrection.bind(this);
    this.updateCorrection = this.updateCorrection.bind(this);
    this.startCalibration = this.startCalibration.bind(this);
    this.onStateUpdate = this.onStateUpdate.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
    this.setupMutationObserver = this.setupMutationObserver.bind(this);
    
    // Set up message listener
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    
    // Initialize when DOM is fully loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', this.initialize);
    } else {
      this.initialize();
    }
    
    // Handle tab visibility changes
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    
    this.cameraStream = null;
    this.cameraVideo = null;
  }
  
  async initialize() {
    console.log('Initializing Vision Corrector...');
    
    try {
      // Get initial state from background
      const state = await this.getState();
      this.state = state;
      
      // Initialize eye tracking if enabled
      if (state.enabled) {
        await this.initializeEyeTracking();
        this.startCorrection();
      }
      
      this.isInitialized = true;
      console.log('Vision Corrector initialized successfully');
      
      // Set up observer to detect DOM changes
      this.setupMutationObserver();
    } catch (error) {
      console.error('Error initializing Vision Corrector:', error);
    }
  }
  
  async getState() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
        resolve(response);
      });
    });
  }
  
  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'STATE_UPDATED':
        this.onStateUpdate(message.data);
        break;
        
      case 'CORRECTION_TOGGLED':
        if (message.enabled) {
          this.startCorrection();
        } else {
          this.stopCorrection();
        }
        break;
        
      case 'START_CALIBRATION':
        this.startCalibration();
        break;
        
      case 'REQUEST_CAMERA_ACCESS':
        this.handleCameraAccessRequest(message.constraints)
          .then(sendResponse);
        return true; // Required for async response
        
      case 'PING':
        // Respond to ping to verify connection is established
        sendResponse({ status: 'alive' });
        return true; // Required for async response
        
      case 'INITIALIZE_CAMERA':
        // No streamId needed for getDisplayMedia approach
        this.initializeCamera()
          .then(response => {
            console.log('Camera initialization response:', response);
            sendResponse(response);
          })
          .catch(error => {
            console.error('Camera initialization error:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true; // Required for async response
        
      default:
        // Send a response even for unhandled messages
        sendResponse({ success: false, error: 'Unhandled message type: ' + message.type });
        return true;
    }
  }
  
  async handleCameraAccessRequest(constraints) {
    try {
      // Check if we're in a secure context (required for getUserMedia)
      if (!window.isSecureContext) {
        throw new Error('Camera access requires a secure context (HTTPS or localhost)');
      }

      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support camera access');
      }

      // Request camera access
      this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Create video element for camera feed
      this.cameraVideo = document.createElement('video');
      this.cameraVideo.id = 'vision-correction-camera';
      this.cameraVideo.style.position = 'fixed';
      this.cameraVideo.style.top = '0';
      this.cameraVideo.style.left = '0';
      this.cameraVideo.style.width = '1px';  // Minimal size but still active
      this.cameraVideo.style.height = '1px';
      this.cameraVideo.style.opacity = '0.01';  // Nearly invisible but still active
      this.cameraVideo.style.pointerEvents = 'none';
      this.cameraVideo.autoplay = true;
      this.cameraVideo.playsInline = true;

      // Wait for video to be ready
      await new Promise((resolve, reject) => {
        this.cameraVideo.onloadedmetadata = () => {
          this.cameraVideo.play().then(resolve).catch(reject);
        };
        this.cameraVideo.onerror = () => reject(new Error('Failed to initialize video stream'));
      });

      document.body.appendChild(this.cameraVideo);
      this.cameraVideo.srcObject = this.cameraStream;

      return { success: true };
    } catch (error) {
      console.error('Error accessing camera:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
  
  onStateUpdate(newState) {
    const wasEnabled = this.state?.enabled;
    this.state = newState;
    
    if (wasEnabled !== newState.enabled) {
      if (newState.enabled) {
        this.startCorrection();
      } else {
        this.stopCorrection();
      }
    } else if (newState.enabled) {
      // Update correction parameters if still enabled
      this.updateCorrection();
    }
  }
  
  async initializeEyeTracking() {
    try {
      // Check if we're in a secure context (required for getUserMedia)
      if (!window.isSecureContext) {
        throw new Error('Camera access requires a secure context (HTTPS or localhost)');
      }

      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support camera access');
      }

      console.log('Requesting camera permission...');
      
      // First, explicitly request camera permission from the browser
      await navigator.mediaDevices.getUserMedia({ video: true });
      
      // Then proceed with the actual camera setup with specific constraints
      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      };

      // If a specific camera is selected in settings, use it
      if (this.state.settings.selectedCamera) {
        constraints.video.deviceId = { exact: this.state.settings.selectedCamera };
      }

      // Request camera access through getUserMedia
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Create video element for camera feed
      const video = document.createElement('video');
      video.id = 'vision-correction-camera';
      video.style.position = 'fixed';
      video.style.top = '0';
      video.style.left = '0';
      video.style.width = '1px';  // Minimal size but still active
      video.style.height = '1px';
      video.style.opacity = '0.01';  // Nearly invisible but still active
      video.style.pointerEvents = 'none';
      video.autoplay = true;
      video.playsInline = true;

      // Wait for video to be ready
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = () => {
          video.play().then(resolve).catch(reject);
        };
        video.onerror = () => reject(new Error('Failed to initialize video stream'));
      });

      document.body.appendChild(video);
      video.srcObject = stream;

      // Update state to indicate camera is enabled
      await this.updateState({
        settings: {
          ...this.state.settings,
          cameraEnabled: true
        }
      });

      // Load TensorFlow.js and face-landmarks-detection model
      console.log('Loading eye tracking model...');
      await tf.setBackend('webgl');
      const model = await createDetector(SupportedModels.mediapipeFacemesh, { maxFaces: 1 });

      this.eyeTracker = {
        video,
        model,
        stream,
        track: async () => {
          if (!video.videoWidth || !video.videoHeight) {
            console.warn('Video dimensions not ready');
            return null;
          }

          try {
            const predictions = await model.estimateFaces({
              input: video,
              returnTensors: false,
              flipHorizontal: false,
              predictIrises: true
            });

            if (predictions.length > 0) {
              const face = predictions[0];
              // Get iris landmarks
              const leftIris = face.annotations.leftEyeIris;
              const rightIris = face.annotations.rightEyeIris;
              
              // Calculate gaze position
              const leftGaze = this.calculateGazePosition(leftIris);
              const rightGaze = this.calculateGazePosition(rightIris);
              
              // Use dominant eye or average of both
              const gaze = this.dominantEye === 'left' ? leftGaze : rightGaze;
              
              // Update current gaze position
              this.currentGaze = gaze;
              
              return gaze;
            }
          } catch (error) {
            console.error('Error tracking face:', error);
          }
          return null;
        }
      };

      console.log('Eye tracking initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize eye tracking:', error);
      // Update state to indicate camera is disabled
      await this.updateState({
        settings: {
          ...this.state.settings,
          cameraEnabled: false
        }
      });
      throw error;
    }
  }
  
  calculateDistance(faceWidth) {
    // If user has set a custom distance, use that instead of calculating
    if (this.screenDistance !== 50) {
      return this.screenDistance;
    }

    // Otherwise, calculate based on face tracking
    const TYPICAL_FACE_WIDTH_CM = 15;
    const CAMERA_FOV = 60; // Typical webcam FOV in degrees
    const distance = (TYPICAL_FACE_WIDTH_CM * video.videoWidth) / 
                    (2 * faceWidth * Math.tan(CAMERA_FOV * Math.PI / 360));
    return distance;
  }
  
  determineDominantEye(leftIris, rightIris) {
    // Simple heuristic: the iris with larger area might indicate dominant eye
    const leftArea = this.calculateIrisArea(leftIris);
    const rightArea = this.calculateIrisArea(rightIris);
    return leftArea > rightArea ? 'left' : 'right';
  }
  
  calculateIrisArea(iris) {
    // Calculate approximate iris area using the landmarks
    const width = Math.abs(iris[3][0] - iris[1][0]);
    const height = Math.abs(iris[4][1] - iris[2][1]);
    return width * height;
  }
  
  startCorrection() {
    if (!this.state?.enabled || !this.isInitialized) return;
    
    console.log('Starting vision correction');
    
    // Create overlay element if it doesn't exist
    if (!this.overlayElement) {
      this.createOverlay();
    }
    
    // Start the correction loop
    this.updateCorrection();
  }
  
  stopCorrection() {
    console.log('Stopping vision correction');
    
    // Cancel the animation frame
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    
    // Remove the overlay
    if (this.overlayElement) {
      // Clean up Three.js resources
      if (this.renderer) {
        this.renderer.dispose();
      }
      if (this.correctionMesh) {
        this.correctionMesh.geometry.dispose();
        this.correctionMesh.material.dispose();
      }
      if (this.screenTexture) {
        this.screenTexture.dispose();
      }
      document.body.removeChild(this.overlayElement);
      this.overlayElement = null;
    }
  }
  
  createOverlay() {
    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'vision-correction-overlay';
    this.overlayElement.style.position = 'fixed';
    this.overlayElement.style.top = '0';
    this.overlayElement.style.left = '0';
    this.overlayElement.style.width = '100%';
    this.overlayElement.style.height = '100%';
    this.overlayElement.style.pointerEvents = 'none';
    this.overlayElement.style.zIndex = '2147483647'; // Max z-index
    
    // Create Three.js scene
    this.scene = new THREE.Scene();
    
    // Create orthographic camera
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1 / aspect, -1 / aspect, 0.1, 1000);
    this.camera.position.z = 1;
    
    // Get current quality settings
    const quality = this.qualitySettings[this.currentQuality];
    
    // Create WebGL renderer with quality settings
    this.renderer = new THREE.WebGLRenderer({ 
      alpha: true,
      antialias: quality.antialias,
      powerPreference: 'high-performance'
    });
    
    // Set renderer size based on quality
    const width = window.innerWidth * quality.resolution;
    const height = window.innerHeight * quality.resolution;
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(quality.textureQuality === 'high' ? window.devicePixelRatio : 1);
    this.overlayElement.appendChild(this.renderer.domElement);
    
    // Create screen texture with quality settings
    this.screenTexture = new THREE.Texture();
    this.screenTexture.minFilter = quality.textureQuality === 'high' ? THREE.LinearFilter : THREE.NearestFilter;
    this.screenTexture.magFilter = quality.textureQuality === 'high' ? THREE.LinearFilter : THREE.NearestFilter;
    this.screenTexture.format = THREE.RGBAFormat;
    
    // Update shader based on quality
    this.correctionShader = {
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float diopter;
        uniform float cylinder;
        uniform float axis;
        uniform vec2 gazePoint;
        uniform float screenDistance;
        uniform sampler2D screenTexture;
        uniform bool useChromaticAberration;
        varying vec2 vUv;
        
        // Constants for visual acuity regions
        const float FOVEAL_ANGLE = 2.0;    // 2 degrees for high acuity
        const float PARAFOVEAL_ANGLE = 5.0; // 5 degrees for moderate acuity
        
        // Function to convert angle in degrees to screen distance in UV space
        float angleToUVDistance(float angleDegrees, float screenDistanceCm) {
          // Convert angle to radians
          float angleRad = angleDegrees * 3.14159 / 180.0;
          // Calculate the actual distance on screen
          float distanceCm = screenDistanceCm * tan(angleRad);
          // Convert to UV space (assuming screen width is about 50cm at 50cm viewing distance)
          return distanceCm / 50.0;
        }
        
        // Function to calculate correction strength based on distance from gaze
        float getCorrectionStrength(vec2 currentUV, vec2 gazeUV, float screenDistanceCm) {
          float dist = length(currentUV - gazeUV);
          
          // Calculate UV distances for foveal and parafoveal regions
          float fovealDist = angleToUVDistance(FOVEAL_ANGLE / 2.0, screenDistanceCm);
          float parafovealDist = angleToUVDistance(PARAFOVEAL_ANGLE / 2.0, screenDistanceCm);
          
          // Full correction in foveal region
          if (dist <= fovealDist) {
            return 1.0;
          }
          // Gradual decrease in parafoveal region
          else if (dist <= parafovealDist) {
            return 1.0 - smoothstep(fovealDist, parafovealDist, dist);
          }
          // No correction outside parafoveal region
          else {
            return 0.0;
          }
        }
        
        void main() {
          // Calculate distance from gaze point
          vec2 center = gazePoint;
          float dist = length(vUv - center);
          
          // Get correction strength based on visual acuity regions
          float correctionStrength = getCorrectionStrength(vUv, center, screenDistance);
          
          // Calculate lens distortion based on diopter
          float distortion = diopter * (dist * dist) * correctionStrength;
          
          // Apply cylindrical correction
          float angle = atan(vUv.y - center.y, vUv.x - center.x);
          float cylDistortion = cylinder * cos(angle - radians(axis)) * (dist * dist) * correctionStrength;
          
          // Combine distortions
          float totalDistortion = distortion + cylDistortion;
          
          // Apply distortion to UV coordinates
          vec2 distortedUV = vUv + normalize(vUv - center) * totalDistortion;
          
          // Clamp UV coordinates to prevent sampling outside texture
          distortedUV = clamp(distortedUV, 0.0, 1.0);
          
          // Sample the screen texture with distorted coordinates
          vec4 color = texture2D(screenTexture, distortedUV);
          
          // Apply chromatic aberration if enabled, scaled by correction strength
          if (useChromaticAberration) {
            float chromaticOffset = totalDistortion * 0.01;
            vec4 redChannel = texture2D(screenTexture, distortedUV + vec2(chromaticOffset, 0.0));
            vec4 blueChannel = texture2D(screenTexture, distortedUV - vec2(chromaticOffset, 0.0));
            color = vec4(
              mix(color.r, redChannel.r, correctionStrength),
              color.g,
              mix(color.b, blueChannel.b, correctionStrength),
              color.a
            );
          }
          
          gl_FragColor = color;
        }
      `
    };
    
    // Create correction mesh with quality settings
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        diopter: { value: 0.0 },
        cylinder: { value: 0.0 },
        axis: { value: 0.0 },
        gazePoint: { value: new THREE.Vector2(0.5, 0.5) },
        screenDistance: { value: 60.0 },
        screenTexture: { value: this.screenTexture },
        useChromaticAberration: { value: quality.chromaticAberration }
      },
      vertexShader: this.correctionShader.vertexShader,
      fragmentShader: this.correctionShader.fragmentShader,
      transparent: true
    });
    
    this.correctionMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.correctionMesh);
    
    document.body.appendChild(this.overlayElement);
    
    // Handle window resize
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }
  
  onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const quality = this.qualitySettings[this.currentQuality];
    
    // Update camera
    const aspect = width / height;
    this.camera.left = -1;
    this.camera.right = 1;
    this.camera.top = 1 / aspect;
    this.camera.bottom = -1 / aspect;
    this.camera.updateProjectionMatrix();
    
    // Update renderer with quality settings
    this.renderer.setSize(width * quality.resolution, height * quality.resolution);
    this.renderer.setPixelRatio(quality.textureQuality === 'high' ? window.devicePixelRatio : 1);
  }
  
  async updateCorrection() {
    if (!this.state?.enabled || !this.eyeTracker) {
      return;
    }
    
    try {
      // Check if we should update based on quality settings
      const currentTime = performance.now();
      if (currentTime - this.lastUpdateTime < this.updateInterval) {
        // Skip this frame if we're not due for an update
        this.frameId = requestAnimationFrame(this.updateCorrection);
        return;
      }
      
      // Get current eye tracking data
      const trackingData = await this.eyeTracker.track();
      this.currentGaze = trackingData.gaze;
      this.screenDistance = trackingData.distance;
      this.dominantEye = trackingData.dominantEye;
      
      // Capture screen content
      await this.captureScreen();
      
      // Apply correction based on current gaze and prescription
      this.applyCorrection();
      
      this.lastUpdateTime = currentTime;
      
      // Schedule next update
      this.frameId = requestAnimationFrame(this.updateCorrection);
    } catch (error) {
      console.error('Error updating correction:', error);
    }
  }
  
  async captureScreen() {
    try {
      const quality = this.qualitySettings[this.currentQuality];
      
      // Create a canvas to capture the screen
      const canvas = document.createElement('canvas');
      canvas.width = window.innerWidth * quality.resolution;
      canvas.height = window.innerHeight * quality.resolution;
      const ctx = canvas.getContext('2d');
      
      // Set image smoothing based on quality
      ctx.imageSmoothingEnabled = quality.textureQuality === 'high';
      ctx.imageSmoothingQuality = quality.textureQuality === 'high' ? 'high' : 'low';
      
      // Use a temporary image element for capturing the visible area
      const img = new Image();
      
      // If we have access to browser tab capture, use it (future implementation)
      // For now, we'll create a screenshot of the visible area by rendering to HTML
      
      // Create a temporary container for the current page content
      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'absolute';
      tempContainer.style.top = '0';
      tempContainer.style.left = '0';
      tempContainer.style.width = `${window.innerWidth}px`;
      tempContainer.style.height = `${window.innerHeight}px`;
      tempContainer.style.overflow = 'hidden';
      tempContainer.style.pointerEvents = 'none';
      tempContainer.style.visibility = 'hidden';
      
      // Clone the current body for screenshot
      const clonedBody = document.body.cloneNode(true);
      
      // Remove our own overlay from the clone to avoid recursive effects
      const ourElements = clonedBody.querySelectorAll('#vision-correction-overlay, #vision-correction-calibration');
      ourElements.forEach(el => el.parentNode?.removeChild(el));
      
      tempContainer.appendChild(clonedBody);
      document.body.appendChild(tempContainer);
      
      // Use html2canvas or a similar approach (simplified version here)
      // In a production extension, you would likely use a dedicated library
      // or the chrome.tabs.captureVisibleTab API if available
      
      // Wait for the next animation frame to ensure the DOM is updated
      await new Promise(resolve => requestAnimationFrame(resolve));
      
      // Get computed styles for the body
      const bodyStyles = window.getComputedStyle(document.body);
      const backgroundColor = bodyStyles.backgroundColor;
      
      // Fill with the page background color
      ctx.fillStyle = backgroundColor || '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Note: In a real implementation, we would use html2canvas or similar library
      // For this fix, we're creating a simpler representation
      // that allows the extension to continue working
      
      // Create pattern representing the page content
      // This is a simplified approach - in production use html2canvas or similar
      this.drawPageRepresentation(ctx, canvas.width, canvas.height);
      
      // Clean up
      document.body.removeChild(tempContainer);
      
      // Update the screen texture
      this.screenTexture.image = canvas;
      this.screenTexture.needsUpdate = true;
    } catch (error) {
      console.error('Error capturing screen:', error);
    }
  }
  
  /**
   * Draw a simplified representation of the page
   * In a production extension, replace this with html2canvas or similar
   */
  drawPageRepresentation(ctx, width, height) {
    // Set fill style
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    
    // Get all visible elements with significant area
    const elements = Array.from(document.querySelectorAll('*'))
      .filter(el => {
        if (!el.getBoundingClientRect) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 50 && rect.height > 20 && 
               rect.top < window.innerHeight && 
               rect.left < window.innerWidth &&
               rect.bottom > 0 && rect.right > 0;
      });
    
    // Draw rectangles representing page elements
    elements.forEach(el => {
      try {
        const rect = el.getBoundingClientRect();
        const styles = window.getComputedStyle(el);
        const x = rect.left * width / window.innerWidth;
        const y = rect.top * height / window.innerHeight;
        const w = rect.width * width / window.innerWidth;
        const h = rect.height * height / window.innerHeight;
        
        // Only draw if element has visible background or border
        if (styles.backgroundColor !== 'rgba(0, 0, 0, 0)' || 
            styles.borderWidth !== '0px') {
          ctx.fillStyle = styles.backgroundColor !== 'rgba(0, 0, 0, 0)' ? 
                         styles.backgroundColor : '#f0f0f0';
          ctx.fillRect(x, y, w, h);
          
          if (styles.borderWidth !== '0px') {
            ctx.strokeStyle = styles.borderColor;
            ctx.lineWidth = parseFloat(styles.borderWidth);
            ctx.strokeRect(x, y, w, h);
          }
        }
      } catch (e) {
        // Skip elements that can't be processed
      }
    });
  }
  
  applyCorrection() {
    if (!this.renderer || !this.correctionMesh) return;
    
    // Get the active profile
    const profile = this.state.profiles[this.state.activeProfile];
    if (!profile) return;
    
    // Determine which eye's prescription to use based on gaze position and dominant eye
    const eyePrescription = this.determineActivePrescription(profile);
    
    // Update shader uniforms
    const material = this.correctionMesh.material;
    material.uniforms.diopter.value = eyePrescription.sphere;
    material.uniforms.cylinder.value = eyePrescription.cylinder;
    material.uniforms.axis.value = eyePrescription.axis;
    material.uniforms.gazePoint.value.set(
      this.currentGaze.x / window.innerWidth,
      this.currentGaze.y / window.innerHeight
    );
    material.uniforms.screenDistance.value = this.screenDistance;
    
    // Render the correction
    this.renderer.render(this.scene, this.camera);
  }
  
  determineActivePrescription(profile) {
    // Simple implementation - use dominant eye
    // A more sophisticated version would consider gaze position
    return this.dominantEye === 'left' ? profile.leftEye : profile.rightEye;
  }
  
  startCalibration() {
    if (this.isCalibrating) return;
    
    this.isCalibrating = true;
    console.log('Starting calibration process...');
    
    // Create calibration UI
    const calibrationDiv = document.createElement('div');
    calibrationDiv.id = 'vision-correction-calibration';
    calibrationDiv.style.position = 'fixed';
    calibrationDiv.style.top = '0';
    calibrationDiv.style.left = '0';
    calibrationDiv.style.width = '100%';
    calibrationDiv.style.height = '100%';
    calibrationDiv.style.backgroundColor = 'rgba(0,0,0,0.8)';
    calibrationDiv.style.zIndex = '2147483646'; // Just below overlay
    calibrationDiv.style.display = 'flex';
    calibrationDiv.style.flexDirection = 'column';
    calibrationDiv.style.justifyContent = 'center';
    calibrationDiv.style.alignItems = 'center';
    calibrationDiv.style.color = 'white';
    
    calibrationDiv.innerHTML = `
      <h1>Eye Tracking Calibration</h1>
      <p>Please follow the dot with your eyes</p>
      <div id="calibration-target" style="width: 20px; height: 20px; background-color: red; border-radius: 50%;"></div>
      <button id="finish-calibration" style="margin-top: 20px; padding: 10px 20px;">Finish Calibration</button>
    `;
    
    document.body.appendChild(calibrationDiv);
    
    // Set up calibration target movement
    const target = document.getElementById('calibration-target');
    let positions = [
      { x: '20%', y: '20%' },
      { x: '80%', y: '20%' },
      { x: '50%', y: '50%' },
      { x: '20%', y: '80%' },
      { x: '80%', y: '80%' }
    ];
    
    let currentPosition = 0;
    
    // Move target to first position
    target.style.position = 'absolute';
    target.style.left = positions[0].x;
    target.style.top = positions[0].y;
    
    // Set interval to move target
    const moveInterval = setInterval(() => {
      currentPosition = (currentPosition + 1) % positions.length;
      target.style.left = positions[currentPosition].x;
      target.style.top = positions[currentPosition].y;
    }, 2000);
    
    // Set up finish button
    document.getElementById('finish-calibration').addEventListener('click', () => {
      clearInterval(moveInterval);
      document.body.removeChild(calibrationDiv);
      this.isCalibrating = false;
      
      // Update calibration state
      const calibrationData = {
        completed: true,
        lastCalibrationDate: new Date().toISOString(),
        eyeTrackingAccuracy: 0.85 // Placeholder value
      };
      
      // Send calibration results to background
      chrome.runtime.sendMessage({
        type: 'UPDATE_STATE',
        data: {
          calibration: calibrationData
        }
      });
      
      console.log('Calibration completed');
    });
  }
  
  onVisibilityChange() {
    if (document.hidden) {
      // Pause processing when tab is not visible
      if (this.frameId) {
        cancelAnimationFrame(this.frameId);
        this.frameId = null;
      }
    } else if (this.state?.enabled) {
      // Resume processing when tab becomes visible again
      this.updateCorrection();
    }
  }
  
  setupMutationObserver() {
    // Watch for changes to the DOM that might affect our overlay
    this.observer = new MutationObserver((mutations) => {
      // Check if our overlay is still in the document
      if (this.state?.enabled && 
          this.overlayElement && 
          !document.body.contains(this.overlayElement)) {
        // Re-add the overlay if it was removed
        document.body.appendChild(this.overlayElement);
      }
    });
    
    // Start observing
    this.observer.observe(document.body, { 
      childList: true,
      subtree: true
    });
  }

  setQuality(qualityLevel) {
    if (!this.qualitySettings[qualityLevel]) return;
    
    this.currentQuality = qualityLevel;
    this.updateInterval = 1000 / this.qualitySettings[qualityLevel].updateRate;
    
    // Recreate overlay with new quality settings
    if (this.overlayElement) {
      this.stopCorrection();
      this.startCorrection();
    }
  }

  // Add method to update state
  async updateState(changes) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ 
        type: 'UPDATE_STATE', 
        data: changes 
      }, (response) => {
        if (response && response.success) {
          this.state = response.state;
        }
        resolve(response);
      });
    });
  }

  async initializeCamera() {
    try {
      console.log('Initializing camera with getDisplayMedia...');
      
      // Check if we're in a secure context
      if (!window.isSecureContext) {
        throw new Error('Camera access requires a secure context (HTTPS or localhost)');
      }

      // Check if getDisplayMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error('Your browser does not support getDisplayMedia');
      }
      
      // Use navigator.mediaDevices.getDisplayMedia which shows a clear permission UI
      console.log('Requesting display media access...');
      this.cameraStream = await navigator.mediaDevices.getDisplayMedia({ 
        video: true,
        audio: false
      });
      
      console.log('Display media access granted');
      
      // Create or reuse video element for camera feed
      if (!this.cameraVideo) {
        console.log('Creating new video element');
        this.cameraVideo = document.createElement('video');
        this.cameraVideo.id = 'vision-correction-camera';
        this.cameraVideo.style.position = 'fixed';
        this.cameraVideo.style.top = '0';
        this.cameraVideo.style.left = '0';
        this.cameraVideo.style.width = '1px';  // Minimal size but still active
        this.cameraVideo.style.height = '1px';
        this.cameraVideo.style.opacity = '0.01';  // Nearly invisible but still active
        this.cameraVideo.style.pointerEvents = 'none';
        this.cameraVideo.autoplay = true;
        this.cameraVideo.playsInline = true;
        
        document.body.appendChild(this.cameraVideo);
      }
      
      // Set the stream to the video element
      console.log('Setting stream to video element');
      this.cameraVideo.srcObject = this.cameraStream;
      
      // Wait for the video to be ready
      console.log('Waiting for video to be ready...');
      await new Promise((resolve, reject) => {
        this.cameraVideo.onloadedmetadata = () => {
          console.log('Video metadata loaded, playing video...');
          this.cameraVideo.play().then(resolve).catch(reject);
        };
        this.cameraVideo.onerror = (e) => {
          console.error('Video error:', e);
          reject(new Error('Failed to initialize video stream'));
        };
        
        // Add a timeout in case the metadata never loads
        setTimeout(() => {
          console.warn('Video metadata load timeout');
          reject(new Error('Video metadata load timeout'));
        }, 5000);
      });
      
      // Set up track end event listener to detect when user stops sharing
      this.cameraStream.getVideoTracks().forEach(track => {
        track.onended = () => {
          console.log('Video track ended, user stopped sharing');
          // Clean up resources
          if (this.cameraVideo) {
            this.cameraVideo.srcObject = null;
          }
        };
      });
      
      console.log('Camera initialized successfully');
      return { success: true };
      
    } catch (error) {
      console.error('Error initializing camera:', error);
      return { success: false, error: error.message };
    }
  }

  calculateGazePosition(iris) {
    // Calculate gaze position based on iris position
    const x = (iris[0][0] + iris[2][0]) / 2;
    const y = (iris[0][1] + iris[2][1]) / 2;
    
    return {
      x: x / this.cameraVideo.videoWidth,
      y: y / this.cameraVideo.videoHeight
    };
  }
}

// Create and initialize the vision corrector
const corrector = new VisionCorrector();
// No exports needed
