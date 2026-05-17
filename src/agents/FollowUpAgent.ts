import { BookingReceipt } from './BookingAgent';

export interface FollowUpTimers {
  transitTimer: ReturnType<typeof setTimeout>;
  feedbackTimer: ReturnType<typeof setTimeout>;
}

export const scheduleFollowUp = (
  receipt: BookingReceipt, 
  onTransit: () => void, 
  onFeedback: () => void
): FollowUpTimers => {
  console.log(`[FOLLOW_UP_AGENT] Scheduling localized state progression for ${receipt.booking_id}`);

  // 1. IN TRANSIT Shift (10 seconds)
  const transitTimer = setTimeout(() => {
    console.log(`[FOLLOW_UP_AGENT] Provider ${receipt.provider_name} is now IN TRANSIT.`);
    onTransit();
  }, 10000);

  // 2. FEEDBACK / COMPLETION (20 seconds) — only if not canceled
  const feedbackTimer = setTimeout(() => {
    console.log(`[FOLLOW_UP_AGENT] Service with ${receipt.provider_name} COMPLETED.`);
    onFeedback();
  }, 20000);

  return { transitTimer, feedbackTimer };
};

export const clearFollowUpTimers = (timers: FollowUpTimers) => {
  clearTimeout(timers.transitTimer);
  clearTimeout(timers.feedbackTimer);
  console.log('[FOLLOW_UP_AGENT] Timers cleared (booking canceled).');
};
