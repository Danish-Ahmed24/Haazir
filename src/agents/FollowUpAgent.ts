import { Alert } from 'react-native';
import { BookingReceipt } from './BookingAgent';

export const scheduleFollowUp = async (receipt: BookingReceipt) => {
  console.log(`[FOLLOW_UP_AGENT] Scheduling simulated alerts for ${receipt.booking_id}`);

  try {
    // 1. Notification 1 Hour prior (Simulated as 10 seconds for prototype)
    setTimeout(() => {
      Alert.alert(
        "🔔 Provider Arriving Soon!", 
        `${receipt.provider_name} is on their way for your ${receipt.service_type} request.`
      );
    }, 10000);

    // 2. Notification 1 Hour post-event (Simulated as 20 seconds for prototype)
    setTimeout(() => {
      Alert.alert(
        "⭐ How was the service?", 
        `Tap to rate your experience with ${receipt.provider_name}.`
      );
    }, 20000);

    console.log(`[FOLLOW_UP_AGENT] Successfully scheduled follow-up alerts`);
    return true;
  } catch (error) {
    console.error(`[FOLLOW_UP_AGENT] Failed to schedule:`, error);
    return false;
  }
};
