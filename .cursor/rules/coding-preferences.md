# Coding Preferences for Vision Correction Extension

## General Principles
- Always prefer simple solutions over complex ones
- Avoid duplication of code whenever possible
- Check for other areas of the codebase that might already have similar code/functionality
- Be mindful of the split between Dev, Test, and Prod environments
- Only make changes that are explicitly requested or clearly related to the task

## Change Management
- When fixing an issue or bug, do not introduce a new pattern or technology without first exhausting all options for the existing implementation
- If a new pattern is introduced, remove the old implementation afterward to prevent duplicate logic
- Keep the codebase clean and organized at all times
- Focus only on areas of code relevant to the task - do not touch unrelated code
- Think about what other methods and areas of code might be affected by changes

## Code Organization
- Avoid writing one-off scripts and files if possible
- If a script is likely to be run only once, either execute it inline or delete after use
- Avoid having files over 200-300 lines of code - refactor at that point
- Write thorough tests for all major functionality
- Always update tests when implementation changes

## Data Handling
- Do not use mock data, stubs, or fake data in Dev or Prod environments
- Only use mock data in Test environments
- Never add stubbing or fake data patterns to code that affects Dev or Prod
- Do not modify or overwrite .env files or environment variables

## Technical Stack
- Frontend: HTML, JavaScript
- Browser Extension: Chrome Extensions Manifest V3
- Libraries: TensorFlow.js, WebGL
- Use Chrome extension testing frameworks for all tests
- Prefer end-to-end testing over unit testing where appropriate

## Performance Considerations
- Optimize WebGL operations to avoid unnecessary rendering
- Avoid unnecessary API calls or DOM operations
- Consider throttling for performance-intensive operations like eye tracking
- Use requestAnimationFrame appropriately
- Be mindful of memory and battery usage

## Security Practices
- Always sanitize user inputs
- Do not access browser APIs without proper permissions
- Do not hardcode credentials or API keys
- Use content security policies
- Respect user privacy with eye tracking data

## Project Workflow
- Write tests before implementing significant changes
- Ensure all tests pass before considering a task complete
- Document key functions, classes, and extension features
- Make small, frequent commits with descriptive messages
- Create useful error messages and logging

## Extension-Specific Guidelines
- Follow Chrome extension best practices
- Keep content scripts as lightweight as possible
- Use background service workers appropriately
- Properly manage extension state with storage APIs
- Ensure cross-browser compatibility where possible