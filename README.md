# Vision Correction Extension

A Chrome extension that provides real-time vision correction using eye tracking and computer vision techniques.

## Features

- Real-time vision correction based on eye tracking
- Multiple vision correction profiles
- Customizable settings for different vision conditions
- Light level detection for optimal performance
- Chromatic aberration correction
- Screen distance adjustment
- Quality settings for performance optimization

## Installation

1. Clone the repository:
```bash
git clone https://github.com/jrkphani/vision-correction-extension.git
cd vision-correction-extension
```

2. Install dependencies:
```bash
npm install
```

3. Build the extension:
```bash
npm run build
```

4. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` directory from the project folder

## Development

To start development:

1. Make your changes in the `src` directory
2. Run the development build:
```bash
npm run dev
```

3. The extension will automatically rebuild when files change

## Project Structure

```
vision-correction-extension/
├── src/
│   ├── scripts/
│   │   ├── background.js    # Background script
│   │   ├── content.js       # Content script for vision correction
│   │   ├── popup.js         # Popup UI script
│   │   └── options.js       # Options page script
│   ├── pages/
│   │   ├── popup.html       # Extension popup
│   │   └── options.html     # Options page
│   ├── styles/
│   │   ├── popup.css        # Popup styles
│   │   └── options.css      # Options page styles
│   └── manifest.json        # Extension manifest
├── dist/                    # Built extension files
├── webpack.config.js        # Webpack configuration
└── package.json            # Project dependencies and scripts
```

## Features in Detail

### Eye Tracking
- Uses TensorFlow.js for face detection and eye tracking
- Calculates gaze position based on iris landmarks
- Adjusts vision correction based on real-time gaze data

### Vision Correction Profiles
- Support for multiple vision prescriptions
- Configurable settings for:
  - Sphere correction
  - Cylinder correction
  - Axis adjustment
  - Pupillary distance (PD)

### Performance Optimization
- Quality settings for different performance levels
- Light level detection for optimal tracking
- Screen distance adjustment for accurate correction

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- TensorFlow.js team for the face-landmarks-detection model
- Chrome Extensions team for the excellent documentation
- All contributors who have helped with the project