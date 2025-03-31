#!/bin/bash

# Create the directory if it doesn't exist
mkdir -p /Users/jrkphani/Projects/vision-correction-extension

# Copy all files and directories from the desktop folder to the Projects folder
cp -R /Users/jrkphani/Desktop/vision-correction-extension/* /Users/jrkphani/Projects/vision-correction-extension/

# Copy hidden files as well
cp -R /Users/jrkphani/Desktop/vision-correction-extension/.* /Users/jrkphani/Projects/vision-correction-extension/ 2>/dev/null || :

# Print success message
echo "Project successfully moved to /Users/jrkphani/Projects/vision-correction-extension"
echo "You can now safely delete the version on your Desktop"
