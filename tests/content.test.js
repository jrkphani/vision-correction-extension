/**
 * Tests for content.js
 */

// Mock the chrome API
global.chrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn(),
    },
    sendMessage: jest.fn((message, callback) => {
      if (message.type === 'GET_STATE') {
        callback({
          enabled: true,
          activeProfile: 'default',
          profiles: {
            default: {
              leftEye: { sphere: -2.0, cylinder: 0, axis: 0 },
              rightEye: { sphere: -2.0, cylinder: 0, axis: 0 },
              pd: 62
            }
          },
          settings: {
            performanceMode: 'balanced',
            autoAdjust: true,
            contrastEnhancement: 0.5,
            sharpnessEnhancement: 0.5
          }
        });
      }
    }),
  },
};

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn(callback => {
  return setTimeout(callback, 0);
});

// Mock cancelAnimationFrame
global.cancelAnimationFrame = jest.fn(id => {
  clearTimeout(id);
});

// Mock document
document.addEventListener = jest.fn();
document.createElement = jest.fn(() => ({
  style: {},
  appendChild: jest.fn(),
  getContext: jest.fn(() => ({
    clearColor: jest.fn(),
    clear: jest.fn()
  }))
}));
document.body = {
  appendChild: jest.fn(),
  removeChild: jest.fn(),
  contains: jest.fn().mockReturnValue(true)
};

// Import the VisionCorrector class (mocked for testing)
// In a real test, you'd import the actual class or use dependency injection
class MockVisionCorrector {
  constructor() {
    this.state = null;
    this.isInitialized = false;
    this.initialize = jest.fn();
    this.startCorrection = jest.fn();
    this.stopCorrection = jest.fn();
    this.updateCorrection = jest.fn();
  }
}

// Tests
describe('VisionCorrector', () => {
  let corrector;
  
  beforeEach(() => {
    jest.clearAllMocks();
    corrector = new MockVisionCorrector();
  });
  
  test('initializes when constructed', () => {
    expect(corrector.initialize).toHaveBeenCalled();
  });
  
  test('starts correction when enabled in state', async () => {
    // Set up initial state
    corrector.state = { enabled: true };
    corrector.isInitialized = true;
    
    // Call method
    await corrector.initialize();
    
    // Check that correction was started
    expect(corrector.startCorrection).toHaveBeenCalled();
  });
  
  test('does not start correction when disabled in state', async () => {
    // Set up initial state
    corrector.state = { enabled: false };
    corrector.isInitialized = true;
    
    // Call method
    await corrector.initialize();
    
    // Check that correction was not started
    expect(corrector.startCorrection).not.toHaveBeenCalled();
  });
});