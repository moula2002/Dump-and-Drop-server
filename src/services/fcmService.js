const admin = require('firebase-admin');
const User = require('../models/User');

const fs = require('fs');
const path = require('path');

let isFirebaseInitialized = false;
let serviceAccount = null;

try {
  let parseErrorMsg = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const rawStr = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      try {
        serviceAccount = JSON.parse(rawStr);
      } catch (e) {
        let processedStr = rawStr.trim();
        
        // Normalize Windows line endings to Unix line endings
        processedStr = processedStr.replace(/\r/g, '');
        
        // 1. Remove backslashes adjacent to double quotes
        processedStr = processedStr.replace(/\\+"/g, '"');
        processedStr = processedStr.replace(/"\\+/g, '"');
        
        // Extract only the content between the first { and last }
        let start = processedStr.indexOf('{');
        let end = processedStr.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
          processedStr = processedStr.substring(start, end + 1);
        }
        
        // 2. Normalize the private key line endings (any sequence of backslashes followed by n or a literal newline -> \n)
        processedStr = processedStr.replace(/\\+n/g, '\\n');
        processedStr = processedStr.replace(/\\+\n/g, '\\n');
        
        serviceAccount = JSON.parse(processedStr);
      }
    } catch (parseError) {
      parseErrorMsg = parseError.message;
    }
  }

  // Fallback: search for local service account key file
  if (!serviceAccount) {
    const searchDirs = [
      path.join(__dirname, '../../..'), // Root directory of workspace
      path.join(__dirname, '../..'),    // Backend directory
      process.cwd()                     // Current working directory
    ];
    for (const dir of searchDirs) {
      try {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          const credFile = files.find(f => f.includes('firebase-adminsdk') && f.endsWith('.json'));
          if (credFile) {
            const filepath = path.join(dir, credFile);
            serviceAccount = JSON.parse(fs.readFileSync(filepath, 'utf8'));
            console.log(`Auto-discovered Firebase service account credentials at: ${filepath}`);
            break;
          }
        }
      } catch (err) {
        // Continue searching
      }
    }
  }

  // Log env parse warning only if fallback also failed
  if (!serviceAccount && parseErrorMsg) {
    console.warn("Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON from environment variable:", parseErrorMsg);
  }

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    isFirebaseInitialized = true;
    console.log("Firebase Admin SDK initialized successfully.");
  } else {
    // Look for standard Application Default Credentials (ADC) or fallback
    admin.initializeApp();
    isFirebaseInitialized = true;
    console.log("Firebase Admin SDK initialized with default credentials.");
  }
} catch (e) {
  console.warn("Firebase Admin SDK initialization skipped/failed: Service account credentials not provided or invalid. Notifications will fall back to local database routing.", e.message);
}

/**
 * Send a push notification to a user's registered FCM device token
 * @param {string} userId 
 * @param {string} title 
 * @param {string} body 
 * @param {object} [data] 
 * @param {string} [targetToken]
 */
exports.sendPushNotification = async (userId, title, body, data = {}, targetToken = null) => {
  console.log(`[FCM DIAGNOSTIC] Initiating push notification dispatch...`);
  console.log(`- User ID: ${userId}`);
  console.log(`- Title: "${title}"`);
  console.log(`- Body: "${body}"`);
  console.log(`- Data:`, data);
  console.log(`- Direct Target Token Provided: ${targetToken ? 'YES' : 'NO'}`);

  try {
    let token = targetToken;
    if (!token) {
      console.log(`- Fetching FCM token from user database record for ID: ${userId}`);
      const user = await User.findById(userId);
      if (user) {
        token = user.fcmToken;
        console.log(`- Database lookup result: ${token ? 'Token Found' : 'No Token Found'}`);
      } else {
        console.log(`- Database lookup result: User not found`);
      }
    }

    if (!token) {
      console.warn(`[FCM DIAGNOSTIC ERROR] Dispatch aborted: No token registered or provided for user: ${userId}`);
      return false;
    }

    console.log(`- Target Token: ${token.substring(0, 15)}...`);

    if (!isFirebaseInitialized) {
      console.log(`[FCM Mock] Target Token: ${token} | Title: "${title}" | Body: "${body}" | Data:`, data);
      return true;
    }

    const message = {
      notification: {
        title,
        body,
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      token: token,
    };

    console.log(`- Sending message payload via Firebase Admin SDK...`);
    const response = await admin.messaging().send(message);
    console.log(`[FCM DIAGNOSTIC SUCCESS] FCM Sent successfully messageId: ${response}`);
    return true;
  } catch (error) {
    console.error("[FCM DIAGNOSTIC ERROR] Exception during FCM dispatch:", error.message);
    return false;
  }
};
