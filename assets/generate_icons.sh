#!/bin/bash

# Make sure Inkscape is installed
if ! command -v inkscape &> /dev/null
then
    echo "Inkscape could not be found. Please install it to generate PNG icons."
    exit 1
fi

# Generate different sizes from the SVG
inkscape -w 16 -h 16 icon.svg -o icon16.png
inkscape -w 32 -h 32 icon.svg -o icon32.png
inkscape -w 48 -h 48 icon.svg -o icon48.png
inkscape -w 128 -h 128 icon.svg -o icon128.png

echo "Icons generated successfully."
