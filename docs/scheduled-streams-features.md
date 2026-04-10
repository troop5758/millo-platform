# Scheduled Streams — Advanced Features

Optional improvements for Millo live stream scheduling. https://milloapp.com

## Implemented

### 1. Stream Reminder
- **15 min, 1 hour, 24 hours before** — Worker runs every 5 min, sends reminders to followers
- **Channels**: In-app notification, mobile push, email
- **Schema**: `ScheduledStream.remindersSent` tracks sent windows to avoid duplicates
- **Worker**: `streamReminder.worker.js` (BullMQ, `stream-reminder` queue)

### 2. Calendar Integration
- **GET /live/scheduled/:id/calendar?format=google|ical|outlook**
- **Google**: Redirects to Google Calendar add-event URL
- **iCal / Outlook**: Returns `.ics` file download
- **SDK**: `getScheduledStreamCalendarUrl(scheduledStreamId, format)`
- **UI**: "Add to calendar" on Upcoming Streams page

### 3. Scheduled Live Commerce
- **Schema**: `ScheduledStream.productIds`, `ScheduledStream.auctionIds`
- **API**: `POST /live/schedule` accepts `productIds`, `auctionIds`
- **Worker**: When stream goes live, `productIds` → `VideoProduct` records (shop-the-look)
- **Auctions**: Schema ready; worker can be extended to create/link auctions on stream start

### 4. Scheduled Live Notifications
- **On schedule**: `notifyFollowersScheduled()` — in-app, push, email via `notifyUser`
- **Reminders**: `streamReminder.worker` — in-app, push, email
- **On start**: `stream_started` notifications to followers

## Future Enhancements

- **Drops**: PPV content drops at scheduled time — extend PPV schema with `scheduledStreamId`
- **PPV tickets**: `LiveTicket` creation when stream goes live (for `paid_event` type)
- **Auction linking**: Create `Auction` with `streamId` when stream starts for `auction` type
