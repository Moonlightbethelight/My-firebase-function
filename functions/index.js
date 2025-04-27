const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

function isTimeToSendNotification(userNotiftime) {
  if (!userNotiftime) return false;
  const now = new Date();
  let notifHour = parseInt(userNotiftime.split(':')[0], 10);
  const isPM = userNotiftime.toUpperCase().includes('PM');
  if (isPM && notifHour < 12) notifHour += 12;
  if (!isPM && notifHour === 12) notifHour = 0;
  return now.getHours() === notifHour && now.getMinutes() < 5;
}

exports.sendQuoteNotifications = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async () => {
    const users = await db.collection('Users').get();
    await Promise.all(users.docs.map(async doc => {
      const u = doc.data();
      if (!u.fcmToken || !u.UserTrack || !isTimeToSendNotification(u.Notiftime)) return;
      const isPremium = !!u.IsPremium;
      const qSnap = await db.collection('Quotes')
        .where('QuoteTheme', '==', u.UserTrack)
        .where('QuoteUsed', '==', false)
        .limit(1)
        .get();
      if (qSnap.empty) return;
      const qDoc = qSnap.docs[0], q = qDoc.data();
      const themeName = (await u.UserTrack.get()).data().TrackName;
      const message = {
        notification: {
          title: `Your Daily ${themeName} Quote`,
          body: isPremium ? q.Quotetext : "Your daily quote is ready. Open the app to view it."
        },
        token: u.fcmToken
      };
      await admin.messaging().send(message);
      await qDoc.ref.update({ QuoteUsed: true, QuoteDateAssigned: admin.firestore.FieldValue.serverTimestamp() });
      await doc.ref.update({ UserTodayQuote: qDoc.ref });
    }));
  });
