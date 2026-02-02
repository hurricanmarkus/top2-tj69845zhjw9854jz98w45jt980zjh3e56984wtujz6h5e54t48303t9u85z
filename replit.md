# TOP 2 Smart Home App

## Overview
A Progressive Web App (PWA) for smart home management built with vanilla JavaScript and Firebase. The application is in German and provides features for household management, payments, contracts, recipes, and more.

## Project Structure
- `index.html` - Main HTML file containing all views
- `style.css` - Custom styles
- `server.js` - Simple Node.js static file server
- `sw.js` - Service worker for PWA functionality
- `manifest.json` - PWA manifest configuration
- `firebase.json` - Firebase configuration
- `firestore.rules` - Firestore security rules

### JavaScript Modules
- `haupteingang.js` - Main entrance/home functionality
- `zahlungsverwaltung.js` - Payment management
- `haushaltszahlungen.js` - Household payments
- `geschenkemanagement.js` - Gift management
- `terminplaner.js` - Calendar/scheduler
- `vertragsverwaltung.js` - Contract management
- `rezeptverwaltung.js` - Recipe management
- `checklist.js` - Checklists
- `notfall.js` - Emergency features
- `lizenzen.js` - Licenses
- `wertguthaben.js` - Value credits
- `ticket-support.js` - Support tickets
- `sendungsverwaltung.js` - Shipment management
- `essensberechnung.js` - Food calculations
- `log-InOut.js` - Authentication
- `admin_*.js` - Admin functionality modules
- `pushmail-*.js` - Push notification system

## Tech Stack
- Frontend: Vanilla JavaScript, TailwindCSS (CDN)
- Backend: Firebase (Firestore, Authentication)
- Server: Node.js static file server

## Running the Application
The app runs on port 5000 with a simple Node.js static file server:
```bash
node server.js
```

## Firebase Integration
This app uses Firebase for:
- Authentication (anonymous auth)
- Firestore database
- The Firebase configuration is embedded in the JavaScript files
